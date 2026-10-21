#!/bin/sh
# Writes a diff to a temp file outside the repo and prints its path. Untracked files count as changes.
#   no argument, uncommitted changes: those changes, against the last commit.
#   --base <branch|commit>: everything since this branch split from it, uncommitted changes included. A commit
#   that is not a branch must be in this branch's history.
#   no argument, nothing uncommitted: as --base, with the first that exists of origin/HEAD, main, master,
#   origin/main, origin/master and the branch named by git's init.defaultBranch setting.
# With a base, a second line reads "base <ref> <commit> named|default [uncommitted]" (<commit>: where the diff
# starts; uncommitted: the diff also holds uncommitted changes).
# Exits 1 if git fails, the repo has no commit, or the diff is empty. Exits 2 or 3 so the caller can ask which
# base to use: 2, naming them on stderr, when the default branch would take in another branch's commits (a
# stacked branch); 3 when the named base is unknown, a commit not in this branch's history, or a branch with no
# shared history.
root=$(git rev-parse --show-toplevel) && cd "$root" || exit 1
head=$(git rev-parse --verify -q HEAD) || { echo "make-diff: no commit yet" >&2; exit 1; }
base=
case $1 in
  "") ;;
  --base) [ -n "$2" ] || { echo "make-diff: --base needs a branch or commit" >&2; exit 1; }; base=$2 ;;
  *) echo "make-diff: unknown argument: $1" >&2; exit 1 ;;
esac

tmp=$(mktemp) || exit 1
fail() { rm -f "$tmp"; echo "make-diff: $1" >&2; exit "${2:-1}"; }
# -p keeps the index's time, which git compares with each file's to spot an edit made in the same second.
cp -p "$(git rev-parse --git-path index)" "$tmp" && GIT_INDEX_FILE="$tmp" git add -A -- . || fail "git failed"

from=$head how= dirty=
GIT_INDEX_FILE="$tmp" git diff --cached --quiet HEAD || dirty=" uncommitted"
if [ -n "$base" ]; then
  git rev-parse --verify -q "$base^{commit}" > /dev/null || fail "no such branch or commit: $base" 3
  # A branch may have moved on since this one split from it; for a commit, "since" needs it in this history.
  git show-ref --verify -q "refs/heads/$base" || git show-ref --verify -q "refs/remotes/$base" ||
    git merge-base --is-ancestor "$base" "$head" ||
    fail "$base is not in this branch's history; name a branch, or a commit this branch contains" 3
  ref=$base how=named
elif [ -z "$dirty" ]; then
  # init.defaultBranch names new repos' first branch, so it is only the last guess; unset, it drops out.
  for ref in origin/HEAD main master origin/main origin/master $(git config --get init.defaultBranch) ""; do
    [ -n "$ref" ] || fail "nothing uncommitted, and no default branch found; name a base with --base"
    git rev-parse --verify -q "$ref^{commit}" > /dev/null && break
  done
  ref=$(git rev-parse --abbrev-ref "$ref") how=default
fi
if [ -n "$how" ]; then
  # A local branch whose remote copy is ahead: the remote copy is the newer base (as Codex's /review does).
  if git show-ref --verify -q "refs/heads/$ref" && up=$(git rev-parse --abbrev-ref "$ref@{upstream}" 2> /dev/null) &&
    git merge-base --is-ancestor "$ref" "$up" 2> /dev/null; then
    ref=$up
  fi
  # Only a named base gets 3: asking would offer the default branch, the base that just failed.
  code=1; [ "$how" = named ] && code=3
  from=$(git merge-base "$head" "$ref") || fail "no shared history with $ref" $code
fi
if [ "$how" = default ]; then
  # Another branch ending inside the reviewed commits means this one is stacked on it, and the default branch
  # would review that branch's commits too. Left out: this branch, its remote copies, and branches at HEAD.
  cur=$(git symbolic-ref -q --short HEAD)
  stacked=
  for b in $(git for-each-ref --format='%(if)%(symref)%(then)%(else)%(refname)%(end)' refs/heads refs/remotes); do
    case $b in "refs/heads/$cur" | refs/remotes/*/"$cur") continue ;; esac
    tip=$(git rev-parse "$b^{commit}")
    [ "$tip" != "$head" ] && [ "$tip" != "$from" ] && git merge-base --is-ancestor "$tip" "$head" &&
      git merge-base --is-ancestor "$from" "$tip" && stacked="$stacked $(git rev-parse --abbrev-ref "$b")"
  done
  [ -z "$stacked" ] || fail "commits since $ref include other branches:$stacked; name a base with --base" 2
fi

dir=${TMPDIR:-/tmp}
out=$(mktemp "${dir%/}/cursor-review-diff.XXXXXX") || fail "could not make a temp file"
GIT_INDEX_FILE="$tmp" git diff --cached -M --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/ "$from" > "$out"
ok=$?; rm -f "$tmp"
[ $ok -eq 0 ] || { rm -f "$out"; echo "make-diff: git failed" >&2; exit 1; }
# Only a base can give an empty diff: uncommitted changes were found above, or a base was chosen.
[ -s "$out" ] || { rm -f "$out"; echo "make-diff: no changes since $ref" >&2; exit 1; }
# On Windows (Git Bash) the path is Git Bash's own, like /tmp/...; print the C:/... form every program reads.
# A failing cygpath prints nothing, so the Git Bash path stays.
if command -v cygpath > /dev/null && win=$(cygpath -m "$out") && [ -n "$win" ]; then out=$win; fi
echo "$out"
[ -z "$how" ] || echo "base $ref $from $how$dirty"
