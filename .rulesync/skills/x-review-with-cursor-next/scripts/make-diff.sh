#!/bin/sh
# Writes every uncommitted change (untracked files included) to a temp file outside the repo and prints its path; exits 1 if git fails, the repo has no commit, or the diff is empty.
root=$(git rev-parse --show-toplevel) && cd "$root" || exit 1
git rev-parse --verify -q HEAD > /dev/null || { echo "make-diff: no commit yet" >&2; exit 1; }
dir=${TMPDIR:-/tmp}
out=$(mktemp "${dir%/}/cursor-review-diff.XXXXXX") || exit 1
tmp=$(mktemp)
# -p keeps the index's time, which git compares with each file's to spot an edit made in the same second.
cp -p "$(git rev-parse --git-path index)" "$tmp" &&
GIT_INDEX_FILE="$tmp" git add -A -- . &&
GIT_INDEX_FILE="$tmp" git diff --cached -M --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/ HEAD > "$out"
ok=$?; rm -f "$tmp"
[ $ok -eq 0 ] || { rm -f "$out"; echo "make-diff: git failed" >&2; exit 1; }
[ -s "$out" ] || { rm -f "$out"; echo "make-diff: nothing uncommitted" >&2; exit 1; }
echo "$out"
