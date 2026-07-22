#!/usr/bin/env bash
# harness-sync.sh [--dry-run]
# Overwrites local harness files from the source remote's latest harness/* tag.
# Used by /harness-check to retrofit unregistered projects or sync drifted ones.
# Policy: remote wins unconditionally. Local tuning is not preserved.

set -euo pipefail

# --- 0. Re-exec from a private temp copy (self-overwrite safety) ---
# Step 6 below overwrites whitelist PATHS in-place, and PATHS includes this
# script (scripts/harness-sync.sh). `cp` truncates the destination inode in
# place, so a shell still reading this file mid-run would execute garbage and
# the sync would fail or partially complete (recurring every harness-check
# because meta is never updated). Running from a throwaway copy makes the
# in-place overwrite of the on-disk script harmless to the live process, and
# still lets the script self-update in consumer repos.
if [[ -z "${_HARNESS_SYNC_REEXEC:-}" ]]; then
  _self="$(mktemp)"
  trap 'rm -f "$_self"' EXIT   # cover the pre-exec window before _cleanup is registered
  cp "$0" "$_self"
  _HARNESS_SYNC_REEXEC=1 _HARNESS_SYNC_SELF="$_self" exec bash "$_self" "$@"
fi

# Initialize tmp empty BEFORE registering the trap: otherwise _cleanup's
# `rm -rf "${tmp:-}"` would expand an inherited lowercase `tmp` ENV var and
# delete it on an early exit (e.g. the self-skip path, where tmp is never
# assigned). The temp self-copy lives outside REPO_ROOT, so step 6's in-place
# overwrite never touches the running process.
tmp=""
# Cleanup is deliberately conservative — it only removes paths THIS process
# created. $tmp is removed only when non-empty; the temp self-copy is removed
# only when _HARNESS_SYNC_SELF equals $0 (true after our own re-exec, where
# $0 IS the temp copy). That stops a forged `_HARNESS_SYNC_REEXEC=1` plus a
# hostile/stale `_HARNESS_SYNC_SELF` from turning cleanup into an arbitrary
# `rm -rf` on self-skip / dry-run / any exit.
_cleanup() {
  [[ -n "${tmp:-}" ]] && rm -rf -- "$tmp"
  [[ -n "${_HARNESS_SYNC_SELF:-}" && "$_HARNESS_SYNC_SELF" == "$0" ]] && rm -f -- "$_HARNESS_SYNC_SELF"
  return 0
}
trap _cleanup EXIT

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

REPO_ROOT="$(git rev-parse --show-toplevel)"
META_FILE="$REPO_ROOT/.omp/extensions/harness/harness-meta.json"
DEFAULT_SOURCE="git@github.com:rae-hugo-kim/omp.git"
# Anchor to a host/path boundary so e.g. `notrae-hugo-kim/omp.git` does NOT
# match and wrongly self-skip sync (codex review nit).
SOURCE_MATCH_RE='(^|[:/])rae-hugo-kim/omp(\.git)?$'

# --- 1. Detect source repo (self-skip) ---
origin_url=$(git -C "$REPO_ROOT" remote get-url origin 2>/dev/null || true)
if [[ "$origin_url" =~ $SOURCE_MATCH_RE ]]; then
  echo "This IS the source harness repo. Nothing to sync."
  exit 0
fi

# --- 2. Resolve source_remote (fallback to default if unregistered) ---
source_remote=""
if [[ -f "$META_FILE" ]]; then
  source_remote=$(grep -o '"source_remote"[[:space:]]*:[[:space:]]*"[^"]*"' "$META_FILE" \
    | sed 's/.*"source_remote"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
fi
if [[ -z "$source_remote" ]]; then
  echo "No source_remote in meta. Treating as unregistered — using default: $DEFAULT_SOURCE"
  source_remote="$DEFAULT_SOURCE"
fi
echo "Source: $source_remote"

# --- 3. Find latest harness/* tag on remote ---
latest_tag=$(git ls-remote --tags "$source_remote" 'refs/tags/harness/*' 2>/dev/null \
  | awk '{ print $2 }' \
  | sed 's|refs/tags/harness/||; s|\^{}$||' \
  | sort -u -t. -k1,1n -k2,2n \
  | tail -1)

if [[ -z "$latest_tag" ]]; then
  echo "Error: no harness/* tags on $source_remote" >&2
  exit 1
fi
echo "Target: harness/$latest_tag"

# --- 4. Shallow clone the target tag into temp ---
tmp=$(mktemp -d)
# (cleanup of $tmp handled by the _cleanup EXIT trap registered at the top)
git clone --quiet --depth 1 --branch "harness/$latest_tag" "$source_remote" "$tmp"
target_sha=$(git -C "$tmp" rev-parse HEAD)

# --- 5. Paths to overwrite (harness assets only — never user code) ---
PATHS=(
  "rules"
  "checklists"
  "templates"
  "AGENTS.md"
  "INDEX.md"
  "EXAMPLES.md"
  ".omp/extensions/harness"
  ".githooks/post-commit"
  ".githooks/pre-push"
  "scripts/harness-version-bump.sh"
  "scripts/harness-sync.sh"
  "scripts/harness-audit.sh"
  "scripts/test-harness-audit.sh"
  ".omp/skills/bootstrap"
  ".omp/skills/init"
  ".omp/skills/migrate"
  ".omp/skills/kickoff"
  ".omp/skills/startdev"
  ".omp/skills/sum"
  ".omp/skills/compr"
  ".omp/skills/compush"
  ".omp/skills/harness-check"
  ".omp/skills/receiving-code-review"
  ".omp/skills/brainstorm"
  ".omp/skills/design-mockup"
  ".omp/skills/grepai-search"
  ".omp/skills/gh-loop"
  ".omp/skills/gh-fanout"
  ".omp/agents"
)

if [[ $DRY_RUN -eq 1 ]]; then
  echo "--- Dry run: paths that would be overwritten ---"
  for p in "${PATHS[@]}"; do
    if [[ -e "$tmp/$p" ]]; then
      echo "  WRITE  $p"
    else
      echo "  SKIP   $p (not in source)"
    fi
  done
  exit 0
fi

# --- 5.6 Capture bootstrapped_at BEFORE the copy overwrites META_FILE ---
# Step 6 replaces .omp/extensions/harness/ wholesale, and META_FILE lives
# inside it. The source repo's meta has no bootstrapped_at (source self-skips
# sync), so reading after the copy always hits the date fallback and resets
# the first-registration timestamp on every sync.
bootstrapped_at=""
if [[ -f "$META_FILE" ]]; then
  bootstrapped_at=$(grep -o '"bootstrapped_at"[[:space:]]*:[[:space:]]*"[^"]*"' "$META_FILE" \
    | sed 's/.*"bootstrapped_at"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || true)
fi
[[ -z "$bootstrapped_at" ]] && bootstrapped_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# --- 6. Copy (remote wins) ---
for p in "${PATHS[@]}"; do
  [[ -e "$tmp/$p" ]] || continue
  mkdir -p "$(dirname "$REPO_ROOT/$p")"
  if [[ -d "$tmp/$p" ]]; then
    rm -rf "$REPO_ROOT/$p"
    cp -r "$tmp/$p" "$REPO_ROOT/$p"
  else
    cp "$tmp/$p" "$REPO_ROOT/$p"
  fi
done

# --- 7. Rewrite harness-meta.json (bootstrapped_at captured in step 5.6) ---

src_desc=$(grep -o '"description"[[:space:]]*:[[:space:]]*"[^"]*"' "$tmp/.omp/extensions/harness/harness-meta.json" \
  | sed 's/.*"description"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/' || echo "")
today=$(date +%Y-%m-%d)

cat > "$META_FILE" <<EOF
{
  "version": "$latest_tag",
  "updated": "$today",
  "description": "$src_desc",
  "source_remote": "$source_remote",
  "commit_sha": "$target_sha",
  "bootstrapped_at": "$bootstrapped_at"
}
EOF

# --- 8. Clear stale check cache ---
cache="$REPO_ROOT/.omp/state/harness-version-check.json"
[[ -f "$cache" ]] && rm -f "$cache"

echo "Synced to harness/$latest_tag (SHA: ${target_sha:0:7})"
