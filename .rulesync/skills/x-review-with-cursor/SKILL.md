---
name: x-review-with-cursor
description: Claude-hosted skill. Get one Cursor CLI review opinion, formatted per x-code-review-standards, with no verify pass and no auto-fix. For the iterative verify-and-fix loop, use x-review-with-cursor-loop instead.
targets:
  - claudecode
disable-model-invocation: true
---

<!-- playbook:x-review-with-cursor v1 (2026-09-10) -->

Automates "review this in Cursor, paste the result here" — a single outside opinion, not a verified/fixed one. If that opinion needs to be checked against the real code and turned into applied fixes, that's `x-review-with-cursor-loop`'s job, not this skill's.

**Host: Claude Code only, for now.** Cursor's `agent` CLI is the reviewer here, not the host — running this skill from within Cursor would mean Cursor invoking itself in its own `/` picker, so `cursor` will never be a target regardless. Other `disable-model-invocation`-supporting hosts (Copilot, Crush, Pi, Qwen Code, Grok CLI, Factory Droid, Devin) are real rulesync targets but deliberately not added yet — undogfooded, and the earlier attempt to add them broadly caused a real bug (`zed` shared `agentsskills`'s output path, leaking the manual-only guarantee to tools that don't honor the flag). Add a host back only once it's actually been run, not because the schema supports it — see docs/x-review-with-cursor-loop.md for the candidate list and tracking.

## Arguments

Parse from `ARGUMENTS` (all optional):
- `--base <ref>|worktree` — diff base, default `main`. Any git ref (branch, tag, commit hash, `HEAD~N`). Special value `worktree`: review uncommitted staged+unstaged+untracked changes instead of a ref diff, and skip the "refuse to run on main" check. Same semantics as `x-review-with-cursor-loop`.
- `--model <name>` — Cursor model, default `cursor-grok-4.6-high-fast`. **Never `auto`** — it can route to a model from the same vendor/family as the host and defeat the point of an independent opinion.
- `--mode plan|ask` — Cursor CLI mode, default **`ask`**. Both are read-only and both block git identically (tested directly), so `ask` isn't a safety downgrade — it's a reliability upgrade. Measured over 6 real runs (see the log below), `plan` narrated instead of answering in 3 of 4 attempts, including one with the anti-narration instruction from Step 2 already in place; `ask` succeeded in 2 of 2, using slightly more tokens each time but never failing outright. A failed `plan` call still costs real tokens for zero output, so `ask`'s modest per-call overhead is cheaper in practice, not more expensive. `plan` remains available via this flag if a future run contradicts this — this default is measured, not assumed permanent.

## Procedure

**Step 1 — confirm and scope.**
1. `agent status`. If not logged in, tell the user to run `agent login` and stop.
2. Determine repo root and current branch: `git rev-parse --show-toplevel`, `git branch --show-current` (needed for step 4's refuse-on-main check — dogfooding found this step missing, 2026-09-10).
3. Confirm Cursor can actually see `x-code-review-standards` — check `.cursor/skills/x-code-review-standards/SKILL.md` (project) or `~/.cursor/skills/x-code-review-standards/SKILL.md` (global). If neither exists, tell the user to run `pnpm generate:user` (or the project's own `pnpm generate`) first and stop — otherwise Step 3's failure looks like "Cursor produced no findings" when the real cause is "Cursor doesn't have the skill to invoke."
4. Refuse to run on `main`/the base branch itself — **unless `--base worktree`**, which is allowed on any branch.
5. Compute the file list yourself, unrestricted — Cursor's `agent` can't run git under `--mode plan` (or `--mode ask`; both reject `git diff`/`git status` even though neither mutates anything — tested directly, don't assume otherwise). `git diff --name-only` alone misses **untracked new files** (found by dogfooding, 2026-09-10 — 3 of 8 real changed paths were silently dropped) — always union it with `git ls-files --others --exclude-standard`, deduped. `--base <ref>`: `mergeBase=$(git merge-base <ref> HEAD)`, files = `git diff --name-only "$mergeBase"` ∪ untracked (includes uncommitted changes automatically). `--base worktree`: files = `git diff --name-only HEAD` ∪ untracked.
6. Empty file list → tell the user there's nothing to review, stop.
7. State the resolved `--base`/`--model`/`--mode` before calling Cursor — on a host where `ARGUMENTS` injection is unverified, this surfaces a silent wrong-default (e.g. reviewing `main` when the user meant `worktree`) before the call happens, not after (dogfooding finding, 2026-09-10).

**Step 2 — call Cursor, one pass.**

```bash
agent -p --trust --mode <mode> --output-format json --model <model> --workspace <repo-root> \
  "/x-code-review-standards Review these files: <file list>. Running git yourself is blocked in this mode — don't guess the base ref, fetch from a remote, or reconstruct the diff from unrelated context; review the files as given and say so if something needs the actual diff to settle. Do NOT narrate your investigation or say what you're about to do — output ONLY the Conventional Comments findings directly, starting with the first finding's label. If you catch yourself about to write a sentence like 'I'll now write up the findings', skip it and write the finding instead. No findings found is a valid outcome — say so directly, don't narrate toward it either."
```

Never add `--force`/`--yolo`. Both modes stay read-only. The anti-narration instruction above is load-bearing, not decoration, but not sufficient on its own — see the log below: `plan` still failed once even with it present. `ask` is the default (see Arguments) because it's the more reliable one measured, not because it needs less prompting.

### Mode cost/reliability log (update as more A/B runs happen)

| Mode | Prompt | Context | Outcome | Usage |
|---|---|---|---|---|
| `plan` | original (no anti-narration) | this session (heavy cache) | FAILED — narration only | in=112,895 out=14,521 cacheRead=525,824 |
| `plan` | original (no anti-narration) | this session (heavy cache) | FAILED — narration only | in=118,432 out=15,544 cacheRead=469,632 |
| `plan` | + anti-narration instruction | this session (heavy cache) | SUCCESS — 9 findings | in=47,897 out=11,143 cacheRead=262,080 |
| `ask` | original (no anti-narration) | this session (heavy cache) | SUCCESS — 8 findings | in=60,910 out=13,173 cacheRead=414,272 |
| `plan` | + anti-narration instruction | fresh subagent, clean baseline | FAILED — narration only | in=64,264 out=15,342 cacheRead=356,224 |
| `ask` | + anti-narration instruction | fresh subagent, clean baseline | SUCCESS — 7 findings | in=69,803 out=16,403 cacheRead=396,224 |

**Tally: `plan` 1/4 success, `ask` 2/2 success** (2026-09-10). The two clean-baseline rows are the only apples-to-apples comparison (identical prompt, identical file list, fresh context, back-to-back) — `ask` cost ~9% more input/output tokens but actually produced findings; `plan`'s lower cost bought nothing. This is why `ask` is the default above. Log new rows here if this gets re-tested — small sample, and `plan`'s one success means it isn't *broken*, just less reliable so far.

**Step 3 — relay, don't paraphrase.**
The JSON envelope's `result` string is the answer. Check it actually contains labeled findings before treating it as a real review — a line starting with `praise`, `nitpick`, `suggestion`, `issue`, or `question` (the labels `x-code-review-standards` defines), optionally followed by a decoration like `(non-blocking)` or `(security)`, then a colon. Don't check for the literal substring `issue:` — a decorated label like `issue (non-blocking):` won't contain it, and a naive check misses every decorated finding (found by dogfooding this skill on itself, 2026-09-09). A `result` that's only narration ("I'll gather the diff...", no labels) is a failure, not a clean pass. But an explicit clean-pass statement ("No findings found." or a close variant, per Step 2's own instruction) is success with zero findings, not a failure — don't require a label on a deliberately-empty result (found by dogfooding, 2026-09-10: a correct empty pass was being misreported as "didn't produce real findings"). On an actual narration-only failure: tell the user plainly it didn't produce real findings, show what it did return, and stop — never present narration as if it were a review.

On success: relay Cursor's own findings as given, not summarized or re-worded — this is meant to be its independent opinion, not the host's retelling of it.

## Reporting

Always tell the user:
- Model and base/scope used, file count reviewed.
- Token usage from the CLI response's `usage` object (this skill keeps no log file — that's the loop skill's thing).
- Plainly: **this is one external opinion, unverified against the real code, nothing was fixed.** Deciding what to act on, or running `x-review-with-cursor-loop` for a verified/fixed pass instead, is a separate next step.
