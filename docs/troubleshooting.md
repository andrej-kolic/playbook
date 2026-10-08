# Troubleshooting

| Symptom | Fix |
|---|---|
| `GitHub API rate limit exceeded` from `playbook rules` | Rerun with a token: `GITHUB_TOKEN=$(gh auth token) pnpm dlx github:andrej-kolic/playbook rules` |
| `failed with 403` or `429` from `rules:outdated` | Rerun with a token: `GITHUB_TOKEN=$(gh auth token) pnpm rules:outdated` |
| `pnpm dlx` runs an older playbook than `main` | Add `--config.dlx-cache-max-age=0`: `pnpm --config.dlx-cache-max-age=0 dlx github:andrej-kolic/playbook rules` |
| `rules:outdated` doesn't show a rule change pushed a moment ago | GitHub caches rule files for up to 5 minutes; rerun later |
| An edited skill still behaves the old way | The installed copy is stale. Rerun `pnpm skills:install` and check that the installed file's modified time changed |
| `playbook rules` stops: `.rulesync/rules/ has rule copies from the old fetch setup` | Run the `git rm` and `pnpm pkg delete` commands it prints, then rerun `playbook rules` |
| `playbook rules` stops: `rulesync.jsonc sets "delete": true` | Set it to `false` or remove it; otherwise every generate wipes hand-written rules |
| `warning: .gitignore ignores the generated rules` | Delete those lines from `.gitignore`, then commit `.claude/rules/` and `.cursor/rules/` |
| `rules:outdated` runs `rulesync install --outdated` or `playbook outdated` | The project was set up by an older version; rerun `playbook rules` |
| `rules:install` shows the generated rules as changed, or `prettier --check` fails on `rulesync.jsonc` | A formatter is rewriting them. Exclude `.claude/rules/`, `.cursor/rules/` and `rulesync.jsonc` from it; `playbook rules` does this only for Prettier |
| A rule doesn't seem to load | See below |

## Check which rules load

A rule on disk is not necessarily in the agent's context. Tested so far:

- **`.claude/rules/*.md` in a project**: loads at session start, with no `CLAUDE.md` and no import.
- **A root `AGENTS.md`**: loads on its own, so a `CLAUDE.md` containing only `@AGENTS.md` is redundant.
- **`~/.claude/rules/*.md`**: loads in any directory, including outside a repo.
- **Rules with `paths:` frontmatter** (`jsdoc`, `documentation`): do *not* load at session start. They attach when a matching file is touched, so a missing one is usually this, not a broken install.

To list what actually loaded, run this in the project:

```bash
claude -p "Do not use any tools. List the exact file paths of every instruction or rules file loaded into your context at session start." --model haiku
```

It is the only way to tell a rule that loaded from one that only exists on disk. That includes a stale copy, which the version line shows only to someone who opens the file.
