#!/bin/sh
# Usage: run.sh <S1..S9>...
# Runs x-review-with-cursor-next from this checkout for real in a setup.sh sandbox per scenario, all scenarios at
# once: one headless Claude session each (Haiku) in safe mode, without your CLAUDE.md, memory, hooks, MCP servers,
# skills or output style, given the user's messages one turn at a time. Prints each sandbox's folder; its
# transcript.jsonl holds the whole run. Exits 1 when any scenario's turn failed.
# Uses your Claude plan's usage, never Cursor's: env.sh's PATH has only the fake agent.
here=$(cd "$(dirname "$0")" && pwd) || exit 1
skill=$(cd "$here/../../../.rulesync/skills/x-review-with-cursor-next" && pwd) || exit 1
# Found before env.sh, whose PATH drops the folder holding the real agent, and often claude with it.
claude=$(command -v claude) || { echo "run: claude not found" >&2; exit 1; }
[ $# -gt 0 ] || { echo "run: name one or more scenarios, S1 to S9" >&2; exit 1; }

task="Run the skill in $skill/SKILL.md on the changes in this repo; that file's folder is the skill's folder."
# Sets first, the user's first message, and answers, the messages after it, one per line, each sent when the
# previous turn ends.
script() {
  first=$task
  case $1 in
    S1) answers='fix 1
another round
done' ;;
    S2) first="$task Use base branch release-9."; answers='main
done' ;;
    S3) answers='fix 1
another round
main
done' ;;
    S4 | S5) answers= ;;
    S6) answers='fix 1
another round
retry
done' ;;
    S7) answers='fix 1
another round' ;;
    S8) answers='none
done' ;;
    S9) answers='done' ;;
    *) echo "run: unknown scenario: $1" >&2; return 1 ;;
  esac
}

# Every sandbox is built before any session starts, so a failed setup leaves no session running.
runs=
for scenario in "$@"; do
  script "$scenario" || exit 1
  root=$(sh "$here/setup.sh" "$scenario") || exit 1
  runs="$runs$scenario $root
"
done

pids=
while read -r scenario root; do
  [ -n "$scenario" ] || continue
  script "$scenario"
  id=$(uuidgen | tr '[:upper:]' '[:lower:]')
  echo "$scenario: $root"
  (
    cd "$root/repo" && . "$root/env.sh" || exit 1
    # stdin is closed: claude -p reads piped input into its prompt and would eat the remaining answers.
    turn() {
      "$claude" -p "$1" "$2" "$id" --model claude-haiku-5-5 --safe-mode \
        --setting-sources project --strict-mcp-config --no-chrome --disable-slash-commands \
        --tools Bash Read Edit Write Glob Grep --allowedTools Bash Read Edit Write Glob Grep \
        --permission-mode dontAsk --add-dir "$skill" \
        --output-format stream-json --verbose < /dev/null >> "$root/transcript.jsonl"
    }
    turn "$first" --session-id || exit 1
    printf '%s\n' "$answers" | while IFS= read -r answer; do
      [ -z "$answer" ] || turn "$answer" --resume || exit 1
    done
  ) || { echo "$scenario: a turn failed; see $root/transcript.jsonl" >&2; false; } &
  pids="$pids $!"
done << EOF
$runs
EOF

status=0
for pid in $pids; do wait "$pid" || status=1; done
exit $status
