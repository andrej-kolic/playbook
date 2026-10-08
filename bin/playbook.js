#!/usr/bin/env node
import { init } from "../lib/init.js";
import { outdated } from "../lib/outdated.js";
import { installSkills } from "../lib/skills.js";

const USAGE = `Usage: playbook <command>

  init      Sets up the playbook's rules in the current project (pnpm only).
  outdated  Lists rules whose text differs from the playbook's main branch; exits with 1 if any.
  skills    Installs the playbook's skills for you, in every project (--dry-run lists the changes).`;

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "init") init(process.cwd());
  else if (command === "outdated") process.exitCode = (await outdated(process.cwd())) ? 1 : 0;
  else if (command === "skills") {
    const dryRun = args.includes("--dry-run");
    const count = await installSkills({ dryRun });
    if (count === 0) console.log("Skills are up to date.");
    else console.log(`${dryRun ? "Would write" : "Wrote"} ${count} skill copies for Claude Code and Cursor.`);
  }
  else {
    console.error(USAGE);
    process.exit(command === undefined || command === "--help" ? 0 : 1);
  }
} catch (error) {
  console.error(`playbook ${command}: ${error.message}`);
  process.exit(1);
}
