# Add or remove the playbook by hand

## Add to a project

The steps `playbook rules` runs, for a project where you want to do them yourself or see what changed. Tested with rulesync 27 and pnpm 11. In the target project:

1. Install rulesync, then deny its `tldjs` dependency's build script. pnpm 11 refuses to run rulesync until that decision exists, and can only record it once `tldjs` is installed, so the install has to skip pnpm's strict check. The second flag lets it install at the root of a monorepo:

   ```bash
   pnpm add -D rulesync@27 --config.strict-dep-builds=false --config.ignore-workspace-root-check=true
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

4. Add to `.gitignore` (only rulesync's fetched copy; the generated rules are committed):

   ```
   .rulesync/rules/.curated/
   ```

   Don't use `rulesync gitignore` for this: it also ignores `CLAUDE.md`.

5. If the project uses Prettier, add to `.prettierignore`, creating it if missing (Biome or dprint: exclude the same three paths in their config):

   ```
   .claude/rules/
   .cursor/rules/
   rulesync.jsonc
   ```

   Otherwise a pre-commit formatter rewrites the generated rules, so `rules:install` shows them as changed, and `prettier --check` rejects how rulesync formats `rulesync.jsonc`.

6. Add to `package.json` scripts:

   ```json
   "rules:install": "rulesync install && rulesync generate -f rules -t claudecode,cursor",
   "rules:outdated": "pnpm dlx github:andrej-kolic/playbook rules --check",
   "rules:update": "rulesync install --update && rulesync generate -f rules -t claudecode,cursor"
   ```

7. Run `pnpm rules:install`, then commit the generated `.claude/rules/` and `.cursor/rules/` along with `rulesync.jsonc`, `rulesync.lock`, `.gitignore`, `.prettierignore` if step 5 changed it, `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`.

What each script does: see the [README](../README.md#add-to-a-project).

## Remove from a project

If its changes went in as one commit, revert it:

```bash
git revert <commit>
pnpm install
```

Otherwise undo each change by hand:

1. In `rulesync.jsonc`, delete the `andrej-kolic/playbook` entry under `sources`. If it was the only source and `playbook rules` created the file, delete `rulesync.jsonc` and `rulesync.lock`.
2. Unless the project uses rulesync for something else, run `pnpm remove rulesync` and delete `tldjs: false` under `allowBuilds` in `pnpm-workspace.yaml`.
3. In `package.json`, delete the `rules:install`, `rules:outdated` and `rules:update` scripts.
4. In `.gitignore`, delete the playbook comment and the `.rulesync/rules/.curated/` line below it, plus any `.claude/rules/` and `.cursor/rules/` lines left from an earlier setup.
5. In `.prettierignore`, delete the playbook comment and the `.claude/rules/`, `.cursor/rules/` and `rulesync.jsonc` lines below it; likewise any exclusions added to a Biome or dprint config.

Either way, then delete the playbook's generated rules and rulesync's fetched copy. A revert doesn't remove rules a project gitignored instead of committing, and Claude Code and Cursor keep loading them until they're gone. The first line deletes only files carrying the playbook's source line, so the project's own rules stay, and stages the deletion of any that were committed:

```bash
sh -c 'for f in .claude/rules/* .cursor/rules/*; do grep -q "source: andrej-kolic/playbook " "$f" 2>/dev/null && git rm -q --cached --ignore-unmatch -- "$f" && rm -f -- "$f"; done; true'
rm -rf .rulesync/rules/.curated
rmdir .claude/rules .cursor/rules .rulesync/rules .rulesync .claude .cursor 2>/dev/null  # only removes folders left empty
```

If you undid the changes by hand, commit all of it as one change. After a revert there's nothing left to commit.
