#!/bin/sh
# Usage: send-review.sh [--resume <session> <prompt-file>] <diff> [model]
# Sends the review prompt, a blank line and the diff to Cursor's agent CLI, read-only, using the model
# (default grok-4.7-high-fast); writes its stream-json reply to a temp file outside the repo and prints
# that file's path; exits 1 if anything fails. With --resume, sends the given prompt into that earlier chat.
session=; prompt=
if [ "$1" = --resume ]; then
  [ $# -ge 4 ] || { echo "send-review: --resume needs a session id, a prompt file and a diff" >&2; exit 1; }
  session=$2; prompt=$3
  shift 3
  # The id comes from Cursor's reply and becomes an argument, so only a plain id passes.
  case $session in
    '' | *[!0-9a-f-]*) echo "send-review: not a session id: $session" >&2; exit 1 ;;
  esac
fi
diff=$1
model=${2:-grok-4.7-high-fast}
# auto can pick a model from the same vendor as the agent running this skill: no independent review.
[ "$model" != auto ] || { echo "send-review: model auto is not allowed; name a model" >&2; exit 1; }
# An empty diff or a missing prompt would still be sent, and billed, so both are checked first.
# -s alone is true for a directory, hence -f too.
{ [ -f "$diff" ] && [ -s "$diff" ]; } || { echo "send-review: no diff file, or the diff is empty: $diff" >&2; exit 1; }
if [ -z "$session" ]; then
  here=$(cd "$(dirname "$0")" && pwd) || exit 1
  prompt=$here/prompt.txt
fi
{ [ -f "$prompt" ] && [ -s "$prompt" ]; } || { echo "send-review: no prompt, or the prompt is empty: $prompt" >&2; exit 1; }
command -v agent > /dev/null || { echo "send-review: Cursor's agent CLI not found: https://cursor.com/docs/cli/installation" >&2; exit 1; }
root=$(git rev-parse --show-toplevel) || exit 1
dir=${TMPDIR:-/tmp}
out=$(mktemp "${dir%/}/cursor-review-reply.XXXXXX") || exit 1
# A pipeline's exit status is its last command's, so this checks agent's.
# $(cat) drops the prompt's trailing line breaks, so exactly one blank line follows it.
{ printf '%s\n\n' "$(cat "$prompt")"; cat "$diff"; } |
  agent -p ${session:+--resume "$session"} --trust --mode ask --output-format stream-json --model "$model" --workspace "$root" > "$out"
status=$?
# agent may print why it failed (such as "Authentication required") as its reply, so that is shown first.
[ $status -eq 0 ] || { cat "$out" >&2; rm -f "$out"; echo "send-review: agent exited with $status" >&2; exit 1; }
# On Windows (Git Bash) the path is Git Bash's own, like /tmp/...; print the C:/... form every program reads.
command -v cygpath > /dev/null && out=$(cygpath -m "$out")
echo "$out"
