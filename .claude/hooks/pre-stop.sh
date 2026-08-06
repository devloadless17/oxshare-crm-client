#!/usr/bin/env bash
#
# Stop — blocking. The last thing between "I'm done" and a red CI.
#
# Runs the same gates CI runs, so "done" cannot mean "done except the parts a
# machine checks".
#
# TWIN FILE — an identical copy lives at the same path in the sibling repos.
set -uo pipefail

payload="$(cat)"

# Non-negotiable: without this the hook re-fires on the continuation it caused
# and the session never ends.
if command -v jq >/dev/null 2>&1; then
  active="$(printf '%s' "$payload" | jq -r '.stop_hook_active // false' 2>/dev/null)"
  [ "$active" = "true" ] && exit 0
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root" || exit 0

# Nothing changed in this repo — nothing to verify. Also covers the case where
# Claude was working in a sibling repo entirely.
if git rev-parse --git-dir >/dev/null 2>&1; then
  if git diff --quiet HEAD -- 2>/dev/null && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    exit 0
  fi
fi

# This hook runs in a non-login shell, so nvm has never been sourced and npm is
# absent. Every gate below then reported "npm: command not found" while the repo
# was in fact green. See scripts/lib/node-path.sh.
# shellcheck source=../../scripts/lib/node-path.sh
. "$repo_root/scripts/lib/node-path.sh"
if [ "$NODE_PATH_RESOLVED" -ne 1 ]; then
  echo "pre-stop: node/npm not found on PATH — the gates did NOT run, so nothing is verified." >&2
  echo "This is an environment problem, not a code failure. See scripts/lib/node-path.sh." >&2
  exit 2
fi

# Deliberately not `node -p` alone. When node was missing this fell through to
# "unknown", and the is_backend test below then read FALSE for the backend — so
# the Stop hook ran the minutes-long Testcontainers suite it explicitly must not.
# The basename fallback keeps that decision correct without a toolchain.
repo_name="$(node -p "require('./package.json').name" 2>/dev/null || basename "$repo_root")"

# Matches both the package name ("backend") and the directory
# ("oxshare-crm-backend"), so either source of the name lands on the same answer.
case "$repo_name" in
  backend | *-backend) is_backend=1 ;;
  *) is_backend=0 ;;
esac

report=""
fail=0

run_gate() {
  local script="$1"
  local out
  if ! out="$(npm run -s "$script" 2>&1)"; then
    fail=1
    report+="--- npm run $script ---"$'\n'"$out"$'\n\n'
  fi
}

run_gate type-check
run_gate lint
run_gate format:check

# NO TEST GATE IN THIS REPO.
#
# The portal's test suite was removed deliberately — every *.test.tsx, the e2e/
# folder, and the vitest and playwright configs — so `npm run test` no longer
# exists here and running it fails the hook with "Missing script: test" on every
# stop, which reads as a broken gate rather than an absent one.
#
# This is a per-repo difference and not a template drift: the sibling copies in
# `admin/` and `backend/` still run their suites and must keep doing so. Restore
# the branch below if tests ever come back to the portal.
#
# What remains is the whole of this repo's automated protection: typecheck, lint
# and format above, plus `npm run build`, `check:css` and `check:twins` run by
# hand. Worth knowing when changing anything on the money screens.

[ "$fail" -eq 0 ] && exit 0

{
  echo "Not done yet — the $repo_name gate is red:"
  echo
  printf '%s\n' "$report"
  if [ "$is_backend" -eq 1 ]; then
    echo "Note: the money test suite is not run here. Run 'npm test' before committing."
  fi
} >&2
exit 2
