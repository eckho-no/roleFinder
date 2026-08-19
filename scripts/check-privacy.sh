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
  'data/private/'
  'job-search-tracker-*.md'
  'job-search-dashboard-*.html'
  '*.private.*'
  '*.local.json'
  'seed.local.*'
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
  # self-match. Only valid as a pathspec when it's inside the repo tree —
  # an absolute path outside the repo can't appear in `git diff` anyway.
  exclude_arg=()
  case "$DENYLIST_FILE" in
    /*) ;;
    *) exclude_arg=(":(exclude)$DENYLIST_FILE") ;;
  esac
  diff_content="$(git diff --cached -- . "${exclude_arg[@]}")"
  added_lines="$(echo "$diff_content" | grep -E '^\+' | grep -Ev '^\+\+\+' || true)"

  while IFS= read -r token; do
    token="${token%%#*}"                # strip trailing comments
    token="$(echo "$token" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    [[ -z "$token" ]] && continue

    # Word-boundary match, not plain substring — a short token would
    # otherwise false-positive inside an unrelated longer word. Only apply
    # \b on a side that starts/ends on a word character; a token starting
    # or ending with e.g. "£" has no word char there for \b to anchor on.
    esc="$(printf '%s' "$token" | sed -e 's/[][\.^$*+?(){}|\\]/\\&/g')"
    left='\b'; right='\b'
    [[ "$token" =~ ^[^A-Za-z0-9] ]] && left=''
    [[ "$token" =~ [^A-Za-z0-9]$ ]] && right=''

    if echo "$added_lines" | grep -qiE -- "${left}${esc}${right}"; then
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
