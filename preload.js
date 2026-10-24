const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  __native: true,
  openDialog: () => ipcRenderer.invoke('open-dialog'),
  // opts.oldReader: Not now to a newer Publisher reader; → the document, or { needReader: 'download'|'newer' }
  readDocument: (p, opts) => ipcRenderer.invoke('read-document', p, opts),
  // the editor's progress box while LibreOffice reads a file: 'waiting' | 'reading', and its Cancel
  onReadStep: (fn) => ipcRenderer.on('read-step', (_e, s) => fn(s)),
  cancelRead: () => ipcRenderer.send('cancel-read'),
  // the Publisher reader (reader.js): { need, size, canDownload, why }, the download ({ ok } | { error } | { cancelled }),
  // its Cancel, and its progress { phase: 'download'|'unpack', got, total }
  readerStatus: () => ipcRenderer.invoke('reader-status'),
  getReader: () => ipcRenderer.invoke('reader-get'),
  cancelReader: () => ipcRenderer.send('reader-cancel'),
  onReaderProgress: (fn) => ipcRenderer.on('reader-progress', (_e, p) => fn(p)),
  // automatic updates (updater.js)
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateReady: (fn) => ipcRenderer.on('update-ready', (_e, v) => fn(String(v))),
  // after an update: is the right-click menu under "Show more options"? 'check' | 'later' | 'fix'
  menuRepair: (action) => ipcRenderer.invoke('menu-repair', action),
  saveDialog: (opts) => ipcRenderer.invoke('save-dialog', opts),
  writeFile: (opts) => ipcRenderer.invoke('write-file', opts),
  pickImages: () => ipcRenderer.invoke('pick-images'),
  pickList: () => ipcRenderer.invoke('pick-list'),
  readList: (p) => ipcRenderer.invoke('read-list', p),
  mailPhotos: (cells, listPath) => ipcRenderer.invoke('mail-photos', cells, listPath),
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
  setMailMenu: (state) => ipcRenderer.send('mail-menu', state),
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
