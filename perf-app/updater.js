'use strict';
// Self-updater for the ad-hoc signed build. Electron's autoUpdater (Squirrel.Mac) refuses
// apps without a Developer ID, so this asks the public GitHub API for the latest release,
// downloads its zip over HTTPS, checks GitHub's SHA-256 for it, and swaps the .app bundle itself.
const { app, dialog } = require('electron');
const { execFile, spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const REPO = 'mayzernator/perforation-studio';
const API = `https://api.github.com/repos/${REPO}`;
// the zip must come from this repo's releases (GitHub then redirects to its own download host)
const ASSET_PREFIX = `https://github.com/${REPO}/releases/download/`;
const FIRST_CHECK_MS = 10 * 1000;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

let build = {};
try { build = JSON.parse(fs.readFileSync(path.join(__dirname, 'app', 'build.json'), 'utf8')); } catch {}

let state = 'idle';          // idle | checking | downloading | ready
let staged = null;           // { dir, app, commit } once an update is downloaded and unpacked
let relaunch = false;
let onChange = () => {};
let getWindow = () => null;

const short = (sha) => (sha ? String(sha).slice(0, 7) : 'unknown');
const setState = (s) => { state = s; onChange(); };

function run(cmd, args, timeout = 60 * 1000) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) { err.stderr = String(stderr || '').trim(); reject(err); } else resolve(String(stdout).trim());
    });
  });
}

// the running .app bundle: .../Perforation Studio.app/Contents/MacOS/Perforation Studio
const bundlePath = () => path.resolve(path.dirname(process.execPath), '..', '..');

class UpdateError extends Error {}

async function api(p) {
  let res;
  try {
    res = await fetch(`${API}/${p}`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': `PerforationStudio/${app.getVersion()}` },
      signal: AbortSignal.timeout(60 * 1000),
    });
  } catch (err) { throw new UpdateError(`Couldn’t reach GitHub: ${err.message}`); }
  if (res.ok) return res.json();
  if (res.status === 404) return null;
  if ((res.status === 403 || res.status === 429) && res.headers.get('x-ratelimit-remaining') === '0') throw new UpdateError('GitHub’s rate limit for this network is used up. Try again in an hour.');
  throw new UpdateError(`GitHub answered ${res.status} ${res.statusText}.`);
}

// { commit, asset } for the rolling "latest" release
async function latestRelease() {
  const rel = await api('releases/tags/latest');
  if (!rel) throw new UpdateError('No release is published right now. A new build may be uploading; try again in a few minutes.');
  const asset = (rel.assets || []).find((a) => a.name.endsWith('.zip'));
  if (!asset) throw new UpdateError('The latest release has no app zip.');
  if (/^[0-9a-f]{40}$/.test(rel.target_commitish)) return { commit: rel.target_commitish, asset };
  const m = /\b([0-9a-f]{7,40})\b/.exec(rel.body || '');
  if (m) return { commit: m[1], asset };
  throw new UpdateError('The latest release doesn’t say which commit it was built from.');
}

// 'ahead' (newer build available) | 'identical' | 'behind' | 'diverged' | 'unknown'
async function compare(remote) {
  if (!build.commit) return 'ahead';
  try { return (await api(`compare/${build.commit}...${remote}`))?.status || 'unknown'; } catch { return 'unknown'; }
}

async function fetchFile(url, dest, expected) {
  if (!url.startsWith(ASSET_PREFIX)) throw new UpdateError('The release zip isn’t hosted on this repository’s releases.');
  const res = await fetch(url, { headers: { 'User-Agent': `PerforationStudio/${app.getVersion()}` }, signal: AbortSignal.timeout(10 * 60 * 1000) });
  if (!res.ok || !res.body) throw new UpdateError(`Download failed: ${res.status} ${res.statusText}`);
  const hash = crypto.createHash('sha256');
  const body = Readable.fromWeb(res.body);
  body.on('data', (chunk) => hash.update(chunk));
  await pipeline(body, fs.createWriteStream(dest));
  const got = hash.digest('hex');
  if (expected && got !== expected) throw new UpdateError('The downloaded zip doesn’t match the checksum GitHub published for it, so it wasn’t installed.');
}

async function download({ commit, asset }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-update-'));
  try {
    const zip = 'update.zip';
    const digest = /^sha256:([0-9a-f]{64})$/.exec(asset.digest || '');
    await fetchFile(asset.browser_download_url, path.join(dir, zip), digest && digest[1]);
    await run('/usr/bin/ditto', ['-x', '-k', path.join(dir, zip), dir], 5 * 60 * 1000);
    const bundle = fs.readdirSync(dir).find((f) => f.endsWith('.app'));
    if (!bundle) throw new UpdateError('The downloaded zip doesn’t contain the app.');
    fs.rmSync(path.join(dir, zip), { force: true });
    return { dir, app: path.join(dir, bundle), commit };
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err instanceof UpdateError ? err : new UpdateError(`Download failed: ${err.stderr || err.message}`);
  }
}

function canReplaceBundle() {
  const p = bundlePath();
  if (!p.endsWith('.app') || p.includes('/AppTranslocation/')) return false;
  try { fs.accessSync(path.dirname(p), fs.constants.W_OK); fs.accessSync(p, fs.constants.W_OK); return true; } catch { return false; }
}

async function check({ manual }) {
  if (state === 'ready') { if (manual) promptRestart(); return; }
  if (state !== 'idle') return;
  const win = getWindow();
  const tell = (o) => manual && dialog.showMessageBox(win, { type: 'info', buttons: ['OK'], ...o });
  if (!app.isPackaged) return tell({ message: 'Updates only work in the installed app.', detail: 'You’re running from source.' });
  if (!canReplaceBundle()) return tell({ type: 'warning', message: 'Perforation Studio can’t update itself from where it is.', detail: `Move it to Applications, or update with “Install Perforation Studio.command”.\n\n${bundlePath()}` });

  setState('checking');
  try {
    const latest = await latestRelease(), remote = latest.commit;
    const status = await compare(remote);
    if (status !== 'ahead') {
      setState('idle');
      const detail = {
        identical: `You have the latest build (${short(build.commit)}).`,
        behind: `This build (${short(build.commit)}) is newer than the latest release (${short(remote)}).`,
        diverged: `This build (${short(build.commit)}) isn’t on main, so it won’t be replaced automatically. Latest release: ${short(remote)}.`,
        unknown: `This build (${short(build.commit)}) isn’t on GitHub, so it can’t be compared with the latest release (${short(remote)}).`,
      }[status] || `Latest release: ${short(remote)}.`;
      return tell({ message: status === 'identical' ? 'Perforation Studio is up to date.' : 'No update installed.', detail });
    }
    setState('downloading');
    staged = await download(latest);
    setState('ready');
    promptRestart();
  } catch (err) {
    setState('idle');
    if (manual) dialog.showMessageBox(win, { type: 'warning', buttons: ['OK'], message: 'Couldn’t check for updates.', detail: err.message });
    else console.error('update check failed:', err.message);
  }
}

async function promptRestart() {
  const { response } = await dialog.showMessageBox(getWindow(), {
    type: 'info', buttons: ['Restart Now', 'Later'], defaultId: 0, cancelId: 1,
    message: 'A new version of Perforation Studio is ready.',
    detail: `Build ${short(staged.commit)} (you have ${short(build.commit)}). If you choose Later, it installs when you quit.`,
  });
  if (response === 0) { relaunch = true; app.quit(); }
}

// Called on will-quit: hand the swap to a detached script that waits for this process to exit.
function installOnQuit() {
  if (state !== 'ready' || !staged) return;
  const script = path.join(staged.dir, 'install.sh');
  fs.writeFileSync(script, `#!/bin/bash
PID="$1"; NEW="$2"; APP="$3"; RELAUNCH="$4"; TMP="$5"
for _ in $(seq 1 300); do kill -0 "$PID" 2>/dev/null || break; sleep 0.2; done
BAK="$TMP/previous.app"
if mv "$APP" "$BAK"; then
  if mv "$NEW" "$APP"; then
    xattr -dr com.apple.quarantine "$APP" 2>/dev/null
    codesign --force --deep --sign - "$APP" 2>/dev/null
  else
    mv "$BAK" "$APP"
  fi
fi
[ "$RELAUNCH" = 1 ] && open "$APP"
rm -rf "$TMP"
`);
  spawn('/bin/bash', [script, String(process.pid), staged.app, bundlePath(), relaunch ? '1' : '0', staged.dir], { detached: true, stdio: 'ignore' }).unref();
  staged = null;
}

function menuItem() {
  if (state === 'ready') return { label: 'Restart to Install Update', click: promptRestart };
  if (state === 'checking') return { label: 'Checking for Updates…', enabled: false };
  if (state === 'downloading') return { label: 'Downloading Update…', enabled: false };
  return { label: 'Check for Updates…', click: () => check({ manual: true }) };
}

function start(opts) {
  ({ onChange, getWindow } = opts);
  app.setAboutPanelOptions({ applicationName: app.getName(), applicationVersion: app.getVersion(), version: `build ${short(build.commit)}${build.dirty ? '+' : ''}` });
  app.on('will-quit', installOnQuit);
  if (!app.isPackaged) return;
  setTimeout(() => check({ manual: false }), FIRST_CHECK_MS);
  setInterval(() => check({ manual: false }), CHECK_EVERY_MS);
}

module.exports = { start, menuItem, cancelRelaunch: () => { relaunch = false; } };
