#!/bin/bash
# Installs (or updates) Perforation Studio from the latest GitHub release.
# Double-click in Finder. Needs nothing but macOS and an internet connection.
set -euo pipefail
REPO="mayzernator/perforation-studio"
ASSET="Perforation-Studio-mac-arm64.zip"
URL="https://github.com/$REPO/releases/download/latest/$ASSET"
APP="/Applications/Perforation Studio.app"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
fail() { echo "$1"; read -rp "Press Enter to close"; exit 1; }

echo "Downloading the latest build..."
curl --fail --location --proto '=https' --tlsv1.2 --silent --show-error -o "$TMP/app.zip" "$URL" \
  || fail "Download failed. Check your connection, or try again in a few minutes if a new build is uploading."

# compare against the SHA-256 GitHub publishes for the release file, when it has one
WANT="$(curl --fail --location --proto '=https' --tlsv1.2 --silent "https://api.github.com/repos/$REPO/releases/tags/latest" \
  | tr ',' '\n' | grep -A60 "\"name\": *\"$ASSET\"" | grep -m1 -o 'sha256:[0-9a-f]\{64\}' | cut -d: -f2 || true)"
if [ -n "$WANT" ]; then
  [ "$(shasum -a 256 "$TMP/app.zip" | cut -d' ' -f1)" = "$WANT" ] || fail "The download doesn't match GitHub's checksum, so it wasn't installed."
fi

ditto -x -k "$TMP/app.zip" "$TMP"
[ -d "$TMP/Perforation Studio.app" ] || fail "The download doesn't contain the app."
osascript -e 'quit app "Perforation Studio"' 2>/dev/null || true
rm -rf "$APP"
mv "$TMP/Perforation Studio.app" "$APP"
# not signed with an Apple Developer ID: clear the quarantine flag and sign ad-hoc so macOS will open it
xattr -dr com.apple.quarantine "$APP"
codesign --force --deep --sign - "$APP"
echo "Installed. Opening..."
open "$APP"
