# Add the playbook to a project by hand

The steps `playbook init` runs, for a project where you want to do them yourself or see what changed. Tested with rulesync 24 and pnpm 11. In the target project:

1. Install rulesync:

   ```bash
   pnpm add -D rulesync@24
   ```

   pnpm 11 then refuses to run it until rulesync's `tldjs` dependency has a build decision. Add to `pnpm-workspace.yaml`:

   ```yaml
   allowBuilds:
     tldjs: false
   ```

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
