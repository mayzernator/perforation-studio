'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const updater = require('./updater');

let win = null;
let dirty = false;
let forceClose = false;
let pendingOpen = null;      // file double-clicked in Finder before the window was ready
let rendererReady = false;
let lastDir = app.getPath('documents');
const allowed = new Set();   // only paths the user picked in a dialog (or opened from Finder) can be written

const send = (cmd, payload) => { if (win && !win.isDestroyed()) win.webContents.send('cmd', cmd, payload); };

function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 900, minHeight: 600,
    title: 'Perforation Studio',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 16 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#262421' : '#f5f1e8',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.once('ready-to-show', () => win.show());

  // links never open inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  win.on('close', (e) => {
    if (forceClose || !dirty) return;
    e.preventDefault();
    const r = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: ['Save', 'Don’t Save', 'Cancel'], defaultId: 0, cancelId: 2,
      message: 'Save changes to this design before closing?',
      detail: 'Your changes will be lost if you don’t save them.',
    });
    if (r === 0) send('save-and-close');
    else if (r === 1) { forceClose = true; win.close(); }
    else updater.cancelRelaunch();
  });
  win.on('closed', () => { win = null; rendererReady = false; });
}

async function readDesign(p) {
  const data = await fs.readFile(p, 'utf8');
  allowed.add(p); lastDir = path.dirname(p);
  app.addRecentDocument(p);
  return { path: p, name: path.basename(p), data };
}

// ---------- IPC ----------
ipcMain.on('ready', () => {
  rendererReady = true;
  if (pendingOpen) { const p = pendingOpen; pendingOpen = null; readDesign(p).then((f) => send('load', f)).catch((err) => send('error', `Could not open ${path.basename(p)}: ${err.message}`)); }
});
ipcMain.on('dirty', (_e, v) => { dirty = !!v; if (win) win.setDocumentEdited(dirty); });
ipcMain.on('title', (_e, t) => { if (win) win.setTitle(String(t).slice(0, 200)); });
ipcMain.on('represented', (_e, p) => { if (win && allowed.has(p)) win.setRepresentedFilename(p); });
ipcMain.on('saved-close', () => { forceClose = true; if (win) win.close(); });

ipcMain.handle('save', async (_e, { data, defaultName, kind, path: target }) => {
  const filters = {
    perf: [{ name: 'Perforation Studio design', extensions: ['perf'] }],
    dxf: [{ name: 'DXF drawing', extensions: ['dxf'] }],
    svg: [{ name: 'SVG image', extensions: ['svg'] }],
  }[kind];
  if (!filters || typeof data !== 'string') return { error: 'Nothing to save.' };
  let p = target && allowed.has(target) ? target : null;
  if (!p) {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.join(lastDir, String(defaultName || 'Untitled').replace(/[\\/:*?"<>|]/g, '-')), filters });
    if (r.canceled || !r.filePath) return { canceled: true };
    p = r.filePath;
  }
  try {
    await fs.writeFile(p, data, 'utf8');
    allowed.add(p); lastDir = path.dirname(p);
    if (kind === 'perf') app.addRecentDocument(p);
    return { path: p, name: path.basename(p) };
  } catch (err) { return { error: `Could not save ${path.basename(p)}: ${err.message}` }; }
});

ipcMain.handle('open', async () => {
  const r = await dialog.showOpenDialog(win, { defaultPath: lastDir, properties: ['openFile'], filters: [{ name: 'Perforation Studio design', extensions: ['perf'] }] });
  if (r.canceled || !r.filePaths[0]) return { canceled: true };
  try { return await readDesign(r.filePaths[0]); } catch (err) { return { error: `Could not open the file: ${err.message}` }; }
});

ipcMain.handle('confirm-discard', async () => {
  if (!dirty) return 'discard';
  const r = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['Save', 'Don’t Save', 'Cancel'], defaultId: 0, cancelId: 2,
    message: 'Save changes to the current design first?', detail: 'Your changes will be lost if you don’t save them.',
  });
  return ['save', 'discard', 'cancel'][r.response];
});

ipcMain.handle('reveal', (_e, p) => { if (allowed.has(p)) shell.showItemInFolder(p); });

// ---------- Finder: double-clicked .perf files ----------
app.on('open-file', (e, p) => {
  e.preventDefault();
  if (win && rendererReady) readDesign(p).then((f) => send('load', f)).catch((err) => send('error', `Could not open ${path.basename(p)}: ${err.message}`));
  else pendingOpen = p;
});

// ---------- menu ----------
function buildMenu() {
  const c = (cmd) => () => send(cmd);
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        updater.menuItem(),
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'File',
      submenu: [
        { label: 'New Design', accelerator: 'CmdOrCtrl+N', click: c('new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: c('open') },
        { role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments' }] },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: c('save') },
        { label: 'Save As…', accelerator: 'Shift+CmdOrCtrl+S', click: c('save-as') },
        { type: 'separator' },
        { label: 'Export DXF…', accelerator: 'CmdOrCtrl+E', click: c('export-dxf') },
        { label: 'Export SVG…', accelerator: 'Shift+CmdOrCtrl+E', click: c('export-svg') },
        { label: 'Copy DXF to Clipboard', click: c('copy-dxf') },
        { type: 'separator' },
        { role: 'close' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: c('undo') },
        { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', click: c('redo') },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Flat Pattern', accelerator: 'CmdOrCtrl+1', click: c('view-flat') },
        { label: '3D Preview', accelerator: 'CmdOrCtrl+2', click: c('view-3d') },
        { type: 'separator' },
        { label: 'Plate with Holes', accelerator: 'CmdOrCtrl+3', click: c('mode-plate') },
        { label: 'Holes Only', accelerator: 'CmdOrCtrl+4', click: c('mode-holes') },
        { label: 'Toggle Snapping', accelerator: 'CmdOrCtrl+;', click: c('snap') },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }]),
      ],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  updater.start({ getWindow: () => win, onChange: buildMenu });
});
app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!win) createWindow(); });
