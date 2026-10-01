#!/usr/bin/env node
import { init } from "../lib/init.js";

const [command] = process.argv.slice(2);

if (command !== "init") {
  console.error("Usage: playbook init\n\nSets up the playbook's rules in the current project (pnpm only).");
  process.exit(command === undefined || command === "--help" ? 0 : 1);
}

try {
  init(process.cwd());
} catch (error) {
  console.error(`playbook init: ${error.message}`);
  process.exit(1);
}
