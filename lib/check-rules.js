import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RULES_PATH, SOURCE } from "./rules.js";

// Same formula rulesync uses for a rule's `integrity` in rulesync.lock.
function integrity(content) {
  return `sha256-${createHash("sha256").update(content).digest("hex")}`;
}

/**
 * Compares the rules pinned in a rulesync.lock source entry with the source's current rules.
 * A rule missing from the lock counts as added only when the entry selects every rule (`*`).
 * @param {object} lockEntry the source's entry under `sources` in rulesync.lock
 * @param {Record<string, string>} currentRules rule name → integrity on the source's branch
 * @returns {{changed: string[], added: string[], removed: string[]}} rule names, sorted
 */
export function diffRules(lockEntry, currentRules) {
  const locked = lockEntry.rules ?? {};
  const changed = [];
  const removed = [];
  for (const [name, { integrity: pinned }] of Object.entries(locked)) {
    if (!(name in currentRules)) removed.push(name);
    else if (currentRules[name] !== pinned) changed.push(name);
  }
  const added = (lockEntry.ruleSelection ?? []).includes("*")
    ? Object.keys(currentRules).filter((name) => !(name in locked))
    : [];
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort() };
}

async function get(url, fetchFn, token) {
  const headers = { "User-Agent": "playbook" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetchFn(url, { headers });
  if (!response.ok) {
    const hint = response.status === 403 || response.status === 429 ? "; rerun with GITHUB_TOKEN=$(gh auth token)" : "";
    throw new Error(`GET ${url} failed with ${response.status}${hint}`);
  }
  return response;
}

/**
 * Downloads every rule under `rulesPath` on `ref` of the playbook repo and hashes it.
 * @returns {Promise<Record<string, string>>} rule name → integrity
 * @throws {Error} when a GitHub request fails
 */
export async function fetchRules(rulesPath, ref, fetchFn = fetch) {
  const path = rulesPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  // Same variables rulesync reads. Only the API request gets the token: raw.githubusercontent.com
  // answers 404 to a token that can't read the repo, and the download URLs come from the response.
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const listing = await get(
    `https://api.github.com/repos/${SOURCE}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    fetchFn,
    token,
  );
  const files = (await listing.json()).filter((item) => item.type === "file" && item.name.endsWith(".md"));
  const entries = await Promise.all(
    files.map(async (file) => {
      const content = Buffer.from(await (await get(file.download_url, fetchFn)).arrayBuffer());
      return [file.name.slice(0, -".md".length), integrity(content)];
    }),
  );
  return Object.fromEntries(entries);
}

/**
 * Reports which playbook rules pinned in `dir`'s rulesync.lock differ from the playbook's branch.
 * @returns {Promise<boolean>} true when any rule changed, was added or was removed
 * @throws {Error} when rulesync.lock is missing or has no playbook source, or a request fails
 */
export async function checkRules(dir, fetchFn = fetch) {
  let lock;
  try {
    lock = JSON.parse(readFileSync(join(dir, "rulesync.lock"), "utf8"));
  } catch (error) {
    throw new Error(`cannot read rulesync.lock in ${dir}: ${error.message}`);
  }
  const entry = lock.sources?.[SOURCE];
  if (!entry) throw new Error(`rulesync.lock has no ${SOURCE} source; run playbook rules first`);

  const ref = entry.requestedRef ?? "main";
  const diff = diffRules(entry, await fetchRules(entry.rulesPath ?? RULES_PATH, ref, fetchFn));
  const lines = [
    ...diff.changed.map((name) => `changed: ${name}`),
    ...diff.added.map((name) => `added: ${name}`),
    ...diff.removed.map((name) => `removed: ${name}`),
  ];
  if (lines.length === 0) {
    console.log(`Rules are up to date with ${SOURCE}@${ref}.`);
    return false;
  }
  console.log(`Rules differ from ${SOURCE}@${ref}:\n${lines.map((line) => `  ${line}`).join("\n")}`);
  console.log("Run pnpm rules:update to take them.");
  return true;
}
