# playbook

User-level custom skills. Source of truth is `.rulesync/skills/<name>/SKILL.md`. [rulesync](https://github.com/dyoshikawa/rulesync) generates host copies. Edit the `.rulesync/` file only.

Per-skill `targets` decide which hosts get a copy (`claudecode`, `cursor`, …). Shared frontmatter (`disable-model-invocation`, …) belongs at the **root** of the rulesync `SKILL.md`, not only under a host section.

The repo can generate for both Claude Code and Cursor. Individual skills should only list hosts they actually run *in*. A skill that *calls* Cursor's CLI is not a Cursor skill.

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

## Add a skill

1. Create `.rulesync/skills/<name>/SKILL.md`
2. Set `name`, `description`, `targets` (only hosts that should invoke it), and any shared flags at the root
3. Run `pnpm generate` and `pnpm generate:user`

## Skills

### `x-review-in-claude-with-cursor`

Claude-hosted (including Claude as a plugin in another editor). Cursor's `agent` CLI is the reviewer, not the host. Not installed as a Cursor skill.

- `--base <branch>` — diff vs that branch (default `main`)
- `--base worktree` — uncommitted staged+unstaged changes; allowed on `main`

Why the loop is shaped this way: [docs/x-review-in-claude-with-cursor.md](docs/x-review-in-claude-with-cursor.md).
