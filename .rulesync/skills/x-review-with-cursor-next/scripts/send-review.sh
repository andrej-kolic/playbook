#!/bin/sh
# Usage: send-review.sh [--resume <session> <prompt-file>] <diff> [model]
# Sends the review prompt, a blank line and the diff to Cursor's agent CLI, read-only, using the model
# (default grok-4.7-high-fast); writes its stream-json reply to a temp file outside the repo and prints
# that file's path before agent starts; exits 1 if anything fails, keeping the reply file once it exists.
# With --resume, sends the given prompt into that earlier chat; exits 3 when Cursor has no such chat.
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
# agent --resume with an unknown id exits 0 and starts a new, empty chat. A chat agent lists has a store.db
# and "hasConversation":true in <config>/chats/<md5 of the workspace path>/<id>/ (undocumented, CLI 2026.10.19).
if [ -n "$session" ]; then
  config=$CURSOR_CONFIG_DIR
  [ -n "$config" ] || config=${XDG_CONFIG_HOME:+$XDG_CONFIG_HOME/cursor}
  [ -n "$config" ] || config=$HOME/.cursor
  # agent hashes the path in its own form; on Windows (Git Bash) that is C:\..., not C:/...
  ws=$root
  if command -v cygpath > /dev/null && win=$(cygpath -w "$root") && [ -n "$win" ]; then ws=$win; fi
  if command -v md5sum > /dev/null; then sum=md5sum
  elif command -v md5 > /dev/null; then sum='md5 -q'
  else echo "send-review: md5sum or md5 not found; it names Cursor's chat folder" >&2; exit 1; fi
  chat=$config/chats/$(printf %s "$ws" | $sum | cut -c1-32)/$session
  { [ -f "$chat/store.db" ] && grep -q '"hasConversation":true' "$chat/meta.json" 2> /dev/null; } || {
    echo "send-review: Cursor has no chat $session for $root; --resume would start a new one" >&2
    exit 3
  }
fi
dir=${TMPDIR:-/tmp}
out=$(mktemp "${dir%/}/cursor-review-reply.XXXXXX") || exit 1
# On Windows (Git Bash) the path is Git Bash's own, like /tmp/...; show the C:/... form every program reads.
# A failing cygpath prints nothing, so the Git Bash path stays.
shown=$out
if command -v cygpath > /dev/null && win=$(cygpath -m "$out") && [ -n "$win" ]; then shown=$win; fi
# Printed first, so a failed or timed-out send still names the file holding what agent wrote.
echo "$shown"
# A pipeline's exit status is its last command's, so this checks agent's.
# $(cat) drops the prompt's trailing line breaks, so exactly one blank line follows it.
{ printf '%s\n\n' "$(cat "$prompt")"; cat "$diff"; } |
  agent -p ${session:+--resume "$session"} --trust --mode ask --output-format stream-json --model "$model" --workspace "$root" > "$out"
status=$?
# A stream-json reply can hold files Cursor read, so only a reply with no stream-json line is shown:
# agent's own error text, such as "Authentication required".
if [ $status -ne 0 ]; then
  grep -q '^{' "$out" || cat "$out" >&2
  echo "send-review: agent exited with $status; its reply is in $shown" >&2
  exit 1
fi
