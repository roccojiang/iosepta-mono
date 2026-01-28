#!/usr/bin/env bash
set -euo pipefail

CURRENT=$(cat .iosevka-version | tr -d '\n')
LATEST=$(gh api /repos/be5invis/iosevka/releases/latest --jq .tag_name)

if [[ "$CURRENT" = "$LATEST" ]]; then
  echo "Already up to date"
  echo "needs_update=false" >> "$GITHUB_OUTPUT"
  exit 0
fi

echo "Iosevka update available: $CURRENT -> $LATEST"
echo "needs_update=true" >> "$GITHUB_OUTPUT"
echo "new_version=$LATEST" >> "$GITHUB_OUTPUT"

# Determine semver bump type
CURRENT_MAJOR=$(echo "$CURRENT" | sed 's/^v//' | cut -d. -f1)
LATEST_MAJOR=$(echo "$LATEST" | sed 's/^v//' | cut -d. -f1)

if [[ "$CURRENT_MAJOR" != "$LATEST_MAJOR" ]]; then
  echo "commit_type=feat!" >> "$GITHUB_OUTPUT"
  exit 0
fi

CURRENT_MINOR=$(echo "$CURRENT" | sed 's/^v//' | cut -d. -f2)
LATEST_MINOR=$(echo "$LATEST" | sed 's/^v//' | cut -d. -f2)

if [[ "$CURRENT_MINOR" != "$LATEST_MINOR" ]]; then
  echo "commit_type=feat" >> "$GITHUB_OUTPUT"
else
  echo "commit_type=fix" >> "$GITHUB_OUTPUT"
fi