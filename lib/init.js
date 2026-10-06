import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Only these hosts: every playbook rule lists exactly these in its `targets`.
export const TARGETS = ["claudecode", "cursor"];
export const SOURCE = "andrej-kolic/playbook";
// Where the playbook keeps its rules, and where rulesync puts its fetched copy in a project.
export const RULES_PATH = ".rulesync/rules";
// Oldest rulesync with `install --outdated`.
const RULESYNC_MAJOR = 24;

// Only rulesync's fetched copy: the generated .claude/ and .cursor/ rules are committed, so
// agents that check out the repo without installing anything still get them.
const GITIGNORE_LINES = [`${RULES_PATH}/.curated/`];
const GENERATE = `rulesync generate -f rules -t ${TARGETS.join(",")}`;
const SCRIPTS = {
  "rules:install": `rulesync install && ${GENERATE}`,
  "rules:outdated": `pnpm dlx github:${SOURCE} outdated`,
  "rules:update": `rulesync install --update && ${GENERATE}`,
};

function read(dir, file) {
  const path = join(dir, file);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

function writeRulesyncConfig(dir) {
  if (read(dir, "rulesync.jsonc") !== null) return null;
  const config = { targets: TARGETS, features: ["rules"] };
  writeFileSync(join(dir, "rulesync.jsonc"), `${JSON.stringify(config, null, 2)}\n`);
  return "created rulesync.jsonc";
}

// Lines from older setups that ignore the generated rules, e.g. `.claude/rules/` or `**/.cursor/rules`.
const IGNORED_RULES = /^(\*\*\/|\/)?\.(claude|cursor)\/rules\/?$/;

function writeGitignore(dir) {
  const current = read(dir, ".gitignore") ?? "";
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  const messages = [];
  const missing = GITIGNORE_LINES.filter((line) => !lines.includes(line));
  if (missing.length > 0) {
    const separator = current === "" ? "" : current.endsWith("\n") ? "\n" : "\n\n";
    const block = `# rulesync's fetched copy of the playbook rules; the generated ones are committed\n${missing.join("\n")}\n`;
    writeFileSync(join(dir, ".gitignore"), `${current}${separator}${block}`);
    messages.push(`added ${missing.join(", ")} to .gitignore`);
  }
  const old = lines.filter((line) => IGNORED_RULES.test(line));
  if (old.length > 0) {
    messages.push(
      `warning: .gitignore ignores the generated rules (${old.join(", ")}). Delete those lines, then ` +
        "`git add .claude/rules .cursor/rules` and commit; until then, agents that only check out " +
        "the repo don't get the rules.",
    );
  }
  return messages;
}

// Adds the missing scripts; warns instead of overwriting one that differs.
function writeScripts(dir) {
  const text = read(dir, "package.json");
  const pkg = JSON.parse(text);
  const lines = [];
  const added = [];
  for (const [name, script] of Object.entries(SCRIPTS)) {
    const existing = pkg.scripts?.[name];
    if (existing === undefined) added.push(name);
    else if (existing !== script) {
      lines.push(`warning: kept your existing "${name}" script; the playbook expects "${script}"`);
    }
  }
  if (added.length > 0) {
    pkg.scripts = { ...pkg.scripts, ...Object.fromEntries(added.map((name) => [name, SCRIPTS[name]])) };
    const indent = text.match(/^[ \t]+/m)?.[0] ?? 2;
    writeFileSync(join(dir, "package.json"), `${JSON.stringify(pkg, null, indent)}\n`);
    lines.unshift(`added ${added.join(", ")} to package.json scripts`);
  }
  return lines;
}

// Rule copies left by the old `rulesync fetch` setup, which would duplicate the installed ones.
function findFetchedCopies(dir) {
  const rulesDir = join(dir, RULES_PATH);
  if (!existsSync(rulesDir)) return [];
  return readdirSync(rulesDir)
    .filter((name) => name.endsWith(".md"))
    .filter((name) => readFileSync(join(rulesDir, name), "utf8").includes(`source: ${SOURCE} `));
}

/**
 * Lists what in the project at `dir` would make init clash with or delete existing files.
 * @returns {string[]} one message per problem; empty when init can run
 */
export function findBlockers(dir) {
  const blockers = [];
  const fetched = findFetchedCopies(dir);
  if (fetched.length > 0) {
    blockers.push(
      `${RULES_PATH}/ has rule copies from the old fetch setup (${fetched.join(", ")}). ` +
        "Delete them and the old rules:fetch, rules:generate and rules:install scripts, then rerun init; " +
        "it installs the same rules and its own scripts:\n" +
        `  git rm ${fetched.map((name) => `${RULES_PATH}/${name}`).join(" ")}\n` +
        `  pnpm pkg delete 'scripts["rules:fetch"]' 'scripts["rules:generate"]' 'scripts["rules:install"]'`,
    );
  }
  if (/"delete"\s*:\s*true/.test(read(dir, "rulesync.jsonc") ?? "")) {
    blockers.push(
      'rulesync.jsonc sets "delete": true, which makes every generate wipe .claude/rules/ and ' +
        '.cursor/rules/, hand-written rules included. Set it to false or remove it first.',
    );
  }
  return blockers;
}

/**
 * Whether `pkg` (a parsed package.json) needs rulesync installed or upgraded.
 * A version spec without a plain major number (a tag, git or workspace link) is left alone.
 */
export function needsRulesync(pkg) {
  const spec = pkg.devDependencies?.rulesync ?? pkg.dependencies?.rulesync;
  if (spec === undefined) return true;
  const major = spec.match(/^[\^~>=v\s]*(\d+)/)?.[1];
  return major !== undefined && Number(major) < RULESYNC_MAJOR;
}

/**
 * Writes or updates the config files the playbook needs, skipping any already set up.
 * Never overwrites an existing rulesync.jsonc or script.
 * @returns {string[]} one line per change or warning
 * @throws {Error} when `dir` has no package.json
 */
export function writeConfigFiles(dir) {
  if (read(dir, "package.json") === null) {
    throw new Error(`no package.json in ${dir}; run this from the project root`);
  }
  return [writeRulesyncConfig, writeGitignore, writeScripts]
    .flatMap((step) => step(dir))
    .filter((line) => line !== null);
}

function pnpm(dir, args) {
  execFileSync("pnpm", args, { cwd: dir, stdio: "inherit" });
}

/**
 * Sets up the playbook's rules in the project at `dir`, then generates them. Runs pnpm.
 * @throws {Error} when `findBlockers` reports a problem, or a pnpm command fails
 */
export function init(dir) {
  const blockers = findBlockers(dir);
  if (blockers.length > 0) throw new Error(blockers.join("\n"));

  for (const line of writeConfigFiles(dir)) console.log(line);

  // pnpm 11 refuses to run rulesync until its `tldjs` dependency has a build decision, which
  // approve-builds can only record once tldjs is installed; strict-dep-builds=false gets it there.
  const lenient = "--config.strict-dep-builds=false";
  if (needsRulesync(JSON.parse(read(dir, "package.json")))) {
    // In a workspace with several package globs, pnpm refuses a root-level add without this;
    // `-w` would do the same but fails outside a workspace.
    pnpm(dir, ["add", "-D", `rulesync@${RULESYNC_MAJOR}`, lenient, "--config.ignore-workspace-root-check=true"]);
  } else {
    pnpm(dir, ["install", lenient]);
  }
  pnpm(dir, ["approve-builds", "!tldjs"]);
  if (!read(dir, "rulesync.jsonc").includes(`"${SOURCE}"`)) {
    pnpm(dir, ["exec", "rulesync", "add", SOURCE, "--rules", "*", "--rules-path", RULES_PATH]);
  }
  // Run directly, not via the rules:install script, which may be the project's own.
  pnpm(dir, ["exec", "rulesync", "install"]);
  pnpm(dir, ["exec", ...GENERATE.split(" ")]);

  console.log(
    "\nDone. Commit .claude/rules/, .cursor/rules/, rulesync.jsonc, rulesync.lock, .gitignore, package.json, " +
      "pnpm-lock.yaml and pnpm-workspace.yaml.",
  );
}
