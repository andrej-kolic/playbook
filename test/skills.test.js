import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

const CLI = join(import.meta.dirname, "..", "bin", "playbook.js");
let home;

// Runs `playbook skills` with a throwaway home folder, so the real user-level skills stay untouched.
function playbookSkills(...args) {
  const result = spawnSync(process.execPath, [CLI, "skills", ...args], {
    cwd: home,
    env: { ...process.env, HOME: home },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
const skills = (host) => readdirSync(join(home, host, "skills")).sort();

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "playbook-skills-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

test("skills_installsEachSkillForItsTargetHostsOnly", () => {
  playbookSkills();

  assert.ok(skills(".claude").includes("x-review-with-cursor"));
  assert.ok(skills(".cursor").includes("x-research"));
  assert.ok(!skills(".cursor").includes("x-review-with-cursor"), "a claudecode-only skill reached Cursor");
});

test("skills_keepsOtherToolsSkills_whenInstalling", () => {
  mkdirSync(join(home, ".claude", "skills", "grounder-note"), { recursive: true });
  writeFileSync(join(home, ".claude", "skills", "grounder-note", "SKILL.md"), "---\nname: grounder-note\n---\n");

  playbookSkills();

  assert.ok(skills(".claude").includes("grounder-note"));
});

test("skills_writesNothing_whenDryRun", () => {
  playbookSkills("--dry-run");

  assert.ok(!existsSync(join(home, ".claude")));
  assert.ok(!existsSync(join(home, ".cursor")));
});
