# Custom host config

Personal, host-specific config that rulesync doesn't generate, kept here so it isn't lost. Nothing in this directory ships to other projects.

## Claude Code output style

[`claude/output-styles/playbook.md`](claude/output-styles/playbook.md) repeats the conversation rules that fade in long sessions ([#51](https://github.com/andrej-kolic/playbook/issues/51)). Install it for every project by linking it into your user config and making it the default:

```bash
mkdir -p ~/.claude/output-styles
ln -s "$PWD/custom/claude/output-styles/playbook.md" ~/.claude/output-styles/playbook.md
```

Then set `"outputStyle": "Playbook"` in `~/.claude/settings.json` and restart Claude Code. The link means an edit here takes effect on the next restart.
