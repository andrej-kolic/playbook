---
name: x-review-with-cursor-next
description: Claude-hosted skill. Work in progress, the next version of x-review-with-cursor, built one piece at a time. For now it only collects the uncommitted changes into one diff file and lists what it holds; nothing is sent to Cursor.
targets:
  - claudecode
disable-model-invocation: true
---

<!-- playbook:x-review-with-cursor-next v1 (2026-10-16) -->
<!-- source: andrej-kolic/playbook .rulesync/skills/x-review-with-cursor-next/SKILL.md; edits elsewhere are overwritten -->

Work in progress: this version only makes the diff. It sends nothing to Cursor and changes nothing in the repo.

## Step 1: make the diff

Run the script shipped with this skill, from the user's current folder:

```sh
sh "<this skill's folder>/scripts/make-diff.sh"
```

It collects every uncommitted change (staged, unstaged and untracked files) into one diff against the last commit, writes it to a temp file outside the repo, and prints that file's path. The user's staging area is left untouched.

If it exits 1, show the user its error line (`make-diff: no commit yet`, `make-diff: git failed` or `make-diff: nothing uncommitted`, after any git message) and stop.

## Step 2: report

With `p` set to the printed path, run:

```sh
wc -c -l < "$p"
git -C "$(git rev-parse --show-toplevel)" apply --numstat --summary "$p"
```

`git apply` here only reads the diff; it applies nothing. It runs from the repo root because, run from a subfolder, it silently leaves out files outside that subfolder. `--numstat` gives lines added and deleted per file (`-` for a binary file); `--summary` adds renames, new and deleted files.

Reply with:

1. The diff's path, as a `file://` link.
2. Its size: lines and bytes.
3. The changed files, one per line, with lines added and deleted, and any rename, new or deleted mark.

Leave the diff file in place so the user can open it.
