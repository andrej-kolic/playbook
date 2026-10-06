#!/usr/bin/env node
import { init } from "../lib/init.js";
import { outdated } from "../lib/outdated.js";

const USAGE = `Usage: playbook <command>

  init      Sets up the playbook's rules in the current project (pnpm only).
  outdated  Lists rules whose text differs from the playbook's main branch; exits with 1 if any.`;

const [command] = process.argv.slice(2);

try {
  if (command === "init") init(process.cwd());
  else if (command === "outdated") process.exitCode = (await outdated(process.cwd())) ? 1 : 0;
  else {
    console.error(USAGE);
    process.exit(command === undefined || command === "--help" ? 0 : 1);
  }
} catch (error) {
  console.error(`playbook ${command}: ${error.message}`);
  process.exit(1);
}
