# playbook

User-level custom skills, plus portable AI-agent rules, for Claude Code, Cursor, and — per skill — a broader set of coding agents; see each skill's own `targets` for the exact list rather than trusting a fixed list here, which goes stale as skills add targets. [rulesync](https://github.com/dyoshikawa/rulesync) generates host copies from `.rulesync/`. Edit the `.rulesync/` files only.

The repo can generate for Claude Code, Cursor, and other coding agents per skill — rules stay Claude Code/Cursor only, since skills reach further than rules do. Individual skills/rules should only list hosts they actually run *in*. A skill that *calls* Cursor's CLI is not a Cursor skill.

## Install

On any laptop, with no clone:

```bash
pnpm --config.dlx-cache-max-age=0 dlx github:andrej-kolic/playbook skills
```

The cache flag makes `pnpm dlx` fetch the latest `main` instead of reusing a copy it downloaded earlier. From a clone, `pnpm install` then `pnpm skills:install` does the same from the working tree, which is how to try skill edits before pushing them.

Writes each skill to the user-level dirs of its `targets` (`claudecode` → `~/.claude/skills/`, `cursor` → `~/.cursor/skills/`). Skills install only user-level and rules only per project (see [Add to a project](#add-to-a-project)), so nothing loads twice. It also removes a playbook skill the playbook no longer has for that host, such as one renamed or removed here; it recognizes its own skills by their source line, so other tools' skills (e.g. Grounder's) are never touched. Add `--dry-run` to either command to preview, or `--check` to list outdated and leftover skills without changing anything (exits with 1 if there are any). Don't use rulesync's `--delete` for this: it wipes everything else in those shared folders too.

Re-run `pnpm skills:install` (and confirm the deployed copy's mtime moved) before dogfood-testing a skill you just edited — a stale global copy silently keeps serving the pre-edit behavior. Has caused a real failure here before: a fix that stopped a reviewer skill from improvising a fake diff when git access was blocked did nothing for a dogfood run whose global copy predated the fix, and that run hit the exact failure mode the fix was for.

This repo's own rules, generated into `.claude/rules/` and `.cursor/rules/` and committed like in any other project. Skills come only from the user-level install:

```bash
pnpm generate
```

## Skills

Source of truth is `.rulesync/skills/<name>/SKILL.md`. Per-skill `targets` decide which hosts get a copy (`claudecode`, `cursor`, …). Shared frontmatter (`disable-model-invocation`, …) belongs at the **root** of the rulesync `SKILL.md`, not only under a host section.

### Add a skill

1. Create `.rulesync/skills/<name>/SKILL.md`
2. Set `name`, `description`, `targets` (only hosts that should invoke it), and any shared flags at the root
3. Start the body with the version and source comment lines (see [Versioning](#versioning) for the format)
4. Run `pnpm skills:install`

### Current skills

Skills use an `x-` prefix — this repo distributes many skills into the same shared, flat `~/.claude/skills/` and `~/.cursor/skills/` directories other projects' skills also land in (e.g. Grounder's own `grounder-*` skills), so a consistent prefix signals provenance and avoids name collisions.

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

`x-review-with-cursor` also takes `--model <name>` (default `grok-4.7-high-fast`, untested — zero dogfood runs, never `auto`) and `--mode plan|ask` (default `ask` — measured more reliable, see the skill's own log table) for a single pass with no fix. `x-review-with-cursor-loop` also takes `--model` (same rule) plus `--rounds`, `--model-round2`, and `--scope` for the iterative verify-and-fix loop — why it's shaped this way: [docs/x-review-with-cursor-loop.md](docs/x-review-with-cursor-loop.md).

## Rules

Source of truth is `.rulesync/rules/<name>.md`, all `root: false` **modular** rules — they generate to each tool's native per-file rules location (Claude Code Modular Rules under `.claude/rules/`, Cursor project rules under `.cursor/rules/`), never to a project's own `CLAUDE.md` or `AGENTS.md`. Rules are installed **per-project**, usually into repos other than this one, from this repo's GitHub remote.

### Add to a project

pnpm only, tested with rulesync 27 and pnpm 11. Projects get the rulesync major the playbook itself uses (`dependencies` in its `package.json`), and an older one is upgraded. From the target project's root:

```bash
pnpm dlx github:andrej-kolic/playbook rules
```

It installs rulesync, adds the playbook as a source pinned in `rulesync.lock`, gitignores rulesync's fetched copy, adds `.claude/rules/`, `.cursor/rules/` and `rulesync.jsonc` to `.prettierignore` (creating it if the project uses Prettier) so a formatter doesn't rewrite them, adds three scripts, and generates the rules for Claude Code and Cursor into `.claude/rules/` and `.cursor/rules/`. It overwrites its three scripts if they differ and prints what it replaced; other files that are already set up are left alone, so running it again is safe. It stops without changing anything if `.rulesync/rules/` still holds copies from the old `rulesync fetch` setup (delete those and the old `rules:fetch`, `rules:generate` and `rules:install` scripts first), or if `rulesync.jsonc` sets `"delete": true`, which would wipe hand-written rules. It doesn't touch Biome or dprint configs: if the project uses one, exclude those three paths there yourself. If it fails with `GitHub API rate limit exceeded`, rerun it as `GITHUB_TOKEN=$(gh auth token) pnpm dlx …`. `pnpm dlx` reuses the copy it downloaded on an earlier run, so to rerun it soon after a playbook change, add `--config.dlx-cache-max-age=0`: `pnpm --config.dlx-cache-max-age=0 dlx github:andrej-kolic/playbook rules`. Each step by hand, and how to remove it all again: [docs/add-to-a-project.md](docs/add-to-a-project.md).

Then commit the generated `.claude/rules/` and `.cursor/rules/` along with `rulesync.jsonc`, `rulesync.lock`, `.gitignore`, `.prettierignore` if it changed, `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`. Committing the generated rules means agents that only check out the repo, such as cloud sessions and review bots, get them without an install step, and a rule change shows up as text in review. A project set up by an earlier version ignores those two folders, and `playbook rules` warns about it: delete their lines from `.gitignore` and commit the folders.

The scripts it adds:

- `pnpm rules:install` regenerates the rules from the commit pinned in `rulesync.lock`, and never changes that file. Run it to restore the committed rules after a bad edit, or in CI.
- `pnpm rules:outdated` lists the rules whose text on the playbook's `main` differs from what `rulesync.lock` pins (changed, added or removed), and exits with 1 if there are any. A playbook commit that changed no rule doesn't count. GitHub caches the rule files for up to 5 minutes, so a rule change pushed just now may not show yet. It calls the GitHub API; if it hits the rate limit, rerun it as `GITHUB_TOKEN=$(gh auth token) pnpm rules:outdated`. A project set up by an earlier version may still run an older command here (`rulesync install --outdated`, or `playbook outdated`, which no longer exists); rerun `playbook rules` to update it.
- `pnpm rules:update` moves to the latest rules, rewrites `rulesync.lock`, and regenerates the rule files. Commit them together; everyone else gets the new rules when they pull.

(To try unpushed rule changes, run `rulesync generate` with `--input-roots` pointing at a local playbook checkout's `.rulesync/` directory — the directory that directly contains `rules/`, not the checkout root.)

### Versioning

Each rule and skill starts its body with two comment lines:

```
<!-- playbook:<name> vN (date)[ — <what changed, a few words>] -->
<!-- source: andrej-kolic/playbook <path>; edits elsewhere are overwritten -->
```

The version is bumped by hand on meaningful changes, so a stale installed copy is visible to a person reading it, not just to tooling; the change note is optional. The source line never changes, and tells anyone who opens a deployed copy where to edit instead.

### Verifying rules load

A rule on disk is not a rule in context. What loads, tested rather than assumed:

- **`.claude/rules/*.md` in a project** — loads at session start, with no `CLAUDE.md` and no import.
- **A root `AGENTS.md`** — loads natively, so a `CLAUDE.md` containing only `@AGENTS.md` is redundant.
- **`~/.claude/rules/*.md`** — loads in any directory, including outside a repo.
- **Rules with `paths:` frontmatter** (`jsdoc`, `documentation`) — do *not* load at session start; they attach when a matching file is touched. A missing one is usually this, not a broken install.

Check a target repo after `rules:install`:

```bash
claude -p "Do not use any tools. List the exact file paths of every instruction or rules file loaded into your context at session start." --model claude-haiku-4-5-20251001
```

That is the only way to tell a rule that loaded from one that merely exists — including a stale copy, which the version marker only reveals to someone who opens the file.

### Add a rule

1. Create `.rulesync/rules/<name>.md` with `root: false`, real `globs` (or `cursor: { alwaysApply: true }` only for a rule with no natural file-type scope — `conversation-style`, `git`, `testing`, and `security` all ship this way), and the version and source comment lines at the top of the body
2. State what the rule does *not* cover, and name the sibling rule that does, to avoid overlap
3. If the rule concerns file content (not chat behavior), state a precedence, not a bare deferral: machine-enforced config → what the project states for agents → the rule's defaults. Whether the repo's existing practice outranks those defaults is a per-rule call — for `jsdoc` and `documentation` it does, since matching neighbouring files *is* the requirement; for `git` it does not, since a commit has no neighbours. See `git.md`.
4. Run `pnpm generate`, then commit the rule with its generated copies in `.claude/rules/` and `.cursor/rules/` — CI fails via `pnpm generate:check` if they don't match; other projects pick it up via `pnpm rules:update`

### Current rules

| Rule | Scope |
|---|---|
| `concision` | Length and wording of anything written: budgets, lists, naming, pointers |
| `conversation-style` | Structure of a response: opening, hierarchy, closing |
| `documentation` | README and `docs/` prose |
| `jsdoc` | `/** */` API doc comments |
| `git` | Commit message format, granularity, and what a commit carries |
| `testing` | What's worth a test, and how to write one that stays useful |
| `security` | Trust boundaries, secrets, and safe sinks |
