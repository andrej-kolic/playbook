# Design notes

Why skills and rules install the way they do. For how to install them, see the [README](../README.md).

## Skills per user, rules per project

Skills install into the user-level folders (`~/.claude/skills/`, `~/.cursor/skills/`), and rules into each project's `.claude/rules/` and `.cursor/rules/`. Neither installs in both places, so nothing loads twice.

Rules are modular (`root: false`): they generate into each host's per-file rules folder, never into a project's own `CLAUDE.md` or `AGENTS.md`. Projects commit the generated rules, so agents that only check out the repo, such as cloud sessions and review bots, get them without an install step, and a rule change shows up as text in review.

## Which hosts get what

Rules generate for Claude Code and Cursor only. Skills reach further: each one's `targets` can name any rulesync host.

A skill lists only hosts it actually runs *in*. A skill that *calls* Cursor's CLI, like the two review skills, is not a Cursor skill, and listing Cursor as its target would mean Cursor invoking itself. Why those two stay Claude Code-only for now, and which hosts are candidates: [x-review-with-cursor-loop decisions](x-review-with-cursor-loop.md).

## The `x-` prefix

Skills from many sources share the same flat `~/.claude/skills/` and `~/.cursor/skills/` folders (Grounder's `grounder-*` skills land there too). The prefix shows where a skill came from and avoids name collisions.

## `x-code-review-standards` is manual-only

It sets `disable-model-invocation: true` so it never competes with the built-in `/code-review`, which triggers on its own. For the same reason it skips the `agentsskills` target: that standard has no `disable-model-invocation` field, so shipping there would silently drop the manual-only guarantee.

## Version lines

Each rule and skill starts with a version line, bumped by hand on meaningful changes, so a person reading an installed copy can see it is stale without any tooling. The source line below it tells anyone who opens an installed copy where to make edits instead. Format: [CONTRIBUTING.md](../CONTRIBUTING.md#version-lines).
