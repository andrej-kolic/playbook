#!/bin/sh
# Checks Cursor's stream-json reply at $1: exits 1 unless its last line is a successful, non-empty result.
# Prints the session id and token use, then each tool call that was not a plain read or search, and whether
# it was refused.
reply=$1
{ [ -f "$reply" ] && [ -s "$reply" ]; } || { echo "read-reply: no reply file, or the reply is empty: $reply" >&2; exit 1; }
last=$(tail -n 1 "$reply")
# Text inside the result is escaped JSON, so an unescaped "key":value match can only be the line's own field.
has() { printf '%s\n' "$last" | grep -q "$1"; }
case $last in
  '{"type":"result",'*) ;;
  *) printf 'read-reply: Cursor stopped before its result; last line: %.300s\n' "$last" >&2; exit 1 ;;
esac
{ has '"subtype":"success"' && has '"is_error":false'; } || { printf 'read-reply: Cursor reported an error: %.300s\n' "$last" >&2; exit 1; }
has '"result":"[^"]' || { echo "read-reply: Cursor's result is empty" >&2; exit 1; }

field() { printf '%s\n' "$last" | sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\).*/\1/p"; }
echo "session $(field session_id)"
if has '"usage":{'; then
  echo "tokens input $(field inputTokens), output $(field outputTokens), cache read $(field cacheReadTokens), cache write $(field cacheWriteTokens)"
else
  echo "tokens not reported"
fi

# Ask mode alone is not read-only (an allowed shell command can write files), so every other call is listed.
# Fields are matched anywhere in the line, so a change in their order can't hide a call. The tool's name is
# the first key of "tool_call"; its outcome the last "result" key, since the arguments come first and Cursor's
# model writes them.
awk '
  BEGIN {
    n = split("readToolCall grepToolCall globToolCall lsToolCall semSearchToolCall readLintsToolCall readTodosToolCall updateTodosToolCall getMcpToolsToolCall", names, " ")
    for (i = 1; i <= n; i++) ok[names[i]] = 1
    refused["rejected"] = 1; refused["permissionDenied"] = 1
  }
  /"type":"tool_call"/ && /"subtype":"completed"/ && match($0, /"tool_call":\{"/) {
    s = substr($0, RSTART + RLENGTH)
    kind = s; sub(/".*/, "", kind)
    if (kind in ok) next
    res = "none"
    if (match(s, /.*"result":\{"/)) { res = substr(s, RLENGTH + 1); sub(/".*/, "", res) }
    print "tool " kind " " (res in refused ? "refused" : "not refused: " res)
  }
' "$reply"
