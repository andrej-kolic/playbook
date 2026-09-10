---
name: x-review-with-cursor-loop
description: Claude-hosted skill. Loop an independent Cursor CLI review against host verify-and-fix passes on the current branch, alternating reviewer perspective each round. Runs inline in this session — no subagents, no auto-commit. For a quick single-pass opinion with no iteration or auto-fix, use x-review-with-cursor instead.
targets:
  - claudecode
disable-model-invocation: true
---

<!-- playbook:x-review-with-cursor-loop v2 (2026-09-10) — renamed, host-genericization language kept but targets scaled back to claudecode only, see docs/x-review-with-cursor-loop.md -->

Automates the manual "review in Cursor, paste into this session, fix, repeat" cycle. Cursor's `agent` CLI reviews (read-only), the host verifies each finding against the real code and applies confirmed fixes — alternating each round so the host never rubber-stamps its own prior fix.

**Host: Claude Code only, for now.** Cursor's `agent` CLI is the reviewer here, not the host — running this skill from within Cursor would mean Cursor invoking its own CLI recursively, so `cursor` will never be a target regardless. Other `disable-model-invocation`-supporting hosts (Copilot, Crush, Pi, Qwen Code, Grok CLI, Factory Droid, Devin) are real rulesync targets but deliberately not added yet — undogfooded, and the earlier attempt to add them broadly caused a real bug (`zed` shared `agentsskills`'s output path, leaking the manual-only guarantee to tools that don't honor the flag). Add a host back only once it's actually been run, not because the schema supports it — see docs/x-review-with-cursor-loop.md for the candidate list and tracking.

**Everything below runs as direct tool calls in this session — your shell, file-read, search, and file-edit tools. Never spawn a subagent for this.** Subagent spin-up reloads a cold system prompt and throws away this session's cached context — the expensive part this skill exists to avoid.

## Arguments

Parse from `ARGUMENTS` (all optional):
- `--rounds N` — round cap, default **3**. Measured, not a guessed plateau (see calibration table) — round 4+ is untested, don't assume 3 is a ceiling either.
- `--base <ref>|worktree` — diff base, default `main`. Any value other than `worktree` is a git ref: branch, tag, commit hash, or relative ref like `HEAD~5` — `git merge-base <ref> HEAD` and `git diff --name-only` treat them identically, so "review since this commit" or "review the last N commits" both work today via `--base <hash>` or `--base HEAD~N`, no special casing needed. Special value `worktree`: review uncommitted staged+unstaged+untracked changes instead of a ref diff, and skip the "refuse to run on main" check. Allowed on any branch, including the base.
- `--model <name>` — Cursor model, default `cursor-grok-4.6-high-fast`. **Never `auto`** — it can route to a model from the same vendor/family as the host and defeat the point of an independent reviewer. Round-cap behavior differs by model — check the calibration table before switching.
- `--model-round2 <name>` — **experimental, opt-in, no default, untested.** Cursor model for round 2 onward, in place of `--model`. If used, log new-CONFIRMED-per-round so a future session can tell whether quality held.
- `--scope incremental|full` — round 2+ diff scope, default `incremental`. See Step 1. Not a settled default — switch to `full` if `incremental` looks like it's missing things.

### Round-cap calibration by model (update as more models get tested)

Finding count per round, same branch, same starting baseline — real dogfooding data, not a general benchmark. **Raw counts, not new-finding counts** — repeats of already-settled findings can dominate a round. Log new-CONFIRMED-per-round in new rows, not just the raw count.

Diff-pasting was tried as the default and reverted — measured more expensive live; every row below uses the file-list form. See docs/x-review-with-cursor-loop.md for why.

| Model | Rounds tested | Findings per round | Notes |
|---|---|---|---|
| `cursor-grok-4.6-high-fast` (default) | 3 | 8 → 11 → 6 | No plateau at round 3 — it caught a real gap in round 2's own fix. Treat round 3 as a floor, not a ceiling. |
| `gpt-5.3-codex-fast` | 2 | 8 → 4 | Tapered faster, but round 2 still found a real confirmed bug at the cap. Round 3 untested. |
| `composer-2.5-fast` | 3 | 12 → 13 → 9 | Same non-monotonic shape as Grok. Highest raw count of the three — but also caught a real bug the other two missed. Don't assert a false-positive ranking against Grok/Codex; their comparison logs are gone (see docs/x-review-with-cursor-loop.md). |
| `cursor-grok-4.6-high-fast` (unconstrained, full branch diff) | 3 (×2 runs) | 6 → 2 → 1, and 9 → 2 → 2 | Two independent runs, same shape both times, zero rejected/untested. Output tokens barely drop despite scope collapsing (~98%) — see `--model-round2` above. Second run's tokens aren't a clean baseline (used the reverted diff-paste form partway through). |
| `cursor-grok-4.6-high-fast` (small targeted diff, 23→2 files) | 2 | 3 → 0 (new-confirmed: 2 → 0) | Converged at round 2 (rule 1), first run outside `vscode-extension`/`playbook`. Round 2's fresh input (179k) exceeded round 1's (79.5k) despite fewer files — same overhead-doesn't-shrink-with-scope pattern as the unconstrained row. Also caught a real staleness bug: this run's global skill copy predated the blocked-diff guard fix and hit that exact failure mode (reviewer wrote itself an unexecuted git-workaround script). |
| any other model | 0 | untested | No data — don't invent a number. Add a row with the real curve once run. |

**Don't recommend running a second model on top.** This skill's design — pin a non-`auto` model, verify every finding against real code — already matches what the literature on multi-model review endorses; a second model mostly adds false positives unless independently verified the same way, which is just running this loop twice.

## Setup (once)

1. Confirm the CLI is ready: `agent status`. If not logged in, tell the user to run `agent login` and stop.
2. State the resolved `--rounds`/`--base`/`--model`/`--scope` before round 1 — on a host where `ARGUMENTS` injection is unverified, this surfaces a silent wrong-default (e.g. reviewing `main` when the user meant `worktree`) before any call happens, not after (dogfooding finding, 2026-09-10).
3. Determine repo root and current branch (`git rev-parse --show-toplevel`, `git branch --show-current`). Refuse to run on `main`/the base branch itself — **unless `--base worktree`**, which is allowed on any branch including the base.
4. Confirm the log destination is ignored: `git check-ignore .tmp/review-loop/`. If not ignored, warn the user and ask before proceeding — don't write untracked review logs into a repo that isn't set up for it.
5. Log file: `.tmp/review-loop/<branch-slug>.log` (`/` → `-` in the branch name). Create the dir if missing. Append-only, plain text, terse lines — an audit trail, not a report:
   ```
   === round 1 · <ISO timestamp> · scope=<diff description> ===
   agent usage: in=<N> out=<N> cacheRead=<N>
   FOUND file.ts:42 [correctness] one-line summary
   VERIFY file.ts:42 CONFIRMED — one-line reason
   FIX    file.ts:42 applied
   FOUND other.ts:10 [simplification] one-line summary
   VERIFY other.ts:10 REJECTED — one-line reason
   FOUND third.ts:5 [efficiency] one-line summary
   VERIFY third.ts:5 SKIPPED — matches round 1's REJECTED verdict, no new evidence
   FOUND fourth.ts:88 [correctness] one-line summary
   VERIFY fourth.ts:88 UNTESTED — matches the code's own assumption, needs live UI testing to settle
   FOUND fifth.ts:20 [correctness] one-line summary
   VERIFY fifth.ts:20 CONFIRMED-DECLINED — real, but out of scope for an automated fix (needs a design decision)
   BUILD/TEST round 1: pnpm check green
   ```

## Loop (up to `--rounds` times)

**Step 1 — compute this round's scope.**
- Round 1, `--base <ref>` (default `main`): `mergeBase=$(git merge-base <base> HEAD)`; changed files = `git diff --name-only --diff-filter=d "$mergeBase"` ∪ `git ls-files --others --exclude-standard` (includes uncommitted working-tree changes automatically; the union with untracked files is load-bearing — `git diff` alone silently drops untracked new files, found by dogfooding 2026-09-10; `--diff-filter=d` excludes deleted paths, which `git diff --name-only` otherwise includes despite there being nothing left to review).
- Round 1, `--base worktree`: changed files = `git diff --name-only --diff-filter=d HEAD` ∪ `git ls-files --others --exclude-standard` (staged + unstaged + untracked vs `HEAD`; no merge-base, no "refuse on main"). Empty list → stop, "nothing to review."
- Round 2+, `--scope incremental` (default): restrict to files *this session edited* during the previous round's fix step. For each, confirm it still shows a real change: tracked files via `git diff --name-only "$mergeBase" -- <file>` (ref base) or `git diff --name-only HEAD -- <file>` (`worktree`); **untracked files skip this check and stay in scope unconditionally** — `git diff` never shows untracked paths regardless of pathspec, so filtering them through it silently empties the list (dogfooded 2026-09-10: this exact gap, on this session's own mostly-new-files change set).
- Round 2+, `--scope full`: same as round 1 — full file list, no path restriction.
- If the resulting file list is empty:
  - Round 2+, `--scope incremental`, and the previous round applied zero fixes (every finding was REJECTED/UNTESTED/CONFIRMED-DECLINED) → stop, reason **"no fixes applied last round — nothing left to re-scope incrementally"** (report this distinctly — it means nothing got resolved, not that the review came back clean).
  - Otherwise (genuinely empty diff) → stop, reason "nothing to review."
  - Either way, go to Reporting.
- Round 2+ only: build this round's **exclusion list** — every finding logged REJECTED, UNTESTED, or CONFIRMED-DECLINED in an earlier round this run whose file is in this round's list, as `file — symbol/substance — verdict: one-line reason`. (Round 1: skip, nothing settled yet.)

**Step 2 — invoke Cursor (read-only).**
Ref base (`--base <ref>`):
```bash
agent -p --trust --mode plan --output-format json --model <model> --workspace <repo-root> \
  "Review the following files for correctness bugs, reuse/simplification opportunities, and efficiency issues, focused on what changed relative to '<base>'. Running git yourself is blocked in this mode — don't guess the base ref, fetch from a remote, or reconstruct history from unrelated context; review the files as given and say so if something needs the actual diff to settle: <file list>. Output ONLY a JSON array (findings may still include a short lead-in sentence before it, that's fine, just make sure the array itself is well-formed) where each item has: file, line, category (correctness|simplification|efficiency), severity (high|medium|low), summary. Empty array if none found."
```
`--base worktree`:
```bash
agent -p --trust --mode plan --output-format json --model <model> --workspace <repo-root> \
  "Review the following files for correctness bugs, reuse/simplification opportunities, and efficiency issues, focused on uncommitted working-tree changes (staged, unstaged, and untracked). Running git yourself is blocked in this mode — don't guess the base ref, fetch from a remote, or reconstruct history from unrelated context; review the files as given and say so if something needs the actual diff to settle: <file list>. Output ONLY a JSON array (findings may still include a short lead-in sentence before it, that's fine, just make sure the array itself is well-formed) where each item has: file, line, category (correctness|simplification|efficiency), severity (high|medium|low), summary. Empty array if none found."
```
Round 2+, if this round's exclusion list is non-empty, append to the prompt: `" Prior verdicts from earlier rounds on these files (still open to challenge with real new evidence, not a gag order — only re-raise one if you have a genuinely new angle): <exclusion list>."`

`--model-round2`, if set, replaces `<model>` from round 2 onward (see Arguments — experimental).

Never add `--force`/`--yolo`. `--mode plan` guarantees Cursor can't touch files — the reason only the host is allowed to edit in this loop.

(Diff-pasting the round's scope instead of this file list was tried and reverted — measured more expensive live despite a cheaper isolated test; see docs/x-review-with-cursor-loop.md before retrying it.)

**Step 3 — extract findings.**
The CLI's JSON envelope wraps the answer in a `result` string that can still contain prose despite the instruction above. Take the substring from the first `[` to the last `]` inside `result`, `JSON.parse` it.
- Parse failure → log `PARSE_FAILED round N`, **stop the loop**, report to the user as "couldn't determine" — never silently treat a parse failure as zero findings.
- Log the round's `usage` object (input/output/cache tokens) — the loop's own running cost, surfaced at the end.

**Step 4 — verify each finding (targeted, not exhaustive).**
Match against this round's exclusion list on **file + symbol/substance, not file:line** — line numbers shift after every fix, so exact file:line matching misses the repeats it exists to catch. Heuristic, not guaranteed — when genuinely unsure, treat as new and verify fresh.

- Matches an exclusion-list entry, and Cursor's write-up adds nothing beyond it → **skip.** Log `VERIFY <file> <symbol/substance> SKIPPED — matches round N's <REJECTED|UNTESTED|CONFIRMED-DECLINED> verdict, no new evidence`. Track how many rounds it's recurred this way (feeds Reporting; not a stop condition on its own, see Step 6).
- Matches, but Cursor raises something genuinely new (a different angle, an unconsidered case) → verify fresh. The exclusion list is a challengeable prior verdict, not a gag order.
- No match → read the flagged line ± a small window first. If the claim depends on code elsewhere (a shared helper, a caller, reachability), follow it there — a targeted read/search in another file to settle a real claim is expected, not a scope violation. The constraint is "don't dump whole files or explore speculatively," not "never leave the flagged file."

Decide one of three verdicts, each with a one-line reason:
- **CONFIRMED** — code reading settles it, the bug/opportunity is real.
- **REJECTED** — code reading settles it, the claim doesn't hold up.
- **UNTESTED** — matches what the code appears to do, but settling it needs live/runtime behavior reading code can't reach (UI interaction, timing, etc). Don't force CONFIRMED/REJECTED — say so plainly.

Log all three outcomes — REJECTED and UNTESTED matter for the recurrence check below just as much as CONFIRMED.

**Step 5 — fix confirmed findings.**
Edit each CONFIRMED finding directly in the working tree. Track which files got touched (feeds round N+1's `incremental` scope). **Never commit or push inside this loop** — the user reviews the cumulative diff when the loop finishes.

Not every CONFIRMED finding has to be fixed here — if it's genuinely out of scope for an automated pass (needs a design decision, touches an unrelated subsystem, risk outweighs the finding), log it `CONFIRMED-DECLINED` with a one-line reason instead of editing; it joins the exclusion list. Default is still to fix it — don't reach for this just because a fix is inconvenient.

**Step 5b — build/test gate.** Skip if zero findings were fixed this round. Otherwise run this repo's build+test entrypoint (`pnpm check` per `AGENTS.md`, or the equivalent elsewhere). On failure: feed the failure back, retry the fix (bounded to 2 retries, 3 attempts total). Still red → **stop the loop now**, flag the failure in Reporting. Only proceed to Step 6 once green.

**Step 6 — check stopping conditions, in order:**
1. Zero findings this round → converged, stop (success).
2. A finding at the same file + symbol/substance (not file:line) as something CONFIRMED+fixed the *previous* round reappears → stop after applying this round's fixes, flag explicitly as unresolved/disputed (a fix that didn't take, or a real disagreement — either way needs a human look). Doesn't apply to CONFIRMED-DECLINED reappearing — it was never fixed, so recurrence is expected, not an alarm; tracked in Reporting instead.
3. This round and the previous round both had zero *new* CONFIRMED findings (an exclusion-list match doesn't count as new) → converged, stop. Evaluable from round 2 on. Two consecutive rounds, not one — a single flat/zero round can still precede a real find the next round.
4. This round produced exactly one new CONFIRMED finding and it's low severity → stop, reason **"low marginal value"** (diminishing-returns literature backs stopping here — see docs/x-review-with-cursor-loop.md). Doesn't require a second round to confirm, unlike rule 3 — a single low-severity finding is weak enough evidence on its own that another round is unlikely to earn its cost.
5. Round cap reached → stop.
- None of the above → next round.

A repeatedly-declined finding (Step 4's SKIPPED case) is **deliberately not a stop condition** — forcing a stop over one standing disagreement would penalize an otherwise-productive round. Track and report it instead (see Reporting) — don't drop it, and don't halt on it alone.

## Reporting (always, on any stop)

Tell the user, plainly:
- Rounds run, and why the loop stopped (converged / two-consecutive-zero-new / low-marginal-value / recurrence / build-test failure / no-fixes-last-round / cap reached / parse failure).
- Count confirmed+fixed vs. rejected vs. confirmed-but-declined, with one-line reasons for rejected and declined (so the user can sanity-check the host's own verify calls, not just Cursor's).
- **UNTESTED findings, listed by name** — need a person to run the app and check.
- **CONFIRMED-DECLINED findings, listed by name with reason** — real but deliberately left unfixed; a person decides whether to act.
- Any recurrence flag, named plainly — don't bury it.
- **Any finding that recurred after being declined/UNTESTED, named as a standing disagreement** — e.g. "Cursor raised X in N rounds, declined every time: <reason>" — separate from the confirmed/rejected tally, worth a second opinion.
- Build/test gate result each round it ran (green, or the failure that stopped the loop).
- Cumulative Cursor-side token usage summed from logged `usage` objects, and the log file path.
- Explicit reminder: nothing was committed — review the diff before committing.
