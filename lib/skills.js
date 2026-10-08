import { join } from "node:path";
import { generate } from "rulesync";
import { TARGETS } from "./init.js";

// The playbook's own copy: under `pnpm dlx` this is the downloaded repo, in a clone the working tree.
const PLAYBOOK_ROOT = join(import.meta.dirname, "..");

/**
 * Installs the playbook's skills user-level (e.g. `~/.claude/skills/`, `~/.cursor/skills/`) from
 * this copy of the playbook. Leaves every other skill in those folders alone.
 * @param {{dryRun?: boolean}} [options] dryRun lists what would change without writing
 * @returns {Promise<number>} how many skills were written, or would be on a dry run
 * @throws {Error} when rulesync can't read the playbook's skills
 */
export async function installSkills({ dryRun = false } = {}) {
  const result = await generate({
    global: true,
    targets: TARGETS,
    features: ["skills"],
    inputRoots: [join(PLAYBOOK_ROOT, ".rulesync")],
    // `delete` would also wipe skills other tools installed in the same folders.
    delete: false,
    dryRun,
    silent: false,
  });
  if (result.sourceLoadFailed) throw new Error(`cannot read the playbook's skills in ${PLAYBOOK_ROOT}`);
  return result.skillsCount;
}
