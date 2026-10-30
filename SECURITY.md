# Security

## Reporting a problem

Please report security issues privately through GitHub: **Security → Report a vulnerability** on this repository. Don't open a public issue for them. There is no bug bounty and no guaranteed response time; this is a personal project maintained in spare time.

## What the app does and doesn't do

- The editor runs in a sandboxed Electron window with context isolation, no Node access, and a Content Security Policy that blocks all network requests from the page.
- The page can only write files the user picked in a save dialog (or opened from Finder).
- The only network traffic is the update check: the app asks the public GitHub API for the latest release of this repository and downloads its zip over HTTPS, checking the SHA-256 digest GitHub reports for the file.
- The app is **not** signed with an Apple Developer ID or notarized. The installer and updater remove the quarantine flag and sign it ad-hoc so macOS will open it. That means macOS isn't vouching for the build: you're trusting this repository and its GitHub releases. If that isn't acceptable, build it yourself from source (see the README).
- Releases are built by GitHub Actions from `main` only. Pull requests from forks never produce a release.
