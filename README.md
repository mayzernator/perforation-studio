# Perforation Studio

Parametric perforation pattern generator (grilles, vents, halftones, wrapped cylinders and cones) with DXF and SVG export.

## Install on a Mac

Apple Silicon Macs only. Download **Install Perforation Studio.command** and double-click it. It downloads the latest release, checks it against the checksum GitHub publishes, and installs it to Applications. No GitHub account or extra tools needed. Double-click it again any time to reinstall the latest build.

If macOS won't open the downloaded script, right-click it and choose **Open**, or run `bash "Install Perforation Studio.command"` in Terminal.

The app isn't signed with an Apple Developer ID or notarized, so the installer clears macOS's quarantine flag and signs it ad-hoc. Read the script before you run it if you want to know exactly what it does; it's short.

## Updates

Every push to `main` builds a new release automatically (GitHub Actions, ~5 min). The app checks for it on launch and every 4 hours, downloads it in the background, and asks to restart; choose Later and it installs when you quit. **Perforation Studio → Check for Updates…** checks right away. It reads the public GitHub API (no login), verifies the download's SHA-256, and only replaces itself with a build that is ahead of its own commit on `main` (About shows which build you have).

## Quick edit loop

- `cd perf-app && npm run dev`: rebuild the page and open the app straight from source (seconds).
- `cd perf-app && npm run install-app`: build and install into /Applications without waiting on GitHub (~1 min).

## Layout

- `perf/`: the editor itself. `core.js` is the pattern engine and DXF/SVG writer, `presets.js` holds the presets, `ui.html` is the interface.
- `perf-app/`: the Mac app wrapper (Electron). `main.js` handles the window, menus and file dialogs. `updater.js` checks for, downloads and installs new releases. `preload.js` is the only bridge to the page. `build-app.py` assembles an offline page with local fonts and three.js.

## Build the Mac app (on a Mac or Linux)

```
cd perf-app
npm install
(cd fonts-src && npm install)
npm run dist          # -> dist/Perforation-Studio-mac-arm64.zip
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

## Disclaimer

Perforation Studio is a design aid. It is provided as is, without warranty of any kind (see [LICENSE](LICENSE)). Check every exported drawing yourself before you cut, print or machine anything: dimensions, hole sizes, web thickness, open area, and whether the part is strong enough, safe and suitable for its use (airflow, fire, electrical, structural or any other requirement). The author isn't responsible for parts made from its output.

## Licence

MIT, see [LICENSE](LICENSE). Bundled fonts and libraries keep their own licences, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). To report a security problem, see [SECURITY.md](SECURITY.md).
