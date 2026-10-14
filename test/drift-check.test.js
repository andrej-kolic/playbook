import assert from "node:assert/strict";
import { test } from "node:test";
import { checkReply, sessionReplies, summarize } from "../custom/claude/drift-check.js";

const log = (...entries) => entries.map((entry) => JSON.stringify(entry)).join("\n");
const prompt = (text, timestamp = "2026-10-15T10:00:00Z") => ({ type: "user", timestamp, message: { content: text } });
const assistant = (...content) => ({ type: "assistant", message: { content } });
const text = (value) => ({ type: "text", text: value });
const toolUse = { type: "tool_use", name: "Bash" };
const toolResult = { type: "user", message: { content: [{ type: "tool_result", content: "ok" }] } };

test("sessionReplies_keepsOnlyTextAfterLastToolCall", () => {
  const replies = sessionReplies(log(prompt("hi"), assistant(text("Checking."), toolUse), toolResult, assistant(text("Done."))));
  assert.deepEqual(replies, [{ start: "2026-10-15T10:00:00Z", turn: 1, text: "Done." }]);
});

test("sessionReplies_numbersTurnsAndSkipsMetaAndSidechain", () => {
  const replies = sessionReplies(
    log(
      prompt("one"),
      assistant(text("A")),
      { type: "user", isMeta: true, message: { content: [text("skill body")] } },
      assistant({ type: "text", text: "B" }),
      { ...assistant(text("subagent")), isSidechain: true },
      prompt("two"),
      assistant(text("C")),
    ),
  );
  assert.deepEqual(
    replies.map(({ turn, text }) => [turn, text]),
    [
      [1, "A\nB"],
      [2, "C"],
    ],
  );
});

test("checkReply_flagsOverBudget_butNotFencedPayload", () => {
  const long = Array.from({ length: 11 }, (_, i) => `line ${i}`).join("\n");
  const fenced = `Answer.\n\`\`\`\n${long}\n\`\`\``;
  assert.equal(checkReply(long).overBudget, true);
  assert.equal(checkReply(fenced).overBudget, false);
});

test("checkReply_countsLabelItems_notPointFirstItems", () => {
  const reply = ["1. **Context:** rules fade", "2. **Why**: cost", "- Note: x", "3. **Rules fade in long sessions.** So a reminder helps."].join("\n");
  assert.equal(checkReply(reply).labelItems, 3);
});

test("checkReply_flagsEmDash", () => {
  assert.equal(checkReply("a — b").emDash, true);
  assert.equal(checkReply("a - b").emDash, false);
});

test("summarize_groupsByCutoffAndTurn", () => {
  const groups = summarize(
    [
      { start: "2026-10-10T00:00:00Z", turn: 1, text: "a — b" },
      { start: "2026-10-15T00:00:00Z", turn: 7, text: "ok" },
    ],
    "2026-10-14T13:30:00.000Z",
  );
  assert.deepEqual(groups, {
    "before · early": { replies: 1, overBudget: 0, labelItems: 0, emDash: 1 },
    "after · late": { replies: 1, overBudget: 0, labelItems: 0, emDash: 0 },
  });
});
