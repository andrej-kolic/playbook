#!/usr/bin/env node
import { installRules } from "../lib/rules.js";
import { checkRules } from "../lib/check-rules.js";
import { checkSkills, installSkills } from "../lib/skills.js";

const USAGE = `Usage: playbook <command>

  rules     Sets up the playbook's rules in the current project (pnpm only); rerun to update its setup.
            --check lists rules whose text differs from the playbook's main branch, exits with 1 if any.
  skills    Installs the playbook's skills for you, in every project, and removes ones it no longer has.
            --dry-run lists the changes; --check lists outdated and leftover skills, exits with 1 if any.`;

const [command, ...args] = process.argv.slice(2);

function report(lines) {
  console.log(lines.length === 0 ? "Skills are up to date." : lines.join("\n"));
}

try {
  if (command === "rules" && args.includes("--check")) process.exitCode = (await checkRules(process.cwd())) ? 1 : 0;
  else if (command === "rules") installRules(process.cwd());
  else if (command === "skills" && args.includes("--check")) {
    const { outdated: stale, leftovers } = await checkSkills();
    report([...stale.map((path) => `outdated: ~/${path}`), ...leftovers.map((path) => `leftover: ~/${path}`)]);
    process.exitCode = stale.length + leftovers.length > 0 ? 1 : 0;
  } else if (command === "skills") {
    const dryRun = args.includes("--dry-run");
    const { written, removed } = await installSkills({ dryRun });
    const [write, remove] = dryRun ? ["would write", "would remove"] : ["wrote", "removed"];
    report([...written.map((path) => `${write}: ~/${path}`), ...removed.map((path) => `${remove}: ~/${path}`)]);
  } else {
    console.error(USAGE);
    process.exit(command === undefined || command === "--help" ? 0 : 1);
  }
} catch (error) {
  console.error(`playbook ${command}: ${error.message}`);
  process.exit(1);
}
