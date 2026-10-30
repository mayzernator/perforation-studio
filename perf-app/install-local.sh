#!/bin/bash
# Build from this checkout and install to /Applications (no GitHub round trip).
set -euo pipefail
cd "$(dirname "$0")"
npm run dist
APP="/Applications/Perforation Studio.app"
osascript -e 'quit app "Perforation Studio"' 2>/dev/null || true
rm -rf "$APP"
ditto -x -k dist/Perforation-Studio-*-mac-arm64.zip /Applications
codesign --force --deep --sign - "$APP"
open "$APP"
