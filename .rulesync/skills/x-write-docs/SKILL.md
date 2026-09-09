---
name: x-write-docs
description: Write or substantially update a README, tutorial, or how-to guide — pick the right structure per artifact type and follow README/tutorial writing conventions.
targets: ["claudecode", "cursor", "agentsskills"]
---

<!-- playbook:x-write-docs v1 (2026-09-09) -->

Procedure for drafting or substantially rewriting documentation. Defer to the target project's own `documentation` rule (or an equivalent written convention) for which [Diátaxis](https://diataxis.fr/) mode applies and for README-length/plain-language constraints — this skill is the checklist for actually writing the artifact once the mode is chosen, not a second copy of that rule.

## README

Include only the sections that apply — a small project doesn't need all of these:
1. Title + one-line description of what it *does*, not what it is.
2. Install / quick start — exact commands; call out version/OS requirements as their own line if any exist.
3. Usage — smallest working example inline, with expected output; link out to `docs/` for anything longer.
4. Configuration/API — only if the project has one worth documenting at README level.
5. Contributing — state whether it's open, and how to start, even in one sentence.
6. License.

### Opener, for a project with adjacent competitors

If the project could be mistaken for a nearby category (a tool that looks like it does the same job as a bigger, better-known one), the opener needs to do more than describe — it needs to place the project correctly on the first read:
- **Tagline** (one line, under badges): the real differentiator, not the generic category ("markdown-native memory shared across agents," not "an AI memory tool").
- **A short "What it is not" section**: name the adjacent category by its real shape (e.g. "not auto-capture RAG") and say why that's a deliberate choice, not a missing feature. This does more disambiguating work than a longer feature list.
- Cut any opening line every competitor's README also uses — it reads as generic, not as this project's own claim.

## Tutorial

One fixed happy path, no branching, no assumed prior knowledge of the tool itself (state prerequisites explicitly instead of assuming them). Every step must leave the reader with something visibly working — a tutorial that ends without a working result failed its own job.

## How-to guide

Assumes a competent reader who already knows the tool. Solves one specific, real problem. Steps can branch or be skipped depending on the reader's situation — terser than a tutorial, no hand-holding.

## Reference / explanation

Reference: facts to look up, organized for scanning (tables over prose). Explanation: background and rationale, no steps to follow.

## Writing it

- Front-load the important information — a reader scans before they read.
- Short sentences. Cut a word if the sentence survives without it.
- Update the doc in the same change that changes the behavior it describes.
