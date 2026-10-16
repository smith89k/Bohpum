// Bohpum - Electron main process
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');

const APP_NAME = 'Bohpum';
let win = null;
let dirty = false;
let pendingOpenPath = null;

// ---------- settings ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function saveSettings(s) {
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch (e) { console.error(e); }
}

// ---------- LibreOffice (bundled; used only to read .pub and other foreign formats, never shown in the UI) ----------
// The bundle comes from scripts/bundle-libreoffice.js; a normal LibreOffice install is the fallback.
function findSoffice() {
  const bundled = app.isPackaged ? path.join(process.resourcesPath, 'libreoffice') : path.join(__dirname, 'vendor', 'libreoffice');
  const candidates = [path.join(bundled, 'program', process.platform === 'win32' ? 'soffice.exe' : 'soffice')];
  if (process.platform === 'win32') {
    const pf = [process.env['ProgramFiles'], process.env['ProgramFiles(x86)'], 'C:\\Program Files', 'C:\\Program Files (x86)'];
    for (const p of pf) if (p) candidates.push(path.join(p, 'LibreOffice', 'program', 'soffice.exe'));
    if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, 'Programs', 'LibreOffice', 'program', 'soffice.exe'));
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/LibreOffice.app/Contents/MacOS/soffice');
  } else {
    candidates.push('/usr/bin/soffice', '/usr/local/bin/soffice', '/usr/lib/libreoffice/program/soffice');
  }
  for (const c of candidates) { try { if (fs.existsSync(c)) return c; } catch {} }
  return null;
}

function convertWithLibreOffice(inputPath) {
  return new Promise((resolve, reject) => {
    const soffice = findSoffice();
    if (!soffice) return reject(new Error('Part of Bohpum is missing. Please reinstall Bohpum.'));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-'));
    const ext = path.extname(inputPath) || '.pub';
    const tmpIn = path.join(tmp, 'input' + ext.toLowerCase());
    fs.copyFileSync(inputPath, tmpIn);
    // Separate profile so conversion works even while LibreOffice is open
    const profile = path.join(app.getPath('userData'), 'lo-profile');
    // Must be a proper file URL: a raw space in the path (e.g. a user name) makes soffice exit 127
    const profileUrl = pathToFileURL(profile).href;
    const args = ['-env:UserInstallation=' + profileUrl, '--headless', '--norestore', '--nolockcheck',
      '--convert-to', 'fodg', '--outdir', tmp, tmpIn];
    execFile(soffice, args, { timeout: 180000, windowsHide: true }, (err) => {
      const out = path.join(tmp, 'input.fodg');
      if (fs.existsSync(out)) {
        const xml = fs.readFileSync(out, 'utf8');
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
        resolve(xml);
      } else {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
        // err.message holds the soffice command line; log it, show the user a plain message
        console.error('Conversion failed:', err || 'no output');
        reject(new Error(err && err.killed ? 'Opening the file took too long.' : 'The file may be damaged or in an unsupported version.'));
      }
    });
  });
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: APP_NAME,
    backgroundColor: '#e9e7e2',
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  // Open maximized; 1400×900 stays as the size used when the user restores the window.
  // Maximize before loading so the editor fits the page to the full-size window.
  win.maximize();
  win.show();
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.on('close', (e) => {
    if (!dirty) return;
    const r = dialog.showMessageBoxSync(win, {
      type: 'question', buttons: ['Save', "Don't Save", 'Cancel'], defaultId: 0, cancelId: 2,
      title: APP_NAME, message: 'Save changes to this publication before closing?'
    });
    if (r === 2) { e.preventDefault(); return; }
    if (r === 0) { e.preventDefault(); win.webContents.send('menu', 'save-and-close'); }
  });
  win.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) { openPathInRenderer(pendingOpenPath); pendingOpenPath = null; }
  });
}

function send(cmd) { if (win) win.webContents.send('menu', cmd); }

function buildMenu() {
  const noReg = { registerAccelerator: false };
  const template = [
    { label: 'File', submenu: [
      { label: 'New…', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
      { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
      { type: 'separator' },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
      { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('save-as') },
      { type: 'separator' },
      { label: 'Export Page as PNG…', click: () => send('export-png') },
      { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: () => send('print') },
      { type: 'separator' },
      { label: 'Page Setup…', click: () => send('page-setup') },
      { type: 'separator' },
      { role: 'quit', label: 'Exit' }
    ]},
    { label: 'Edit', submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', ...noReg, click: () => send('undo') },
      { label: 'Redo', accelerator: 'CmdOrCtrl+Y', ...noReg, click: () => send('redo') },
      { type: 'separator' },
      { label: 'Cut', accelerator: 'CmdOrCtrl+X', ...noReg, click: () => send('cut') },
      { label: 'Copy', accelerator: 'CmdOrCtrl+C', ...noReg, click: () => send('copy') },
      { label: 'Paste', accelerator: 'CmdOrCtrl+V', ...noReg, click: () => send('paste') },
      { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', ...noReg, click: () => send('duplicate') },
      { label: 'Delete', accelerator: 'Delete', ...noReg, click: () => send('delete') },
      { label: 'Select All', accelerator: 'CmdOrCtrl+A', ...noReg, click: () => send('select-all') }
    ]},
    { label: 'Insert', submenu: [
      { label: 'Text Box', accelerator: 'T', ...noReg, click: () => send('tool-text') },
      { label: 'Rectangle', accelerator: 'R', ...noReg, click: () => send('tool-rect') },
      { label: 'Ellipse', accelerator: 'E', ...noReg, click: () => send('tool-ellipse') },
      { label: 'Line', accelerator: 'L', ...noReg, click: () => send('tool-line') },
      { label: 'Picture…', click: () => send('insert-image') },
      { type: 'separator' },
      { label: 'New Page', click: () => send('page-add') },
      { label: 'Duplicate Page', click: () => send('page-duplicate') }
    ]},
    { label: 'Arrange', submenu: [
      { label: 'Bring to Front', accelerator: 'CmdOrCtrl+Shift+]', ...noReg, click: () => send('front') },
      { label: 'Bring Forward', accelerator: 'CmdOrCtrl+]', ...noReg, click: () => send('forward') },
      { label: 'Send Backward', accelerator: 'CmdOrCtrl+[', ...noReg, click: () => send('backward') },
      { label: 'Send to Back', accelerator: 'CmdOrCtrl+Shift+[', ...noReg, click: () => send('back') },
      { type: 'separator' },
      { label: 'Group', accelerator: 'CmdOrCtrl+G', ...noReg, click: () => send('group') },
      { label: 'Ungroup', accelerator: 'CmdOrCtrl+Shift+G', ...noReg, click: () => send('ungroup') },
      { label: 'Lock / Unlock', click: () => send('lock') }
    ]},
    { label: 'View', submenu: [
      { label: 'Zoom In', accelerator: 'CmdOrCtrl+=', ...noReg, click: () => send('zoom-in') },
      { label: 'Zoom Out', accelerator: 'CmdOrCtrl+-', ...noReg, click: () => send('zoom-out') },
      { label: 'Fit Page', accelerator: 'CmdOrCtrl+0', ...noReg, click: () => send('zoom-fit') },
      { label: 'Actual Size', accelerator: 'F9', ...noReg, click: () => send('zoom-100') },
      { type: 'separator' },
      { label: 'Master Page', accelerator: 'CmdOrCtrl+M', ...noReg, click: () => send('toggle-master') },
      { label: 'Show Guides', click: () => send('toggle-guides') },
      { type: 'separator' },
      { role: 'toggleDevTools' }
    ]},
    { label: 'Help', submenu: [
      { label: 'About ' + APP_NAME, click: () => dialog.showMessageBox(win, { title: APP_NAME, message: APP_NAME + ' (បោះពុម្ព)', detail: 'Version ' + app.getVersion() }) }
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const FOREIGN = ['.pub', '.odg', '.vsd', '.vsdx', '.cdr', '.wpg', '.cmx', '.p65', '.pmd', '.qxd', '.zmf'];

async function readAnyDocument(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.bpum' || ext === '.kbach' || ext === '.json') return { kind: 'bpum', text: fs.readFileSync(p, 'utf8'), path: p };
  if (ext === '.fodg') return { kind: 'fodg', text: fs.readFileSync(p, 'utf8'), path: p };
  const xml = await convertWithLibreOffice(p);
  return { kind: 'fodg', text: xml, path: p };
}

function openPathInRenderer(p) {
  win.webContents.send('open-path', p);
}

// ---------- IPC ----------
ipcMain.handle('open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open publication', properties: ['openFile'],
    filters: [
      { name: 'All supported', extensions: ['bpum', 'kbach', 'pub', 'odg', 'fodg', 'vsd', 'vsdx', 'cdr', 'p65', 'pmd', 'qxd'] },
      { name: 'Bohpum', extensions: ['bpum', 'kbach'] },
      { name: 'Microsoft Publisher', extensions: ['pub'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('read-document', async (_e, p) => {
  if (!fs.existsSync(p)) return { error: 'The file was moved or deleted.', missing: true };
  try { return await readAnyDocument(p); }
  catch (err) { return { error: String(err && err.message || err) }; }
});

ipcMain.handle('save-dialog', async (_e, { defaultName, filters }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters });
  return r.canceled ? null : r.filePath;
});

ipcMain.handle('write-file', async (_e, { path: p, text, base64 }) => {
  if (base64 != null) fs.writeFileSync(p, Buffer.from(base64, 'base64'));
  else fs.writeFileSync(p, text, 'utf8');
  return true;
});

ipcMain.handle('pick-images', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Insert picture', properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] }] });
  if (r.canceled) return [];
  return r.filePaths.map(p => {
    const ext = path.extname(p).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
    return { name: path.basename(p), dataUrl: 'data:' + mime + ';base64,' + fs.readFileSync(p).toString('base64') };
  });
});

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('set-settings', (_e, patch) => { const s = { ...loadSettings(), ...patch }; saveSettings(s); return s; });


ipcMain.on('set-dirty', (_e, v) => { dirty = !!v; });
ipcMain.on('set-title', (_e, t) => { if (win) win.setTitle(t); });
ipcMain.on('close-now', () => { dirty = false; if (win) win.close(); });

// Render HTML in a hidden window, then PDF / print / PNG
function withHiddenWindow(html, fn) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), 'bohpum-print-' + Date.now() + '.html');
    fs.writeFileSync(tmp, html, 'utf8');
    const w = new BrowserWindow({ show: false, width: 1200, height: 1600, webPreferences: { offscreen: false } });
    w.loadFile(tmp).then(async () => {
      try {
        await w.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(r=>setTimeout(r,150)))');
        const r = await fn(w);
        resolve(r);
      } catch (e) { reject(e); }
      finally { setTimeout(() => { try { w.destroy(); fs.unlinkSync(tmp); } catch {} }, 500); }
    }).catch(reject);
  });
}

// Lay the HTML out as PDF pages of widthMm × heightMm, write it, open it for viewing
async function writePdf(html, widthMm, heightMm, filePath) {
  const data = await withHiddenWindow(html, (w) => w.webContents.printToPDF({
    printBackground: true, preferCSSPageSize: true,
    pageSize: { width: widthMm / 25.4, height: heightMm / 25.4 },
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  }));
  fs.writeFileSync(filePath, data);
  shell.openPath(filePath);
  return filePath;
}

// The Print dialog's Save as PDF (the sheets as laid out): asks for the file itself
ipcMain.handle('export-pdf', async (_e, { html, widthMm, heightMm, defaultName }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName || 'publication.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled) return null;
  return writePdf(html, widthMm, heightMm, r.filePath);
});

// Save As → PDF: the editor already asked for the file
ipcMain.handle('write-pdf', async (_e, { html, widthMm, heightMm, path: p }) => {
  if (typeof p !== 'string' || !/\.pdf$/i.test(p)) throw new Error('Not a PDF file name');
  return writePdf(html, widthMm, heightMm, p);
});

ipcMain.handle('print-html', async (_e, { html, widthMm, heightMm, copies }) => {
  return withHiddenWindow(html, (w) => new Promise((resolve) => {
    w.webContents.print({
      silent: false, printBackground: true, copies: copies || 1,
      margins: { marginType: 'none' },
      pageSize: { width: Math.round(widthMm * 1000), height: Math.round(heightMm * 1000) },
      scaleFactor: 100
    }, (ok, reason) => resolve({ ok, reason }));
  }));
});

ipcMain.handle('export-png', async (_e, { html, widthMm, heightMm, dpi, defaultName }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName || 'page.png', filters: [{ name: 'PNG', extensions: ['png'] }] });
  if (r.canceled) return null;
  const factor = (dpi || 300) / 96;
  const W = Math.round(widthMm / 25.4 * 96 * factor), H = Math.round(heightMm / 25.4 * 96 * factor);
  const tmp = path.join(os.tmpdir(), 'bohpum-png-' + Date.now() + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  const w = new BrowserWindow({ show: false, width: W, height: H, useContentSize: true, enableLargerThanScreen: true, webPreferences: { offscreen: true } });
  try {
    await w.loadFile(tmp);
    w.webContents.setZoomFactor(factor);
    await w.webContents.executeJavaScript('document.fonts.ready.then(()=>new Promise(r=>setTimeout(r,400)))');
    const img = await w.webContents.capturePage({ x: 0, y: 0, width: W, height: H });
    fs.writeFileSync(r.filePath, img.toPNG());
  } finally { w.destroy(); try { fs.unlinkSync(tmp); } catch {} }
  shell.openPath(r.filePath);
  return r.filePath;
});

// ---------- app lifecycle ----------
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on('second-instance', (_e, argv) => {
    const f = argv.slice(1).find(a => /\.(bpum|kbach|pub|odg|fodg|vsdx?|cdr)$/i.test(a));
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); if (f) openPathInRenderer(f); }
  });
  app.whenReady().then(() => {
    // allow listing installed fonts (Font menu)
    const ALLOWED = ['local-fonts', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'];
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOWED.includes(perm)));
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => ALLOWED.includes(perm));
    const f = process.argv.slice(1).find(a => /\.(bpum|kbach|pub|odg|fodg|vsdx?|cdr)$/i.test(a));
    if (f) pendingOpenPath = f;
    buildMenu();
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
