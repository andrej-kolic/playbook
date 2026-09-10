# playbook

User-level custom skills, plus portable AI-agent rules, for Claude Code, Cursor, and — per skill — a broader set of coding agents; see each skill's own `targets` for the exact list rather than trusting a fixed list here, which goes stale as skills add targets. [rulesync](https://github.com/dyoshikawa/rulesync) generates host copies from `.rulesync/`. Edit the `.rulesync/` files only.

The repo can generate for Claude Code, Cursor, and other coding agents per skill — rules stay Claude Code/Cursor only, since skills reach further than rules do. Individual skills/rules should only list hosts they actually run *in*. A skill that *calls* Cursor's CLI is not a Cursor skill.

## Install

```bash
pnpm install
pnpm generate:user
```

Writes each skill to the user-level dirs of its `targets` (e.g. `claudecode` → `~/.claude/skills/`, `cursor` → `~/.cursor/skills/`, `agentsskills` → `~/.agents/skills/`). Preview with `pnpm generate:user --dry-run`. This only writes, never prunes — renaming or removing a skill here leaves the old directory behind at the destination; remove it by hand (`rm -rf ~/.claude/skills/<old-name>`, per host). Don't use `--delete` for this: it wipes everything else already in that shared directory too, including other projects' skills (e.g. Grounder's).

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

### Current skills

Skills use an `x-` prefix — this repo distributes many skills into the same shared, flat `~/.claude/skills/`/`~/.agents/skills/` directories other projects' skills also land in (e.g. Grounder's own `grounder-*` skills), so a consistent prefix signals provenance and avoids name collisions.

| Skill | What it does |
|---|---|
| `x-write-docs` | Checklist for writing/updating a README, tutorial, or how-to guide — defers mode selection to the `documentation` rule, adds the concrete structure and opener guidance that rule doesn't cover. |
| `x-research` | Structured research procedure for "what are the best practices / industry standards / what do other projects do" requests — ground in the current project, name real standards, check prominent implementations, close with one ranked recommendation. Includes a competitive-positioning variant. |
| `x-code-review-standards` | Human-facing review standards (what to look for, standard of approval, scope) and Conventional Comments labeling — for reviews outside `/code-review` and the two skills below. |
| `x-review-with-cursor` | One Cursor CLI review opinion, formatted per `x-code-review-standards` — no verify pass, no auto-fix. See below for flags. |
| `x-review-with-cursor-loop` | Cross-model review loop: Cursor's `agent` CLI reviews, the host verifies and fixes, multiple rounds with a challengeable exclusion list. See below for flags. |

`x-code-review-standards` is manual-invocation only (`disable-model-invocation: true`), so it never competes with the built-in `/code-review`'s auto-trigger — and it deliberately skips the `agentsskills` target for the same reason: that standard has no `disable-model-invocation` field, so shipping there would silently drop the manual-only guarantee.

### `x-review-with-cursor` and `x-review-with-cursor-loop`

Both Claude Code-hosted, for now, and not installed as a Cursor skill, since each shells out to Cursor's own CLI (`cursor` will never be a target for that reason). Other hosts are real candidates, not yet dogfooded — why, and the candidate list: [docs/x-review-with-cursor-loop.md](docs/x-review-with-cursor-loop.md).

Same `--base` flag, same semantics, on both:
- `--base <ref>` — diff vs that branch, tag, commit hash, or relative ref like `HEAD~5` (default `main`)
- `--base worktree` — uncommitted staged+unstaged+untracked changes; allowed on `main`

`x-review-with-cursor` also takes `--model <name>` (default `cursor-grok-4.6-high-fast`, never `auto`) and `--mode plan|ask` (default `ask` — measured more reliable, see the skill's own log table) for a single pass with no fix. `x-review-with-cursor-loop` also takes `--model` (same rule) plus `--rounds`, `--model-round2`, and `--scope` for the iterative verify-and-fix loop — why it's shaped this way: [docs/x-review-with-cursor-loop.md](docs/x-review-with-cursor-loop.md).

## Rules

Source of truth is `.rulesync/rules/<name>.md`, all `root: false` **modular** rules — they generate to each tool's native per-file rules location (Claude Code Modular Rules under `.claude/rules/`, Cursor project rules under `.cursor/rules/`), never to a project's own `CLAUDE.md` or `AGENTS.md`. Unlike skills, rules are meant to be **per-project**, usually in repos other than this one — fetch them from this repo's GitHub remote rather than installing them here:

```bash
rulesync fetch andrej-kolic/playbook -f rules -t rulesync -p .rulesync
rulesync generate -f rules -t claudecode,cursor
```

(or point `--input-roots` at a local playbook checkout's `.rulesync/` directory instead of fetching — it must be the directory that directly contains `rules/`, not the checkout root)

Each rule carries a `<!-- playbook:<name> vN (date) -->` comment as its first body line — bumped by hand on meaningful changes, so a stale fetched copy is visible to a person reading it, not just to tooling.

### Add a rule

1. Create `.rulesync/rules/<name>.md` with `root: false`, real `globs` (or `cursor: { alwaysApply: true }` only for a rule with no natural file-type scope — `conversation-style`, `git`, `testing`, and `security` all ship this way), and a versioned first body line
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
