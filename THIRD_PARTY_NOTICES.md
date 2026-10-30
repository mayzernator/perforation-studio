# Third-party notices

The Mac app bundles the following. Their full licence texts are copied into the app at build time (`Contents/Resources/app.asar` → `app/licenses/`).

| Component | Licence | Source |
| --- | --- | --- |
| Barlow, Barlow Semi Condensed (fonts) | SIL Open Font License 1.1 | https://github.com/jpt/barlow, via @fontsource |
| JetBrains Mono (font) | SIL Open Font License 1.1 | https://github.com/JetBrains/JetBrainsMono, via @fontsource |
| three.js r128 | MIT | https://github.com/mrdoob/three.js |
| Electron (includes Chromium and Node.js) | MIT, plus the licences listed in the app's `LICENSES.chromium.html` | https://github.com/electron/electron |

The browser version of the editor (`perf/ui.html`) loads Google Fonts, JSZip (MIT or GPLv3, used here under MIT) and three.js from public CDNs instead of bundling them.
