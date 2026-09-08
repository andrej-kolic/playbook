# playbook

User-level custom skills, plus portable AI-agent rules, for Claude Code and Cursor. [rulesync](https://github.com/dyoshikawa/rulesync) generates host copies from `.rulesync/`. Edit the `.rulesync/` files only.

The repo can generate for both Claude Code and Cursor. Individual skills/rules should only list hosts they actually run *in*. A skill that *calls* Cursor's CLI is not a Cursor skill.

## Install

```bash
pnpm install
pnpm generate:user
```

Writes each skill to the user-level dirs of its `targets` (Claude Code → `~/.claude/skills/`). Preview with `pnpm generate:user --dry-run`.

Project copies (this repo only, gitignored):

```bash
pnpm generate
```

## Skills

Source of truth is `.rulesync/skills/<name>/SKILL.md`. Per-skill `targets` decide which hosts get a copy (`claudecode`, `cursor`, …). Shared frontmatter (`disable-model-invocation`, …) belongs at the **root** of the rulesync `SKILL.md`, not only under a host section.

### Add a skill

1. Create `.rulesync/skills/<name>/SKILL.md`
2. Set `name`, `description`, `targets` (only hosts that should invoke it), and any shared flags at the root
3. Run `pnpm generate` and `pnpm generate:user`

### `x-review-in-claude-with-cursor`

Claude-hosted (including Claude as a plugin in another editor). Cursor's `agent` CLI is the reviewer, not the host. Not installed as a Cursor skill.

- `--base <ref>` — diff vs that branch, tag, commit hash, or relative ref like `HEAD~5` (default `main`)
- `--base worktree` — uncommitted staged+unstaged changes; allowed on `main`

Why the loop is shaped this way: [docs/x-review-in-claude-with-cursor.md](docs/x-review-in-claude-with-cursor.md).

## Rules

Source of truth is `.rulesync/rules/<name>.md`, all `root: false` **modular** rules — they generate to each tool's native per-file rules location (Claude Code Modular Rules under `.claude/rules/`, Cursor project rules under `.cursor/rules/`), never to a project's own `CLAUDE.md` or `AGENTS.md`. Unlike skills, rules are meant to be **per-project**, usually in repos other than this one — fetch them from this repo's GitHub remote rather than installing them here:

```bash
rulesync fetch andrej-kolic/playbook -f rules -t rulesync -p .rulesync
rulesync generate -f rules -t claudecode,cursor
```

(or point `--input-roots` at a local playbook checkout instead of fetching)

Each rule carries a `<!-- playbook:<name> vN (date) -->` comment as its first body line — bumped by hand on meaningful changes, so a stale fetched copy is visible to a person reading it, not just to tooling.

### Add a rule

1. Create `.rulesync/rules/<name>.md` with `root: false`, real `globs` (or `cursor: { alwaysApply: true }` only for a rule with no natural file-type scope, like `conversation-style`), and a versioned first body line
2. State what the rule does *not* cover, and name the sibling rule that does, to avoid overlap
3. If the rule concerns file content (not chat behavior), have it defer to a target project's own established conventions first, and only apply as a fallback default
4. Run `pnpm generate` to sanity-check locally, then commit — other projects pick it up via `rulesync fetch`/`generate`, not via this repo's own install

### Current rules

| Rule | Scope |
|---|---|
| `conversation-style` | How to open, structure, and close chat responses |
| `documentation` | README and `docs/` prose |
| `jsdoc` | `/** */` API doc comments |
| `git` | Commit message format and granularity |
| `testing` | What's worth a test, and how to write one that stays useful |
| `security` | Trust boundaries, secrets, and safe sinks |
