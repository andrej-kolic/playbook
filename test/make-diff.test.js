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
  git(repo, "init", "-q", "-b", "main");
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
// The script prints the diff's path, then with a base "base <ref> <commit> named|default".
function makeDiff(cwd = repo, args = []) {
  const result = spawnSync("sh", [SCRIPT, ...args], { cwd, env, encoding: "utf8" });
  const [path = "", base = ""] = result.stdout.trim().split("\n");
  return { status: result.status, path, base, error: result.stderr };
}
function diffPath(cwd = repo) {
  const { status, path, error } = makeDiff(cwd);
  assert.equal(status, 0, error);
  return path;
}
function diffAgainstBase(args = []) {
  const { status, path, base, error } = makeDiff(repo, args);
  assert.equal(status, 0, error);
  return { path, base };
}
const head = (ref = "HEAD") => git(repo, "rev-parse", ref).trim();
function branch(name, from = "HEAD") {
  git(repo, "switch", "-qc", name, from);
}
// Files the diff touches, by name, sorted.
const changedFiles = (path) =>
  git(repo, "apply", "--numstat", path)
    .trim()
    .split("\n")
    .map((line) => line.split("\t")[2])
    .sort();
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

  assert.equal(realpathSync(join(diffPath(), "..")), temp);
  assert.doesNotMatch(diffPath(), /\/\//);
});

test("makeDiff_failsWithoutLeavingFiles_whenMainHasNothingUncommitted", () => {
  commit({ "a.txt": "one\n" });

  const { status, path, error } = makeDiff();

  assert.equal(status, 1);
  assert.equal(path, "");
  assert.match(error, /make-diff: no changes since main/);
  assert.deepEqual(readdirSync(temp), []);
});

test("makeDiff_reviewsOnlyUncommittedChanges_whenNoBaseIsNamed", () => {
  commit({ "a.txt": "one\n" });
  branch("feat");
  commit({ "f.txt": "f\n" });
  write("u.txt", "u\n");

  const { path, base } = diffAgainstBase();

  assert.equal(base, "");
  assert.deepEqual(changedFiles(path), ["u.txt"]);
});

test("makeDiff_reviewsBranchAgainstMain_whenNothingIsUncommitted", () => {
  commit({ "a.txt": "one\n" });
  const fork = head();
  branch("feat");
  commit({ "f1.txt": "1\n" });
  commit({ "f2.txt": "2\n" });

  const { path, base } = diffAgainstBase();

  assert.equal(base, `base main ${fork} default`);
  assert.deepEqual(changedFiles(path), ["f1.txt", "f2.txt"]);
});

test("makeDiff_startsAtForkPoint_whenMainMovedOn", () => {
  commit({ "a.txt": "one\n" });
  const fork = head();
  branch("feat");
  commit({ "f.txt": "f\n" });
  git(repo, "switch", "-q", "main");
  commit({ "m.txt": "m\n" });
  git(repo, "switch", "-q", "feat");

  const { path, base } = diffAgainstBase();

  assert.equal(base, `base main ${fork} default`);
  assert.deepEqual(changedFiles(path), ["f.txt"]);
});

test("makeDiff_usesMaster_whenThereIsNoMain", () => {
  commit({ "a.txt": "one\n" });
  git(repo, "branch", "-m", "master");
  branch("feat");
  commit({ "f.txt": "f\n" });

  assert.match(diffAgainstBase().base, /^base master /);
});

test("makeDiff_usesOriginMain_whenThereIsNoOriginHeadOrLocalMain", () => {
  commit({ "a.txt": "one\n" });
  const fork = head();
  // As after `git remote add` and `git fetch`, which set no origin/HEAD.
  git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
  git(repo, "branch", "-m", "feat");
  commit({ "f.txt": "f\n" });

  assert.equal(diffAgainstBase().base, `base origin/main ${fork} default`);
});

test("makeDiff_usesOriginMaster_whenThereIsNoOriginHeadOrMain", () => {
  commit({ "a.txt": "one\n" });
  const fork = head();
  git(repo, "update-ref", "refs/remotes/origin/master", "HEAD");
  git(repo, "branch", "-m", "feat");
  commit({ "f.txt": "f\n" });

  assert.equal(diffAgainstBase().base, `base origin/master ${fork} default`);
});

test("makeDiff_usesInitDefaultBranch_whenNoOtherDefaultExists", () => {
  commit({ "a.txt": "one\n" });
  const fork = head();
  git(repo, "branch", "-m", "trunk");
  writeFileSync(join(root, "gitconfig"), "[init]\n\tdefaultBranch = trunk\n");
  branch("feat");
  commit({ "f.txt": "f\n" });

  assert.equal(diffAgainstBase().base, `base trunk ${fork} default`);
});

test("makeDiff_usesOriginHead_beforeMain", () => {
  commit({ "a.txt": "one\n" });
  branch("trunk");
  commit({ "t.txt": "t\n" });
  const fork = head();
  git(root, "clone", "-q", "-b", "trunk", repo, "copy");
  const copy = join(root, "copy");
  git(copy, "switch", "-qc", "feat");
  writeFileSync(join(copy, "f.txt"), "f\n");
  git(copy, "add", "-A");
  git(copy, "commit", "-qm", "f");
  git(copy, "branch", "main", fork + "~1");

  const { status, path, base, error } = makeDiff(copy);

  assert.equal(status, 0, error);
  assert.equal(base, `base origin/trunk ${fork} default`);
  assert.equal(git(copy, "apply", "--numstat", path).trim().split("\t")[2], "f.txt");
});

test("makeDiff_failsWithoutLeavingFiles_whenNothingIsUncommittedAndNoDefaultBranch", () => {
  commit({ "a.txt": "one\n" });
  git(repo, "branch", "-m", "trunk");

  const { status, error } = makeDiff();

  assert.equal(status, 1);
  assert.match(error, /make-diff: nothing uncommitted, and no default branch found/);
  assert.deepEqual(readdirSync(temp), []);
});

test("makeDiff_asksForBase_whenBranchIsStackedOnAnother", () => {
  commit({ "a.txt": "one\n" });
  branch("feat-a");
  commit({ "a1.txt": "1\n" });
  branch("feat-b");
  commit({ "b1.txt": "1\n" });

  const { status, path, error } = makeDiff();

  assert.equal(status, 2);
  assert.equal(path, "");
  assert.match(error, /make-diff: commits since main include other branches: feat-a; name a base with --base/);
  assert.deepEqual(readdirSync(temp), []);
});

test("makeDiff_asksForBase_whenBranchStartedFromThisOneIsBehindIt", () => {
  commit({ "a.txt": "one\n" });
  branch("feat-a");
  commit({ "a1.txt": "1\n" });
  git(repo, "branch", "feat-b");
  commit({ "a2.txt": "2\n" });

  const { status, error } = makeDiff();

  assert.equal(status, 2);
  assert.match(error, /other branches: feat-b;/);
});

test("makeDiff_doesNotAsk_whenOtherBranchesAreAtHeadOrMerged", () => {
  commit({ "a.txt": "one\n" });
  branch("old");
  commit({ "o.txt": "o\n" });
  git(repo, "switch", "-q", "main");
  git(repo, "merge", "-q", "--no-ff", "-m", "merge old", "old");
  branch("feat");
  commit({ "f.txt": "f\n" });
  git(repo, "branch", "copy-of-feat");

  const { path } = diffAgainstBase();

  assert.deepEqual(changedFiles(path), ["f.txt"]);
});

test("makeDiff_doesNotAsk_whenOwnRemoteCopyIsBehind", () => {
  commit({ "a.txt": "one\n" });
  branch("feat");
  commit({ "f1.txt": "1\n" });
  // As after a push: the remote copy holds f1, and f2 is not pushed yet.
  git(repo, "update-ref", "refs/remotes/origin/feat", "HEAD");
  commit({ "f2.txt": "2\n" });

  const { path } = diffAgainstBase();

  assert.deepEqual(changedFiles(path), ["f1.txt", "f2.txt"]);
});

test("makeDiff_reviewsSinceNamedBranch_includingUncommittedChanges", () => {
  commit({ "a.txt": "one\n" });
  branch("feat-a");
  commit({ "a1.txt": "1\n" });
  const fork = head();
  branch("feat-b");
  commit({ "b1.txt": "1\n" });
  write("u.txt", "u\n");

  const { path, base } = diffAgainstBase(["--base", "feat-a"]);

  assert.equal(base, `base feat-a ${fork} named uncommitted`);
  assert.deepEqual(changedFiles(path), ["b1.txt", "u.txt"]);
});

// main moves on after feat splits from it; returns the commit where feat split.
function branchFromMovedMain() {
  commit({ "a.txt": "one\n" });
  const fork = head();
  branch("feat");
  commit({ "f.txt": "f\n" });
  git(repo, "switch", "-q", "main");
  commit({ "m.txt": "m\n" });
  git(repo, "switch", "-q", "feat");
  return fork;
}

test("makeDiff_reviewsFromForkPoint_whenNamedBranchMovedOn", () => {
  const fork = branchFromMovedMain();

  const { path, base } = diffAgainstBase(["--base", "main"]);

  assert.equal(base, `base main ${fork} named`);
  assert.deepEqual(changedFiles(path), ["f.txt"]);
});

test("makeDiff_reviewsFromForkPoint_whenNamedRemoteBranchMovedOn", () => {
  const fork = branchFromMovedMain();
  git(repo, "update-ref", "refs/remotes/origin/main", "main");

  const { path, base } = diffAgainstBase(["--base", "origin/main"]);

  assert.equal(base, `base origin/main ${fork} named`);
  assert.deepEqual(changedFiles(path), ["f.txt"]);
});

test("makeDiff_reviewsEverythingSinceCommit_whenBaseIsACommit", () => {
  commit({ "a.txt": "one\n" });
  const since = head();
  commit({ "b.txt": "b\n" });
  commit({ "c.txt": "c\n" });

  const { path, base } = diffAgainstBase(["--base", since]);

  assert.equal(base, `base ${since} ${since} named`);
  assert.deepEqual(changedFiles(path), ["b.txt", "c.txt"]);
});

test("makeDiff_usesRemoteCopy_whenItIsAheadOfLocalBase", () => {
  commit({ "a.txt": "one\n" });
  git(root, "clone", "-q", repo, "upstream");
  const upstream = join(root, "upstream");
  writeFileSync(join(upstream, "m.txt"), "m\n");
  git(upstream, "add", "-A");
  git(upstream, "commit", "-qm", "m");
  git(repo, "remote", "add", "origin", upstream);
  git(repo, "fetch", "-q", "origin");
  git(repo, "branch", "-q", "--set-upstream-to", "origin/main", "main");
  const fork = head("origin/main");
  branch("feat", "origin/main");
  commit({ "f.txt": "f\n" });

  const { path, base } = diffAgainstBase(["--base", "main"]);

  assert.equal(base, `base origin/main ${fork} named`);
  assert.deepEqual(changedFiles(path), ["f.txt"]);
});

test("makeDiff_failsWithoutLeavingFiles_whenBaseCommitIsNotInBranchHistory", () => {
  commit({ "a.txt": "one\n" });
  branch("other");
  commit({ "o.txt": "o\n" });
  const elsewhere = head();
  git(repo, "switch", "-q", "main");
  branch("feat");
  commit({ "f.txt": "f\n" });

  const { status, error } = makeDiff(repo, ["--base", elsewhere]);

  assert.equal(status, 1);
  assert.match(error, /is not in this branch's history; name a branch, or a commit this branch contains/);
  assert.deepEqual(readdirSync(temp), []);
});

test("makeDiff_failsWithoutLeavingFiles_whenBaseIsUnknown", () => {
  commit({ "a.txt": "one\n" });

  const { status, error } = makeDiff(repo, ["--base", "nope"]);

  assert.equal(status, 1);
  assert.match(error, /make-diff: no such branch or commit: nope/);
  assert.deepEqual(readdirSync(temp), []);
});

test("makeDiff_fails_whenBaseFlagHasNoValue", () => {
  commit({ "a.txt": "one\n" });

  const { status, error } = makeDiff(repo, ["--base"]);

  assert.equal(status, 1);
  assert.match(error, /make-diff: --base needs a branch or commit/);
});

test("makeDiff_fails_whenArgumentIsUnknown", () => {
  commit({ "a.txt": "one\n" });

  const { status, error } = makeDiff(repo, ["--bsae", "main"]);

  assert.equal(status, 1);
  assert.match(error, /make-diff: unknown argument: --bsae/);
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
