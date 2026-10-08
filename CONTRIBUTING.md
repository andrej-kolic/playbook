# Contributing

Skills and rules are written in `.rulesync/`. Everything under `.claude/` and `.cursor/` is generated from there; edits made there are overwritten.

## Setup

```bash
pnpm install
pnpm test               # unit tests
pnpm test:e2e           # end-to-end tests
pnpm generate           # regenerate this repo's own rules into .claude/rules/ and .cursor/rules/
pnpm skills:install     # install the skills from this working tree
```

CI runs `pnpm test` and `pnpm generate:check`, which fails if the committed rules don't match `.rulesync/`.

## Add a skill

1. Create `.rulesync/skills/<name>/SKILL.md`, with an `x-` prefix on the name ([why](docs/design.md#the-x--prefix)).
2. Set `name`, `description` and `targets` (only hosts that should invoke it). Frontmatter shared by all hosts, such as `disable-model-invocation`, goes at the **root** of the file, not only under a host section.
3. Start the body with the [version lines](#version-lines).
4. Run `pnpm skills:install`, and check that the installed copy's modified time changed before testing it. A stale installed copy keeps serving the old behavior: a fix once did nothing in a test run because the run used a copy installed before the fix.
5. Add it to the skills table in the README.

## Add a rule

1. Create `.rulesync/rules/<name>.md` with `root: false` and real `globs`. Use `cursor: { alwaysApply: true }` only for a rule with no natural file type, as `conversation-style`, `git`, `testing` and `security` do.
2. Start the body with the [version lines](#version-lines).
3. State what the rule does *not* cover, and name the sibling rule that does.
4. If the rule is about file content (not chat behavior), state a precedence, not just "defer to the project": machine-enforced config → what the project states for agents → the rule's defaults. Whether the repo's existing practice outranks those defaults depends on the rule: for `jsdoc` and `documentation` it does, since matching neighbouring files *is* the requirement; for `git` it does not, since a commit has no neighbours.
5. Run `pnpm generate`, and commit the rule together with its generated copies in `.claude/rules/` and `.cursor/rules/`.
6. Add it to the rules table in the README.

Other projects get the change with `pnpm rules:update`. To try an unpushed rule change in another project first, see [Add rules to a project](docs/add-to-a-project.md#try-unpushed-rule-changes).

## Version lines

Each rule and skill starts its body with two comment lines:

```
<!-- playbook:<name> vN (date)[ — <what changed, a few words>] -->
<!-- source: andrej-kolic/playbook <path>; edits elsewhere are overwritten -->
```

Bump the version by hand on meaningful changes; the change note is optional. The source line never changes. Why: [Design notes](docs/design.md#version-lines).
