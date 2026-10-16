import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";

const SCRIPT = join(import.meta.dirname, "..", ".rulesync", "skills", "x-review-with-cursor-next", "scripts", "make-diff.sh");
// Windows checkouts often have no symlinks or file modes, so those cases run elsewhere only.
const posixOnly = { skip: process.platform === "win32" && "no symlinks or file modes on Windows" };
let root, repo, temp, env;

beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "playbook-make-diff-")));
  repo = join(root, "repo");
  temp = join(root, "tmp");
  mkdirSync(repo);
  mkdirSync(temp);
  writeFileSync(join(root, "gitconfig"), "");
  // The user's and the system's git settings (autocrlf, an external diff tool) stay out of the test.
  env = {
    ...process.env,
    HOME: root,
    GIT_CONFIG_GLOBAL: join(root, "gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@t",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@t",
    TMPDIR: temp,
  };
  git(repo, "init", "-q");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}
function write(path, content) {
  mkdirSync(join(repo, path, ".."), { recursive: true });
  writeFileSync(join(repo, path), content);
}
function commit(files) {
  for (const [path, content] of Object.entries(files)) write(path, content);
  git(repo, "add", "-A");
  git(repo, "commit", "-qm", "base");
}
function makeDiff(cwd = repo) {
  const result = spawnSync("sh", [SCRIPT], { cwd, env, encoding: "utf8" });
  return { status: result.status, path: result.stdout.trim(), error: result.stderr };
}
function diffPath(cwd = repo) {
  const { status, path, error } = makeDiff(cwd);
  assert.equal(status, 0, error);
  return path;
}
// What the diff holds, the way the skill reports it: per file added/deleted lines, then renames and new files.
const summary = (path) => git(repo, "apply", "--numstat", "--summary", path);
// Every file git would track, with its content, or a symlink's target. `ls-files -c` also lists
// files deleted from disk but still in the index, so those are dropped.
function tree(dir) {
  const list = (...args) => git(dir, "ls-files", "-z", ...args).split("\0").filter(Boolean);
  const deleted = new Set(list("-d"));
  const files = list("-co", "--exclude-standard").filter((file) => !deleted.has(file)).sort();
  return Object.fromEntries(
    files.map((file) => {
      const full = join(dir, file);
      return [file, lstatSync(full).isSymbolicLink() ? `-> ${readlinkSync(full)}` : readFileSync(full, "utf8")];
    }),
  );
}
// Applies the diff to a fresh copy of the last commit; the copy must then match the working tree.
function assertDiffRecreatesWorkingTree(path) {
  const copy = join(root, "copy");
  git(root, "clone", "-q", repo, copy);
  git(copy, "apply", path);
  assert.deepEqual(tree(copy), tree(repo));
}

test("makeDiff_includesStagedChange", () => {
  commit({ "a.txt": "one\n" });
  write("a.txt", "two\n");
  git(repo, "add", "a.txt");

  assertDiffRecreatesWorkingTree(diffPath());
});

test("makeDiff_includesUnstagedChange", () => {
  commit({ "a.txt": "one\n" });
  write("a.txt", "two\n");

  assertDiffRecreatesWorkingTree(diffPath());
});

test("makeDiff_includesLatestEdit_whenFileWasEditedAfterStaging", () => {
  commit({ "a.txt": "one\n" });
  write("a.txt", "two\n");
  git(repo, "add", "a.txt");
  write("a.txt", "three\n");

  assertDiffRecreatesWorkingTree(diffPath());
});

test("makeDiff_includesUntrackedFiles_inNewFolder", () => {
  commit({ "a.txt": "one\n" });
  write("new/b.txt", "b\n");
  write("new/empty.txt", "");

  const path = diffPath();

  assert.match(summary(path), /create mode \d+ new\/b\.txt/);
  assertDiffRecreatesWorkingTree(path);
});

test("makeDiff_includesDeletedFile", () => {
  commit({ "a.txt": "one\n", "b.txt": "two\n" });
  rmSync(join(repo, "b.txt"));

  const path = diffPath();

  assert.match(summary(path), /delete mode \d+ b\.txt/);
  assertDiffRecreatesWorkingTree(path);
});

test("makeDiff_showsRename_whenFileWasMovedWithoutGit", () => {
  commit({ "old.txt": "a\nb\nc\nd\n" });
  renameSync(join(repo, "old.txt"), join(repo, "new.txt"));

  const path = diffPath();

  assert.match(summary(path), /rename old\.txt => new\.txt/);
  assertDiffRecreatesWorkingTree(path);
});

test("makeDiff_showsRename_whenUserTurnedOffRenameDetection", () => {
  writeFileSync(env.GIT_CONFIG_GLOBAL, "[diff]\n\trenames = false\n");
  commit({ "old.txt": "a\nb\nc\nd\n" });
  renameSync(join(repo, "old.txt"), join(repo, "new.txt"));

  assert.match(summary(diffPath()), /rename old\.txt => new\.txt/);
});

// `git apply` needs the standard a/ and b/ path prefixes, whatever prefixes the user's git settings ask for.
for (const setting of ["noprefix = true", "mnemonicPrefix = true"]) {
  test(`makeDiff_usesStandardPathPrefixes_whenUserSet_${setting.split(" ")[0]}`, () => {
    writeFileSync(env.GIT_CONFIG_GLOBAL, `[diff]\n\t${setting}\n`);
    commit({ "a.txt": "one\n" });
    write("a.txt", "two\n");

    const path = diffPath();

    assert.match(readFileSync(path, "utf8"), /^diff --git a\/a\.txt b\/a\.txt$/m);
    assertDiffRecreatesWorkingTree(path);
  });
}

test("makeDiff_includesSameSizeEdit_whenMadeInSameSecondAsCommit", () => {
  // File, its cached time in the index, and the index itself share one whole-second timestamp,
  // as when an edit lands in the commit's second. Whole seconds, since git compares nanoseconds.
  const second = Math.floor(Date.now() / 1000) - 10;
  // Writing a file always sets its ctime to now, which no test can set back; ignoring ctime keeps
  // the setup independent of whether the run crosses a second boundary.
  writeFileSync(env.GIT_CONFIG_GLOBAL, "[core]\n\ttrustctime = false\n");
  write("a.txt", "one\n");
  utimesSync(join(repo, "a.txt"), second, second);
  commit({});
  write("a.txt", "two\n");
  utimesSync(join(repo, "a.txt"), second, second);
  utimesSync(join(repo, ".git", "index"), second, second);

  assertDiffRecreatesWorkingTree(diffPath());
});

test("makeDiff_includesFileWithSpacesInName", () => {
  commit({ "a.txt": "one\n" });
  write("with space.txt", "x\n");

  assertDiffRecreatesWorkingTree(diffPath());
});

test("makeDiff_listsBinaryFile_withoutItsContent", () => {
  commit({ "a.txt": "one\n" });
  writeFileSync(join(repo, "img.bin"), Buffer.from([0, 1, 2]));

  assert.match(summary(diffPath()), /^-\t-\timg\.bin$/m);
});

test("makeDiff_leavesOutGitignoredFile", () => {
  commit({ ".gitignore": "*.log\n" });
  write("debug.log", "secret\n");
  write("a.txt", "one\n");

  assert.doesNotMatch(readFileSync(diffPath(), "utf8"), /debug\.log/);
});

test("makeDiff_includesModeChange", posixOnly, () => {
  commit({ "run.sh": "echo\n" });
  chmodSync(join(repo, "run.sh"), 0o755);

  assert.match(summary(diffPath()), /mode change 100644 => 100755 run\.sh/);
});

test("makeDiff_includesSymlink", posixOnly, () => {
  commit({ "a.txt": "one\n" });
  symlinkSync("a.txt", join(repo, "link"));

  assertDiffRecreatesWorkingTree(diffPath());
});

test("makeDiff_coversWholeRepo_whenRunFromSubfolder", () => {
  commit({ "a.txt": "one\n", "sub/b.txt": "two\n" });
  write("a.txt", "changed\n");

  assertDiffRecreatesWorkingTree(diffPath(join(repo, "sub")));
});

test("makeDiff_leavesStatusAndStagingAreaUnchanged", () => {
  commit({ "a.txt": "one\n" });
  write("a.txt", "two\n");
  write("b.txt", "new\n");
  // `git status` itself refreshes the index, so it runs before the index is read.
  const status = git(repo, "status", "--porcelain");
  const index = readFileSync(join(repo, ".git", "index"));

  diffPath();

  assert.equal(git(repo, "status", "--porcelain"), status);
  assert.deepEqual(readFileSync(join(repo, ".git", "index")), index);
});

test("makeDiff_writesDiffToTempFolder_withSingleSlashPath", () => {
  commit({ "a.txt": "one\n" });
  write("a.txt", "two\n");
  env.TMPDIR = `${temp}/`;

  assert.equal(join(diffPath(), ".."), temp);
  assert.doesNotMatch(diffPath(), /\/\//);
});

test("makeDiff_failsWithoutLeavingFiles_whenNothingIsUncommitted", () => {
  commit({ "a.txt": "one\n" });

  const { status, path, error } = makeDiff();

  assert.equal(status, 1);
  assert.equal(path, "");
  assert.match(error, /make-diff: nothing uncommitted/);
  assert.deepEqual(readdirSync(temp), []);
});

test("makeDiff_failsWithoutLeavingFiles_whenRepoHasNoCommits", () => {
  write("a.txt", "one\n");

  const { status, error } = makeDiff();

  assert.equal(status, 1);
  assert.match(error, /make-diff: no commit yet/);
  assert.deepEqual(readdirSync(temp), []);
});

test("makeDiff_fails_whenRunOutsideRepo", () => {
  const { status, path } = makeDiff(temp);

  assert.equal(status, 1);
  assert.equal(path, "");
  assert.deepEqual(readdirSync(temp), []);
});
