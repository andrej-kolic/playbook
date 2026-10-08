# playbook

Shared rules and skills for AI coding agents: install the skills once per machine, and add the rules to any project with one command.

[rulesync](https://github.com/dyoshikawa/rulesync) generates each host's copy from `.rulesync/`. Edit only the files there.

## What's inside

**Skills** install once per user and work in every project. Each skill's `targets` lists the hosts it installs for.

| Skill | What it does |
|---|---|
| [`x-write-docs`](.rulesync/skills/x-write-docs/SKILL.md) | Writes or rewrites a README, tutorial or how-to guide |
| [`x-research`](.rulesync/skills/x-research/SKILL.md) | Researches a tool, architecture or positioning question and ends with one ranked, sourced recommendation |
| [`x-issue-to-pr`](.rulesync/skills/x-issue-to-pr/SKILL.md) | Runs a GitHub issue through issue → branch → PR: labels new issues, assigns and sets project Status when work starts, opens a PR that closes the issue |
| [`x-code-review-standards`](.rulesync/skills/x-code-review-standards/SKILL.md) | Review standards and Conventional Comments labels for reviews outside `/code-review`; runs only when invoked by name |
| [`x-review-with-cursor`](.rulesync/skills/x-review-with-cursor/SKILL.md) | One review pass by Cursor's `agent` CLI, with no fixes |
| [`x-review-with-cursor-loop`](.rulesync/skills/x-review-with-cursor-loop/SKILL.md) | Several review rounds: Cursor reviews, the host agent checks each finding and fixes it |

Each skill's flags are in its `SKILL.md`.

**Rules** install per project, for Claude Code and Cursor.

| Rule | Covers |
|---|---|
| `concision` | Length and wording of anything written: budgets, lists, naming, pointers |
| `conversation-style` | Structure of a response: opening, hierarchy, closing |
| `documentation` | README and `docs/` prose |
| `jsdoc` | `/** */` API doc comments |
| `git` | When to commit, commit message format, granularity, and what a commit carries |
| `testing` | What's worth a test, and how to write one that stays useful |
| `security` | Trust boundaries, secrets, and safe sinks |

## Install the skills

```bash
pnpm --config.dlx-cache-max-age=0 dlx github:andrej-kolic/playbook skills
```

Run it again to update. It writes to `~/.claude/skills/` and `~/.cursor/skills/`, and removes playbook skills that were renamed or removed. Other tools' skills are left alone. Options: [Install skills](docs/install-skills.md).

## Add the rules to a project

Needs pnpm 11. From the project's root:

```bash
pnpm dlx github:andrej-kolic/playbook rules
```

It generates the rules into `.claude/rules/` and `.cursor/rules/`, adds three scripts, and ends by printing the files to commit. Running it again is safe.

| Script | Does |
|---|---|
| `pnpm rules:install` | Regenerates the rules from the pinned playbook commit |
| `pnpm rules:outdated` | Lists rules that changed on the playbook's `main`; exits with 1 if any did |
| `pnpm rules:update` | Moves to the latest rules |

What it changes, doing it by hand, and removing it: [Add rules to a project](docs/add-to-a-project.md).

## Docs

- [Install skills](docs/install-skills.md): options, and installing from a clone
- [Add rules to a project](docs/add-to-a-project.md): what setup changes, the scripts, manual setup, removal
- [Troubleshooting](docs/troubleshooting.md): symptom → fix, and how to check which rules load
- [Design notes](docs/design.md): why skills and rules install the way they do
- [`x-review-with-cursor-loop` decisions](docs/x-review-with-cursor-loop.md): why the review loop works the way it does

## Contributing

Adding or changing a skill or rule: [CONTRIBUTING.md](CONTRIBUTING.md).
