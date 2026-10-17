const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  __native: true,
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  readDocument: (p) => ipcRenderer.invoke('read-document', p),
  saveDialog: (opts) => ipcRenderer.invoke('save-dialog', opts),
  writeFile: (opts) => ipcRenderer.invoke('write-file', opts),
  pickImages: () => ipcRenderer.invoke('pick-images'),
  appInfo: () => ipcRenderer.invoke('app-info'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSettings: (patch) => ipcRenderer.invoke('set-settings', patch),
  exportPdf: (opts) => ipcRenderer.invoke('export-pdf', opts),
  writePdf: (opts) => ipcRenderer.invoke('write-pdf', opts),
  exportPng: (opts) => ipcRenderer.invoke('export-png', opts),
  printHtml: (opts) => ipcRenderer.invoke('print-html', opts),
  printers: () => ipcRenderer.invoke('printers'),
  printerPrefs: (name) => ipcRenderer.invoke('printer-prefs', name),
  setDirty: (v) => ipcRenderer.send('set-dirty', v),
  setTitle: (t) => ipcRenderer.send('set-title', t),
  closeNow: () => ipcRenderer.send('close-now'),
  setTheme: (t) => ipcRenderer.send('set-theme', t),
  showMenu: (index, x, y) => ipcRenderer.invoke('show-menu', index, x, y),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return file.path || null; } },
  onMenu: (fn) => ipcRenderer.on('menu', (_e, cmd) => fn(cmd)),
  onOpenPath: (fn) => ipcRenderer.on('open-path', (_e, p) => fn(p)),
  // the Explorer menu's convert window (src/task.js)
  taskReady: () => ipcRenderer.send('task-ready'),
  taskSize: (h) => ipcRenderer.send('task-size', h),
  taskFocus: () => ipcRenderer.send('task-focus'),
  onTaskBatch: (fn) => ipcRenderer.on('task-batch', (_e, b) => fn(b)),
  nameClashes: (groups) => ipcRenderer.invoke('name-clashes', groups),
  resolveNames: (groups, choice) => ipcRenderer.invoke('resolve-names', groups, choice)
});
