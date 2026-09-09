# `x-review-with-cursor-loop` — why it is shaped this way

The skill file is the runbook. This note is the rationale so later edits do not undo measured choices. Chronology, dogfood bugs, and session logs stay in the vault plan (`cursor-review-loop-skill`) and the market-comparison note — not here.

Host is Claude Code (targets: `claudecode` only, for now — see the targets row below). Cursor `agent` is the reviewer CLI, not the skill host, and `cursor` will never be a target regardless, since that would mean Cursor invoking itself.

## Decisions

| Choice | Why |
|---|---|
| No subagents — inline tool calls only | Subagent start reloads a cold system prompt and drops this session's cached context. Held up across every dogfood run. |
| Default model `cursor-grok-4.6-high-fast`, never `auto` | Cost profile from calibration, not a guessed plateau. `auto` can route to a model from the host's own vendor/family and remove the independent reviewer. Do not assert a measured false-positive ranking vs other models; Grok's comparison log is gone. |
| `--mode plan` on Cursor `agent`, no `--force`/`--yolo` | Read-only reviewer. Only the host edits. |
| File-list prompt, not pasted diffs | Isolated A/B looked cheaper with paste; a live full-branch run was more expensive and once failed to emit JSON ("Creating the findings list."). Documented in the skill as tried-and-reverted. |
| Exclusion list of prior REJECTED / UNTESTED / CONFIRMED-DECLINED, keyed on file + symbol/substance (not `file:line`) | Repeats were driven by the reviewer having no memory, and line numbers drift after every fix. Challengeable prior, not a gag order. GitHub-style comment anchoring has the same class of failure — treat matching as a heuristic. |
| Stop after two consecutive rounds with zero *new* CONFIRMED | A single flat round can precede a real find. The old "flat or higher count → stop" rule fired too early on a non-monotonic curve. Iterative self-refine literature stops after two consecutive low-gain rounds for the same reason. |
| Stop on one new CONFIRMED if it is low severity ("low marginal value") | Largest gains land in the first 1–2 rounds; quality saturates around 3. Added from research; has not fired in dogfood yet. |
| Round cap 3 default | Real shipped finds appeared at round 3. Cap is a backstop, not a claim that 3 is a ceiling. |
| Step 5b: build/test after fixes, bounded retries, stop the loop if still red | The skill used to skip this; every green check in early logs was done by hand. Matches Aider-style autonomous-fix tools. |
| `CONFIRMED-DECLINED` joins the exclusion list and does not trip recurrence-after-fix | Real findings left unfixed were fully re-verified every round. Recurrence is expected if they were never fixed. |
| Distinct stop reason when incremental scope is empty because nothing was fixed | "Nothing to review" reads as success; it is not. |
| Do not recommend a second reviewer model on top | A second model often adds false positives unless independently verified — which is this loop run twice. Pin a non-`auto` model and verify against code; that already matches the ensemble-diversity result. |
| `--base worktree` as a flag, not a second skill | Same verify/fix/report loop; only the file list and the refuse-on-main check change. |
| Targets: `claudecode` only (2026-09-10, after a brief broaden-then-revert) | Briefly broadened (2026-09-09) to every `disable-model-invocation`-supporting rulesync target except Cursor, on the reasoning that Claude-only was historical accident, not a real requirement. That broadening caused a real bug: `zed` writes to the same `.agents/skills/` path as `agentsskills`, which had been excluded from these skills specifically for not honoring `disable-model-invocation` — `zed` reopened that exact leak through a different target name. Scaled back (2026-09-10) to `claudecode` only: "the schema supports the field" isn't the same claim as "this host actually honors it and injects `ARGUMENTS` the same way," and none of the other 9 targets have ever been run. Real technical requirement is still just shell/git access and not being Cursor — that hasn't changed — but "technically possible" isn't a ship bar on its own for something that costs real money per call. **Candidate targets for later, one at a time, only after a real dogfood run on each**: `copilot`, `copilotcli`, `crush`, `pi`, `qwencode`, `grokcli`, `factorydroid`, `devin`. Not `zed` (shared-directory leak) and never `cursor` (self-invocation). |
| `--mode plan`, not `--mode ask`, despite both blocking git identically | Tested directly (not assumed): both reject `git diff`/`git status` even though neither mutates anything. This loop's calibration table (in `x-review-with-cursor-loop/SKILL.md`, not in this doc — every row has a real non-zero finding count, which is *indirect* evidence of no narration-only failures, not a table that explicitly labels each run pass/fail on that dimension; precision matters here, caught 2026-09-10) has never produced a JSON-parse failure in any logged dogfood run — its prompt's hard "Output ONLY a JSON array" constraint appears to prevent the narration problem `x-review-with-cursor` hit. That sibling skill's own prompt (invoking `/x-code-review-standards` rather than a self-contained JSON instruction) narrated instead of answering in 3 of 4 `plan`-mode runs (2026-09-09/10, clean-baseline data in its own skill file) and switched its default to `ask`. This loop stays on `plan` — different prompt shape, no measured problem here — but if a future run of *this* skill starts narrating instead of emitting JSON, `ask` is the first thing to try, not a mystery to re-diagnose from scratch. |

## `x-review-with-cursor`'s own measured choices

That sibling skill keeps its measured data (the mode cost/reliability log, the anti-narration prompt's necessity) in its own skill file rather than a doc, since it's meant to stay small. Noted here too so a future skill-file trim doesn't lose the reasoning even if it loses the raw log: `--mode ask` is its default because `--mode plan` narrated instead of answering in 3 of 4 real runs (including one with the anti-narration instruction already present) versus 2 of 2 successes for `ask` — see `x-review-with-cursor/SKILL.md`'s own log table for the numbers.

## Still open

- `--model-round2` (drop reasoning tier on later rounds) — opt-in, **zero runs**.
- Two-consecutive-zero-new stop — **never observed**; every dogfood run hit the round cap first.
- Non-Claude-Code hosts (Copilot, Crush, Pi, Qwen Code, Grok CLI, Factory Droid, Devin) — see the targets row above. Tracked as a backlog item on the GitHub project board (github.com/users/andrej-kolic/projects/8): add each back to `targets` individually once it's actually been dogfooded, not before.
- **Ship-bar question, unresolved (2026-09-10 dogfooding finding):** schema support for `disable-model-invocation` (what the target list is filtered on) isn't the same claim as "this host actually honors the flag" or "this host injects `ARGUMENTS` the way Claude Code does." Current answer in practice is "appear in the picker, warn in the body, echo resolved flags before calling Cursor" (see Setup step 2) rather than fail-closed the way `agentsskills` was excluded outright. That's a defensible, consistent choice — but it's a choice, not a default, and the next target-list edit should treat "rulesync has the field" as necessary, not sufficient.

CLI `usage` numbers from dogfood are directional, not exact (implausible `inputTokens` showed up in test calls). Do not treat calibration counts as a model bake-off; they are raw finding counts, often dominated by repeats — log new-CONFIRMED-per-round in new rows.

## Sources (short)

- Exclusion list / memory across trials: Reflexion; CodeRabbit in production (still re-flags sometimes).
- Two consecutive clean rounds: LLM audit-fix loops with a dip-rise-fall curve; iterative self-refine stopping rules.
- Build/test gate: Aider (test after every edit, retry, only proceed on green).
- Repeat keying: no perfect `file:line` fix exists (GitHub review comment anchoring included).
- Second model: mixed literature; independent verification of each finding is the version that helps.

Market vs built-in `/code-review` and third-party tools: vault note `review-loop-market-c` (keep the custom skill for cross-model + multi-round memory; `/code-review` is a different job).

## Relationship to `x-code-review-standards`

Deliberately not merged. `x-code-review-standards`'s broader "what to look for" (Design, Complexity, Consistency, …) targets a human reader and doesn't map onto this loop's narrow correctness/simplification/efficiency scope, which Step 5 already excludes design-level findings from (`CONFIRMED-DECLINED`, "needs a design decision"). Folding in the extra categories would also invalidate the calibration table in `x-review-with-cursor-loop/SKILL.md`, which is measured against the current three-category prompt. If a design/consistency-level finding gets declined here, running `x-code-review-standards` by hand on the same diff is the intended follow-up, not an automatic step in this loop.
