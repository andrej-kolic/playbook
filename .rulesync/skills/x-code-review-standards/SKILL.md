---
name: x-code-review-standards
description: Structured, human-facing code review — what to look for and how to label findings. The standards/labeling layer for any review meant for a person; also the format x-review-with-cursor asks Cursor to use, and distinct from /code-review and x-review-with-cursor-loop.
targets: ["claudecode", "cursor"]
disable-model-invocation: true
---

<!-- playbook:x-code-review-standards v2 (2026-09-10) — targets: claudecode+cursor; other hosts are undogfooded candidates, see docs/x-review-with-cursor-loop.md -->

Not a replacement for `/code-review` (Claude-native pass, `--fix`/`--comment`), `x-review-with-cursor-loop` (cross-model, multi-round, working-tree-fix loop), or `x-review-with-cursor` (single-pass Cursor opinion, no fix) — use those for their jobs. This skill is the standards/labeling layer for a review meant to be read by a person: a teammate's PR, or an ad-hoc "review this" outside any automated flow. It's also the content `x-review-with-cursor` invokes inside Cursor for that single-pass opinion.

## What to look for

Per change under review, roughly in this order — design problems make style comments moot:
1. **Design** — does this fit the system; is this the right approach.
2. **Functionality** — does it do what the author intended, and is that what the user actually needs.
3. **Complexity** — can another engineer understand this quickly; flag anything over-engineered for what it solves.
4. **Tests** — correct, sensible, and does the change actually need one (defer to the project's own `testing` rule if present).
5. **Naming**, **comments** (why, not what), **style** (defer to the project's own style/lint config).
6. **Consistency** with the rest of the codebase, unless the existing pattern is itself the bug.
7. Say what's good, not just what's wrong — a review that's all complaints reads harsher than intended.

## Standard of approval

Approve once the change **definitely improves** overall code health — don't hold it for a hypothetical perfect version. A change doesn't need to match the reviewer's own preferred implementation to be good enough to land.

## Scope

Flag a change that bundles more than one conceptual thing, and recommend splitting rather than reviewing it as one unit — a large, mixed-purpose diff produces a worse review than the same content split.

## Labeling findings

Use [Conventional Comments](https://conventionalcomments.org/): `<label> [decorations]: <subject>`.
- **praise** — call out something done well.
- **nitpick** — trivial, non-blocking by convention.
- **suggestion** — a concrete proposed change.
- **issue** — a real problem; blocking unless decorated `(non-blocking)`.
- **question** — flag uncertainty about whether something is actually a problem; don't assert it as one.

Add `(security)` or `(non-blocking)` decorations where they change how a finding should be triaged.
