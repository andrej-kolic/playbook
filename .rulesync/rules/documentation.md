---
root: false
targets: ["claudecode", "cursor"]
description: "Documentation and README conventions: which mode a doc is, and how to structure it."
globs: []
cursor:
  alwaysApply: true
---

<!-- playbook:documentation v1 (2026-09-08) -->

# Documentation Conventions

Governs README and `docs/` prose — not JSDoc/API comments (see the separate `jsdoc` rule) and not conversational responses (see `conversation-style`).

Defer to this project's own established documentation conventions where they exist — a style guide, `CONTRIBUTING.md`, or an existing `docs/` structure. Use the rules below only where no such convention exists.

1. **Know the mode before you write** — Per the [Diátaxis](https://diataxis.fr/) framework, a doc is one of four things: a tutorial (learning by doing), a how-to guide (steps for a specific task), a reference (facts to look up), or an explanation (background and why). Don't mix modes within one document — a doc that's half quick-start, half deep API reference serves neither reader well.
2. **Keep the README short** — Overview, quick start, links out for depth. Push reference detail and background explanation into `docs/`, not the README itself.
3. **Scale structure to the project** — For a small project, "know your mode" inside a couple of files is enough. For a larger one, grow into the full Diátaxis structure — separate tutorial, how-to, reference, and explanation docs (or a dedicated docs site) — rather than cramming all four into one sprawling README.
4. **Docs-as-code** — Update documentation in the same change that changes the behavior it describes, not as a follow-up. A doc describing old behavior is actively worse than no doc.
5. **Plain language** — Cut fancy words, filler, and unexplained jargon. A reader looking something up wants the fact, not the buildup.
