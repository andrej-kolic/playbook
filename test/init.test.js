import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { findBlockers, needsRulesync, writeConfigFiles } from "../lib/init.js";

let dir;
const file = (name) => readFileSync(join(dir, name), "utf8");

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "playbook-init-"));
  writeFileSync(join(dir, "package.json"), '{\n  "name": "target"\n}\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

test("writeConfigFiles_createsEveryFile_whenProjectHasNone", () => {
  writeConfigFiles(dir);

  assert.deepEqual(JSON.parse(file("rulesync.jsonc")), {
    targets: ["claudecode", "cursor"],
    features: ["rules"],
  });
  assert.equal(file("pnpm-workspace.yaml"), "allowBuilds:\n  tldjs: false\n");
  assert.match(file(".gitignore"), /^\.rulesync\/rules\/\.curated\/\n\.claude\/rules\/\n\.cursor\/rules\/$/m);
  assert.deepEqual(JSON.parse(file("package.json")).scripts, {
    "rules:install": "rulesync install && rulesync generate -f rules -t claudecode,cursor",
    "rules:outdated": "rulesync install --outdated",
    "rules:update": "rulesync install --update && rulesync generate -f rules -t claudecode,cursor",
  });
});

test("writeConfigFiles_changesNothing_whenRunTwice", () => {
  writeConfigFiles(dir);
  const before = ["rulesync.jsonc", "pnpm-workspace.yaml", ".gitignore", "package.json"].map(file);

  assert.deepEqual(writeConfigFiles(dir), []);
  assert.deepEqual(["rulesync.jsonc", "pnpm-workspace.yaml", ".gitignore", "package.json"].map(file), before);
});

test("writeConfigFiles_keepsExistingContent_whenFilesAlreadyExist", () => {
  writeFileSync(join(dir, "rulesync.jsonc"), '{ "targets": ["copilot"] }\n');
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n\nallowBuilds:\n  esbuild: true\n");
  writeFileSync(join(dir, ".gitignore"), "node_modules/\n.claude/rules/\n");

  writeConfigFiles(dir);

  assert.equal(file("rulesync.jsonc"), '{ "targets": ["copilot"] }\n');
  assert.equal(
    file("pnpm-workspace.yaml"),
    "packages:\n  - 'apps/*'\n\nallowBuilds:\n  tldjs: false\n  esbuild: true\n",
  );
  assert.equal(file(".gitignore").match(/\.claude\/rules\//g).length, 1);
  assert.match(file(".gitignore"), /^node_modules\/$/m);
  assert.match(file(".gitignore"), /^\.cursor\/rules\/$/m);
});

test("writeConfigFiles_appendsAllowBuilds_whenWorkspaceHasNone", () => {
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n");

  writeConfigFiles(dir);

  assert.equal(file("pnpm-workspace.yaml"), "packages:\n  - 'apps/*'\n\nallowBuilds:\n  tldjs: false\n");
});

test("writeConfigFiles_keepsTldjsDecision_whenAlreadySet", () => {
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds:\n  tldjs: true\n");

  writeConfigFiles(dir);

  assert.equal(file("pnpm-workspace.yaml"), "allowBuilds:\n  tldjs: true\n");
});

test("writeConfigFiles_keepsDifferingScriptAndAddsOthers_whenOneExists", () => {
  writeFileSync(join(dir, "package.json"), '{ "scripts": { "rules:install": "custom" } }\n');

  const lines = writeConfigFiles(dir);

  const { scripts } = JSON.parse(file("package.json"));
  assert.equal(scripts["rules:install"], "custom");
  assert.equal(scripts["rules:outdated"], "rulesync install --outdated");
  assert.ok(lines.some((line) => line.startsWith('warning: kept your existing "rules:install"')));
});

test("writeConfigFiles_throws_whenNoPackageJson", () => {
  rmSync(join(dir, "package.json"));

  assert.throws(() => writeConfigFiles(dir), /no package\.json/);
});

test("writeConfigFiles_replacesPnpmPlaceholder_whenTldjsHasNoDecision", () => {
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds:\n  tldjs: set this to true or false\n");

  writeConfigFiles(dir);

  assert.equal(file("pnpm-workspace.yaml"), "allowBuilds:\n  tldjs: false\n");
});

test("writeConfigFiles_addsDecision_whenTldjsOnlyAppearsOutsideAllowBuilds", () => {
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "overrides:\n  tldjs: 2.3.2\nallowBuilds:\n  esbuild: true\n");

  writeConfigFiles(dir);

  assert.equal(
    file("pnpm-workspace.yaml"),
    "overrides:\n  tldjs: 2.3.2\nallowBuilds:\n  tldjs: false\n  esbuild: true\n",
  );
});

test("writeConfigFiles_editsSameBlock_whenAllowBuildsLineHasComment", () => {
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds: # builds\n  esbuild: true\n");

  writeConfigFiles(dir);

  assert.equal(file("pnpm-workspace.yaml"), "allowBuilds: # builds\n  tldjs: false\n  esbuild: true\n");
});

test("writeConfigFiles_keepsWindowsLineEndings_whenFileUsesThem", () => {
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds:\r\n  esbuild: true\r\n");

  writeConfigFiles(dir);

  assert.equal(file("pnpm-workspace.yaml"), "allowBuilds:\r\n  tldjs: false\r\n  esbuild: true\r\n");
});

test("writeConfigFiles_matchesSiblingIndent_whenBlockUsesFourSpaces", () => {
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds:\n    # native\n    esbuild: true\n");

  writeConfigFiles(dir);

  assert.equal(
    file("pnpm-workspace.yaml"),
    "allowBuilds:\n    tldjs: false\n    # native\n    esbuild: true\n",
  );
});

test("writeConfigFiles_leavesOneLineMap_whenItAlreadyDecidesTldjs", () => {
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds: { tldjs: false }\n");

  writeConfigFiles(dir);

  assert.equal(file("pnpm-workspace.yaml"), "allowBuilds: { tldjs: false }\n");
});

test("findBlockers_reportsOneLineMap_whenItLacksTldjs", () => {
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds: { esbuild: true }\n");

  assert.match(findBlockers(dir).join(), /on one line/);
});

test("findBlockers_reportsDuplicateKey_whenAllowBuildsAppearsTwice", () => {
  writeFileSync(join(dir, "pnpm-workspace.yaml"), "allowBuilds:\n  a: true\nallowBuilds:\n  b: true\n");

  assert.match(findBlockers(dir).join(), /more than one allowBuilds/);
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
});

test("findBlockers_reportsDelete_whenRulesyncConfigDeletesOnGenerate", () => {
  writeFileSync(join(dir, "rulesync.jsonc"), '{\n  // from rulesync init\n  "delete": true,\n}\n');

  assert.match(findBlockers(dir).join(), /"delete": true/);
});

test("findBlockers_returnsEmpty_whenProjectIsClean", () => {
  writeFileSync(join(dir, "rulesync.jsonc"), '{ "delete": false }\n');

  assert.deepEqual(findBlockers(dir), []);
});

test("needsRulesync_isTrue_whenMissingOrBelow24", () => {
  assert.equal(needsRulesync({}), true);
  assert.equal(needsRulesync({ devDependencies: { rulesync: "16.24.1" } }), true);
  assert.equal(needsRulesync({ dependencies: { rulesync: "^23.1.0" } }), true);
  assert.equal(needsRulesync({ devDependencies: { rulesync: "24.0.0" } }), false);
  assert.equal(needsRulesync({ devDependencies: { rulesync: "^25.2.0" } }), false);
  assert.equal(needsRulesync({ devDependencies: { rulesync: "latest" } }), false);
});
