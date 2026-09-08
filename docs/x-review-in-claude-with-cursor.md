# `x-review-in-claude-with-cursor` — why it is shaped this way

The skill file is the runbook. This note is the rationale so later edits do not undo measured choices. Chronology, dogfood bugs, and session logs stay in the vault plan (`cursor-review-loop-skill`) and the market-comparison note — not here.

Host is Claude (Claude Code, including Claude as a plugin). Cursor `agent` is the reviewer CLI, not the skill host.

## Decisions

| Choice | Why |
|---|---|
| No `Agent`/`Task` subagents — inline tool calls only | Subagent start reloads a cold system prompt and drops this session's cached context. Held up across every dogfood run. |
| Default model `cursor-grok-4.6-high-fast`, never `auto` | Cost profile from calibration, not a guessed plateau. `auto` can route to Claude and remove the independent reviewer. Do not assert a measured false-positive ranking vs other models; Grok's comparison log is gone. |
| `--mode plan` on Cursor `agent`, no `--force`/`--yolo` | Read-only reviewer. Only Claude edits. |
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

## Still open

- `--model-round2` (drop reasoning tier on later rounds) — opt-in, **zero runs**.
- Two-consecutive-zero-new stop — **never observed**; every dogfood run hit the round cap first.
- Copilot (or any other non-Claude host) — not spiked; do not invent a port.

CLI `usage` numbers from dogfood are directional, not exact (implausible `inputTokens` showed up in test calls). Do not treat calibration counts as a model bake-off; they are raw finding counts, often dominated by repeats — log new-CONFIRMED-per-round in new rows.

## Sources (short)

- Exclusion list / memory across trials: Reflexion; CodeRabbit in production (still re-flags sometimes).
- Two consecutive clean rounds: LLM audit-fix loops with a dip-rise-fall curve; iterative self-refine stopping rules.
- Build/test gate: Aider (test after every edit, retry, only proceed on green).
- Repeat keying: no perfect `file:line` fix exists (GitHub review comment anchoring included).
- Second model: mixed literature; independent verification of each finding is the version that helps.

Market vs built-in `/code-review` and third-party tools: vault note `review-loop-market-c` (keep the custom skill for cross-model + multi-round memory; `/code-review` is a different job).
