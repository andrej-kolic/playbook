import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { findBlockers, needsRulesync, writeConfigFiles } from "../lib/rules.js";

const PLAYBOOK_RULESYNC = JSON.parse(readFileSync(join(import.meta.dirname, "..", "package.json"), "utf8"))
  .dependencies.rulesync;
let dir;
const file = (name) => readFileSync(join(dir, name), "utf8");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "playbook-rules-"));
  writeFileSync(join(dir, "package.json"), '{\n  "name": "target"\n}\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("writeConfigFiles_createsEveryFile_whenProjectHasNone", () => {
  writeConfigFiles(dir);

  assert.deepEqual(JSON.parse(file("rulesync.jsonc")), {
    targets: ["claudecode", "cursor"],
    features: ["rules"],
  });
  assert.deepEqual(
    file(".gitignore").split("\n").filter((line) => line && !line.startsWith("#")),
    [".rulesync/rules/.curated/"],
  );
  assert.deepEqual(JSON.parse(file("package.json")).scripts, {
    "rules:install": "rulesync install && rulesync generate -f rules -t claudecode,cursor",
    "rules:outdated": "pnpm dlx github:andrej-kolic/playbook rules --check",
    "rules:update": "rulesync install --update && rulesync generate -f rules -t claudecode,cursor",
  });
});

test("writeConfigFiles_changesNothing_whenRunTwice", () => {
  writeConfigFiles(dir);
  const before = ["rulesync.jsonc", ".gitignore", "package.json"].map(file);

  assert.deepEqual(writeConfigFiles(dir), []);
  assert.deepEqual(["rulesync.jsonc", ".gitignore", "package.json"].map(file), before);
});

test("writeConfigFiles_keepsExistingContent_whenFilesAlreadyExist", () => {
  writeFileSync(join(dir, "rulesync.jsonc"), '{ "targets": ["copilot"] }\n');
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n.rulesync/rules/.curated/\n");

  writeConfigFiles(dir);

  assert.equal(file("rulesync.jsonc"), '{ "targets": ["copilot"] }\n');
  assert.equal(file(".gitignore"), "node_modules/\n.rulesync/rules/.curated/\n");
});

test("writeConfigFiles_appendsCuratedLine_whenGitignoreHasOtherContent", () => {
  writeFileSync(join(dir, ".gitignore"), "node_modules/");

  writeConfigFiles(dir);

  assert.match(file(".gitignore"), /^node_modules\/\n\n#.*\n\.rulesync\/rules\/\.curated\/\n$/);
});

test("writeConfigFiles_warnsAndKeepsLines_whenGitignoreIgnoresGeneratedRules", () => {
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n.claude/rules/\n**/.cursor/rules\n");

  const lines = writeConfigFiles(dir);

  assert.match(file(".gitignore"), /^\.claude\/rules\/$/m);
  assert.match(file(".gitignore"), /^\*\*\/\.cursor\/rules$/m);
  assert.ok(
    lines.some((line) => line.startsWith("warning:") && line.includes("(.claude/rules/, **/.cursor/rules). Delete those lines")),
  );
});

test("writeConfigFiles_createsNoPrettierignore_whenProjectHasNone", () => {
  const lines = writeConfigFiles(dir);

  assert.equal(existsSync(join(dir, ".prettierignore")), false);
  assert.ok(!lines.some((line) => line.includes(".prettierignore")));
});

test("writeConfigFiles_appendsGeneratedPaths_whenPrettierignoreExists", () => {
  writeFileSync(join(dir, ".prettierignore"), "dist/\n");

  const lines = writeConfigFiles(dir);

  assert.match(file(".prettierignore"), /^dist\/\n\n#.*\n\.claude\/rules\/\n\.cursor\/rules\/\nrulesync\.jsonc\n$/);
  assert.ok(lines.includes("added .claude/rules/, .cursor/rules/, rulesync.jsonc to .prettierignore"));
});

test("writeConfigFiles_appendsOnlyMissingPaths_whenPrettierignoreHasVariants", () => {
  writeFileSync(join(dir, ".prettierignore"), "/.claude/rules\n**/.cursor/rules/\n");

  writeConfigFiles(dir);

  assert.match(file(".prettierignore"), /\n\n#.*\nrulesync\.jsonc\n$/);
  assert.equal(file(".prettierignore").match(/\.claude\/rules/g).length, 1);
});

test("writeConfigFiles_keepsOptOut_whenPrettierignoreNegatesAPath", () => {
  writeFileSync(join(dir, ".prettierignore"), ".claude/*\n!.claude/rules/\n");

  writeConfigFiles(dir);

  assert.match(file(".prettierignore"), /^\.claude\/\*\n!\.claude\/rules\/\n\n#.*\n\.cursor\/rules\/\nrulesync\.jsonc\n$/);
});

test("writeConfigFiles_leavesPrettierignoreUnchanged_whenRunTwice", () => {
  writeFileSync(join(dir, ".prettierignore"), "dist/\n");
  writeConfigFiles(dir);
  const before = file(".prettierignore");

  assert.deepEqual(writeConfigFiles(dir), []);
  assert.equal(file(".prettierignore"), before);
});

test("writeConfigFiles_createsPrettierignore_whenPrettierIsUsedWithoutOne", () => {
  for (const setup of [
    () => writeFileSync(join(dir, "package.json"), '{ "devDependencies": { "prettier": "^3.0.0" } }\n'),
    () => writeFileSync(join(dir, ".prettierrc.json"), "{}\n"),
  ]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir);
    writeFileSync(join(dir, "package.json"), "{}\n");
    setup();

    writeConfigFiles(dir);

    assert.match(file(".prettierignore"), /^#.*\n\.claude\/rules\/\n\.cursor\/rules\/\nrulesync\.jsonc\n$/);
  }
});

test("writeConfigFiles_replacesDifferingScriptAndKeepsOthers_whenOneExists", () => {
  writeFileSync(
    join(dir, "package.json"),
    '{ "scripts": { "build": "tsc", "rules:outdated": "rulesync install --outdated" } }\n',
  );

  const lines = writeConfigFiles(dir);

  const { scripts } = JSON.parse(file("package.json"));
  assert.equal(scripts.build, "tsc");
  assert.equal(scripts["rules:outdated"], "pnpm dlx github:andrej-kolic/playbook rules --check");
  assert.ok(lines.includes("replaced rules:outdated in package.json scripts (was: rulesync install --outdated)"));
});

test("writeConfigFiles_throws_whenNoPackageJson", () => {
  rmSync(join(dir, "package.json"));

  assert.throws(() => writeConfigFiles(dir), /no package\.json/);
});

test("findBlockers_listsOnlyPlaybookRules_whenOldFetchCopiesExist", () => {
  mkdirSync(join(dir, ".rulesync", "rules"), { recursive: true });
  writeFileSync(
    join(dir, ".rulesync", "rules", "git.md"),
    "<!-- source: andrej-kolic/playbook .rulesync/rules/git.md; edits elsewhere are overwritten -->\n",
  );
  writeFileSync(join(dir, ".rulesync", "rules", "own.md"), "# A project's own rule\n");

  const blockers = findBlockers(dir);

  assert.equal(blockers.length, 1);
  assert.match(blockers[0], /\(git\.md\)/);
  assert.match(blockers[0], /rules:fetch, rules:generate and rules:install/);
  assert.match(blockers[0], /^  git rm \.rulesync\/rules\/git\.md$/m);
  assert.match(blockers[0], /pnpm pkg delete 'scripts\["rules:fetch"\]'/);
});

test("findBlockers_reportsDelete_whenRulesyncConfigDeletesOnGenerate", () => {
  writeFileSync(join(dir, "rulesync.jsonc"), '{\n  // from rulesync init\n  "delete": true,\n}\n');

  assert.match(findBlockers(dir).join(), /"delete": true/);
});

test("findBlockers_returnsEmpty_whenProjectIsClean", () => {
  writeFileSync(join(dir, "rulesync.jsonc"), '{ "delete": false }\n');

  assert.deepEqual(findBlockers(dir), []);
});

test("needsRulesync_isTrue_whenMissingOrBelowThePlaybooksMajor", () => {
  assert.equal(needsRulesync({}), true);
  assert.equal(needsRulesync({ devDependencies: { rulesync: "16.24.1" } }), true);
  assert.equal(needsRulesync({ dependencies: { rulesync: "^24.0.0" } }), true);
  assert.equal(needsRulesync({ devDependencies: { rulesync: PLAYBOOK_RULESYNC } }), false);
  assert.equal(needsRulesync({ devDependencies: { rulesync: "^999.0.0" } }), false);
  assert.equal(needsRulesync({ devDependencies: { rulesync: "latest" } }), false);
});
