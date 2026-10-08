import { readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { generate } from "rulesync";
import { SOURCE, TARGETS } from "./init.js";

// The playbook's own copy: under `pnpm dlx` this is the downloaded repo, in a clone the working tree.
const PLAYBOOK_ROOT = join(import.meta.dirname, "..");
// Where rulesync writes in global mode, which its paths are relative to: HOME_DIR when set, else home.
const OUTPUT_ROOT = process.env.HOME_DIR || homedir();
// The source line every playbook skill starts with; skills without it belong to other tools.
const MARKER = `<!-- source: ${SOURCE} `;

async function generateSkills(options) {
  const result = await generate({
    global: true,
    targets: TARGETS,
    features: ["skills"],
    inputRoots: [join(PLAYBOOK_ROOT, ".rulesync")],
    silent: true,
    ...options,
  });
  if (result.sourceLoadFailed) throw new Error(`cannot read the playbook's skills in ${PLAYBOOK_ROOT}`);
  return result;
}

// What an install would change, without changing anything: the paths it would write, and the
// playbook skills it would remove. rulesync's orphan sweep would also delete other tools' skills
// from these shared folders, so it only ever runs as a dry run, to list the candidates.
async function plan() {
  const result = await generateSkills({ delete: true, dryRun: true });
  const candidates = (result.deletedPathsByFeature?.skills ?? []).filter(({ kind }) => kind === "directory");
  return {
    write: result.skillsPaths,
    remove: candidates.map(({ path }) => path).filter((path) => isPlaybookSkill(join(OUTPUT_ROOT, path))),
  };
}

function isPlaybookSkill(dir) {
  return readdirSync(dir, { withFileTypes: true }).some(
    (entry) => entry.isFile() && readFileSync(join(dir, entry.name), "utf8").includes(MARKER),
  );
}

/**
 * Installs the playbook's skills user-level for Claude Code and Cursor from this copy of the
 * playbook, then removes playbook skills it no longer has for a host. Skills from other tools are
 * never touched: only folders carrying the playbook's source line are removed.
 * @param {{dryRun?: boolean}} [options] dryRun lists what would change without writing
 * @returns {Promise<{written: string[], removed: string[]}>} paths relative to the home folder
 * @throws {Error} when rulesync can't read the playbook's skills
 */
export async function installSkills({ dryRun = false } = {}) {
  const { write, remove } = await plan();
  if (dryRun) return { written: write, removed: remove };
  const { skillsPaths } = await generateSkills({ delete: false });
  for (const path of remove) rmSync(join(OUTPUT_ROOT, path), { recursive: true, force: true });
  return { written: skillsPaths, removed: remove };
}

/**
 * Compares the installed skills with this copy of the playbook, by content. Writes nothing.
 * @returns {Promise<{outdated: string[], leftovers: string[]}>} paths relative to the home folder:
 *   copies that differ or are missing, and playbook skills the playbook no longer has
 * @throws {Error} when rulesync can't read the playbook's skills
 */
export async function checkSkills() {
  const { write, remove } = await plan();
  return { outdated: write, leftovers: remove };
}
