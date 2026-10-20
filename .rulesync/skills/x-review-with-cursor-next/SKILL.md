---
name: x-review-with-cursor-next
description: Claude-hosted skill. Work in progress, the next version of x-review-with-cursor. Sends the changes (uncommitted, or since a base branch or commit) to Cursor for review, validates each finding against the code and asks which to fix; it applies no fix yet.
targets:
  - claudecode
disable-model-invocation: true
---

<!-- playbook:x-review-with-cursor-next v1 (2026-10-16) -->
<!-- source: andrej-kolic/playbook .rulesync/skills/x-review-with-cursor-next/SKILL.md; edits elsewhere are overwritten -->

Work in progress: applies no fix. A Cursor run costs money on the user's Cursor plan.

## Step 1: make the diff

From the user's current folder, run `sh "<this skill's folder>/scripts/make-diff.sh"`, adding `--base <name>` only when the user named a base branch or commit.

It prints the diff file's path. With a base, named or default, a second line follows: `base <ref> <commit> named|default [uncommitted]`.

- Exit 2: the branch is stacked on another. Ask which base to use, offering the branches its error names and the default branch, then run it again with `--base`.
- Exit 1: show its error line and stop.

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

- Exit 1: show its error line and stop. If it names "Authentication required", tell the user to run `agent login`.
- Otherwise set `r` to the printed path.

## Step 4: check Cursor's reply

Run `sh "<this skill's folder>/scripts/read-reply.sh" "$r"`.

- Exit 1: show its error line and stop.
- Otherwise it prints `session <id>`, a `tokens` line, and a `tool <name> refused` or `tool <name> not refused: <outcome>` line per tool call that was not a read or search.

Read the review with `tail -n 1 "$r"`, its `result` field. Never read the whole file: it holds every file Cursor read. Skip Cursor's lead-in before the findings.

## Step 5: validate and report

Validate each finding against the current code; per finding, run one narrow check (a test file, a type check) when one exists. Skip a finding the code proves false, or an old problem this change did not cause. Apply nothing. Report:

1. First, any `not refused` tool call from Step 4 and what it could have done.
2. Counts, then Fix / Skip / Needs your decision, one line per finding: Cursor's number, severity, `file:line`, the problem, and for Fix the fix. High severity first.
3. One line: model, session id, tokens, reply file link.
4. Ask which to fix.
