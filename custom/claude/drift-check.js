#!/usr/bin/env node
// Counts conversation-rule breaks in Claude Code session logs, before vs. after
// the Playbook output style went live (#51), and early vs. late in each session.
// Usage: node custom/claude/drift-check.js [--cutoff ISO] [--since ISO]; cutoff defaults to when the style was linked in

import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const BUDGET = 10;
const LATE_TURN = 6;
const LABEL_ITEM = /^\s*(?:\d+[.)]|[-*•])\s+(?:\*\*[^*\n]{1,40}?:\*\*|\*\*[^*\n]{1,40}?\*\*:|[A-Z][\w'/ -]{0,30}:\s)/;

const isPrompt = (entry) => {
  if (entry.type !== "user" || entry.isMeta || entry.isSidechain) return false;
  const content = entry.message?.content;
  if (typeof content === "string") return true;
  return Array.isArray(content) && content.length > 0 && content.every((block) => block.type === "text");
};

/** Splits one session log into turns; each reply is the text after the turn's last tool call. */
export function sessionReplies(jsonl) {
  const replies = [];
  let start;
  let turn = 0;
  let current;
  const close = () => {
    if (current?.text.trim()) replies.push(current);
  };
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    start ??= entry.timestamp;
    if (isPrompt(entry)) {
      close();
      turn += 1;
      current = { start, turn, text: "" };
    } else if (entry.type === "assistant" && !entry.isSidechain && current) {
      for (const block of entry.message?.content ?? []) {
        if (block.type === "tool_use") current.text = "";
        else if (block.type === "text") current.text += (current.text ? "\n" : "") + block.text;
      }
    }
  }
  close();
  return replies;
}

/** Rule breaks a program can spot in one reply. Fenced code blocks are payload and don't count. */
export function checkReply(text) {
  const prose = text.replace(/^```[\s\S]*?^```/gm, "");
  const lines = prose.split("\n").filter((line) => line.trim()).length;
  return {
    overBudget: lines > BUDGET,
    labelItems: prose.split("\n").filter((line) => LABEL_ITEM.test(line)).length,
    emDash: text.includes("—"),
  };
}

/** Rates per group: before/after cutoff × early/late turn. */
export function summarize(replies, cutoff) {
  const groups = {};
  for (const reply of replies) {
    const key = `${reply.start < cutoff ? "before" : "after"} · ${reply.turn < LATE_TURN ? "early" : "late"}`;
    const group = (groups[key] ??= { replies: 0, overBudget: 0, labelItems: 0, emDash: 0 });
    const result = checkReply(reply.text);
    group.replies += 1;
    group.overBudget += result.overBudget;
    group.labelItems += result.labelItems;
    group.emDash += result.emDash;
  }
  return groups;
}

function readAll(root, since) {
  const replies = [];
  for (const dir of readdirSync(root, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    for (const file of readdirSync(join(root, dir.name))) {
      if (!file.endsWith(".jsonl")) continue;
      for (const reply of sessionReplies(readFileSync(join(root, dir.name, file), "utf8"))) {
        if (reply.start && reply.start >= since) replies.push(reply);
      }
    }
  }
  return replies;
}

// The style went live on this laptop when its link was created.
function installTime() {
  try {
    return lstatSync(join(homedir(), ".claude", "output-styles", "playbook.md")).birthtime;
  } catch {
    console.error("Playbook style isn't installed here (see custom/README.md); pass --cutoff <ISO date>.");
    process.exit(1);
  }
}

function main(argv) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const cutoff = new Date(arg("--cutoff") ?? installTime()).toISOString();
  const since = new Date(arg("--since", new Date(Date.parse(cutoff) - 14 * 864e5).toISOString())).toISOString();
  const groups = summarize(readAll(join(homedir(), ".claude", "projects"), since), cutoff);
  const pct = (n, d) => `${Math.round((100 * n) / d)}%`.padStart(5);
  console.log(`Sessions started ${since.slice(0, 10)} on; style live from ${cutoff}; late = turn ${LATE_TURN}+`);
  console.log("group            replies  >10 lines  em dash  label items/reply");
  for (const key of ["before · early", "before · late", "after · early", "after · late"]) {
    const g = groups[key];
    if (!g) continue;
    console.log(
      `${key.padEnd(16)} ${String(g.replies).padStart(7)}  ${pct(g.overBudget, g.replies).padStart(9)}  ${pct(g.emDash, g.replies).padStart(7)}  ${(g.labelItems / g.replies).toFixed(2).padStart(17)}`,
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
