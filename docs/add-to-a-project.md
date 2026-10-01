# Add or remove the playbook by hand

## Add to a project

The steps `playbook init` runs, for a project where you want to do them yourself or see what changed. Tested with rulesync 24 and pnpm 11. In the target project:

1. Install rulesync, then deny its `tldjs` dependency's build script. pnpm 11 refuses to run rulesync until that decision exists, and can only record it once `tldjs` is installed, so the install has to skip pnpm's strict check. The second flag lets it install at the root of a monorepo:

   ```bash
   pnpm add -D rulesync@24 --config.strict-dep-builds=false --config.ignore-workspace-root-check=true
   pnpm approve-builds '!tldjs'
   ```

   This writes `tldjs: false` under `allowBuilds` in `pnpm-workspace.yaml`, reformatting the file in pnpm's own style.

2. Create `rulesync.jsonc`:

   ```jsonc
   { "targets": ["claudecode", "cursor"], "features": ["rules"] }
   ```

   Don't use `rulesync init` for this: it adds sample files, targets other agents, and sets `"delete": true`, which wipes `.claude/rules/` on every generate, hand-written rules included.

3. Add the playbook as a source. This records it in `rulesync.jsonc` and pins the commit in `rulesync.lock`:

   ```bash
   pnpm rulesync add andrej-kolic/playbook --rules '*' --rules-path .rulesync/rules
   ```

4. Add to `.gitignore`:

   ```
   .rulesync/rules/.curated/
   .claude/rules/
   .cursor/rules/
   ```

   Don't use `rulesync gitignore` for this: it also ignores `CLAUDE.md`.

5. Add to `package.json` scripts:

   ```json
   "rules:install": "rulesync install && rulesync generate -f rules -t claudecode,cursor",
   "rules:outdated": "rulesync install --outdated",
   "rules:update": "rulesync install --update && rulesync generate -f rules -t claudecode,cursor"
   ```

6. Run `pnpm rules:install`, then commit `rulesync.jsonc`, `rulesync.lock`, `.gitignore`, `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`.

What each script does: see the [README](../README.md#add-to-a-project).

## Remove from a project

If init's changes went in as one commit, revert it:

```bash
git revert <commit>
pnpm install
```

Otherwise undo each change by hand:

1. In `rulesync.jsonc`, delete the `andrej-kolic/playbook` entry under `sources`. If it was the only source and init created the file, delete `rulesync.jsonc` and `rulesync.lock`.
2. Unless the project uses rulesync for something else, run `pnpm remove rulesync` and delete `tldjs: false` under `allowBuilds` in `pnpm-workspace.yaml`.
3. In `package.json`, delete the `rules:install`, `rules:outdated` and `rules:update` scripts.
4. In `.gitignore`, delete the `# playbook rules` comment and the three lines below it.

Either way, then delete the generated rules. They're gitignored, so neither path above removes them, and Claude Code and Cursor keep loading them until they're gone:

```bash
rm -rf .claude/rules .cursor/rules .rulesync/rules/.curated
rmdir .rulesync/rules .rulesync .claude .cursor 2>/dev/null  # only removes folders left empty
```
