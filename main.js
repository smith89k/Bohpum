// Bohpum - Electron main process
const { app, BrowserWindow, Menu, dialog, ipcMain, shell, session, nativeTheme, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');
const menu = require('./explorer-menu');
const updates = require('./updater');
const reader = require('./reader');

const APP_NAME = 'Bohpum';
const ICON = path.join(__dirname, 'build', 'icon.png'); // the exe, installer and Explorer menu use build/icon.ico
let win = null;
let dirty = false;
let pendingOpenPath = null;
let up = null;              // automatic updates (updater.js), only in the installed app with the key

// Installer hooks (build/installer.nsh): "Bohpum.exe --explorer-menu=install|uninstall|release|add-package" sets up
// the File Explorer right-click menu and exits — before the single-instance lock, with no window.
const menuCmd = (process.argv.find(a => a.startsWith('--explorer-menu=')) || '').slice('--explorer-menu='.length);
if (menuCmd) {
  const res = path.join(process.resourcesPath, 'explorer-menu');
  process.exit(app.isPackaged ? menu.runCommand(menuCmd, {
    installDir: path.dirname(process.execPath), exe: process.execPath,
    dll: path.join(res, 'BohpumMenu.dll'), msix: path.join(res, menu.PKG + '.msix'),
    silent: process.argv.includes('--silent')
  }) : 2);   // 2: only the installed app can register the menu
}

// ---------- settings ----------
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
function loadSettings() {
  try { return JSON.parse(fs.readFileSync(settingsFile(), 'utf8')); } catch { return {}; }
}
function saveSettings(s) {
  try { fs.mkdirSync(path.dirname(settingsFile()), { recursive: true }); fs.writeFileSync(settingsFile(), JSON.stringify(s, null, 2)); } catch (e) { console.error(e); }
}
// File windows start where you last worked: 'lastDir' is the folder of the last publication opened or saved,
// 'lastImageDir' of the last picture inserted. Without one (or when it is gone) Windows chooses.
function rememberDir(key, file) { if (!file) return; const s = loadSettings(); s[key] = path.dirname(file); saveSettings(s); }
function startIn(key, name) {
  const d = loadSettings()[key];
  if (!d || !fs.existsSync(d)) return name;
  return name ? path.join(d, path.basename(name)) : d;
}

// ---------- LibreOffice (used only to read .pub and other foreign formats, never shown in the UI) ----------
// The Publisher reader (reader.js): a trimmed LibreOffice downloaded once, after asking; a LibreOffice installed on
// the PC needs no download. %TEMP%\Bohpum\update.log gets the update checks' and the downloads' problems.
const updateLog = updates.logTo(path.join(os.tmpdir(), 'Bohpum', 'update.log'));
// Tests only (never in the installed app): BOHPUM_READER_TEST = { base, pack, key } instead of the files below, and
// no developer vendor\libreoffice, so a test sees only the folders it sets up.
const readerTest = (() => {
  if (app.isPackaged || !process.env.BOHPUM_READER_TEST) return null;
  try { return JSON.parse(process.env.BOHPUM_READER_TEST); } catch { return null; }
})();
const readText = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const READER = readerTest ? {
  base: reader.readBaseUrl('url: ' + (readerTest.base || '')), pack: reader.parsePackInfo(JSON.stringify(readerTest.pack || null)),
  key: updates.parseUpdateConfig(JSON.stringify(readerTest.key || null))
} : {
  // written into the app by the release job (.github/workflows/release.yml); the address is the updates' own
  base: app.isPackaged ? reader.readBaseUrl(readText(path.join(process.resourcesPath, 'app-update.yml'))) : null,
  pack: reader.readPackInfo(path.join(__dirname, 'reader-pack.json')),
  key: updates.readUpdateConfig(path.join(__dirname, 'update-config.json'))
};
READER.root = reader.readerRoot(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'));
READER.canDownload = !!(READER.key && READER.pack && READER.base);
const fileThere = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
// in `pnpm start`: the developer's copy from scripts/bundle-libreoffice.js
function devSoffice() {
  const p = path.join(__dirname, 'vendor', 'libreoffice', 'program', 'soffice.exe');
  return !app.isPackaged && !readerTest && fileThere(p) ? p : null;
}
// a LibreOffice installed on the PC
function installedSoffice() {
  const candidates = [];
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
// → { soffice, need }: need 'download' (none to read with) or 'newer' (an older pack works; only offered when this
// copy can download the newer one), else null
function chooseReader() {
  const r = reader.chooseReader({ root: READER.root, pack: READER.pack, dev: devSoffice(), installed: installedSoffice() });
  return r.need === 'newer' && !READER.canDownload ? { soffice: r.soffice, need: null } : r;
}
// One download at a time, shared by the editor and the convert window (each window = one caller)
const readerService = reader.createReaderService({
  download: (onProgress, signal) => reader.downloadPack({
    fetch: (...a) => net.fetch(...a),   // Electron's network: the PC's proxy settings, as electron-updater
    url: reader.packUrl(READER.base, READER.pack), headers: updates.keyHeaders(READER.key), pack: READER.pack, root: READER.root, onProgress, signal
  }).then(() => {
    updateLog('reader downloaded: ' + READER.pack.name);
    if (loJobs === 0) reader.cleanStale(READER.root, READER.pack.name);   // older packs, unless one is reading
  }, (e) => { if (e !== reader.CANCELLED) updateLog('reader download: ' + (e.code || '') + ' ' + (e.message || e)); throw e; })
});

// One conversion at a time: the editor and the Explorer menu's convert window share LibreOffice's profile.
// job: step('waiting') when files are ahead of it, step('reading') on its turn; cancelled before its turn it never
// starts, and stopRead() ends it while LibreOffice reads (the editor's progress box: Cancel).
let loQueue = Promise.resolve(), loJobs = 0;
const CANCELLED = new Error('cancelled');
function convertWithLibreOffice(inputPath, job = {}, soffice) {
  if (loJobs++) job.step?.('waiting');
  const run = loQueue.then(() => {
    if (job.cancelled) throw CANCELLED;
    job.step?.('reading');
    return convertOne(inputPath, job, soffice);
  });
  loQueue = run.then(() => {}, () => {}).then(() => { loJobs--; });
  return run;
}
function stopRead(job) {
  job.cancelled = true;
  const child = job.child; if (!child) return;
  // soffice.exe only starts soffice.bin and waits for it: end both, or the one left keeps the profile busy
  if (process.platform === 'win32' && child.pid) execFile('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true }, () => {});
  else child.kill();
}
function convertOne(inputPath, job, soffice) {
  return new Promise((resolve, reject) => {
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
    job.child = execFile(soffice, args, { timeout: 180000, windowsHide: true }, (err) => {
      job.child = null;
      const out = path.join(tmp, 'input.fodg');
      if (job.cancelled) { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} return reject(CANCELLED); }
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

// ---------- theme ----------
// System / Light / Dark, chosen with the toolbar's theme button (the page owns the choice) and saved in
// settings.json. nativeTheme.themeSource switches the page's CSS (prefers-color-scheme) and Windows' parts.
const THEMES = ['system', 'light', 'dark'];
// Title-row colours for Windows' ─ □ ✕: --chrome / --ink of src/tokens.css, light and dark (keep in sync)
const BAR_COLORS = { light: { color: '#f7f5f1', symbolColor: '#23201b' }, dark: { color: '#1f1d1b', symbolColor: '#ece8e2' } };
const barColors = () => BAR_COLORS[nativeTheme.shouldUseDarkColors ? 'dark' : 'light'];
function paintBar() { if (win) win.setTitleBarOverlay(barColors()); }
function applyTheme(t) {
  nativeTheme.themeSource = t;
  const item = Menu.getApplicationMenu()?.getMenuItemById('theme-' + t);
  if (item) item.checked = true;
  paintBar();
}

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    title: APP_NAME, icon: ICON,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1d1b' : '#e9e7e2',
    // Own title row (src/index.html #titlebar): Windows only draws ─ □ ✕ over its right end, in the row's
    // colours (--chrome / --ink in src/tokens.css — keep in sync). 36 = the row without its 1 px bottom line.
    titleBarStyle: 'hidden',
    titleBarOverlay: { ...barColors(), height: 36 },
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  // Open maximized; 1400×900 stays as the size used when the user restores the window.
  // Maximize before loading so the editor fits the page to the full-size window.
  win.maximize();
  bringUp(win);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  // Unsaved changes: the page asks in its own box (Save / Don't save / Cancel, as in Sastra PDF) and closes
  // through 'close-now'. It must be visible for that, e.g. when closed from the taskbar.
  win.on('close', (e) => {
    if (!dirty) return;
    e.preventDefault();
    if (win.isMinimized()) win.restore();
    win.focus();
    send('close-request');
  });
  // Links (the About page) open in the normal browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('did-finish-load', () => {
    if (pendingOpenPath) { openPathInRenderer(pendingOpenPath); pendingOpenPath = null; }
  });
  win.on('closed', () => { win = null; dirty = false; }); // the convert window may still be open
}

function send(cmd) { if (win) win.webContents.send('menu', cmd); }

// Windows won't let a program in the background take the front (its taskbar button only flashes), e.g. when
// Bohpum was already running behind another program. A moment "always on top" still brings the window up.
function bringUp(w) {
  if (w.isMinimized()) w.restore();
  w.setAlwaysOnTop(true); w.show(); w.focus(); w.setAlwaysOnTop(false);
}

// ---------- File Explorer menu "Convert to Bohpum" (BohpumMenu.dll → --bohpum-task / --bohpum-list) ----------
// A small window converts the files (src/task.html); it never opens or touches the editor.
let taskWin = null, taskReady = false, taskQueue = [];
const TASK_W = 440;
// true when argv is a menu click (handled, or nothing to do because its files are gone)
function handleTask(argv) {
  const t = menu.parseTaskArgs(argv); if (!t) return false;
  const paths = menu.readTaskList(t.list);
  if (!paths.length) return true;
  taskQueue.push({ task: t.task, paths }); openTaskWindow(); flushTasks();
  return true;
}
function openTaskWindow() {
  if (taskWin) { bringUp(taskWin); return; }
  taskReady = false;
  taskWin = new BrowserWindow({
    // no Windows title bar: it looks like Bohpum's own boxes (drag it anywhere; Cancel / Close / Esc close it)
    frame: false, width: TASK_W, height: 140, useContentSize: true, resizable: false, maximizable: false, fullscreenable: false,
    title: APP_NAME, icon: ICON, backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1d1b' : '#f7f5f1', show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false }
  });
  taskWin.setMenu(null);
  taskWin.once('ready-to-show', () => bringUp(taskWin));
  taskWin.loadFile(path.join(__dirname, 'src', 'task.html'));
  taskWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  taskWin.webContents.on('will-navigate', (e) => e.preventDefault());
  taskWin.on('closed', () => { taskWin = null; taskReady = false; taskQueue = []; });
}
function flushTasks() { if (taskWin && taskReady) for (const b of taskQueue.splice(0)) taskWin.webContents.send('task-batch', b); }
ipcMain.on('task-ready', (e) => { if (taskWin && e.sender === taskWin.webContents) { taskReady = true; flushTasks(); } });
// a question in the convert window ("already there"): bring it up so it's seen
ipcMain.on('task-focus', (e) => { if (taskWin && e.sender === taskWin.webContents) bringUp(taskWin); });
// The window is as tall as its contents (task.js measures them): small while working, taller with problems
ipcMain.on('task-size', (e, h) => {
  if (taskWin && e.sender === taskWin.webContents && Number.isFinite(h)) taskWin.setContentSize(TASK_W, Math.max(100, Math.min(420, Math.ceil(h))));
});

// Names already there (the convert window asks Replace / Keep both / Cancel in its own box): as Sastra PDF.
const exists = (p) => fs.promises.access(p).then(() => true, () => false);
const numbered = (name, k) => { const ext = path.extname(name); return `${name.slice(0, name.length - ext.length)} (${k})${ext}`; };
// groups = [{ dir, names }] → file names only (never a path); the same name twice in one group gets " (2)", like Explorer
function nameGroups(groups) {
  return (Array.isArray(groups) ? groups : []).map(g => {
    const seen = new Set(), names = (Array.isArray(g.names) ? g.names : []).map(n => {
      const base = path.basename(String(n)); let name = base, k = 1;
      while (seen.has(name.toLowerCase())) name = numbered(base, ++k);
      seen.add(name.toLowerCase()); return name;
    });
    return { dir: String(g.dir), names, seen };
  });
}
async function clashesOf(gs) {
  const clash = [];
  for (const g of gs) for (const n of g.names) if (await exists(path.join(g.dir, n))) clash.push({ g, n });
  return clash;
}
// → { count: 0 } or { count, message, detail } for the window's question
ipcMain.handle('name-clashes', async (_e, groups) => {
  const gs = nameGroups(groups), clash = await clashesOf(gs);
  if (!clash.length) return { count: 0 };
  const dirs = new Set(gs.map(g => g.dir.toLowerCase())).size;
  return {
    count: clash.length,
    message: clash.length === 1 ? `"${clash[0].n}" is already in ${dirs > 1 ? 'its folder' : 'this folder'}.` : `${clash.length} of these files are already in ${dirs > 1 ? 'their folders' : 'this folder'}.`,
    detail: 'Replace them, or keep both? With Keep both the new files get a number added to their name.'
  };
});
// choice 'keep': a clashing name gets the first free " (n)"; otherwise (replace / no clash) names stay → final names per group
ipcMain.handle('resolve-names', async (_e, groups, choice) => {
  const gs = nameGroups(groups);
  const clash = choice === 'keep' ? await clashesOf(gs) : [];
  const out = [];
  for (const g of gs) {
    const list = [];
    for (const n of g.names) {
      let name = n;
      if (clash.some(c => c.g === g && c.n === n)) {
        let k = 1;
        do name = numbered(n, ++k); while (g.seen.has(name.toLowerCase()) || await exists(path.join(g.dir, name)));
        g.seen.add(name.toLowerCase());
      }
      list.push(name);
    }
    out.push(list);
  }
  return out;
});

function buildMenu() {
  // The menu is never drawn as a row (own title row, menus pop up from it), so the page's keydown
  // handler owns every shortcut; the menu only shows them.
  const noReg = { registerAccelerator: false };
  const template = [
    { label: 'File', submenu: [
      { label: 'New…', accelerator: 'CmdOrCtrl+N', ...noReg, click: () => send('new') },
      { label: 'Open…', accelerator: 'CmdOrCtrl+O', ...noReg, click: () => send('open') },
      { type: 'separator' },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', ...noReg, click: () => send('save') },
      { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', ...noReg, click: () => send('save-as') },
      { type: 'separator' },
      { label: 'Export Page as PNG…', click: () => send('export-png') },
      { label: 'Print…', accelerator: 'CmdOrCtrl+P', ...noReg, click: () => send('print') },
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
      { label: 'Maximize Page Area', accelerator: 'F', ...noReg, click: () => send('maximize') },
      { label: 'Theme', submenu: THEMES.map(t => ({ id: 'theme-' + t, label: t[0].toUpperCase() + t.slice(1), type: 'radio', click: () => send('theme-' + t) })) },
      { type: 'separator' },
      { role: 'toggleDevTools' }
    ]},
    { label: 'Help', submenu: [
      { label: 'Check for Updates…', click: () => send('check-updates') }, // the page asks main ('check-updates' IPC)
      { label: "What's New", click: () => send('whats-new') }, // the page's What's new window (src/notes.js)
      { label: 'About ' + APP_NAME, click: () => send('about') } // the page shows its own About page
    ]}
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

const FOREIGN = ['.pub', '.odg', '.vsd', '.vsdx', '.cdr', '.wpg', '.cmx', '.p65', '.pmd', '.qxd', '.zmf'];

// opts.oldReader: the user said Not now to a newer Publisher reader, so an older one reads it.
// → the document, or { needReader: 'download'|'newer' } when the page must ask first (LibreOffice isn't started)
async function readAnyDocument(p, job, opts = {}) {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.bpum' || ext === '.kbach' || ext === '.json') return { kind: 'bpum', text: fs.readFileSync(p, 'utf8'), path: p };
  if (ext === '.fodg') return { kind: 'fodg', text: fs.readFileSync(p, 'utf8'), path: p };
  const r = chooseReader();
  if (r.need === 'download' || (r.need === 'newer' && !opts.oldReader)) return { needReader: r.need };
  const xml = await convertWithLibreOffice(p, job, r.soffice);
  return { kind: 'fodg', text: xml, path: p };
}

function openPathInRenderer(p) {
  win.webContents.send('open-path', p);
}

// ---------- IPC ----------
ipcMain.handle('open-dialog', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Open publication', properties: ['openFile'], defaultPath: startIn('lastDir'),
    filters: [
      { name: 'All supported', extensions: ['bpum', 'kbach', 'pub', 'odg', 'fodg', 'vsd', 'vsdx', 'cdr', 'p65', 'pmd', 'qxd'] },
      { name: 'Bohpum', extensions: ['bpum', 'kbach'] },
      { name: 'Microsoft Publisher', extensions: ['pub'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  return r.canceled ? null : r.filePaths[0];
});

// Each window's file being read: the editor's progress box shows its steps ('read-step') and its Cancel stops it
const reading = new Map(); // webContents id → job (see convertWithLibreOffice)
ipcMain.handle('read-document', async (e, p, opts) => {
  if (!fs.existsSync(p)) return { error: 'The file was moved or deleted.', missing: true };
  rememberDir('lastDir', p); // also files opened from Explorer, Recent or a drop
  const id = e.sender.id, job = { step: (s) => { if (!e.sender.isDestroyed()) e.sender.send('read-step', s); } };
  reading.set(id, job);
  try { return await readAnyDocument(p, job, { oldReader: !!(opts && opts.oldReader) }); }
  catch (err) { return err === CANCELLED ? { cancelled: true } : { error: String(err && err.message || err) }; }
  finally { if (reading.get(id) === job) reading.delete(id); }
});
ipcMain.on('cancel-read', (e) => { const job = reading.get(e.sender.id); if (job) stopRead(job); });

// The Publisher reader: is one needed (and can this copy download it)? Then the download, its progress and Cancel.
ipcMain.handle('reader-status', () => {
  const { need } = chooseReader();
  return { need, size: READER.pack ? READER.pack.size : null, canDownload: READER.canDownload,
    why: need === 'download' && !READER.canDownload ? reader.READER_TEXT['no-key'] : null };
});
ipcMain.handle('reader-get', (e) => {
  if (!READER.canDownload) return { error: reader.READER_TEXT['no-key'] };
  const wc = e.sender;
  return readerService.get(wc.id, (p) => { if (!wc.isDestroyed()) wc.send('reader-progress', p); });
});
ipcMain.on('reader-cancel', (e) => readerService.cancel(e.sender.id));

// Automatic updates (updater.js). The page asks about unsaved changes BEFORE install-update: quitAndInstall starts the
// installer at once and it closes the app by force, so nothing may be left to ask by then.
ipcMain.handle('check-updates', () => up ? up.checkNow() : { kind: 'dev' });
ipcMain.handle('install-update', () => {
  const block = updates.installBlock({ downloaded: up && up.downloaded(), taskOpen: !!taskWin, readerBusy: readerService.busy() });
  if (block) return { ok: false, reason: block };
  const was = dirty;
  dirty = false;   // before: the window's close guard must not stop the quit a moment after the installer starts
  if (up.install()) return { ok: true };
  dirty = was;     // it didn't start: closing must ask about unsaved changes again
  return { ok: false, reason: 'failed' };
});

ipcMain.handle('save-dialog', async (_e, { defaultName, filters }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: startIn('lastDir', defaultName), filters });
  if (r.canceled) return null;
  rememberDir('lastDir', r.filePath);
  return r.filePath;
});

// true, or { error } in plain words (the page shows it)
ipcMain.handle('write-file', async (_e, { path: p, text, base64 }) => {
  try {
    if (base64 != null) fs.writeFileSync(p, Buffer.from(base64, 'base64'));
    else fs.writeFileSync(p, text, 'utf8');
    return true;
  } catch (err) {
    const c = err && err.code;
    return { error: c === 'EACCES' || c === 'EPERM' ? 'no permission to save there' : c === 'ENOSPC' ? 'the disk is full'
      : c === 'EBUSY' ? 'the file is open in another program' : c === 'ENOENT' ? 'its folder is gone' : String(err && err.message || err) };
  }
});

ipcMain.handle('pick-images', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Insert picture', properties: ['openFile', 'multiSelections'], defaultPath: startIn('lastImageDir'),
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg'] }] });
  if (r.canceled) return [];
  rememberDir('lastImageDir', r.filePaths[0]);
  return r.filePaths.map(p => {
    const ext = path.extname(p).slice(1).toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : 'image/' + ext;
    return { name: path.basename(p), dataUrl: 'data:' + mime + ';base64,' + fs.readFileSync(p).toString('base64') };
  });
});

ipcMain.handle('app-info', () => ({ version: app.getVersion(), electron: process.versions.electron }));
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('set-settings', (_e, patch) => { const s = { ...loadSettings(), ...patch }; saveSettings(s); return s; });


ipcMain.on('set-dirty', (_e, v) => { dirty = !!v; });
ipcMain.on('set-title', (_e, t) => { if (win) win.setTitle(t); });
ipcMain.on('set-theme', (_e, t) => {
  if (!THEMES.includes(t)) return;
  applyTheme(t);
  saveSettings({ ...loadSettings(), theme: t });
});
nativeTheme.on('updated', paintBar); // System: Windows switched light ↔ dark
ipcMain.on('close-now', () => { dirty = false; if (win) win.close(); });
// A menu word in the title row (or Alt+letter / F10): that application menu drops down under it.
// x, y = the word's bottom-left in page pixels. Resolves when the menu closes.
ipcMain.handle('show-menu', (e, index, x, y) => new Promise((resolve) => {
  const item = Menu.getApplicationMenu()?.items[index | 0];
  if (!win || e.sender !== win.webContents || !item || !item.submenu) return resolve(false);
  item.submenu.popup({ window: win, x: Math.max(0, Math.round(+x) || 0), y: Math.max(0, Math.round(+y) || 0), callback: () => resolve(true) });
}));

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
  const r = await dialog.showSaveDialog(win, { defaultPath: startIn('lastDir', defaultName || 'publication.pdf'), filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled) return null;
  rememberDir('lastDir', r.filePath);
  return writePdf(html, widthMm, heightMm, r.filePath);
});

// Save As → PDF: the editor already asked for the file
ipcMain.handle('write-pdf', async (_e, { html, widthMm, heightMm, path: p }) => {
  if (typeof p !== 'string' || !/\.pdf$/i.test(p)) throw new Error('Not a PDF file name');
  return writePdf(html, widthMm, heightMm, p);
});

// ---------- printing: straight to the printer chosen in the Print dialog (no Windows dialog) ----------
const SHEET_NAMES = ['A4', 'A3', 'A5', 'Letter', 'Legal'];
async function printerList() {
  if (!win) return [];
  return (await win.webContents.getPrintersAsync()).map(p => ({ name: p.name, displayName: p.displayName || p.name, isDefault: !!p.isDefault }));
}
ipcMain.handle('printers', () => printerList());
// Windows' "Printing preferences" for one printer; changes there become that printer's defaults
ipcMain.handle('printer-prefs', async (_e, name) => {
  if (!(await printerList()).some(p => p.name === name)) return false;
  execFile('rundll32.exe', ['printui.dll,PrintUIEntry', '/e', '/n', name], () => {});
  return true;
});
// sheet: a named paper (the page turns landscape sheets itself, so landscape is always false here),
// or null for "Page size = paper size" (custom size in microns)
ipcMain.handle('print-html', async (_e, { html, sheet, widthMm, heightMm, copies, deviceName }) => {
  if (!(await printerList()).some(p => p.name === deviceName)) return { ok: false, reason: 'that printer is not installed any more' };
  const named = SHEET_NAMES.includes(sheet);
  if (!named && !(+widthMm > 0 && +heightMm > 0)) return { ok: false, reason: 'unknown paper size' };
  const pageSize = named ? sheet : { width: Math.round(+widthMm * 1000), height: Math.round(+heightMm * 1000) };
  return withHiddenWindow(html, (w) => new Promise((resolve) => {
    w.webContents.print({
      silent: true, deviceName, printBackground: true, landscape: false,
      copies: Math.min(999, Math.max(1, copies | 0)),
      margins: { marginType: 'none' }, pageSize, scaleFactor: 100
    }, (ok, reason) => resolve({ ok, reason }));
  }));
});

ipcMain.handle('export-png', async (_e, { html, widthMm, heightMm, dpi, defaultName }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: startIn('lastDir', defaultName || 'page.png'), filters: [{ name: 'PNG', extensions: ['png'] }] });
  if (r.canceled) return null;
  rememberDir('lastDir', r.filePath);
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
    if (handleTask(argv)) return; // Explorer menu: the convert window, the editor stays as it is
    const f = argv.slice(1).find(a => /\.(bpum|kbach|pub|odg|fodg|vsdx?|cdr)$/i.test(a));
    if (!win) { pendingOpenPath = f || null; createWindow(); return; } // only the convert window was open
    bringUp(win);
    if (f) openPathInRenderer(f);
  });
  app.whenReady().then(() => {
    // allow listing installed fonts (Font menu)
    const ALLOWED = ['local-fonts', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen'];
    session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOWED.includes(perm)));
    session.defaultSession.setPermissionCheckHandler((_wc, perm) => ALLOWED.includes(perm));
    buildMenu();
    const t = loadSettings().theme;
    applyTheme(THEMES.includes(t) ? t : 'system'); // before the window exists: no light flash in Dark
    if (app.isPackaged) menu.cleanOld(path.dirname(process.execPath)); // menu DLLs moved aside by an update
    reader.cleanStale(READER.root, READER.pack && READER.pack.name); // a download the PC was turned off in, older packs
    // Started by the Explorer menu: only the convert window (Bohpum quits when it closes)
    if (handleTask(process.argv)) { if (!taskWin) app.quit(); return; }
    const f = process.argv.slice(1).find(a => /\.(bpum|kbach|pub|odg|fodg|vsdx?|cdr)$/i.test(a));
    if (f) pendingOpenPath = f;
    createWindow();
    // a right-click job alone (above) never checks; electron-updater is loaded only here. The update address is locked:
    // only a copy built by the release job carries the key (update-config.json), so a copy without it doesn't check.
    if (updates.updatesRunHere({ packaged: app.isPackaged, platform: process.platform })) {
      if (!READER.key) updateLog('no update key (update-config.json): this copy does not check for updates');
      else up = updates.createUpdater({
        updater: require('electron-updater').autoUpdater, current: app.getVersion(), key: READER.key, log: updateLog,
        send: (channel, v) => { if (win) win.webContents.send(channel, v); }
      });
    }
  });
  app.on('window-all-closed', () => app.quit());
}
