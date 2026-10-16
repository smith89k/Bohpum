const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  __native: true,
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  readDocument: (p) => ipcRenderer.invoke('read-document', p),
  saveDialog: (opts) => ipcRenderer.invoke('save-dialog', opts),
  writeFile: (opts) => ipcRenderer.invoke('write-file', opts),
  pickImages: () => ipcRenderer.invoke('pick-images'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('set-settings', patch),
  exportPdf: (opts) => ipcRenderer.invoke('export-pdf', opts),
  writePdf: (opts) => ipcRenderer.invoke('write-pdf', opts),
  exportPng: (opts) => ipcRenderer.invoke('export-png', opts),
  printHtml: (opts) => ipcRenderer.invoke('print-html', opts),
  setDirty: (v) => ipcRenderer.send('set-dirty', v),
  setTitle: (t) => ipcRenderer.send('set-title', t),
  closeNow: () => ipcRenderer.send('close-now'),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return file.path || null; } },
  onMenu: (fn) => ipcRenderer.on('menu', (_e, cmd) => fn(cmd)),
  onOpenPath: (fn) => ipcRenderer.on('open-path', (_e, p) => fn(p))
});
