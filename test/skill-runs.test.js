import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";

const SETUP = join(import.meta.dirname, "skill-runs", "x-review-with-cursor-next", "setup.sh");
const RUN = join(import.meta.dirname, "skill-runs", "x-review-with-cursor-next", "run.sh");
const SCRIPTS =join(import.meta.dirname, "..", ".rulesync", "skills", "x-review-with-cursor-next", "scripts");
// send-review.sh hashes the C:\ form of the repo path on Windows; the fake agent does not.
const skip = process.platform === "win32" && "the sandbox runs on macOS and Linux only";
let root;

afterEach(() => root && rmSync(root, { recursive: true, force: true }));

function setup(scenario) {
  const result = spawnSync("sh", [SETUP, scenario], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  root = result.stdout.trim();
  return root;
}
// Runs a command as the skill run must: env.sh first, from the sandbox repo.
function run(command) {
  const result = spawnSync("sh", ["-c", `. "${root}/env.sh" && ${command}`], { cwd: join(root, "repo"), encoding: "utf8" });
  return { status: result.status, out: result.stdout.trim(), error: result.stderr };
}
function send(args) {
  return run(`sh "${SCRIPTS}/send-review.sh" ${args}`);
}
function firstRound() {
  const diff = run(`sh "${SCRIPTS}/make-diff.sh"`);
  assert.equal(diff.status, 0, diff.error);
  const sent = send(`"${diff.out.split("\n")[0]}"`);
  assert.equal(sent.status, 0, sent.error);
  return { diff: diff.out.split("\n")[0], reply: sent.out };
}
function resume(diff) {
  const prompt = join(root, "tmp", "prompt");
  writeFileSync(prompt, "Addressed. Fixed: 1.\n");
  return send(`--resume 5e55a0e1-0000-4000-8000-000000000001 "${prompt}" "${diff}"`);
}

test("setup_failsWithUsage_whenScenarioIsUnknown", () => {
  const result = spawnSync("sh", [SETUP, "S9"], { encoding: "utf8" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /setup: name a scenario, S1 to S8/);
});

test("setup_answersEachCallWithItsQueuedReply_andLetsRealScriptsResume", { skip }, () => {
  setup("S1");

  const { diff, reply } = firstRound();
  assert.equal(run(`sh "${SCRIPTS}/read-reply.sh" "${reply}"`).out.split("\n")[0], "session 5e55a0e1-0000-4000-8000-000000000001");
  const second = resume(diff);

  assert.equal(second.status, 0, second.error);
  assert.match(readFileSync(second.out, "utf8"), /No findings/);
  assert.match(readFileSync(join(root, "calls", "2.args"), "utf8"), /--resume\n5e55a0e1/);
});

test("setup_leavesNoAgentOnPath_forS4", { skip }, () => {
  setup("S4");

  const result = run("command -v agent");

  assert.notEqual(result.status, 0, `agent found at ${result.out}`);
});

test("setup_printsSandboxPlansFolder_fromFakeGrounder", { skip }, () => {
  setup("S1");

  assert.equal(run("grounder path plans").out, join(root, "plans"));
});

test("setup_makesSendFailAfterReplyPath_forS5", { skip }, () => {
  setup("S5");
  const diff = run(`sh "${SCRIPTS}/make-diff.sh"`).out;

  const sent = send(`"${diff}"`);

  assert.equal(sent.status, 1);
  assert.match(sent.error, /Authentication required/);
  assert.ok(existsSync(sent.out), "no reply file named before the failure");
});

test("setup_makesReadReplyFail_onS6SecondCall_andAnswersTheRetry", { skip }, () => {
  setup("S6");
  const { diff } = firstRound();

  const second = resume(diff);
  const check = run(`sh "${SCRIPTS}/read-reply.sh" "${second.out}"`);
  const retry = resume(diff);

  assert.equal(check.status, 1);
  assert.match(check.error, /Cursor stopped before its result/);
  assert.equal(retry.status, 0, retry.error);
  assert.match(readFileSync(retry.out, "utf8"), /No findings/);
});

test("setup_storesNoChat_forS7_soResumeExits3", { skip }, () => {
  setup("S7");
  const { diff } = firstRound();

  const second = resume(diff);

  assert.equal(second.status, 3);
  assert.equal(readdirSync(join(root, "calls")).filter((name) => name.endsWith(".args")).length, 1);
});

test("setup_amendsCommitDuringRound1_forS3_soItsStartCommitHasNoBase", { skip }, () => {
  setup("S3");
  const start = run("git rev-parse HEAD").out;
  firstRound();

  const diff = run(`sh "${SCRIPTS}/make-diff.sh" --base ${start}`);

  assert.equal(diff.status, 3, diff.error);
});

test("setup_committedChangeOnly_forS2_soNamedUnknownBaseExits3", { skip }, () => {
  setup("S2");

  const diff = run(`sh "${SCRIPTS}/make-diff.sh" --base release-9`);

  assert.equal(diff.status, 3, diff.error);
  assert.equal(run("git status --porcelain").out, "");
});

test("setup_ignoresCallersGitConfig_whenItWouldBreakCommits", { skip }, () => {
  root = mkdtempSync(join(tmpdir(), "skill-runs-"));
  writeFileSync(join(root, "gitconfig"), "[commit]\n\tgpgsign = true\n[gpg]\n\tprogram = false\n");
  const env = { ...process.env, TMPDIR: root, GIT_CONFIG_GLOBAL: join(root, "gitconfig") };

  const result = spawnSync("sh", [SETUP, "S1"], { encoding: "utf8", env });

  assert.equal(result.status, 0, result.stderr);
});

// Runs run.sh with a fake claude that records each call and exits with `code`; sandboxes land in root.
function runScenarios(code, ...scenarios) {
  root = mkdtempSync(join(tmpdir(), "skill-runs-"));
  mkdirSync(join(root, "bin"));
  writeFileSync(join(root, "bin", "claude"), `#!/bin/sh\necho call >> "${root}/claude-calls"\nexit ${code}\n`, { mode: 0o755 });
  const env = { ...process.env, TMPDIR: root, PATH: `${join(root, "bin")}:${process.env.PATH}` };
  const result = spawnSync("sh", [RUN, ...scenarios], { encoding: "utf8", env });
  const calls = existsSync(join(root, "claude-calls")) ? readFileSync(join(root, "claude-calls"), "utf8").split("\n").length - 1 : 0;
  return { status: result.status, error: result.stderr, calls };
}

test("run_exits0_whenEveryTurnSucceeds", { skip }, () => {
  const result = runScenarios(0, "S8");

  assert.equal(result.status, 0, result.error);
  assert.equal(result.calls, 3);
});

test("run_exits1_whenATurnFails", { skip }, () => {
  const result = runScenarios(1, "S8");

  assert.equal(result.status, 1);
  assert.match(result.error, /S8: a turn failed/);
});

test("run_startsNoSession_whenALaterScenarioIsUnknown", { skip }, () => {
  const result = runScenarios(0, "S1", "S9");

  assert.equal(result.status, 1);
  assert.equal(result.calls, 0);
});
