# Install skills

```bash
pnpm --config.dlx-cache-max-age=0 dlx github:andrej-kolic/playbook skills
```

The cache flag makes `pnpm dlx` fetch the latest `main` instead of reusing a copy it downloaded earlier.

## What it changes

It writes each skill to the user-level folder of every host in that skill's `targets`: `claudecode` → `~/.claude/skills/`, `cursor` → `~/.cursor/skills/`. Skills install only per user, and rules only per project, so nothing loads twice.

It also removes a playbook skill the playbook no longer has for that host, such as one renamed or removed. It recognizes its own skills by their source line, so other tools' skills (Grounder's `grounder-*`, for example) are never touched.

Don't use rulesync's `--delete` for this: it wipes everything else in those shared folders too.

## Options

- `--dry-run` lists what it would write and remove, without changing anything.
- `--check` lists outdated and leftover skills without changing anything, and exits with 1 if there are any.

## From a clone

```bash
pnpm install
pnpm skills:install
```

This installs from the working tree, which is how to try skill edits before pushing them. The same options work: `pnpm skills:install --dry-run`.
