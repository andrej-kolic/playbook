---
name: x-review-with-cursor-next
description: Claude-hosted skill. Work in progress, the next version of x-review-with-cursor, built one piece at a time. For now it collects the changes to review (uncommitted, or everything since a base branch or commit) into one diff file, lists what it holds, and sends it to Cursor for review, saving Cursor's raw reply; the reply is not read or shown yet.
targets:
  - claudecode
disable-model-invocation: true
---

<!-- playbook:x-review-with-cursor-next v1 (2026-10-16) -->
<!-- source: andrej-kolic/playbook .rulesync/skills/x-review-with-cursor-next/SKILL.md; edits elsewhere are overwritten -->

Work in progress: this version makes the diff, sends it to Cursor, and saves Cursor's raw reply. It does not read or show the reply yet, and changes nothing in the repo. A Cursor run costs money on the user's Cursor plan.

## Step 1: make the diff

Run the script shipped with this skill, from the user's current folder:

```sh
sh "<this skill's folder>/scripts/make-diff.sh"
```

Append `--base <name>` only when the user named a base branch or commit ("against feat-a", "since abc1234").

It writes one diff to a temp file outside the repo and prints that file's path. Staged, unstaged and untracked files all count; the user's staging area is left untouched. What the diff covers:

1. No base named, uncommitted changes: those changes, against the last commit.
2. A base named: everything since this branch split from that base, uncommitted changes included. A commit means everything since that commit, and must be in this branch's history.
3. No base named, nothing uncommitted: as 2, against the first that exists of `origin/HEAD`, `main`, `master`, `origin/main`, `origin/master` and the branch named by git's `init.defaultBranch` setting.

In cases 2 and 3 it prints a second line, `base <ref> <commit> named|default`, where `<commit>` is where the diff starts.

If it exits 2, this branch is stacked on another: its error line names the branches. Ask the user which base to review against, offering those branches and the default branch, then run it again with `--base`.

If it exits 1, show the user its error line (such as `make-diff: no changes since main` or `make-diff: no such branch or commit: <name>`, after any git message) and stop.

## Step 2: report

With `p` set to the printed path, and `c` to the `<commit>` from the base line if there is one, run:

```sh
wc -c -l < "$p"
git -C "$(git rev-parse --show-toplevel)" apply --numstat --summary "$p"
```

With a base line, also run `git log --oneline "$c"..HEAD` to list the commits reviewed.

`git apply` here only reads the diff; it applies nothing. It runs from the repo root because, run from a subfolder, it silently leaves out files outside that subfolder. `--numstat` gives lines added and deleted per file (`-` for a binary file); `--summary` adds renames, new and deleted files.

Reply with:

1. What it covers: "uncommitted changes", or "since `<ref>` (named or default)" and the commits, one per line.
2. The diff's path, as a `file://` link.
3. Its size: lines and bytes.
4. The changed files, one per line, with lines added and deleted, and any rename, new or deleted mark.

Leave the diff file in place so the user can open it.

## Step 3: send to Cursor

Run, with the longest command timeout (10 minutes), since a review takes minutes:

```sh
sh "<this skill's folder>/scripts/send-review.sh" "$p"
```

Append the model id as a second argument only when the user named one ("model composer-2.5" → `"$p" composer-2.5`); `agent models` lists them. Without one the script uses `grok-4.7-high-fast`, the model the prompt was tuned on. It refuses `auto`.

It pipes the review prompt (`scripts/prompt.txt`), a blank line and the diff into Cursor's `agent` CLI in read-only `ask` mode, writes Cursor's reply to a temp file and prints that file's path.

If it exits 1, show the user its error line and stop. If the error names "Authentication required", tell the user to run `agent login`.

Otherwise reply with the model used, the reply file's path, as a `file://` link, and its size in bytes. Leave it in place.
