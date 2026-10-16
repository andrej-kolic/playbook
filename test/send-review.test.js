import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

const SCRIPTS = join(import.meta.dirname, "..", ".rulesync", "skills", "x-review-with-cursor-next", "scripts");
const SCRIPT = join(SCRIPTS, "send-review.sh");
// Stands in for Cursor's agent CLI: records its arguments and input, then answers like the real one.
const FAKE_AGENT = `#!/bin/sh
printf '%s\\n' "$@" > "$FAKE_AGENT_LOG/args"
cat > "$FAKE_AGENT_LOG/stdin"
echo '{"type":"result","result":"fake review"}'
exit "\${FAKE_AGENT_EXIT:-0}"
`;
let root, repo, temp, log, diff, env;

// Git Bash reads C:/... paths in variables it passes through untouched; C:\\... it may not.
const slashed = (path) => path.replaceAll("\\", "/");
// PATH without any real agent CLI, so no test can start a paid Cursor run.
const pathWithoutAgent = () =>
  process.env.PATH.split(delimiter)
    .filter((dir) => !["agent", "agent.cmd", "agent.exe", "agent.ps1"].some((name) => existsSync(join(dir, name))))
    .join(delimiter);

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "playbook-send-review-")));
  repo = join(root, "repo");
  temp = join(root, "tmp");
  log = join(root, "log");
  const bin = join(root, "bin");
  for (const dir of [repo, temp, log, bin]) mkdirSync(dir);
  writeFileSync(join(bin, "agent"), FAKE_AGENT, { mode: 0o755 });
  diff = join(root, "change.diff");
  writeFileSync(diff, "diff --git a/a.txt b/a.txt\n-one\n+two\n");
  // Windows names the variable Path; one PATH key avoids passing two.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  env = { ...inherited, PATH: `${bin}${delimiter}${pathWithoutAgent()}`, TMPDIR: temp, FAKE_AGENT_LOG: slashed(log) };
  spawnSync("git", ["init", "-q"], { cwd: repo, env });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function sendReview(args = [slashed(diff)]) {
  const result = spawnSync("sh", [SCRIPT, ...args], { cwd: repo, env, encoding: "utf8" });
  return { status: result.status, path: result.stdout.trim(), error: result.stderr };
}
function replyPath() {
  const { status, path, error } = sendReview();
  assert.equal(status, 0, error);
  return path;
}

test("sendReview_pipesPromptBlankLineAndDiff_toAgent", () => {
  replyPath();

  const prompt = readFileSync(join(SCRIPTS, "prompt.txt"), "utf8");
  assert.equal(readFileSync(join(log, "stdin"), "utf8"), `${prompt}\n${readFileSync(diff, "utf8")}`);
});

test("sendReview_runsAgentReadOnly_withDefaultModelInRepo", () => {
  replyPath();

  const args = readFileSync(join(log, "args"), "utf8").trimEnd().split("\n");
  const workspace = args.pop();
  assert.deepEqual(args, [
    "-p",
    "--trust",
    "--mode",
    "ask",
    "--output-format",
    "stream-json",
    "--model",
    "grok-4.7-high-fast",
    "--workspace",
  ]);
  assert.equal(realpathSync(workspace), repo);
});

test("sendReview_usesNamedModel_whenGiven", () => {
  const { status, error } = sendReview([slashed(diff), "composer-2.5"]);

  assert.equal(status, 0, error);
  const args = readFileSync(join(log, "args"), "utf8").split("\n");
  assert.equal(args[args.indexOf("--model") + 1], "composer-2.5");
});

test("sendReview_failsWithoutRunningAgent_whenModelIsAuto", () => {
  const { status, error } = sendReview([slashed(diff), "auto"]);

  assert.equal(status, 1);
  assert.match(error, /send-review: model auto is not allowed/);
  assert.ok(!existsSync(join(log, "args")), "agent ran with model auto");
});

test("sendReview_writesAgentReply_toTempFile", () => {
  const path = replyPath();

  assert.equal(realpathSync(join(path, "..")), temp);
  assert.equal(readFileSync(path, "utf8"), '{"type":"result","result":"fake review"}\n');
});

test("sendReview_showsAgentOutputAndLeavesNoFiles_whenAgentFails", () => {
  env.FAKE_AGENT_EXIT = "3";

  const { status, path, error } = sendReview();

  assert.equal(status, 1);
  assert.equal(path, "");
  assert.match(error, /fake review/, "agent's own output was lost");
  assert.match(error, /send-review: agent exited with 3/);
  assert.deepEqual(readdirSync(temp), []);
});

test("sendReview_fails_whenAgentIsNotInstalled", () => {
  env.PATH = pathWithoutAgent();

  const { status, error } = sendReview();

  assert.equal(status, 1);
  assert.match(error, /send-review: Cursor's agent CLI not found/);
});

test("sendReview_failsWithoutRunningAgent_whenDiffFileIsMissing", () => {
  const { status, error } = sendReview([slashed(join(root, "missing.diff"))]);

  assert.equal(status, 1);
  assert.match(error, /send-review: no diff file, or the diff is empty/);
  assert.ok(!existsSync(join(log, "args")), "agent ran without a diff");
});

test("sendReview_failsWithoutRunningAgent_whenDiffIsEmpty", () => {
  writeFileSync(diff, "");

  const { status, error } = sendReview();

  assert.equal(status, 1);
  assert.match(error, /send-review: no diff file, or the diff is empty/);
  assert.ok(!existsSync(join(log, "args")), "agent ran with an empty diff");
  assert.deepEqual(readdirSync(temp), []);
});

test("sendReview_failsWithoutRunningAgent_whenDiffPathIsDirectory", () => {
  const { status, error } = sendReview([slashed(root)]);

  assert.equal(status, 1);
  assert.match(error, /send-review: no diff file, or the diff is empty/);
  assert.ok(!existsSync(join(log, "args")), "agent ran with a directory as the diff");
});

test("sendReview_failsWithoutRunningAgent_whenPromptIsMissing", () => {
  // A copy of the script with no prompt.txt beside it.
  const copy = join(root, "skill");
  mkdirSync(copy);
  copyFileSync(SCRIPT, join(copy, "send-review.sh"));

  const result = spawnSync("sh", [join(copy, "send-review.sh"), slashed(diff)], { cwd: repo, env, encoding: "utf8" });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /send-review: no prompt, or the prompt is empty/);
  assert.ok(!existsSync(join(log, "args")), "agent ran without a prompt");
  assert.deepEqual(readdirSync(temp), []);
});
