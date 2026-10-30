#!/bin/bash
# Installs (or updates) Perforation Studio from the latest GitHub release.
# Double-click in Finder. First run sets up the GitHub CLI and asks you to log in once.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v gh >/dev/null; then
  command -v brew >/dev/null || { echo "Install Homebrew first: https://brew.sh"; read -rp "Press Enter to close"; exit 1; }
  brew install gh
fi
gh auth status >/dev/null 2>&1 || gh auth login --hostname github.com --git-protocol https --web
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
