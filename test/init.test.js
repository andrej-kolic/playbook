import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { findFetchedCopies, writeConfigFiles } from "../lib/init.js";

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
  assert.equal(
    JSON.parse(file("package.json")).scripts["rules:install"],
    "rulesync install && rulesync generate -f rules -t claudecode,cursor",
  );
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

test("writeConfigFiles_warnsAndKeepsScript_whenADifferentOneExists", () => {
  writeFileSync(join(dir, "package.json"), '{ "scripts": { "rules:install": "custom" } }\n');

  const lines = writeConfigFiles(dir);

  assert.equal(JSON.parse(file("package.json")).scripts["rules:install"], "custom");
  assert.ok(lines.some((line) => line.startsWith("warning:")));
});

test("writeConfigFiles_throws_whenNoPackageJson", () => {
  rmSync(join(dir, "package.json"));

  assert.throws(() => writeConfigFiles(dir), /no package\.json/);
});

test("findFetchedCopies_listsOnlyPlaybookRules_whenOldFetchCopiesExist", () => {
  mkdirSync(join(dir, ".rulesync", "rules"), { recursive: true });
  writeFileSync(
    join(dir, ".rulesync", "rules", "git.md"),
    "<!-- source: andrej-kolic/playbook .rulesync/rules/git.md; edits elsewhere are overwritten -->\n",
  );
  writeFileSync(join(dir, ".rulesync", "rules", "own.md"), "# A project's own rule\n");

  assert.deepEqual(findFetchedCopies(dir), ["git.md"]);
});
