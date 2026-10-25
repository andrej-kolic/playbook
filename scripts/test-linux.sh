#!/bin/sh
# Runs the unit tests on Linux in Docker, on a copy of this folder without node_modules,
# so the packages installed for this machine stay untouched. Needs Docker Desktop running.
cd "$(dirname "$0")/.." || exit 1
exec docker run --rm -v "$PWD":/src:ro node:24 sh -c '
  set -e
  mkdir /w
  tar -C /src --exclude=./node_modules -cf - . | tar -C /w -xf -
  cd /w
  npm install -g --silent pnpm@12
  pnpm install --frozen-lockfile
  pnpm test
'
