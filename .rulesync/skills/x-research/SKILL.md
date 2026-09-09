---
name: x-research
description: Research a technical topic, tool/architecture choice, or positioning question — ground in the current project first, map it against named standards and prominent public implementations, then close with a ranked, sourced recommendation.
targets: ["claudecode", "cursor", "agentsskills"]
---

<!-- playbook:x-research v1 (2026-09-09) -->

For "research X, what are the best practices / industry standards / what are other projects doing" requests — not a quick lookup, and not code review. The point is to replace a guess with established knowledge, so every claim needs a real source.

## Procedure

1. **Ground first.** Read the current project's own relevant code/config/docs before researching outward — findings need to compare against what's actually there, not a generic assumption about what a project like this usually has.
2. **Find what the field actually standardized on** — named specs, governance bodies, canonical docs, official guides. Cite them by name, not "research shows" or "it's common to."
3. **Check prominent public implementations** actually doing this — real repos, real tools, existing catalogs/awesome-lists — before recommending something be built from scratch. Reuse over reinvention: if something is already 80% of the way there, say so instead of designing a new version.
4. **Map the current project against the standard**: what already matches (say so explicitly, don't just list gaps), and what's a real, specific gap.
5. **Turn gaps into a ranked list** — cheapest/most-standard fix first, not a flat wishlist.
6. **Name anti-patterns explicitly** when the research surfaces one ("the mistake everyone names is X") — a named failure mode is more actionable than a vague caution.
7. **Close with one recommended next step**, not a menu to choose from.

## Positioning / competitive research

When the topic is how a project compares to or should be positioned against others (not just an internal technical choice), add:
- A **landscape table**: peers/competitors against one real comparable metric (stars, downloads, adoption) — not a subjective ranking. Fetch the number live (e.g. `gh api repos/<org>/<repo>`, a package registry's API) at research time; never state a remembered or estimated figure as if it were current, and mark the table with the date it was pulled.
- A **channel/distribution matrix** if the question involves reaching users: where peers actually get found, fit/effort/timing per channel.
- **Stop saying / start saying**: the generic opening claim every peer uses, versus this project's actual, specific claim.
- **What not to do**: the tempting-but-wrong move (chasing a much bigger adjacent competitor, a launch channel that's actually oversaturated for this category) — named directly, with the reason.

## Sourcing discipline

- Cite named sources: a spec URL, a GitHub repo, an official guide, a dated report — not vague appeals to consensus.
- Tables over prose for any comparison — scannable beats narrated.
- Mark anything time-sensitive as a snapshot ("as of <date>") rather than presenting it as a permanent fact.
