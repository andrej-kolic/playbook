import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

const CLI = join(import.meta.dirname, "..", "bin", "playbook.js");
const PLAYBOOK_SOURCE_LINE = "<!-- source: andrej-kolic/playbook .rulesync/skills/x-old/SKILL.md -->";
let home;

// Runs `playbook skills` with a throwaway home folder, so the real user-level skills stay untouched.
// rulesync writes to HOME_DIR before HOME, so both point there unless a test sets its own.
function playbookSkills(args = [], env = { HOME: home, HOME_DIR: home }) {
  const result = spawnSync(process.execPath, [CLI, "skills", ...args], {
    cwd: home,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  return { status: result.status, output: result.stdout + result.stderr };
}
function installed(...args) {
  const { status, output } = playbookSkills(args);
  assert.equal(status, 0, output);
  return output;
}
const skills = (host) => readdirSync(join(home, host, "skills")).sort();
function addSkill(host, name, body) {
  mkdirSync(join(home, host, "skills", name), { recursive: true });
  writeFileSync(join(home, host, "skills", name, "SKILL.md"), `---\nname: ${name}\n---\n${body}\n`);
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "playbook-skills-"));
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

test("skills_installsEachSkillForItsTargetHostsOnly", () => {
  installed();

  assert.ok(skills(".claude").includes("x-review-with-cursor"));
  assert.ok(skills(".cursor").includes("x-research"));
  assert.ok(!skills(".cursor").includes("x-review-with-cursor"), "a claudecode-only skill reached Cursor");
});

test("skills_keepsOtherToolsSkills_whenInstalling", () => {
  addSkill(".claude", "grounder-note", "Grounder's own skill.");

  installed();

  assert.ok(skills(".claude").includes("grounder-note"));
});

test("skills_removesPlaybookSkill_whenPlaybookNoLongerHasIt", () => {
  addSkill(".claude", "x-old", PLAYBOOK_SOURCE_LINE);

  const output = installed();

  assert.ok(!skills(".claude").includes("x-old"));
  assert.match(output, /removed: ~\/\.claude\/skills\/x-old/);
});

test("skills_removesPlaybookSkill_whenItNoLongerTargetsThatHost", () => {
  addSkill(".cursor", "x-review-with-cursor", PLAYBOOK_SOURCE_LINE);

  installed();

  assert.ok(!skills(".cursor").includes("x-review-with-cursor"));
});

test("skills_writesAndRemovesNothing_whenDryRun", () => {
  addSkill(".claude", "x-old", PLAYBOOK_SOURCE_LINE);

  const output = installed("--dry-run");

  assert.deepEqual(skills(".claude"), ["x-old"]);
  assert.ok(!existsSync(join(home, ".cursor")));
  assert.match(output, /would remove: ~\/\.claude\/skills\/x-old/);
});

test("skillsCheck_exitsZero_whenInstalledSkillsMatch", () => {
  installed();

  const { status, output } = playbookSkills(["--check"]);

  assert.equal(status, 0, output);
  assert.match(output, /up to date/);
});

test("skillsCheck_exitsOneAndWritesNothing_whenACopyIsStaleOrLeftOver", () => {
  installed();
  const stale = join(home, ".claude", "skills", "x-research", "SKILL.md");
  appendFileSync(stale, "edited by hand\n");
  addSkill(".claude", "x-old", PLAYBOOK_SOURCE_LINE);

  const { status, output } = playbookSkills(["--check"]);

  assert.equal(status, 1, output);
  assert.match(output, /outdated: ~\/\.claude\/skills\/x-research\/SKILL\.md/);
  assert.match(output, /leftover: ~\/\.claude\/skills\/x-old/);
  assert.ok(skills(".claude").includes("x-old"), "--check removed a leftover");
});

test("skills_keepsCurrentSkills_whenOneInstalledCopyIsStale", () => {
  installed();
  appendFileSync(join(home, ".claude", "skills", "x-research", "SKILL.md"), "edited by hand\n");

  installed();

  assert.ok(skills(".claude").includes("x-write-docs"), "a current skill was removed as a leftover");
  assert.ok(skills(".claude").includes("x-review-with-cursor"));
});

test("skills_usesHomeDir_whenItDiffersFromHome", () => {
  const homeDir = join(home, "rulesync-home");
  mkdirSync(join(homeDir, ".claude", "skills", "x-old"), { recursive: true });
  writeFileSync(join(homeDir, ".claude", "skills", "x-old", "SKILL.md"), `${PLAYBOOK_SOURCE_LINE}\n`);

  const { status, output } = playbookSkills([], { HOME: home, HOME_DIR: homeDir });

  assert.equal(status, 0, output);
  assert.ok(readdirSync(join(homeDir, ".claude", "skills")).includes("x-research"));
  assert.ok(!readdirSync(join(homeDir, ".claude", "skills")).includes("x-old"));
  assert.ok(!existsSync(join(home, ".claude")), "wrote to HOME although HOME_DIR was set");
});
