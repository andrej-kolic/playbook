import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { checkRules, diffRules } from "../lib/check-rules.js";

const hash = (text) => `sha256-${createHash("sha256").update(text).digest("hex")}`;
const entry = (rules, ruleSelection = ["*"]) => ({
  requestedRef: "main",
  rulesPath: ".rulesync/rules",
  ruleSelection,
  rules: Object.fromEntries(Object.entries(rules).map(([name, text]) => [name, { integrity: hash(text) }])),
});

// Fakes GitHub: the contents listing of .rulesync/rules plus one raw download per file.
// Records each request's URL and Authorization header in `requests`.
function fakeGitHub(files, requests = []) {
  return async (url, { headers }) => {
    requests.push({ url, authorization: headers.Authorization });
    if (url.startsWith("https://api.github.com/")) {
      const listing = Object.keys(files).map((name) => ({
        type: "file",
        name: `${name}.md`,
        download_url: `https://raw.test/${name}.md`,
      }));
      return new Response(JSON.stringify(listing));
    }
    const name = url.slice("https://raw.test/".length, -".md".length);
    return name in files ? new Response(files[name]) : new Response("", { status: 404 });
  };
}

test("diffRules_reportsNothing_whenEveryHashMatches", () => {
  assert.deepEqual(diffRules(entry({ git: "a" }), { git: hash("a") }), { changed: [], added: [], removed: [] });
});

test("diffRules_reportsChangedAddedAndRemoved_whenRulesDiffer", () => {
  const current = { git: hash("b"), jsdoc: hash("c") };

  assert.deepEqual(diffRules(entry({ git: "a", testing: "t" }), current), {
    changed: ["git"],
    added: ["jsdoc"],
    removed: ["testing"],
  });
});

test("diffRules_ignoresNewRules_whenSelectionIsExplicit", () => {
  assert.deepEqual(diffRules(entry({ git: "a" }, ["git"]), { git: hash("a"), jsdoc: hash("c") }).added, []);
});

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "playbook-check-rules-"));
});
const savedEnv = { GITHUB_TOKEN: process.env.GITHUB_TOKEN, GH_TOKEN: process.env.GH_TOKEN };
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const writeLock = (sourceEntry) =>
  writeFileSync(
    join(dir, "rulesync.lock"),
    JSON.stringify({ lockfileVersion: 1, sources: { "andrej-kolic/playbook": sourceEntry } }),
  );

test("checkRules_returnsFalse_whenRuleTextIsUnchanged", async () => {
  writeLock(entry({ git: "same text" }));

  assert.equal(await checkRules(dir, fakeGitHub({ git: "same text" })), false);
});

test("checkRules_returnsTrue_whenARuleTextChanged", async () => {
  writeLock(entry({ git: "old text" }));

  assert.equal(await checkRules(dir, fakeGitHub({ git: "new text" })), true);
});

test("checkRules_throws_whenLockHasNoPlaybookSource", async () => {
  writeFileSync(join(dir, "rulesync.lock"), JSON.stringify({ sources: {} }));

  await assert.rejects(checkRules(dir, fakeGitHub({})), /no andrej-kolic\/playbook source/);
});

test("checkRules_throws_whenGitHubRequestFails", async () => {
  writeLock(entry({ git: "a" }));
  const failing = async () => new Response("", { status: 403 });

  await assert.rejects(checkRules(dir, failing), /failed with 403; rerun with GITHUB_TOKEN/);
});

test("checkRules_sendsTokenToApiOnly_whenGhTokenIsSet", async () => {
  delete process.env.GITHUB_TOKEN;
  process.env.GH_TOKEN = "secret";
  writeLock(entry({ git: "a" }));
  const requests = [];

  await checkRules(dir, fakeGitHub({ git: "a" }, requests));

  assert.deepEqual(
    requests.map(({ url, authorization }) => [new URL(url).host, authorization]),
    [["api.github.com", "Bearer secret"], ["raw.test", undefined]],
  );
});
