#!/bin/sh
# Stands in for Cursor's agent CLI in a setup.sh sandbox ($FAKE_AGENT_DIR): the nth call records its arguments
# and input in calls/, prints queue/<n>.reply, runs queue/<n>.hook if any, and exits with queue/<n>.exit (else 0).
d=$FAKE_AGENT_DIR
n=$(($(cat "$d/calls/count" 2> /dev/null || echo 0) + 1))
echo "$n" > "$d/calls/count"
printf '%s\n' "$@" > "$d/calls/$n.args"
cat > "$d/calls/$n.stdin"
[ -f "$d/queue/$n.reply" ] || { echo "fake agent: no reply queued for call $n" >&2; exit 1; }
cat "$d/queue/$n.reply"
resume=; workspace=
while [ $# -gt 0 ]; do
  case $1 in
    --resume) resume=$2; shift ;;
    --workspace) workspace=$2; shift ;;
  esac
  shift
done
# Like Cursor, a new chat is stored under the md5 of the workspace path, where send-review.sh --resume looks.
session=$(tail -n 1 "$d/queue/$n.reply" | sed -n 's/.*"session_id":"\([^"]*\)".*/\1/p')
if [ -z "$resume" ] && [ -n "$session" ] && [ ! -e "$d/queue/$n.nochat" ]; then
  if command -v md5sum > /dev/null; then hash=$(printf %s "$workspace" | md5sum | cut -c1-32)
  else hash=$(printf %s "$workspace" | md5 -q); fi
  chat=$CURSOR_CONFIG_DIR/chats/$hash/$session
  mkdir -p "$chat" && printf '{"hasConversation":true}\n' > "$chat/meta.json" && : > "$chat/store.db"
fi
[ ! -f "$d/queue/$n.hook" ] || sh "$d/queue/$n.hook"
exit "$(cat "$d/queue/$n.exit" 2> /dev/null || echo 0)"
