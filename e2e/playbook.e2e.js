// Runs the real CLI in a fresh project: pnpm installs rulesync and fetches the rules from GitHub.
// Needs pnpm and the network, so it runs via `pnpm test:e2e`, not `pnpm test`. Set GITHUB_TOKEN or
// GH_TOKEN to avoid GitHub's rate limit.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const CLI = join(import.meta.dirname, "..", "bin", "playbook.js");
const dir = mkdtempSync(join(tmpdir(), "playbook-e2e-"));
const file = (name) => readFileSync(join(dir, name), "utf8");

// node:test's --test-timeout can't interrupt spawnSync, so the cap goes on the child instead.
const TIMEOUT_MS = 5 * 60 * 1000;

function playbook(...args) {
  const result = spawnSync(process.execPath, [CLI, ...args], { cwd: dir, encoding: "utf8", timeout: TIMEOUT_MS });
  const error = result.error ? `\n${result.error.message}` : "";
  return { status: result.status, output: `${result.stdout}${result.stderr}${error}` };
}

before(() => {
  writeFileSync(join(dir, "package.json"), '{\n  "name": "e2e-target",\n  "private": true\n}\n');
  const { status, output } = playbook("rules");
  assert.equal(status, 0, output);
});
after(() => rmSync(dir, { recursive: true, force: true }));

test("rules_generatesRulesForBothHosts_whenProjectIsEmpty", () => {
  for (const host of [".claude", ".cursor"]) {
    const rules = readdirSync(join(dir, host, "rules")).filter((name) => /\.mdc?$/.test(name));
    assert.ok(rules.length > 0, `no rules in ${host}/rules/`);
  }
  assert.ok(JSON.parse(file("rulesync.lock")).sources["andrej-kolic/playbook"]);
});

test("rulesCheck_exitsZero_rightAfterRules", () => {
  const { status, output } = playbook("rules", "--check");

  assert.equal(status, 0, output);
  assert.match(output, /up to date/);
});

test("rulesCheck_exitsOneAndNamesRule_whenLockedHashDiffers", () => {
  const original = file("rulesync.lock");
  const lock = JSON.parse(original);
  const rules = lock.sources["andrej-kolic/playbook"].rules;
  const [name] = Object.keys(rules);
  rules[name].integrity = "sha256-0";
  writeFileSync(join(dir, "rulesync.lock"), JSON.stringify(lock));

  try {
    const { status, output } = playbook("rules", "--check");

    assert.equal(status, 1, output);
    assert.match(output, new RegExp(`changed: ${name}\\b`));
  } finally {
    writeFileSync(join(dir, "rulesync.lock"), original);
  }
});
