'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// The only bridge between the editor page and the Mac app. No Node access is exposed.
contextBridge.exposeInMainWorld('perfApp', {
  platform: process.platform,
  ready: () => ipcRenderer.send('ready'),
  onCommand: (fn) => ipcRenderer.on('cmd', (_e, cmd, payload) => fn(cmd, payload)),
  save: (opts) => ipcRenderer.invoke('save', opts),
  open: () => ipcRenderer.invoke('open'),
  confirmDiscard: () => ipcRenderer.invoke('confirm-discard'),
  reveal: (p) => ipcRenderer.invoke('reveal', p),
  setDirty: (v) => ipcRenderer.send('dirty', !!v),
  setTitle: (t) => ipcRenderer.send('title', String(t)),
  setRepresented: (p) => ipcRenderer.send('represented', String(p)),
  savedAndClose: () => ipcRenderer.send('saved-close'),
});
