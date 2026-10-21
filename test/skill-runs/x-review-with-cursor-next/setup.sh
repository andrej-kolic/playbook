#!/bin/sh
# Usage: setup.sh <S1..S8>
# Builds a sandbox to run x-review-with-cursor-next for real without Cursor, for one scenario of the flow-format
# plan, and prints its folder. Every command of the run must start with `. <folder>/env.sh &&`, from <folder>/repo.
#   repo/    git repo: main with one commit, branch feature with calc.sh; most scenarios add an uncommitted bug
#   bin/     a fake agent (Cursor's CLI) and a fake grounder; no real agent is on env.sh's PATH
#   queue/   <n>.reply, <n>.exit, <n>.nochat, <n>.hook: what the fake agent's nth call answers and does
#   calls/   <n>.args, <n>.stdin: what each call got
#   plans/   what `grounder path plans` prints, so the review log lands here
#   tmp/     TMPDIR: the skill's diff, reply and prompt files
# macOS and Linux only: on Windows send-review.sh hashes the C:\ form of the repo path, the fake agent does not.
scenario=$1
case $scenario in
  S[1-8]) ;;
  *) echo "setup: name a scenario, S1 to S8" >&2; exit 1 ;;
esac
here=$(cd "$(dirname "$0")" && pwd) || exit 1
root=$(cd "$(mktemp -d "${TMPDIR:-/tmp}/skill-run-$scenario.XXXXXX")" && pwd -P) || exit 1
mkdir "$root/repo" "$root/bin" "$root/queue" "$root/calls" "$root/plans" "$root/tmp" "$root/cursor" || exit 1
session=5e55a0e1-0000-4000-8000-000000000001

# Your own and the system's git settings (commit.gpgsign, a global hook, core.autocrlf) stay out of the sandbox.
: > "$root/gitconfig"
export GIT_CONFIG_GLOBAL="$root/gitconfig" GIT_CONFIG_NOSYSTEM=1
git() { command git -C "$root/repo" -c user.name=Test -c user.email=test@example.com "$@"; }
git init -q -b main || exit 1
printf '# calc\n' > "$root/repo/README.md"
git add README.md && git commit -q -m "add readme" || exit 1
git checkout -q -b feature || exit 1
printf '#!/bin/sh\n# Prints the sum of two numbers.\necho $(( $1 + $2 ))\n' > "$root/repo/calc.sh"
git add calc.sh && git commit -q -m "add calc" || exit 1
# The bug both fake reviews point at: calc.sh:3 subtracts. The README line keeps the diff non-empty once it is
# fixed, so round 2 has a change to send.
bug() {
  printf '#!/bin/sh\n# Prints the sum of two numbers.\necho $(( $1 - $2 ))\n' > "$root/repo/calc.sh"
  printf 'Usage: calc.sh A B\n' >> "$root/repo/README.md"
}

# A reply as Cursor writes it: its last line is the result read-reply.sh checks.
reply() {
  printf '{"type":"system","subtype":"init","session_id":"%s"}\n' "$session"
  printf '{"type":"result","subtype":"success","duration_ms":12000,"is_error":false,"result":"%s","session_id":"%s","request_id":"r-1","usage":{"inputTokens":120,"outputTokens":30,"cacheReadTokens":400,"cacheWriteTokens":0}}\n' "$1" "$session"
}
two_findings='Findings:\n\n1. High, calc.sh:3: subtracts instead of adding, so `calc.sh 2 3` prints -1. Fix: use +.\n2. Low, calc.sh:3: no check that two numbers were given; `calc.sh` alone prints 0.'
no_findings='No findings: the fix to 1 is correct, and 2 stays settled.'
queue() { reply "$2" > "$root/queue/$1.reply"; }

case $scenario in
  S1) bug; queue 1 "$two_findings"; queue 2 "$no_findings" ;;
  S2) queue 1 "$two_findings" ;;
  S3)
    bug; queue 1 "$two_findings"; queue 2 "$no_findings"
    # The user amends the commit during round 1, so its start commit leaves the branch's history.
    printf 'git -C "%s" -c user.name=Test -c user.email=test@example.com commit -q --amend -m "add calc, amended"\n' "$root/repo" > "$root/queue/1.hook"
    ;;
  S4) bug ;;
  S5) bug; printf 'Authentication required. Run agent login.\n' > "$root/queue/1.reply"; echo 1 > "$root/queue/1.exit" ;;
  S6)
    bug; queue 1 "$two_findings"; queue 3 "$no_findings"
    printf '{"type":"assistant","session_id":"%s","message":"partial"}\n' "$session" > "$root/queue/2.reply"
    ;;
  S7) bug; queue 1 "$two_findings"; : > "$root/queue/1.nochat" ;;
  S8) bug; queue 1 "$two_findings" ;;
esac

[ "$scenario" = S4 ] || cp "$here/fake-agent.sh" "$root/bin/agent" || exit 1
printf '#!/bin/sh\n[ "$1 $2" = "path plans" ] || { echo "fake grounder: only path plans" >&2; exit 1; }\necho "%s"\n' "$root/plans" > "$root/bin/grounder"
chmod +x "$root/bin/"* 2> /dev/null

# bin/ comes first, so its grounder hides the real one; folders with a real agent are dropped, so even S4,
# with no fake agent, can never start a paid Cursor run.
path=$root/bin
old_ifs=$IFS; IFS=:
for dir in $PATH; do
  [ -e "$dir/agent" ] || path=$path:$dir
done
IFS=$old_ifs
cat > "$root/env.sh" << EOF
export PATH='$path'
export TMPDIR='$root/tmp'
export GIT_CONFIG_GLOBAL='$root/gitconfig' GIT_CONFIG_NOSYSTEM=1
export CURSOR_CONFIG_DIR='$root/cursor'
export FAKE_AGENT_DIR='$root'
EOF
echo "$root"
