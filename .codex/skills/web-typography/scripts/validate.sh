#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" "$REPO_ROOT"

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --source "$REPO_ROOT" --no-git --redact --exit-code 1
else
  echo "gitleaks not found; skipping secret scan"
fi

echo "Validation passed"
