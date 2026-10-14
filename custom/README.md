# Custom host config

Personal, host-specific config that rulesync doesn't generate, kept here so it isn't lost. Nothing in this directory ships to other projects.

## Claude Code output style

[`claude/output-styles/playbook.md`](claude/output-styles/playbook.md) repeats the conversation rules that fade in long sessions ([#51](https://github.com/andrej-kolic/playbook/issues/51)). Install it for every project by linking it into your user config and making it the default:

```bash
mkdir -p ~/.claude/output-styles
ln -s "$PWD/custom/claude/output-styles/playbook.md" ~/.claude/output-styles/playbook.md
```

Then set `"outputStyle": "Playbook"` in `~/.claude/settings.json` and restart Claude Code. The link means an edit here takes effect on the next restart.

## Drift check

[`claude/drift-check.js`](claude/drift-check.js) counts rule breaks in this laptop's Claude Code session logs (`~/.claude/projects/`), before vs. after the style went live and early vs. late in each session:

```bash
node custom/claude/drift-check.js
```

"Before" and "after" split at the moment the style link was created on this laptop; `--cutoff <ISO date>` overrides it. It checks replies over 10 lines, list items that open with a label (`**Why:** ...`) and em dashes. Whether the first line states the result needs a manual look.
