import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

const SCRIPT = join(import.meta.dirname, "..", ".rulesync", "skills", "x-review-with-cursor-next", "scripts", "read-reply.sh");
// Lines shaped like Cursor's stream-json reply (2026-10-16 runs), cut down to the fields the script reads.
const INIT = '{"type":"system","subtype":"init","session_id":"s-1","model":"Grok 4.7 Fast"}';
const READ =
  '{"type":"tool_call","subtype":"completed","call_id":"c-1\\nfc_1","tool_call":{"readToolCall":{"args":{"path":"/r/a.js"},"result":{"success":{"content":"const result = {\\"result\\":{\\"rejected\\":1}};"}}}},"session_id":"s-1"}';
const shell = (result) =>
  `{"type":"tool_call","subtype":"completed","call_id":"c-2\\nfc_2","tool_call":{"shellToolCall":{"args":{"command":"touch x","simpleCommands":["touch"]},"result":{"${result}":{"command":"touch x"}}}},"session_id":"s-1"}`;
const FETCH_REFUSED =
  '{"type":"tool_call","subtype":"completed","call_id":"c-3\\nfc_3","tool_call":{"webFetchToolCall":{"args":{"url":"https://example.com"},"result":{"rejected":{"reason":"User Rejected"}}}},"session_id":"s-1"}';
const result = ({ subtype = "success", isError = false, text = 'Lead-in.Finding 1 (high): \\"a\\" breaks.' } = {}) =>
  `{"type":"result","subtype":"${subtype}","duration_ms":1000,"is_error":${isError},"result":"${text}","session_id":"s-1","request_id":"r-1","usage":{"inputTokens":120,"outputTokens":30,"cacheReadTokens":400,"cacheWriteTokens":0}}`;
let root;

beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), "playbook-read-reply-")));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function readReply(lines) {
  const reply = join(root, "reply.jsonl");
  writeFileSync(reply, lines.map((line) => `${line}\n`).join(""));
  const run = spawnSync("sh", [SCRIPT, reply.replaceAll("\\", "/")], { encoding: "utf8" });
  return { status: run.status, lines: run.stdout.trimEnd().split("\n"), error: run.stderr };
}

test("readReply_printsSessionAndTokens_whenReplySucceededWithReadsOnly", () => {
  const { status, lines, error } = readReply([INIT, READ, result()]);

  assert.equal(status, 0, error);
  assert.deepEqual(lines, ["session s-1", "tokens input 120, output 30, cache read 400, cache write 0"]);
});

test("readReply_fails_whenReplyHasNoResultLine", () => {
  const { status, error } = readReply([INIT, READ]);

  assert.equal(status, 1);
  assert.match(error, /read-reply: Cursor stopped before its result; last line: \{"type":"tool_call"/);
});

test("readReply_fails_whenResultIsAnError", () => {
  const { status, error } = readReply([INIT, result({ subtype: "error", isError: true, text: "Rate limited" })]);

  assert.equal(status, 1);
  assert.match(error, /read-reply: Cursor reported an error: .*Rate limited/);
});

test("readReply_fails_whenOnlyIsErrorIsTrue", () => {
  const { status, error } = readReply([INIT, result({ isError: true })]);

  assert.equal(status, 1);
  assert.match(error, /read-reply: Cursor reported an error/);
});

test("readReply_fails_whenResultIsEmpty", () => {
  const { status, error } = readReply([INIT, result({ text: "" })]);

  assert.equal(status, 1);
  assert.match(error, /read-reply: Cursor's result is empty/);
});

test("readReply_listsCallAsNotRefused_whenShellRan", () => {
  const { status, lines, error } = readReply([INIT, READ, shell("success"), result()]);

  assert.equal(status, 0, error);
  assert.deepEqual(lines.slice(2), ["tool shellToolCall not refused: success"]);
});

test("readReply_listsCallsAsRefused_whenShellAndFetchWereRejected", () => {
  const { status, lines, error } = readReply([INIT, shell("rejected"), READ, FETCH_REFUSED, result()]);

  assert.equal(status, 0, error);
  assert.deepEqual(lines.slice(2), ["tool shellToolCall refused", "tool webFetchToolCall refused"]);
});

test("readReply_listsCallAsRefused_whenPermissionDenied", () => {
  const { status, lines, error } = readReply([INIT, shell("permissionDenied"), result()]);

  assert.equal(status, 0, error);
  assert.deepEqual(lines.slice(2), ["tool shellToolCall refused"]);
});

test("readReply_listsCall_whenFieldsComeInAnotherOrder", () => {
  const reordered = shell("success").replace(
    /^\{"type":"tool_call","subtype":"completed",(.*)\}$/,
    '{"session_id":"s-1",$1,"subtype":"completed","type":"tool_call"}',
  );

  const { status, lines, error } = readReply([INIT, reordered, result()]);

  assert.equal(status, 0, error);
  assert.deepEqual(lines.slice(2), ["tool shellToolCall not refused: success"]);
});

test("readReply_ignoresQuotedKeysInsideResultText", () => {
  // Escaped keys in the review text must not pass for the line's own fields.
  const text = 'Report: \\"is_error\\":false, \\"session_id\\":\\"fake\\"';
  const { status, lines, error } = readReply([INIT, result({ isError: true, text })]);

  assert.equal(status, 1, lines.join("\n"));
  assert.match(error, /read-reply: Cursor reported an error/);
});

test("readReply_printsTokensNotReported_whenUsageIsMissing", () => {
  const { status, lines, error } = readReply([INIT, result().replace(/,"usage":\{[^}]*\}/, "")]);

  assert.equal(status, 0, error);
  assert.deepEqual(lines, ["session s-1", "tokens not reported"]);
});

test("readReply_fails_whenReplyFileIsEmpty", () => {
  const { status, error } = readReply([]);

  assert.equal(status, 1);
  assert.match(error, /read-reply: no reply file, or the reply is empty/);
});
