#!/bin/sh
# Sends the review prompt, a blank line and the diff at $1 to Cursor's agent CLI, read-only; writes its
# stream-json reply to a temp file outside the repo and prints that file's path; exits 1 if anything fails.
diff=$1
# An empty diff or a missing prompt would still be sent, and billed, so both are checked first.
[ -s "$diff" ] || { echo "send-review: no diff, or the diff is empty: $diff" >&2; exit 1; }
here=$(cd "$(dirname "$0")" && pwd) || exit 1
[ -s "$here/prompt.txt" ] || { echo "send-review: no prompt, or the prompt is empty: $here/prompt.txt" >&2; exit 1; }
command -v agent > /dev/null || { echo "send-review: Cursor's agent CLI not found: https://cursor.com/docs/cli/installation" >&2; exit 1; }
root=$(git rev-parse --show-toplevel) || exit 1
dir=${TMPDIR:-/tmp}
out=$(mktemp "${dir%/}/cursor-review-reply.XXXXXX") || exit 1
# A pipeline's exit status is its last command's, so this checks agent's.
{ cat "$here/prompt.txt"; printf '\n'; cat "$diff"; } |
  agent -p --trust --mode ask --output-format stream-json --model grok-4.7-high-fast --workspace "$root" > "$out"
status=$?
# agent may print why it failed (such as "Authentication required") as its reply, so that is shown first.
[ $status -eq 0 ] || { cat "$out" >&2; rm -f "$out"; echo "send-review: agent exited with $status" >&2; exit 1; }
# On Windows (Git Bash) the path is Git Bash's own, like /tmp/...; print the C:/... form every program reads.
command -v cygpath > /dev/null && out=$(cygpath -m "$out")
echo "$out"
