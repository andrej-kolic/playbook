import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

const SCRIPTS = join(import.meta.dirname, "..", ".rulesync", "skills", "x-review-with-cursor-next", "scripts");
const SCRIPT = join(SCRIPTS, "send-review.sh");
// Stands in for Cursor's agent CLI: records its arguments and input, then answers like the real one.
const FAKE_AGENT = `#!/bin/sh
printf '%s\\n' "$@" > "$FAKE_AGENT_LOG/args"
cat > "$FAKE_AGENT_LOG/stdin"
if [ -n "$FAKE_AGENT_WAIT" ]; then while [ ! -e "$FAKE_AGENT_WAIT" ]; do sleep 0.1; done; fi
if [ -n "$FAKE_AGENT_REPLY" ]; then echo "$FAKE_AGENT_REPLY"; else echo '{"type":"result","result":"fake review"}'; fi
exit "\${FAKE_AGENT_EXIT:-0}"
`;
let root, repo, temp, log, diff, config, env;

// Git Bash reads C:/... paths in variables it passes through untouched; C:\\... it may not.
const slashed = (path) => path.replaceAll("\\", "/");
// PATH without any real agent CLI, so no test can start a paid Cursor run.
const pathWithoutAgent = () =>
  process.env.PATH.split(delimiter)
    .filter((dir) => !["agent", "agent.cmd", "agent.exe", "agent.ps1"].some((name) => existsSync(join(dir, name))))
    .join(delimiter);

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), "playbook-send-review-")));
  repo = join(root, "repo");
  temp = join(root, "tmp");
  log = join(root, "log");
  const bin = join(root, "bin");
  for (const dir of [repo, temp, log, bin]) mkdirSync(dir);
  writeFileSync(join(bin, "agent"), FAKE_AGENT, { mode: 0o755 });
  diff = join(root, "change.diff");
  // Cursor's chat store for these tests, so none reads the real one.
  config = join(root, "cursor");
  writeFileSync(diff, "diff --git a/a.txt b/a.txt\n-one\n+two\n");
  // Windows names the variable Path; one PATH key avoids passing two.
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== "PATH"));
  env = { ...inherited, PATH: `${bin}${delimiter}${pathWithoutAgent()}`, TMPDIR: temp, CURSOR_CONFIG_DIR: slashed(config), FAKE_AGENT_LOG: slashed(log) };
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
  assert.equal(realpathSync.native(workspace), repo);
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

  assert.equal(realpathSync.native(join(path, "..")), temp);
  assert.equal(readFileSync(path, "utf8"), '{"type":"result","result":"fake review"}\n');
});

test("sendReview_keepsReplyInFileOnly_whenAgentFails", () => {
  env.FAKE_AGENT_EXIT = "3";

  const { status, path, error } = sendReview();

  assert.equal(status, 1);
  assert.match(error, /send-review: agent exited with 3/);
  assert.doesNotMatch(error, /fake review/, "the reply was copied to stderr");
  assert.equal(realpathSync.native(join(path, "..")), temp);
  assert.equal(readFileSync(path, "utf8"), '{"type":"result","result":"fake review"}\n');
});

test("sendReview_showsAgentErrorText_whenFailedReplyIsNotStreamJson", () => {
  env.FAKE_AGENT_EXIT = "1";
  env.FAKE_AGENT_REPLY = "Authentication required. Please run 'agent login' first.";

  const { status, error } = sendReview();

  assert.equal(status, 1);
  assert.match(error, /Authentication required/);
});

test("sendReview_keepsStreamJsonReplyOffStderr_whenItQuotesLoginError", () => {
  env.FAKE_AGENT_EXIT = "1";
  env.FAKE_AGENT_REPLY = '{"type":"tool_call","text":"Authentication required"}';

  const { status, error } = sendReview();

  assert.equal(status, 1);
  assert.doesNotMatch(error, /Authentication required/, "a file Cursor read was shown as the login error");
});

test("sendReview_keepsGitBashPathInBothLines_whenCygpathFails", () => {
  writeFileSync(join(root, "bin", "cygpath"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  env.FAKE_AGENT_EXIT = "3";

  const { status, path, error } = sendReview();

  assert.equal(status, 1);
  assert.equal(readFileSync(path, "utf8"), '{"type":"result","result":"fake review"}\n');
  assert.ok(error.includes(`its reply is in ${path}\n`), error);
});

test("sendReview_printsReplyPath_beforeAgentFinishes", async () => {
  const go = join(log, "go");
  env.FAKE_AGENT_WAIT = slashed(go);
  const child = spawn("sh", [SCRIPT, slashed(diff)], { cwd: repo, env });
  const exited = new Promise((resolve) => child.on("close", resolve));

  // The path must arrive while agent waits for the go file; the timer only ends a failing run.
  const firstLine = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(""), 5000);
    child.stdout.once("data", (data) => {
      clearTimeout(timer);
      resolve(String(data).trim());
    });
  });
  writeFileSync(go, "");

  assert.equal(await exited, 0);
  assert.notEqual(firstLine, "", "no path while agent was running");
  assert.equal(realpathSync.native(join(firstLine, "..")), temp);
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

const SESSION = "f3952505-06f0-448b-aa5f-d396f77852db";
function writePrompt(text = "Addressed. Fixed: 1. Do another round on the change included below as a diff.\n") {
  const path = join(root, "round2.txt");
  writeFileSync(path, text);
  return slashed(path);
}
// Lays out a chat the way agent stores it: <config>/chats/<md5 of the workspace path>/<id>/.
function writeChat({ base = config, workspace = repo, hasConversation = true, store = true } = {}) {
  const dir = join(base, "chats", createHash("md5").update(resolve(workspace)).digest("hex"), SESSION);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "meta.json"), JSON.stringify({ schemaVersion: 1, createdAtMs: 1, hasConversation, cwd: workspace }));
  if (store) writeFileSync(join(dir, "store.db"), "");
}
function resumeArgs() {
  return ["--resume", SESSION, writePrompt(), slashed(diff)];
}

test("sendReview_resumesSessionWithSameFlags_whenResumeGiven", () => {
  writeChat();

  const { status, error } = sendReview(["--resume", SESSION, writePrompt(), slashed(diff), "composer-2.5"]);

  assert.equal(status, 0, error);
  const args = readFileSync(join(log, "args"), "utf8").trimEnd().split("\n");
  args.pop();
  assert.deepEqual(args, [
    "-p",
    "--resume",
    SESSION,
    "--trust",
    "--mode",
    "ask",
    "--output-format",
    "stream-json",
    "--model",
    "composer-2.5",
    "--workspace",
  ]);
});

test("sendReview_pipesGivenPromptBlankLineAndDiff_whenResumeGiven", () => {
  writeChat();

  const { status, error } = sendReview(["--resume", SESSION, writePrompt("Do another round.\n\n"), slashed(diff)]);

  assert.equal(status, 0, error);
  assert.equal(readFileSync(join(log, "stdin"), "utf8"), `Do another round.\n\n${readFileSync(diff, "utf8")}`);
});

test("sendReview_failsWithoutRunningAgent_whenSessionIdIsNotPlain", () => {
  const { status, error } = sendReview(["--resume", "x; rm -rf ~", writePrompt(), slashed(diff)]);

  assert.equal(status, 1);
  assert.match(error, /send-review: not a session id/);
  assert.ok(!existsSync(join(log, "args")), "agent ran with an unchecked session id");
});

test("sendReview_failsWithoutRunningAgent_whenResumePromptIsMissing", () => {
  const { status, error } = sendReview(["--resume", SESSION, slashed(join(root, "missing.txt")), slashed(diff)]);

  assert.equal(status, 1);
  assert.match(error, /send-review: no prompt, or the prompt is empty/);
  assert.ok(!existsSync(join(log, "args")), "agent ran without a prompt");
});

test("sendReview_fails_whenResumeLacksArguments", () => {
  const { status, error } = sendReview(["--resume", SESSION]);

  assert.equal(status, 1);
  assert.match(error, /send-review: --resume needs a session id, a prompt file and a diff/);
  assert.ok(!existsSync(join(log, "args")), "agent ran without its arguments");
});

test("sendReview_failsWithoutRunningAgent_whenResumeLacksDiff", () => {
  const { status, error } = sendReview(["--resume", SESSION, writePrompt()]);

  assert.equal(status, 1);
  assert.match(error, /send-review: --resume needs a session id, a prompt file and a diff/);
  assert.ok(!existsSync(join(log, "args")), "agent ran without a diff");
});

function assertNoChat({ status, error }) {
  assert.equal(status, 3, error);
  assert.match(error, /send-review: Cursor has no chat .* --resume would start a new one/);
  assert.ok(!existsSync(join(log, "args")), "agent ran with a chat it does not have");
  assert.deepEqual(readdirSync(temp), []);
}

test("sendReview_failsWithExit3WithoutRunningAgent_whenResumedChatIsUnknown", () => {
  assertNoChat(sendReview(resumeArgs()));
});

test("sendReview_failsWithExit3WithoutRunningAgent_whenResumedChatHasNoConversation", () => {
  writeChat({ hasConversation: false });

  assertNoChat(sendReview(resumeArgs()));
});

test("sendReview_failsWithExit3WithoutRunningAgent_whenResumedChatHasNoStore", () => {
  writeChat({ store: false });

  assertNoChat(sendReview(resumeArgs()));
});

test("sendReview_failsWithExit3WithoutRunningAgent_whenResumedChatIsInAnotherWorkspace", () => {
  writeChat({ workspace: root });

  assertNoChat(sendReview(resumeArgs()));
});

test("sendReview_findsResumedChatUnderXdgConfigHome_whenCursorConfigDirIsUnset", () => {
  delete env.CURSOR_CONFIG_DIR;
  const xdg = join(root, "xdg");
  env.XDG_CONFIG_HOME = slashed(xdg);
  writeChat({ base: join(xdg, "cursor") });

  const { status, error } = sendReview(resumeArgs());

  assert.equal(status, 0, error);
});

test("sendReview_findsResumedChatUnderHome_whenNoConfigDirIsSet", () => {
  delete env.CURSOR_CONFIG_DIR;
  delete env.XDG_CONFIG_HOME;
  const home = join(root, "home");
  env.HOME = slashed(home);
  writeChat({ base: join(home, ".cursor") });

  const { status, error } = sendReview(resumeArgs());

  assert.equal(status, 0, error);
});
