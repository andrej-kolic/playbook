---
name: x-shut-the-fuck-up
description: The last reply broke the communication rules. Reread conversation-style and concision in full, then redo that reply so it passes every rule. Runs only when invoked by name.
targets: ["claudecode", "cursor"]
disable-model-invocation: true
---

<!-- playbook:x-shut-the-fuck-up v1 (2026-11-15) -->
<!-- source: andrej-kolic/playbook .rulesync/skills/x-shut-the-fuck-up/SKILL.md; edits elsewhere are overwritten -->

Your last reply failed the communication rules. The goal is clarity.

1. Reread the `conversation-style` and `concision` rules in full, every line. If either is not installed in this project, say so in one line and stop.
2. Check your last reply against each rule in both, one by one.
3. Redo the last reply so it passes every rule. Output only the redone reply: no apology, no list of what was wrong, no mention of this skill.
4. Hold every later reply in this session to both rules.
