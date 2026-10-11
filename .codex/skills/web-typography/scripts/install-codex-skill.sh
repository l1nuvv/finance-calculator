#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_ROOT="${CODEX_SKILLS_DIR:-$HOME/.codex/skills}"
DEST="$DEST_ROOT/web-typography"

mkdir -p "$DEST_ROOT"
rsync -a --delete \
  --exclude ".git" \
  --exclude ".github" \
  --exclude ".DS_Store" \
  "$REPO_ROOT/" "$DEST/"

echo "Installed web-typography skill to $DEST"
