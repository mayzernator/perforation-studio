#!/bin/bash
# Installs (or updates) Perforation Studio from the latest GitHub release.
# Needs the GitHub CLI, logged in: brew install gh && gh auth login
set -euo pipefail
REPO="${REPO:-mayzernator/perforation-studio}"
APP="/Applications/Perforation Studio.app"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
gh release download latest -R "$REPO" -p '*.zip' -D "$TMP"
ditto -x -k "$TMP"/*.zip "$TMP"
osascript -e 'quit app "Perforation Studio"' 2>/dev/null || true
rm -rf "$APP"
mv "$TMP/Perforation Studio.app" "$APP"
xattr -dr com.apple.quarantine "$APP"
codesign --force --deep --sign - "$APP"
echo "Installed. Opening..."
open "$APP"
