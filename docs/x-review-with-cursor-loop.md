# `x-review-with-cursor-loop` decisions

Why the review loop works the way it does, so later edits don't undo measured choices. The [skill file](../.rulesync/skills/x-review-with-cursor-loop/SKILL.md) is the runbook and holds the measurement logs. Session history stays in the vault plan (`cursor-review-loop-skill`), not here.

The host is Claude Code. Cursor's `agent` CLI is the reviewer it calls, not the host.

**How defaults change:** only after at least two independent real runs agree. A single isolated benchmark is a hypothesis, not a result. Example: an isolated test showed pasting the diff ~8x cheaper than sending a file list, but a full end-to-end run came back 13–46% more expensive, and the change was reverted the same day.

## Decisions

| Choice | Why |
|---|---|
| No subagents, only inline tool calls | A subagent starts with a cold system prompt and loses this session's cached context. Held up in every real run. |
| Default model `grok-4.7-high-fast`, never `auto` | A version bump from `cursor-grok-4.6-high-fast`, whose choice came from real cost measurements. 4.7 itself is untested (see [Still open](#still-open)). `auto` can route to a model from the host's own vendor and remove the independent reviewer. Don't claim a false-positive ranking against other models: the comparison log is gone. |
| `--mode plan`, no `--force` / `--yolo` | Read-only reviewer; only the host edits. |
| File list in the prompt, not a pasted diff | Pasting looked cheaper in isolation, but a full-branch run cost more and once failed to return JSON. Tried and reverted. |
| Exclusion list of earlier REJECTED, UNTESTED and CONFIRMED-DECLINED findings, matched on file + symbol, not `file:line` | The reviewer has no memory, so it repeats findings, and line numbers move after every fix. The reviewer may challenge the list. Matching is a heuristic. |
| Stop after two rounds in a row with no *new* CONFIRMED finding | One empty round can come before a real find. Self-refinement research stops after two low-gain rounds for the same reason. |
| Stop when a round's only new CONFIRMED finding is low severity | Most gains land in rounds 1–2, and quality levels off around 3 (diminishing-returns research). Hasn't fired in a real run yet. |
| At most 3 rounds by default | Real, shipped finds appeared in round 3. The cap is a backstop, not a claim that 3 is enough. |
| Build and test after fixes, retry a bounded number of times, stop the loop if still failing | Early runs skipped this and every check was done by hand. Matches tools like Aider. |
| CONFIRMED-DECLINED findings join the exclusion list and don't count as recurring after a fix | Real findings left unfixed were otherwise re-verified every round. They recur because they were never fixed. |
| A separate stop reason when round 2+ has nothing to review because nothing was fixed | "Nothing to review" reads as success; it isn't. |
| No second reviewer model on top | A second model adds false positives unless its findings are verified too, which is this loop run twice. |
| `--base worktree` is a flag, not a second skill | Same verify/fix/report loop; only the file list and the refuse-on-`main` check differ. |
| `--mode plan`, although the sibling skill uses `ask` | Both modes block `git diff` and `git status` (tested). This loop's prompt demands "Output ONLY a JSON array", and every logged run in the skill's calibration table has a nonzero finding count. That is indirect evidence of no narration-only failures: the table doesn't label each run pass/fail on JSON output, and the `grok-4.7-high-fast` row has no runs yet, so it isn't covered. `x-review-with-cursor` uses a different prompt that narrated instead of answering in 3 of 4 `plan` runs, so it switched to `ask`. If this loop ever starts narrating, try `ask` first. |

## Which hosts

Targets: `claudecode` only. The skill needs only shell and git access, and it must not run in Cursor (Cursor calling itself), so other hosts are possible. They stay off until each has had a real run, because "rulesync supports `disable-model-invocation` for this host" isn't the same as "this host honors it and passes arguments the way Claude Code does."

Adding them all at once has already caused a bug: `zed` writes to the same `.agents/skills/` folder as `agentsskills`, which was excluded because it ignores `disable-model-invocation`, so `zed` reopened that leak under another name.

Candidates, one at a time, each after a real run: `copilot`, `copilotcli`, `crush`, `pi`, `qwencode`, `grokcli`, `factorydroid`, `devin`. Never `zed` (the shared folder) or `cursor`. Tracked on the [project board](https://github.com/users/andrej-kolic/projects/8).

Until then, on a host where argument passing is unverified, the skill warns in its body and echoes the flags it resolved before calling Cursor, rather than refusing to run.

## Why it isn't merged with `x-code-review-standards`

`x-code-review-standards` covers a broader checklist (design, complexity, consistency, …) aimed at a human reader. This loop's scope is narrow: correctness, simplification and efficiency. Design-level findings are already declined here as CONFIRMED-DECLINED ("needs a design decision"). Adding the extra categories would also invalidate the calibration table in the skill file, which was measured against the current three-category prompt. When a design- or consistency-level finding is declined here, run `x-code-review-standards` by hand on the same diff; it isn't an automatic step of this loop.

## `x-review-with-cursor`

The single-pass sibling keeps its measurements in [its own skill file](../.rulesync/skills/x-review-with-cursor/SKILL.md). The reason is repeated here so trimming that file doesn't lose it: `ask` is its default because `plan` narrated instead of answering in 3 of 4 real runs (one with the anti-narration instruction already in place), while `ask` succeeded in 2 of 2.

## Still open

- `grok-4.7-high-fast` as default: no real runs yet. Needs two independent runs that agree before it's trusted like 4.6 was.
- `--model-round2` (a cheaper model from round 2): opt-in, no runs yet.
- The two-empty-rounds stop: never observed; every real run hit the round cap first.
- Other hosts: see [Which hosts](#which-hosts).
