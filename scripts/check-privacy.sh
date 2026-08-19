#!/usr/bin/env bash
# Blocks a commit/CI run if staged content matches the privacy deny-list.
# See PLAN_2.0.md §3.
#
# The deny-list itself is never committed — it would leak what it protects.
# It lives in a gitignored token file (default: scripts/privacy-denylist.private.txt,
# one literal token per line, '#' comments and blank lines ignored). This
# script contains no private tokens itself, only the mechanism.
set -euo pipefail

DENYLIST_FILE="${PRIVACY_DENYLIST_FILE:-scripts/privacy-denylist.private.txt}"
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

fail=0

# --- Defense in depth: staged files that match known private filename
# patterns should never be staged at all, even under a forced `git add -f`.
private_path_patterns=(
  'data/private/*'
  'job-search-tracker-*.md'
  'job-search-dashboard-*.html'
  '*.private.*'
  '*.local.json'
  'seed.local.*'
  'PLAN.md'
)

staged_files="$(git diff --cached --name-only || true)"

if [[ -n "$staged_files" ]]; then
  for pattern in "${private_path_patterns[@]}"; do
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      case "$f" in
        $pattern)
          echo "check:privacy: staged file matches a never-commit pattern ($pattern): $f"
          fail=1
          ;;
      esac
    done <<< "$staged_files"
  done
fi

# --- Token deny-list: grep staged additions for literal tokens.
if [[ -f "$DENYLIST_FILE" ]]; then
  # Exclude the denylist file itself from the diff so its own tokens don't
  # self-match. Only valid as a pathspec when it resolves inside the repo
  # tree — a path outside it (absolute, or relative via "../") can't be
  # expressed as an in-repo exclude pathspec, and passing it as one makes
  # `git diff` fail hard, so resolve first and skip the exclude if it's
  # outside.
  exclude_arg=()
  resolved="$(realpath -m -- "$DENYLIST_FILE" 2>/dev/null || true)"
  if [[ -n "$resolved" && "$resolved" == "$REPO_ROOT"/* ]]; then
    exclude_arg=(":(exclude)${resolved#"$REPO_ROOT"/}")
  fi
  diff_content="$(git diff --cached -- . "${exclude_arg[@]}")"
  added_lines="$(echo "$diff_content" | grep -E '^\+' | grep -Ev '^\+\+\+' || true)"

  # `|| [[ -n "$token" ]]` keeps the loop body running for a final line
  # that has no trailing newline — plain `while read` silently drops it.
  while IFS= read -r token || [[ -n "$token" ]]; do
    token="${token%%#*}"                # strip trailing comments
    token="$(echo "$token" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [[ -z "$token" ]] && continue

    # Word-boundary match, not plain substring — a short token would
    # otherwise false-positive inside an unrelated longer word. A single
    # alternation (start-of-line or non-word char) on each side handles
    # every token shape uniformly, including tokens that start or end in
    # punctuation (e.g. "£"), which `\b` can't anchor on.
    esc="$(printf '%s' "$token" | sed -e 's/[][\.^$*+?(){}|\\]/\\&/g')"

    if echo "$added_lines" | grep -qiE -- "(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|\$)"; then
      echo "check:privacy: staged content matches a deny-listed token"
      fail=1
    fi
  done < "$DENYLIST_FILE"
else
  if [[ "${PRIVACY_DENYLIST_REQUIRED:-0}" == "1" ]]; then
    echo "check:privacy: PRIVACY_DENYLIST_REQUIRED=1 but $DENYLIST_FILE is missing"
    fail=1
  else
    echo "check:privacy: no local deny-list at $DENYLIST_FILE — filename check only. See scripts/privacy-denylist.example.txt."
  fi
fi

if [[ "$fail" -ne 0 ]]; then
  echo "check:privacy: FAILED — fix the offending content, don't weaken the deny-list."
  exit 1
fi

echo "check:privacy: OK"
