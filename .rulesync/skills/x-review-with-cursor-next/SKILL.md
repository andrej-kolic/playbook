---
name: x-review-with-cursor-next
description: Claude-hosted skill. Work in progress, the next version of x-review-with-cursor. Sends the changes (uncommitted, or since a base branch or commit) to Cursor for review, validates each finding against the code, asks which to fix and applies those, then runs another round in the same Cursor chat.
targets:
  - claudecode
disable-model-invocation: true
---

<!-- playbook:x-review-with-cursor-next v1 (2026-10-16) — log entry per round; failures in one section; unknown chat stops a round -->
<!-- source: andrej-kolic/playbook .rulesync/skills/x-review-with-cursor-next/SKILL.md; edits elsewhere are overwritten -->

Work in progress. A Cursor run costs money on the user's Cursor plan. When a step's script fails, see When a step fails.

## Step 1: make the diff

From the user's current folder, run `sh "<this skill's folder>/scripts/make-diff.sh"`, adding `--base <name>` only when the user named a base branch or commit.

It prints the diff file's path. With a base, named or default, a second line follows: `base <ref> <commit> named|default [uncommitted]`.

In the first round, also run `git rev-parse HEAD` and keep it as the start commit.

## Step 2: report the diff

With `p` the printed path and `c` the `<commit>` from the base line, run:

```sh
wc -c -l < "$p"
git -C "$(git rev-parse --show-toplevel)" apply --numstat --summary "$p"
```

With a base line, also run `git log --oneline "$c"..HEAD`.

Before Step 3, show the user: what it covers ("uncommitted changes", or "since `<ref>`" (named or default), plus "and uncommitted changes" when the base line says so, and the commits); the diff's path as a `file://` link; its lines and bytes; each changed file with lines added and deleted, and any rename, new or deleted mark.

## Step 3: send to Cursor

With a 10-minute timeout, run `sh "<this skill's folder>/scripts/send-review.sh" "$p"`, adding the model id as a second argument only when the user named one. The default is `grok-4.7-high-fast`.

It prints the reply file's path before Cursor starts; set `r` to it.

At the timeout the command keeps running in the background, its output (reply path first) going to the file the timeout message names. Tell the user and wait for the notice that it finished; until then, do not start Step 4 or delete any file.

## Step 4: check Cursor's reply

Run `sh "<this skill's folder>/scripts/read-reply.sh" "$r"`.

It prints `session <id>`, a `tokens` line, and a `tool <name> refused` or `tool <name> not refused: <outcome>` line per tool call that was not a read or search.

Read the review with `tail -n 1 "$r"`, its `result` field. Never read the whole file: it holds every file Cursor read. Skip Cursor's lead-in before the findings.

## Step 5: validate and report

Validate each finding against the current code; per finding, run one narrow check (a test file, a type check) when one exists. Mark Skip a finding the code proves false, or an old problem this change did not cause; it stays in the report. Apply nothing. Report:

1. First, any `not refused` tool call from Step 4 and what it could have done.
2. Counts, then Fix / Skip / Needs your decision, one line per finding: Cursor's number, severity, `file:line`, the problem, and for Fix the fix. High severity first.
3. One line: model, session id, tokens, reply file link.
4. Ask which to fix. If the user picks none, Step 6 applies nothing. If the user says done, write the log entry (see Log) with each finding `not answered`, then Step 8.

## Step 6: apply the picked fixes

Apply only the findings the user picks, by Cursor's number. Then run each applied finding's check again, and report pass or fail per finding; say when a finding has no check. Do not commit unless the user asks. Write the round's log entry (see Log). Then ask: another round, or done?

## Step 7: another round

When the user asks for another round:

1. Run Step 1 again with `--base <commit>`: the `<commit>` from the base line of the latest run that answered a base question (When a step fails, item 1), else from the first round's base line, else the start commit. Then Step 2.
2. Write this prompt to a temp file from `mktemp`, with the latest round's numbers and, for each finding not fixed, the reason from Step 5 or the user. A fix whose check failed in Step 6 is not fixed, with reason `fix applied, check failed`: `Addressed. Fixed: <numbers>. Not fixed: <number> (<reason>), …. Do another round on the change included below as a diff. Treat the findings not fixed as settled: raise one again only if the new code changes it, and say what changed. My reasons are not proof: if a finding I did not fix is still a real bug, raise it again and say why.`
3. Run Step 3 as `sh "<this skill's folder>/scripts/send-review.sh" --resume <session> <prompt file> "$p" <model>`: the session id from Step 4, the model the first round used.
4. Continue from Step 4. Once the new reply passes Step 4, delete the prompt file and the previous round's diff and reply.

## Step 8: done

When the user says done or a step sends you here: stop any send still running in the background and write its round's log entry (see Log), then delete every diff, reply and prompt file this review left on disk.

## When a step fails

Show the failing command's error lines. If they name "Authentication required", tell the user to run `agent login`. Then:

1. Step 1, exit 2 (the branch is stacked on another) or exit 3 (the named base is unknown, a commit not in this branch's history, or a branch with no shared history): ask which base to use, offering the default branch and, for exit 2, the branches its error names. Then run Step 1 again with `--base`. When it succeeds, continue from where Step 1 was run: Step 2 in the first round, the rest of Step 7 item 1 in a later round.
2. Step 1, exit 1: Step 8.
3. Step 3, exit 3: Cursor has no chat with that session id. Tell the user, then Step 8.
4. Step 3, any other failure before the reply path: nothing was sent. Then item 7.
5. Step 3, a failure after the reply path: go on to Step 4.
6. Step 4: write the log entry (see Log), then delete the reply. Then item 7.
7. After items 4 and 6: in the first round, Step 8. In a later round, ask whether to retry: a retry runs Step 7 items 3 and 4 again with the same prompt file; no retry goes to Step 8.

## Log

At each round's end (after Step 6, done at Step 5, a Step 4 failure, or a send stopped at Step 8) and before its reply is deleted, append an entry to `x-review-with-cursor-log.md` in the folder `grounder path plans` prints; if that command fails, tell the user the log was skipped. Create a missing folder or file; a new file starts with frontmatter: a `---` line, `project: <repo folder name>`, `created: <YYYY-MM-DD>`, a `---` line.

`- <YYYY-MM-DD>, <branch>, session <first 8 characters of id>, round <n>, <Step 2 wc -l> lines, <duration_ms from the reply's last line ÷ 1000, rounded> s, <model>, tokens <input>/<output>/<cache read>/<cache write>, <number of Cursor's findings> found[. Note: <note>]`
`  - <Cursor's number>, <severity>, <file:line, or file>, <problem in a few words>, <Fix | Skip | Needs your decision>: <reason or fix>, <picked, check passed | picked, check failed | picked, no check | not picked | not answered>`

Each of Cursor's findings gets a line, Skip ones included. A round that never reached Cursor (a Step 1 failure, or a Step 3 failure with no reply path) gets no entry. A field a failed or stopped send leaves unknown is `?`; a retry is a new entry with the same round and `retry` added to its note. Note only the unusual: a send that ran past the 10-minute timeout, a failed or stopped send, a `not refused` tool call, a settled finding raised again without saying what changed, a skipped finding the user then fixed. Never copy Cursor's reply into the log.
