# Perforation Studio

Parametric perforation pattern generator (grilles, vents, halftones, wrapped cylinders and cones) with DXF and SVG export.

## Install on a Mac

Double-click **Install Perforation Studio.command** (in this repo, or downloaded on its own). The first time, it installs the GitHub CLI if needed and asks you to log in to GitHub once, since the repo is private. Double-click it again any time to update. Every push to `main` builds a new release automatically (GitHub Actions, ~5 min).

## Quick edit loop

- `cd perf-app && npm run dev`: rebuild the page and open the app straight from source (seconds).
- `cd perf-app && npm run install-app`: build and install into /Applications without waiting on GitHub (~1 min).

## Layout

- `perf/`: the editor itself. `core.js` is the pattern engine and DXF/SVG writer, `presets.js` holds the presets, `ui.html` is the interface.
- `perf-app/`: the Mac app wrapper (Electron). `main.js` handles the window, menus and file dialogs. `preload.js` is the only bridge to the page. `build-app.py` assembles an offline page with local fonts and three.js.

## Build the Mac app (on a Mac or Linux)

```
cd perf-app
npm install
(cd fonts-src && npm install)
npm run dist          # -> dist/Perforation-Studio-1.0.0-mac-arm64.zip
```

Run it without packaging: `npm run build:page && npm start`

## First launch on a Mac

The app isn't signed with an Apple Developer ID, so sign it ad-hoc once after moving it to Applications:

```
xattr -dr com.apple.quarantine "/Applications/Perforation Studio.app"
codesign --force --deep --sign - "/Applications/Perforation Studio.app"
```

## Design files

`.perf` files are JSON: `{ "app": "perforation-studio", "version": 1, "state": { ... } }`. Image gradients are embedded as JPEG data.
