# Own Title Bar, Green Theme, Direct Printing, Save As PDF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bohpum gets its own title row with menus, a jade-green accent, a Print dialog that picks the printer and prints straight to it, and PDF as a file type in Save As.

**Architecture:** Electron app, no framework: `main.js` (window, menus, IPC, printing), `preload.js` (the `window.api` bridge), `src/` (plain ES modules + one CSS file). The title row is HTML drawn by the page with Windows' caption buttons laid over it (`titleBarOverlay`); keyboard shortcuts move from the (now hidden) Windows menu into the page's keydown handler. Printing stays "render HTML in a hidden window", but with `silent: true` and a `deviceName`.

**Tech Stack:** Electron ^44.8.0, plain JavaScript (CommonJS in main, ES modules in `src/`), CSS. Tests: Electron scripts in `tests/` that load the real `main.js` and drive the window (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-16-titlebar-theme-print-saveas-design.md`

## Global Constraints

- Windows only (the app ships as an NSIS installer). Electron ^44.8.0. No new dependencies.
- Accent `#1f7a4c`, accent-soft `#e6f2eb`; derived tints `#186240` (primary hover), `#b7d9c4` (.btn.on border), `#b9dcc6` (field focus outline), `#cfe8d9` (focus shadows), `rgba(31,122,76,…)` for translucent fills. None of `#9a3412 #7f2a0e #fbeee6 #e7c2ad #f0c7b2 #f3d2c2 rgba(154,52,18,…)` may remain.
- Title row: 37 px tall including its 1 px bottom line; `titleBarOverlay: { color: '#f7f5f1', symbolColor: '#23201b', height: 36 }`.
- Menu indexes: File 0, Edit 1, Insert 2, Arrange 3, View 4, Help 5. Alt+F/E/I/A/V/H open them; F10 opens File.
- UI text exactly: "Close", "Save as PDF", "Print" (no ellipsis), "Properties", "Finding printers…", "No printers installed", "Sending to <printer>…", "Sent N sheet(s) to <printer>", "Print failed: <reason>", "Saved <file>.pdf". Section headings: "Printer", "Paper", "Layout", "Pages", "Printer adjustment".
- Save As file types: "Bohpum publication" (`bpum`) and "PDF" (`pdf`); plain Save offers only "Bohpum publication".
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests never print on paper and never open real Windows dialogs (stub them in the test's `setup`).

## File map

| File | Responsibility | Tasks |
|---|---|---|
| `tests/harness.js` (new) | Boots real `main.js` with a throwaway profile; real key/mouse input helpers; PASS/FAIL output | 1 |
| `tests/run.js` (new) | Runs each `tests/*.test.js` in its own Electron process | 1 |
| `tests/print-position.test.js` (new) | Print dialog keeps position after Esc / Close | 1 |
| `tests/theme.test.js` (new) | Green accent | 2 |
| `tests/save-as.test.js` (new) | Save As → PDF / .bpum | 3 |
| `tests/titlebar.test.js` (new) | Title row, menus, shortcuts | 4 |
| `tests/print-direct.test.js` (new) | Printer picker, direct print, landscape turn | 5 |
| `package.json` | `test` script | 1 |
| `src/app.css` | Theme tokens, title row, print column | 2, 4, 5 |
| `src/index.html` | Title row markup, toolbar | 3, 4 |
| `src/app.js` | Save As, title text, menus, keyboard | 2, 3, 4 |
| `src/print.js` | Print dialog, output HTML | 1 (already edited), 5 |
| `main.js` | Window, menu, IPC for menus / PDF / printers | 3, 4, 5 |
| `preload.js` | `showMenu`, `writePdf`, `printers`, `printerPrefs` | 3, 4, 5 |
| `README.md` | User-facing feature list | 6 |

---

### Task 1: Test harness, runner, and the print-position test

`src/print.js` already holds an uncommitted fix (Esc / Close keep the print position). It was shown failing before the fix and passing after with a scratch script; this task turns that script into the project's first test and commits fix + test together.

**Files:**
- Create: `tests/harness.js`
- Create: `tests/run.js`
- Create: `tests/print-position.test.js`
- Modify: `package.json` (scripts)
- Commit (already modified): `src/print.js`

**Interfaces:**
- Produces: `require('./harness')` → `{ run, sleep, ROOT }`.
  - `run(test, { setup?, timeout? })`: `setup(ctx)` runs before `main.js` loads (stub Electron APIs there); `test(t, check)` is `async`.
  - `ctx` / `t.ctx`: `{ userData: string, tmp: string }` (`tmp` = empty folder for output files).
  - `check(name: string, pass: any, detail?: any)`.
  - `t`: `{ win, wc, js(code) → Promise<any>, waitFor(code, ms=8000), key(keyCode, modifiers=[]), click(selector), drag(selector, dx, dy), center(selector) → {x,y}|null, ready(sample='test-shapes.fodg' | null), sleep(ms), ctx, ROOT }`.
  - `t.ready()` closes the welcome screen with Esc and opens `samples/test-shapes.fodg` (one 110 × 60 mm page, name `test-shapes`, unsaved = false). `t.ready(null)` only closes the welcome screen.
  - Renderer hooks used by tests (already in `src/app.js`): `window.__bohpumApp.cmd(name)`, `.openFile(path)`, `.state` (= `S`: `doc`, `path`, `dirty`, `hist`, …).

- [ ] **Step 1: Write the harness**

Create `tests/harness.js`:

```js
// Test harness: starts the real Bohpum (main.js) in Electron with a throwaway profile, then lets a
// test drive the window with real key and mouse input. Each tests/*.test.js calls run(); tests/run.js
// starts one Electron per file. Output: one "PASS name" / "FAIL name {detail}" line per check.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function run(test, { setup, timeout = 90000 } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-test-'));
  app.setPath('userData', userData); // never touches the user's real settings
  const ctx = { userData, tmp: fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-out-')) };
  const results = [];
  const check = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); };
  let started = false, finished = false;
  const finish = () => {
    if (finished) return; finished = true;
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '  ' + JSON.stringify(r.detail)}`);
    try { fs.rmSync(ctx.tmp, { recursive: true, force: true }); } catch {}
    app.exit(results.length && results.every(r => r.pass) ? 0 : 1); // exit() skips the "save changes?" prompt
  };
  if (setup) setup(ctx);
  app.on('browser-window-created', (_e, win) => {
    if (started) return; started = true; // the editor window; later ones are hidden print windows
    win.webContents.once('did-finish-load', () => test(driver(win, ctx), check).then(finish, (err) => {
      check('test ran to the end', false, String(err && err.stack || err)); finish();
    }));
  });
  setTimeout(() => { check('test finished in time', false, `over ${timeout} ms`); finish(); }, timeout);
  require(path.join(ROOT, 'main.js'));
}

function driver(win, ctx) {
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code, true);
  const waitFor = async (code, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await js(code)) return; await sleep(100); }
    throw new Error('timed out waiting for: ' + code);
  };
  const center = (selector) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await sleep(250);
  };
  const click = async (selector) => {
    const c = await center(selector);
    if (!c) throw new Error('nothing to click: ' + selector);
    wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y });
    wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await sleep(250);
  };
  const drag = async (selector, dx, dy) => {
    const c = await center(selector);
    if (!c) throw new Error('nothing to drag: ' + selector);
    wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y });
    wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
      wc.sendInputEvent({ type: 'mouseMove', x: Math.round(c.x + dx * i / 12), y: Math.round(c.y + dy * i / 12), modifiers: ['leftButtonDown'] });
      await sleep(25);
    }
    wc.sendInputEvent({ type: 'mouseUp', x: c.x + dx, y: c.y + dy, button: 'left', clickCount: 1 });
    await sleep(250);
  };
  // Closes the welcome screen and opens samples/<sample> (or only closes it when sample is null)
  const ready = async (sample = 'test-shapes.fodg') => {
    win.focus(); wc.focus();
    await waitFor('!!window.__bohpumApp && !!document.querySelector(".modal-back")');
    await key('Escape');
    await waitFor('!document.querySelector(".modal-back")');
    if (!sample) return;
    await js(`window.__bohpumApp.openFile(${JSON.stringify(path.join(ROOT, 'samples', sample))})`);
    await waitFor(`window.__bohpumApp.state.doc.name === ${JSON.stringify(sample.replace(/\.[^.]+$/, ''))} && !window.__bohpumApp.state.dirty`);
  };
  return { win, wc, js, waitFor, key, click, drag, center, ready, sleep, ctx, ROOT };
}

module.exports = { run, sleep, ROOT };
```

- [ ] **Step 2: Write the runner and the npm script**

Create `tests/run.js`:

```js
// Runs each tests/*.test.js (or the files given) in its own Electron process: npm test [-- file …]
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const electron = require('electron'); // from plain Node this is the path to electron.exe

const files = process.argv.length > 2
  ? process.argv.slice(2).map(f => path.resolve(f))
  : fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(__dirname, f));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let failed = 0;
for (const f of files) {
  console.log('\n# ' + path.basename(f));
  const r = spawnSync(electron, [f], { stdio: 'inherit', env });
  if (r.status !== 0) { failed++; console.log(`# ${path.basename(f)} FAILED (exit ${r.status})`); }
}
console.log(failed ? `\n${failed} of ${files.length} test files failed` : `\nAll ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
```

In `package.json`, change the `scripts` block to:

```json
  "scripts": {
    "start": "electron .",
    "test": "node tests/run.js",
    "bundle-libreoffice": "node scripts/bundle-libreoffice.js",
    "dist": "node scripts/bundle-libreoffice.js && electron-builder --win nsis"
  },
```

(`build.files` lists only `main.js`, `preload.js`, `src/**/*`, so `tests/` never ships.)

- [ ] **Step 3: Write the print-position test**

Create `tests/print-position.test.js`:

```js
// Print dialog: the card position (and other settings) survive Esc / Close, and only real changes count as edits.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const readPos = () => t.js(`(() => { const l = document.querySelector('[data-k="left"]'), p = document.querySelector('[data-k="top"]'); return l && p ? { left: +l.value, top: +p.value } : null; })()`);
  const docState = () => t.js(`(() => { const S = window.__bohpumApp.state; return { dirty: S.dirty, hist: S.hist.length, print: S.doc.print && { left: S.doc.print.left, top: S.doc.print.top } }; })()`);
  const openPrint = async () => {
    await t.js('window.__bohpumApp.cmd("print")');
    await t.waitFor('!!document.querySelector(".print-preview .slot")');
    await t.sleep(300);
  };
  const dialogOpen = () => t.js('!!document.querySelector(".print-preview")');

  const before = await docState();
  await openPrint();
  await t.key('Escape');
  const after = await docState();
  check('Esc with no changes leaves the publication unchanged', !(await dialogOpen()) && !after.dirty && after.hist === before.hist, { before, after });

  await openPrint();
  const start = await readPos();
  await t.drag('.print-preview .slot', 70, 45);
  const moved = await readPos();
  await t.key('Escape');
  const closed = !(await dialogOpen());
  await openPrint();
  const reopened = await readPos();
  check('Drag then Esc: position kept on reopen',
    closed && (moved.left !== start.left || moved.top !== start.top) && reopened.left === moved.left && reopened.top === moved.top,
    { start, moved, reopened, closed });

  await t.js(`(() => { const i = document.querySelector('[data-k="left"]'); i.value = 12.5; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await t.click('.modal-f [data-a="close"]');
  const closed3 = !(await dialogOpen());
  await openPrint();
  const reopened3 = await readPos();
  await t.key('Escape');
  check('Typed Left then Close: value kept on reopen', closed3 && reopened3.left === 12.5, { reopened3, closed3 });

  const st = await docState();
  await t.js('window.__bohpumApp.cmd("undo")');
  const undone = await docState();
  check('Position change is a normal edit (unsaved, undoable)', st.dirty && undone.print && undone.print.left !== 12.5, { st, undone });
});
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected (a Bohpum window flashes up for a few seconds):
```
# print-position.test.js
PASS  Esc with no changes leaves the publication unchanged
PASS  Drag then Esc: position kept on reopen
PASS  Typed Left then Close: value kept on reopen
PASS  Position change is a normal edit (unsaved, undoable)

All 1 test files passed
```
If PASS lines don't show (only "All 1 test files passed" / "FAILED"), Electron's console output is not reaching the terminal: run `node tests/run.js > out.txt 2>&1` and read `out.txt`.

- [ ] **Step 5: Commit**

```bash
git add tests/harness.js tests/run.js tests/print-position.test.js package.json src/print.js
git commit -m "fix: print dialog keeps the card position after Esc / Close; add Electron test harness

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Green theme

**Files:**
- Create: `tests/theme.test.js`
- Modify: `src/app.css:9-10, 35, 39, 49, 118, 139, 186, 227`
- Modify: `src/app.js:327`

**Interfaces:**
- Consumes: `run`, `t.ready(null)`, `t.js` from Task 1.
- Produces: CSS tokens `--accent: #1f7a4c`, `--accent-soft: #e6f2eb` (Tasks 4 and 5 style with them).

- [ ] **Step 1: Write the failing test**

Create `tests/theme.test.js`:

```js
// The accent is jade green everywhere; nothing red-brown from the old theme is left.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const OLD = ['#9a3412', '#7f2a0e', '#fbeee6', '#e7c2ad', '#f0c7b2', '#f3d2c2', '154,52,18'];

run(async (t, check) => {
  await t.ready(null);
  const c = await t.js(`(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      accent: cs.getPropertyValue('--accent').trim(), soft: cs.getPropertyValue('--accent-soft').trim(),
      printBg: getComputedStyle(document.querySelector('.btn.primary[data-cmd="print"]')).backgroundColor,
      brand: getComputedStyle(document.querySelector('.brand .km')).color
    };
  })()`);
  check('Accent colour is jade green', c.accent === '#1f7a4c' && c.soft === '#e6f2eb', c);
  check('Print button is green', c.printBg === 'rgb(31, 122, 76)', c);
  check('Khmer logo text is green', c.brand === 'rgb(31, 122, 76)', c);

  const files = ['src/app.css', 'src/app.js', 'src/print.js', 'src/index.html', 'main.js'];
  const found = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8').toLowerCase().replace(/\s+/g, '');
    for (const v of OLD) if (text.includes(v)) found.push(`${f}: ${v}`);
  }
  check('No red-brown left in the sources', !found.length, found);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- tests/theme.test.js`
Expected: `FAIL  Accent colour is jade green`, `FAIL  Print button is green`, `FAIL  Khmer logo text is green`, `FAIL  No red-brown left in the sources` (lists `src/app.css: #9a3412` … and `src/app.js: #9a3412`).

- [ ] **Step 3: Change the colours**

In `src/app.css`:

```css
  --accent: #9a3412;        /* lacquer red-brown */
  --accent-soft: #fbeee6;
```
→
```css
  --accent: #1f7a4c;        /* jade green */
  --accent-soft: #e6f2eb;
```

```css
.btn.on { background: var(--accent-soft); border-color: #e7c2ad; color: var(--accent); }
```
→
```css
.btn.on { background: var(--accent-soft); border-color: #b7d9c4; color: var(--accent); }
```

```css
.btn.primary:hover { background: #7f2a0e; }
```
→
```css
.btn.primary:hover { background: #186240; }
```

```css
.field:focus { outline: 2px solid #f0c7b2; outline-offset: -1px; border-color: var(--accent); }
```
→
```css
.field:focus { outline: 2px solid #b9dcc6; outline-offset: -1px; border-color: var(--accent); }
```

```css
.draft { position: absolute; border: 1px dashed var(--accent); background: rgba(154,52,18,.05); pointer-events: none; }
```
→
```css
.draft { position: absolute; border: 1px dashed var(--accent); background: rgba(31,122,76,.05); pointer-events: none; }
```

```css
.numf:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px #f3d2c2; }
```
→
```css
.numf:focus-within { border-color: var(--accent); box-shadow: 0 0 0 2px #cfe8d9; }
```

```css
.preset.on { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 2px #f3d2c2; }
```
→
```css
.preset.on { border-color: var(--accent); background: var(--accent-soft); box-shadow: 0 0 0 2px #cfe8d9; }
```

```css
.drop-hint { position: fixed; inset: 0; border: 3px dashed var(--accent); background: rgba(154,52,18,.06); z-index: 40; pointer-events: none; display: none; align-items: center; justify-content: center; font-size: 18px; color: var(--accent); }
```
→
```css
.drop-hint { position: fixed; inset: 0; border: 3px dashed var(--accent); background: rgba(31,122,76,.06); z-index: 40; pointer-events: none; display: none; align-items: center; justify-content: center; font-size: 18px; color: var(--accent); }
```

In `src/app.js` (ruler mark that follows the mouse):

```js
      g.strokeStyle = '#9a3412'; g.beginPath();
```
→
```js
      g.strokeStyle = '#1f7a4c'; g.beginPath(); // --accent
```

- [ ] **Step 4: Run it to see it pass**

Run: `npm test -- tests/theme.test.js`
Expected: four `PASS` lines, `All 1 test files passed`.

- [ ] **Step 5: Commit**

```bash
git add tests/theme.test.js src/app.css src/app.js
git commit -m "feat: green theme (accent #1f7a4c) so Bohpum no longer looks like Sastra PDF

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Save As → PDF; Export PDF removed

**Files:**
- Create: `tests/save-as.test.js`
- Modify: `main.js` (File menu: remove Export PDF; `export-pdf` handler → `writePdf` helper + new `write-pdf` handler)
- Modify: `preload.js` (add `writePdf`)
- Modify: `src/app.js` (`save`, `exportPdf` → `savePdf`, `cmd`, `ICONS.pdf`)
- Modify: `src/index.html` (toolbar PDF button)

**Interfaces:**
- Consumes: harness from Task 1.
- Produces: `api.writePdf({ html, widthMm, heightMm, path }) → Promise<string>` (main IPC `write-pdf`); main helper `writePdf(html, widthMm, heightMm, filePath)`. `api.exportPdf` (own dialog) stays for the Print dialog's Save as PDF.

- [ ] **Step 1: Write the failing test**

Create `tests/save-as.test.js`:

```js
// Save As offers PDF; a PDF is a copy (the publication keeps its own file); Export PDF is gone.
const { dialog, shell, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

const dialogs = [], opened = [];
let answers = [];

run(async (t, check) => {
  await t.ready();
  await t.js('window.__bohpumApp.cmd("page-add")'); // 2 pages, unsaved
  const state = () => t.js('(() => { const S = window.__bohpumApp.state; return { path: S.path, dirty: S.dirty, name: S.doc.name, pages: S.doc.pages.length }; })()');
  const pdf = path.join(t.ctx.tmp, 'card.pdf'), bpum = path.join(t.ctx.tmp, 'card.bpum'), bpum2 = path.join(t.ctx.tmp, 'again.bpum');

  answers = [pdf];
  await t.js('window.__bohpumApp.cmd("save-as")');
  const st1 = await state();
  const bytes = fs.existsSync(pdf) ? fs.readFileSync(pdf) : null;
  const pdfPages = bytes ? (bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length : 0;
  check('Save As offers Bohpum publication and PDF',
    dialogs[0] && dialogs[0].filters.map(f => `${f.name}:${f.extensions.join()}`).join('|') === 'Bohpum publication:bpum|PDF:pdf', dialogs[0]);
  check('PDF written, one page per publication page', bytes && bytes.slice(0, 4).toString() === '%PDF' && pdfPages === st1.pages, { exists: !!bytes, pdfPages, pages: st1.pages });
  check('PDF leaves the publication as it was', st1.path === null && st1.dirty === true && st1.name === 'test-shapes', st1);
  check('PDF is opened for viewing', opened.includes(pdf), opened);

  answers = [bpum];
  await t.js('window.__bohpumApp.cmd("save-as")');
  const st2 = await state();
  check('Save As .bpum saves the publication', st2.path === bpum && st2.dirty === false && st2.name === 'card' && fs.existsSync(bpum), st2);

  answers = [bpum2];
  await t.js('window.__bohpumApp.state.path = null');
  await t.js('window.__bohpumApp.cmd("save")');
  check('Plain Save offers only Bohpum publication', dialogs[2] && dialogs[2].filters.length === 1 && dialogs[2].filters[0].extensions.join() === 'bpum', dialogs[2]);

  const button = await t.js('!!document.querySelector(\'[data-cmd="export-pdf"]\')');
  const labels = Menu.getApplicationMenu().items[0].submenu.items.map(i => i.label);
  check('Export PDF is gone from the toolbar and the File menu', !button && !labels.some(l => /export pdf/i.test(l)), { button, labels });
}, {
  setup: () => {
    dialog.showSaveDialog = async (_win, opts) => { dialogs.push(opts); const p = answers.shift(); return p ? { canceled: false, filePath: p } : { canceled: true }; };
    shell.openPath = async (p) => { opened.push(p); return ''; };
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- tests/save-as.test.js`
Expected: FAIL on "Save As offers Bohpum publication and PDF" (filters are `Bohpum:bpum`), "PDF written…" (no file), "PDF leaves the publication…" (the .pdf path was saved as a publication), "PDF is opened…", "Export PDF is gone…". "Save As .bpum…" and "Plain Save…" may already pass.

- [ ] **Step 3: Main process — one PDF writer, new `write-pdf`, menu item removed**

In `main.js`, File menu, delete this line:

```js
      { label: 'Export PDF…', accelerator: 'CmdOrCtrl+E', click: () => send('export-pdf') },
```

Replace the whole `ipcMain.handle('export-pdf', …)` block:

```js
ipcMain.handle('export-pdf', async (_e, { html, widthMm, heightMm, defaultName }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName || 'publication.pdf', filters: [{ name: 'PDF', extensions: ['pdf'] }] });
  if (r.canceled) return null;
  const data = await withHiddenWindow(html, (w) => w.webContents.printToPDF({
    printBackground: true, preferCSSPageSize: true,
    pageSize: { width: widthMm / 25.4, height: heightMm / 25.4 },
    margins: { top: 0, bottom: 0, left: 0, right: 0 }
  }));
  fs.writeFileSync(r.filePath, data);
  shell.openPath(r.filePath);
  return r.filePath;
});
```

with:

```js
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
```

In `preload.js`, after the `exportPdf:` line add:

```js
  writePdf: (opts) => ipcRenderer.invoke('write-pdf', opts),
```

- [ ] **Step 4: Editor — Save As handles .pdf; Export PDF removed**

In `src/app.js`, replace:

```js
async function save(as = false) {
  finishEditing();
  let p = S.path;
  if (as || !p || !/\.bpum$/i.test(p)) {
    p = await api.saveDialog({ defaultName: (S.doc.name || 'Untitled') + '.bpum', filters: [{ name: 'Bohpum', extensions: ['bpum'] }] });
    if (!p) return false;
  }
```

with:

```js
async function save(as = false) {
  finishEditing();
  let p = S.path;
  if (as || !p || !/\.bpum$/i.test(p)) {
    // Save As also offers PDF; plain Save (also a first save) only .bpum
    const filters = [{ name: 'Bohpum publication', extensions: ['bpum'] }];
    if (as) filters.push({ name: 'PDF', extensions: ['pdf'] });
    p = await api.saveDialog({ defaultName: (S.doc.name || 'Untitled') + '.bpum', filters });
    if (!p) return false;
    if (/\.pdf$/i.test(p)) { await savePdf(p); return false; } // a copy: the publication itself is not saved
  }
```

Replace the `exportPdf` function:

```js
async function exportPdf() {
  finishEditing();
  const lay = { sw: S.doc.pageW, sh: S.doc.pageH, sheets: S.doc.pages.map((_, i) => [{ pi: i, x: 0, y: 0 }]) };
  const html = buildOutputHtml(S.doc, lay);
  const p = await api.exportPdf({ html, widthMm: lay.sw, heightMm: lay.sh, defaultName: (S.doc.name || 'publication') + '.pdf' });
  if (p) toast('Exported ' + p);
}
```

with:

```js
// Save As → PDF: every page at page size. The publication's own file, name and unsaved state don't change.
async function savePdf(p) {
  const lay = { sw: S.doc.pageW, sh: S.doc.pageH, sheets: S.doc.pages.map((_, i) => [{ pi: i, x: 0, y: 0 }]) };
  const html = buildOutputHtml(S.doc, lay);
  try {
    await api.writePdf({ html, widthMm: lay.sw, heightMm: lay.sh, path: p });
    toast('Saved ' + p.split(/[\\/]/).pop());
  } catch (err) { toast('Could not save the PDF: ' + (err && err.message || err), 6000); }
}
```

In `cmd`, delete:

```js
    case 'export-pdf': return exportPdf();
```

In `ICONS`, delete (only the removed toolbar button used it):

```js
  pdf: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M12 11v6M9 14l3 3 3-3',
```

In `src/index.html`, delete the toolbar button:

```html
      <button class="btn" data-cmd="export-pdf" title="Export PDF (Ctrl+E)"><span data-icon="pdf"></span><span class="lbl">PDF</span></button>
```

- [ ] **Step 5: Run it to see it pass, plus the earlier tests**

Run: `npm test`
Expected: every check in `print-position`, `save-as` and `theme` PASSes; `All 3 test files passed`.

- [ ] **Step 6: Commit**

```bash
git add tests/save-as.test.js main.js preload.js src/app.js src/index.html
git commit -m "feat: Save As can save a PDF; remove the separate Export PDF command

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Own title row with menus; shortcuts handled by the page

**Files:**
- Create: `tests/titlebar.test.js`
- Modify: `main.js` (`createWindow` options, File menu `noReg`, new `show-menu` handler)
- Modify: `preload.js` (add `showMenu`)
- Modify: `src/index.html` (new `#titlebar`, brand moves out of `#topbar`)
- Modify: `src/app.css` (body grid rows, title row styles, no-drag overlays)
- Modify: `src/app.js` (`updateTitle`, `openMenu`, `onKey`, `wire`)

**Interfaces:**
- Consumes: harness (Task 1); `--accent`, `--accent-soft` (Task 2).
- Produces: `api.showMenu(index: number, x: number, y: number) → Promise<boolean>` (resolves when the menu closes); main IPC `show-menu`; renderer `openMenu(i)`; DOM `#titlebar`, `#menus [data-menu="0..5"]`, `#doc-title`.

- [ ] **Step 1: Write the failing test**

Create `tests/titlebar.test.js`:

```js
// Own title row: logo, menu words, publication name, Windows' buttons over the right end; menus
// open from the words, Alt+letter and F10; File shortcuts are handled by the page.
const { Menu } = require('electron');
const { run } = require('./harness');

const popups = [];

run(async (t, check) => {
  await t.ready();
  const b = t.win.getBounds(), c = t.win.getContentBounds();
  const bar = await t.js(`(() => {
    const tb = document.getElementById('titlebar'); if (!tb) return null;
    const cs = getComputedStyle(tb), wco = navigator.windowControlsOverlay, r = wco && wco.getTitlebarAreaRect();
    return {
      region: cs.getPropertyValue('-webkit-app-region'),
      menuRegion: getComputedStyle(document.querySelector('#menus [data-menu="0"]')).getPropertyValue('-webkit-app-region'),
      menus: [...document.querySelectorAll('#menus [data-menu]')].map(m => m.textContent.trim()),
      title: document.getElementById('doc-title').textContent,
      overlay: !!(wco && wco.visible), padRight: parseFloat(cs.paddingRight), reserved: r ? innerWidth - r.x - r.width : 0,
      brandInTitle: !!tb.querySelector('.brand'), brandInToolbar: !!document.querySelector('#topbar .brand')
    };
  })()`);
  check('Windows title bar and menu row are gone', bar && bar.overlay && c.y - b.y <= 10, { b, c, overlay: bar && bar.overlay });
  check('Title row has the logo, six menus and the publication name',
    bar && bar.brandInTitle && !bar.brandInToolbar && bar.menus.join(' ') === 'File Edit Insert Arrange View Help' && bar.title === 'test-shapes', bar);
  check('Title row is a drag area, its menu words are not', bar && bar.region === 'drag' && bar.menuRegion === 'no-drag', bar);
  check('Nothing sits under the window buttons', bar && bar.reserved > 100 && bar.padRight >= bar.reserved, bar);

  await t.js('window.__bohpumApp.cmd("page-add")');
  const dirtyTitle = await t.js('document.getElementById("doc-title").textContent');
  check('Publication name shows the unsaved dot', dirtyTitle === 'test-shapes •', { dirtyTitle });

  const menu = Menu.getApplicationMenu();
  await t.click('#menus [data-menu="0"]');
  check('Clicking File opens the File menu under the word', popups[0] && popups[0].menu === menu.items[0].submenu && popups[0].y >= 28 && popups[0].y <= 40,
    popups[0] && { x: popups[0].x, y: popups[0].y });
  await t.key('E', ['alt']);
  check('Alt+E opens the Edit menu', popups[1] && popups[1].menu === menu.items[1].submenu, { count: popups.length });
  await t.key('F10');
  check('F10 opens the File menu', popups[2] && popups[2].menu === menu.items[0].submenu, { count: popups.length });

  await t.key('P', ['control']);
  const printOpen = await t.js('!!document.querySelector(".print-preview")');
  check('Ctrl+P opens Print', printOpen, { printOpen });
  await t.key('Escape');

  const left = menu.items[0].submenu.items.filter(i => i.accelerator && !i.role && i.registerAccelerator !== false).map(i => i.label);
  check('No File shortcut is left to the hidden Windows menu', left.length === 0, left);
}, {
  setup: () => {
    // Record native menu pop-ups instead of showing them
    Menu.prototype.popup = function (opts = {}) {
      popups.push({ menu: this, x: opts.x, y: opts.y });
      if (opts.callback) setTimeout(opts.callback, 10);
    };
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- tests/titlebar.test.js`
Expected: every check FAILs (no `#titlebar`; `bar` is `null`), except possibly "Ctrl+P opens Print".

- [ ] **Step 3: Main process — hidden title bar, menu pop-up, page-owned shortcuts**

In `main.js` `createWindow`, replace:

```js
    title: APP_NAME,
    backgroundColor: '#e9e7e2',
    show: false,
```

with:

```js
    title: APP_NAME,
    backgroundColor: '#e9e7e2',
    // Own title row (src/index.html #titlebar): Windows only draws ─ □ ✕ over its right end, in the row's
    // colours (--chrome / --ink in src/app.css — keep in sync). 36 = the row without its 1 px bottom line.
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#f7f5f1', symbolColor: '#23201b', height: 36 },
    show: false,
```

In `buildMenu`, replace:

```js
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
```

with:

```js
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
```

After the line `ipcMain.on('close-now', …);` add:

```js
// A menu word in the title row (or Alt+letter / F10): that application menu drops down under it.
// x, y = the word's bottom-left in page pixels. Resolves when the menu closes.
ipcMain.handle('show-menu', (e, index, x, y) => new Promise((resolve) => {
  const item = Menu.getApplicationMenu()?.items[index | 0];
  if (!win || e.sender !== win.webContents || !item || !item.submenu) return resolve(false);
  item.submenu.popup({ window: win, x: Math.max(0, Math.round(+x) || 0), y: Math.max(0, Math.round(+y) || 0), callback: () => resolve(true) });
}));
```

In `preload.js`, after the `closeNow:` line add:

```js
  showMenu: (index, x, y) => ipcRenderer.invoke('show-menu', index, x, y),
```

- [ ] **Step 4: Markup and styles**

In `src/index.html`, replace:

```html
<body>
  <header id="topbar">
    <div class="brand"><span class="km">បោះពុម្ព</span><b>Bohpum</b></div>
    <div class="tb-group">
```

with:

```html
<body>
  <header id="titlebar">
    <div class="brand"><span class="km">បោះពុម្ព</span><b>Bohpum</b></div>
    <nav id="menus">
      <button class="menu-btn" data-menu="0">File</button>
      <button class="menu-btn" data-menu="1">Edit</button>
      <button class="menu-btn" data-menu="2">Insert</button>
      <button class="menu-btn" data-menu="3">Arrange</button>
      <button class="menu-btn" data-menu="4">View</button>
      <button class="menu-btn" data-menu="5">Help</button>
    </nav>
    <div id="doc-title"></div>
  </header>
  <header id="topbar">
    <div class="tb-group">
```

In `src/app.css`, replace:

```css
body { display: grid; grid-template-rows: auto auto 1fr auto; }
```

with:

```css
body { display: grid; grid-template-rows: auto auto auto 1fr auto; }

/* ---------- title row ---------- */
/* Windows draws ─ □ ✕ over the right end (main.js titleBarOverlay: 36 px = this row without its line,
   colours = --chrome / --ink); the right padding keeps the row's content out from under them. */
#titlebar { display: flex; align-items: center; gap: 2px; height: 37px; padding: 0 calc(10px + 100vw - env(titlebar-area-x, 0px) - env(titlebar-area-width, 100vw)) 0 10px; background: var(--chrome); border-bottom: 1px solid var(--line); -webkit-app-region: drag; user-select: none; }
#titlebar .brand { margin-right: 6px; }
#menus { display: flex; gap: 1px; }
.menu-btn { -webkit-app-region: no-drag; height: 28px; padding: 0 9px; border: 0; border-radius: 5px; background: transparent; font-size: 12.5px; cursor: default; }
.menu-btn:hover { background: var(--chrome-2); }
.menu-btn.open { background: var(--accent-soft); color: var(--accent); }
#doc-title { flex: 1; min-width: 0; text-align: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ink-2); font-size: 12.5px; }
/* a drag area ignores what is drawn over it */
.modal-back, #ctxmenu, #toast, .drop-hint { -webkit-app-region: no-drag; }
```

- [ ] **Step 5: Editor — title text, menus, keyboard**

In `src/app.js`, replace:

```js
function updateTitle() { api.setTitle(`${S.doc.name || 'Untitled'}${S.dirty ? ' •' : ''} – Bohpum`); }
```

with:

```js
function updateTitle() {
  const t = `${S.doc.name || 'Untitled'}${S.dirty ? ' •' : ''}`;
  $('doc-title').textContent = t;
  api.setTitle(`${t} – Bohpum`);
}
```

Directly above the line `// ---------------------------------------------------------------- keyboard` add:

```js
// ---------------------------------------------------------------- title row menus
const MENU_KEYS = { f: 0, e: 1, i: 2, a: 3, v: 4, h: 5 }; // Alt+F File, Alt+E Edit … (main.js menu order)
const FILE_KEYS = { n: 'new', o: 'open', p: 'print' };    // Ctrl+letter; Ctrl+S / Ctrl+Shift+S below
function openMenu(i) {
  const b = document.querySelector(`#menus [data-menu="${i}"]`);
  if (!b || !api.showMenu) return;
  closeCtx();
  const r = b.getBoundingClientRect();
  b.classList.add('open');
  api.showMenu(i, r.left, r.bottom).finally(() => b.classList.remove('open'));
}

```

In `onKey`, replace:

```js
function onKey(e) {
  if ($('modal-root').children.length) return;
  const ctrl = e.ctrlKey || e.metaKey, k = e.key;
  if (S.editing) {
```

with:

```js
function onKey(e) {
  if ($('modal-root').children.length) return;
  const ctrl = e.ctrlKey || e.metaKey, k = e.key;
  // File shortcuts work everywhere, also while typing (Windows no longer handles them: see main.js buildMenu)
  if (ctrl && !e.altKey) {
    const lk = k.toLowerCase();
    if (lk === 's') { e.preventDefault(); return cmd(e.shiftKey ? 'save-as' : 'save'); }
    if (!e.shiftKey && FILE_KEYS[lk]) { e.preventDefault(); return cmd(FILE_KEYS[lk]); }
  }
  if (S.editing) {
```

In `onKey`, replace:

```js
  if (e.target.matches('input, select, textarea, [contenteditable="true"]')) { if (k === 'Escape') e.target.blur(); return; }
  const sel = selObjs();
```

with:

```js
  if (e.target.matches('input, select, textarea, [contenteditable="true"]')) { if (k === 'Escape') e.target.blur(); return; }
  if (e.altKey && !ctrl && !e.shiftKey && MENU_KEYS[k.toLowerCase()] != null) { e.preventDefault(); return openMenu(MENU_KEYS[k.toLowerCase()]); }
  if (k === 'F10' && !ctrl && !e.altKey) { e.preventDefault(); return openMenu(0); }
  const sel = selObjs();
```

In `onKey`, delete the old browser-only fallback (the page now always handles these keys):

```js
    if (!window.api.__native) { // browser fallback for menu shortcuts
      if (lk === 's') { e.preventDefault(); return save(e.shiftKey); }
      if (lk === 'o') { e.preventDefault(); return openFile(); }
      if (lk === 'p') { e.preventDefault(); return printDialog(); }
    }
```

In `wire()`, after the line `document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));` add:

```js
  document.querySelectorAll('#menus [data-menu]').forEach(b => {
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus (e.g. in a text box being edited)
    b.addEventListener('click', () => openMenu(+b.dataset.menu));
  });
```

- [ ] **Step 6: Run it to see it pass, plus the earlier tests**

Run: `npm test`
Expected: all checks in `print-position`, `save-as`, `theme`, `titlebar` PASS; `All 4 test files passed`.

- [ ] **Step 7: Look at it**

Run: `npm start`. Check by eye: one title row (logo · File … Help · "Untitled" · ─ □ ✕ in the cream colour), toolbar below it; dragging the empty title row moves the window; double-click maximizes / restores; File opens under the word; Ctrl+S, Ctrl+O, Ctrl+P, Ctrl+N work, also while typing in the font box. Close the app.

- [ ] **Step 8: Commit**

```bash
git add tests/titlebar.test.js main.js preload.js src/index.html src/app.css src/app.js
git commit -m "feat: own title row with File/Edit/... menus; shortcuts handled by the page

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Print dialog — printer picker, direct printing, tidier left column

**Files:**
- Create: `tests/print-direct.test.js`
- Modify: `main.js` (`print-html` handler; new `printers`, `printer-prefs` handlers)
- Modify: `preload.js` (add `printers`, `printerPrefs`)
- Modify: `src/print.js:70-end` (`buildOutputHtml`, `openPrintDialog`)
- Modify: `src/app.css` (print dialog block)

**Interfaces:**
- Consumes: harness (Task 1); `keepAndClose` / `opened` logic already in `src/print.js` (Task 1 commit).
- Produces: `api.printers() → Promise<{ name, displayName, isDefault }[]>`; `api.printerPrefs(name) → Promise<boolean>`; `api.printHtml({ html, sheet: 'A4'|'A3'|'A5'|'Letter'|'Legal'|null, widthMm, heightMm, copies, deviceName }) → Promise<{ ok, reason }>`; `buildOutputHtml(doc, lay, { crop, nudge, portraitPaper })`; settings key `printer` (string). Output HTML class `.sheet-turn` for turned sheets.

- [ ] **Step 1: Write the failing test**

Create `tests/print-direct.test.js`:

```js
// Print dialog picks the printer and prints straight to it; landscape sheets go out as portrait
// paper with the content turned; the last printer is remembered; no printers → Print disabled.
const { app } = require('electron');
const { run } = require('./harness');

const jobs = [];
const FAKE = [
  { name: 'Office HP', displayName: 'Office HP', isDefault: false },
  { name: 'Front Desk Canon', displayName: 'Front Desk Canon', isDefault: true }
];

run(async (t, check) => {
  let printers = FAKE;
  t.wc.getPrintersAsync = async () => printers.map(p => ({ ...p, description: '', status: 0, options: {} }));
  await t.ready();
  const openPrint = async () => {
    await t.js('window.__bohpumApp.cmd("print")');
    await t.waitFor('!!document.querySelector(".print-preview .slot") && document.getElementById("pd-printer").options[0].textContent !== "Finding printers…"');
  };
  const set = (selector, value, ev) => t.js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event(${JSON.stringify(ev)}, { bubbles: true })); })()`);
  const ui = () => t.js(`(() => {
    const s = document.getElementById('pd-printer');
    return {
      options: [...s.options].map(o => o.value), selected: s.value, disabled: s.disabled,
      props: !!document.getElementById('pd-props') && !document.getElementById('pd-props').disabled,
      heads: [...document.querySelectorAll('.print-side .psec h4')].map(h => h.textContent),
      printLabel: document.querySelector('[data-a="print"]').textContent, printDisabled: document.querySelector('[data-a="print"]').disabled,
      pdfDisabled: document.querySelector('[data-a="pdf"]').disabled, firstOption: s.options[0] && s.options[0].textContent
    };
  })()`);

  await openPrint();
  const u1 = await ui();
  check('Printer list shows the installed printers, Windows default selected',
    u1.options.join('|') === 'Office HP|Front Desk Canon' && u1.selected === 'Front Desk Canon' && u1.props && !u1.disabled, u1);
  check('Left column: Printer, Paper, Layout, Pages, Printer adjustment', u1.heads.join('|') === 'Printer|Paper|Layout|Pages|Printer adjustment', u1.heads);
  check('Print button says Print (no Windows dialog follows)', u1.printLabel === 'Print', u1.printLabel);

  await set('#pd-printer', 'Office HP', 'change');
  await set('[data-k="orient"]', 'landscape', 'change');
  await t.waitFor('!!document.querySelector(".print-preview .slot")');
  await set('[data-k="copies"]', '2', 'input');
  await t.click('.modal-f [data-a="print"]');
  await t.waitFor('!document.querySelector(".print-preview")', 20000);
  const toastText = await t.js('document.getElementById("toast").textContent');
  const job = jobs[0];
  check('Print goes straight to the chosen printer', job && job.opts.silent === true && job.opts.deviceName === 'Office HP' && job.opts.copies === 2, job && job.opts);
  check('Landscape A4 goes out as portrait A4 with the content turned',
    job && job.opts.pageSize === 'A4' && job.opts.landscape === false && job.sheet.turned &&
    Math.round(job.sheet.w) === 794 && Math.round(job.sheet.h) === 1123 &&
    /@page \{ size: 210mm 297mm/.test(job.sheet.css) && /rotate\(-90deg\)/.test(job.sheet.css), job && { ...job.sheet, css: undefined });
  check('Says where it was sent', toastText === 'Sent 1 sheet to Office HP', { toastText });

  await openPrint();
  const u2 = await ui();
  check('Last printer is remembered', u2.selected === 'Office HP', u2);
  await t.key('Escape');

  printers = [];
  await openPrint();
  const u3 = await ui();
  check('No printers: says so, Print disabled, Save as PDF still works',
    u3.firstOption === 'No printers installed' && u3.disabled && !u3.props && u3.printDisabled && !u3.pdfDisabled, u3);
  await t.key('Escape');
}, {
  setup: () => {
    let seen = 0;
    app.on('browser-window-created', (_e, w) => {
      if (seen++ === 0) return; // the editor window
      // Hidden print window: record the job instead of printing on paper
      w.webContents.print = (opts, cb) => {
        w.webContents.executeJavaScript(`(() => { const s = document.querySelector('.sheet-out'), r = s.getBoundingClientRect(); return { w: r.width, h: r.height, turned: !!s.querySelector('.sheet-turn'), css: document.querySelector('style').textContent }; })()`)
          .then((sheet) => { jobs.push({ opts, sheet }); cb(true, ''); }, (err) => { jobs.push({ opts, err: String(err) }); cb(false, String(err)); });
      };
    });
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- tests/print-direct.test.js`
Expected: `FAIL  test ran to the end` with "timed out waiting for: …pd-printer…" (the dialog has no printer list yet).

- [ ] **Step 3: Main process — printer list, Properties, silent print**

In `main.js`, replace the whole `ipcMain.handle('print-html', …)` block:

```js
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
```

with:

```js
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
```

In `preload.js`, after the `printHtml:` line add:

```js
  printers: () => ipcRenderer.invoke('printers'),
  printerPrefs: (name) => ipcRenderer.invoke('printer-prefs', name),
```

- [ ] **Step 4: Print dialog — output HTML and the dialog**

In `src/print.js`, replace everything from the line `// Build a standalone HTML document for the hidden print window` to the end of the file with:

```js
// Build a standalone HTML document for the hidden print window.
// portraitPaper: a landscape sheet goes out as portrait paper with the content turned 90° (its top along
// the paper's left edge, the way drivers print landscape), so no printer driver turns it a second time.
export function buildOutputHtml(doc, lay, { crop = false, nudge = { x: 0, y: 0 }, portraitPaper = false } = {}) {
  const turn = portraitPaper && lay.sw > lay.sh;
  const pw = turn ? lay.sh : lay.sw, ph = turn ? lay.sw : lay.sh;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;';
  document.body.append(host);
  for (const sheet of lay.sheets) {
    const s = document.createElement('div');
    s.className = 'sheet-out';
    let t = s;
    if (turn) { t = document.createElement('div'); t.className = 'sheet-turn'; s.append(t); }
    for (const p of sheet) {
      const pg = renderPage(doc, doc.pages[p.pi]);
      pg.style.position = 'absolute';
      pg.style.left = (p.x + (nudge.x || 0)) + 'mm';
      pg.style.top = (p.y + (nudge.y || 0)) + 'mm';
      t.append(pg);
      if (crop) cropMarks(t, p.x + (nudge.x || 0), p.y + (nudge.y || 0), doc.pageW, doc.pageH);
    }
    host.append(s);
  }
  fixLineHeights(host);
  const body = host.innerHTML;
  host.remove();
  return `<!doctype html><html><head><meta charset="utf-8"><title>${(doc.name || 'Publication').replace(/</g, '')}</title><style>${RENDER_CSS}
@page { size: ${pw}mm ${ph}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet-out { position: relative; width: ${pw}mm; height: ${ph}mm; overflow: hidden; break-after: page; page-break-after: always; }
.sheet-out:last-child { break-after: auto; page-break-after: auto; }
.sheet-turn { position: absolute; left: 0; top: 0; width: ${lay.sw}mm; height: ${lay.sh}mm; transform-origin: 0 0; transform: translateY(${lay.sw}mm) rotate(-90deg); }
</style></head><body>${body}</body></html>`;
}

// ---------------- dialog ----------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function openPrintDialog({ doc, pageIndex, api, settings, saveSettings, toast, onDocChange }) {
  const small = doc.pageW * 2 <= 210 || doc.pageH * 2 <= 297;
  const o = Object.assign({
    sheet: 'A4', orient: 'portrait', mode: small ? 'single' : 'actual',
    left: null, top: null,
    marginT: 10, marginL: 10, marginR: 10, marginB: 10, gapX: 0, gapY: 0, center: true, order: 'repeat',
    crop: false, pages: 'all', range: '', copies: 1
  }, clone(doc.print || {}));
  const nudge = Object.assign({ x: 0, y: 0 }, settings.printNudge || {});
  let sheetNo = 0;
  let printers = null;                     // null until Windows has listed them
  let printer = settings.printer || null;  // printer name; remembered app-wide
  let sending = false;

  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `
  <div class="modal" role="dialog" aria-label="Print">
    <div class="modal-h">Print</div>
    <div class="modal-b"><div class="print-wrap">
      <div class="print-side" id="pd-side"></div>
      <div class="print-preview" id="pd-prev"></div>
    </div></div>
    <div class="modal-f">
      <span class="muted" style="margin-right:auto" id="pd-info"></span>
      <button class="btn" data-a="close">Close</button>
      <button class="btn" data-a="pdf">Save as PDF</button>
      <button class="btn primary" data-a="print">Print</button>
    </div>
  </div>`;
  document.getElementById('modal-root').append(back);
  const side = back.querySelector('#pd-side'), prev = back.querySelector('#pd-prev'), info = back.querySelector('#pd-info');
  const printBtn = back.querySelector('[data-a="print"]');

  const num = (key, label, obj = o, step = 0.5) => `<div class="numf" title="${label}"><span>${label}</span><input type="number" step="${step}" data-k="${key}" data-o="${obj === nudge ? 'n' : 'o'}" value="${round(obj[key])}"></div>`;
  const round = (v) => v == null ? '' : Math.round(v * 10) / 10;

  function ensurePos() {
    const [sw, sh] = sheetSize(o.sheet, o.orient);
    if (o.left == null || o.left > sw) o.left = Math.max(0, (sw - doc.pageW) / 2);
    if (o.top == null || o.top > sh) o.top = Math.max(0, (sh - doc.pageH) / 2);
  }

  function renderSide() {
    if (o.mode === 'single') ensurePos();
    const [sw, sh] = sheetSize(o.sheet, o.orient);
    const g = gridInfo(doc, o, sw, sh);
    side.innerHTML = `
      <div class="psec">
        <h4>Printer</h4>
        <div class="pr-printer">
          <select class="field" id="pd-printer" aria-label="Printer"></select>
          <button class="btn" id="pd-props" title="Opens Windows' printing preferences for this printer. Changes there become this printer's defaults.">Properties</button>
        </div>
        <div class="grid2">${num('copies', 'Copies', o, 1)}</div>
      </div>
      <div class="psec">
        <h4>Paper</h4>
        <div class="grid2">
          <select class="field" data-k="sheet" aria-label="Paper size">${Object.keys(SHEETS).map(k => `<option ${k === o.sheet ? 'selected' : ''}>${k}</option>`).join('')}</select>
          <select class="field" data-k="orient" aria-label="Orientation"><option value="portrait" ${o.orient === 'portrait' ? 'selected' : ''}>Portrait</option><option value="landscape" ${o.orient === 'landscape' ? 'selected' : ''}>Landscape</option></select>
        </div>
        <div class="muted">Publication page: ${round(doc.pageW)} × ${round(doc.pageH)} mm</div>
      </div>
      <div class="psec">
        <h4>Layout</h4>
        <div class="radio ${o.mode === 'single' ? 'on' : ''}" data-mode="single"><input type="radio" ${o.mode === 'single' ? 'checked' : ''}><div><b>One per sheet, at a position</b><small>Drag the page on the preview or type the distance from the paper edge.</small></div></div>
        ${o.mode === 'single' ? `<div style="margin:2px 0 10px 24px">
          <div class="grid2">${num('left', 'Left')}${num('top', 'Top')}</div>
          <div class="pos-grid" id="pd-pos">
            ${[['tl', '↖'], ['tc', '↑'], ['tr', '↗'], ['ml', '←'], ['mc', 'Center'], ['mr', '→'], ['bl', '↙'], ['bc', '↓'], ['br', '↘']].map(([k, l]) => `<button class="btn" data-pos="${k}" title="Snap to ${k}">${l}</button>`).join('')}
          </div></div>` : ''}
        <div class="radio ${o.mode === 'grid' ? 'on' : ''}" data-mode="grid"><input type="radio" ${o.mode === 'grid' ? 'checked' : ''}><div><b>Multiple copies per sheet</b><small>${g.cols * g.rows ? `${g.cols * g.rows} per sheet (${g.cols} × ${g.rows})` : 'Page is larger than the paper'}</small></div></div>
        ${o.mode === 'grid' ? `<div style="margin:2px 0 10px 24px">
          <div class="grid2">${num('marginT', 'Top')}${num('marginL', 'Left')}${num('marginB', 'Bottom')}${num('marginR', 'Right')}${num('gapX', 'Gap ↔')}${num('gapY', 'Gap ↕')}</div>
          <label class="chk"><input type="checkbox" data-k="center" ${o.center ? 'checked' : ''}> Center the block on the sheet</label>
          <select class="field" data-k="order" style="width:100%"><option value="repeat" ${o.order === 'repeat' ? 'selected' : ''}>Fill each sheet with one page</option><option value="sequence" ${o.order === 'sequence' ? 'selected' : ''}>Different pages in sequence</option></select>
        </div>` : ''}
        <div class="radio ${o.mode === 'actual' ? 'on' : ''}" data-mode="actual"><input type="radio" ${o.mode === 'actual' ? 'checked' : ''}><div><b>Page size = paper size</b><small>Print each page on paper of the same size (${round(doc.pageW)} × ${round(doc.pageH)} mm).</small></div></div>
      </div>
      <div class="psec">
        <h4>Pages</h4>
        <div class="grid2">
          <select class="field" data-k="pages" aria-label="Pages to print"><option value="all" ${o.pages === 'all' ? 'selected' : ''}>All pages (${doc.pages.length})</option><option value="current" ${o.pages === 'current' ? 'selected' : ''}>Current page</option><option value="range" ${o.pages === 'range' ? 'selected' : ''}>Pages…</option></select>
          ${o.pages === 'range' ? `<input class="field" data-k="range" aria-label="Pages" placeholder="e.g. 1-3, 5" value="${esc(o.range || '')}">` : ''}
        </div>
        <label class="chk"><input type="checkbox" data-k="crop" ${o.crop ? 'checked' : ''} ${o.mode === 'actual' ? 'disabled' : ''}> Crop marks</label>
      </div>
      <div class="psec">
        <h4>Printer adjustment</h4>
        <div class="grid2">${num('x', 'X', nudge, 0.1)}${num('y', 'Y', nudge, 0.1)}</div>
        <div class="muted">If your printer prints a little off, enter the correction in mm (+X moves right, +Y moves down). It is remembered for next time.</div>
      </div>
      <div id="pd-warn"></div>`;
    side.querySelectorAll('[data-mode]').forEach(r => r.onclick = () => { o.mode = r.dataset.mode; sheetNo = 0; update(); });
    side.querySelectorAll('[data-k]').forEach(inp => {
      const ev = inp.type === 'number' || inp.tagName === 'INPUT' && inp.type !== 'checkbox' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        const target = inp.dataset.o === 'n' ? nudge : o;
        const k = inp.dataset.k;
        if (inp.type === 'checkbox') target[k] = inp.checked;
        else if (inp.type === 'number') { const v = parseFloat(inp.value); target[k] = isNaN(v) ? 0 : v; }
        else target[k] = inp.value;
        if (k === 'sheet' || k === 'orient') { o.left = null; o.top = null; }
        if (inp.tagName === 'SELECT' || inp.type === 'checkbox') update(); else { renderPreview(); renderWarn(); }
      });
    });
    side.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => {
      const [sw, sh] = sheetSize(o.sheet, o.orient);
      const m = 10, k = b.dataset.pos;
      o.left = k[1] === 'l' ? m : k[1] === 'r' ? sw - doc.pageW - m : (sw - doc.pageW) / 2;
      o.top = k[0] === 't' ? m : k[0] === 'b' ? sh - doc.pageH - m : (sh - doc.pageH) / 2;
      update();
    });
    side.querySelector('#pd-printer').addEventListener('change', (e) => { printer = e.target.value; saveSettings({ printer }); });
    side.querySelector('#pd-props').onclick = () => { if (printer) api.printerPrefs(printer); };
    fillPrinters();
    renderWarn();
  }

  // The printer list: the remembered printer if still installed, else Windows' default
  function fillPrinters() {
    const sel = side.querySelector('#pd-printer'), props = side.querySelector('#pd-props');
    const none = !printers || !printers.length;
    sel.innerHTML = !printers ? '<option>Finding printers…</option>'
      : none ? '<option>No printers installed</option>'
      : printers.map(p => `<option value="${esc(p.name)}"${p.name === printer ? ' selected' : ''}>${esc(p.displayName)}</option>`).join('');
    sel.disabled = none; props.disabled = none;
    printBtn.disabled = sending || none || !printer;
  }

  function renderWarn() {
    const w = [];
    const lay = currentLayout();
    const [sw, sh] = [lay.sw, lay.sh];
    if (o.mode !== 'actual') {
      if (!lay.sheets.length || !lay.sheets[0].length) w.push('The page does not fit on this paper. Choose a bigger sheet or landscape.');
      for (const p of (lay.sheets[0] || [])) {
        if (p.x < -0.01 || p.y < -0.01 || p.x + doc.pageW > sw + 0.01 || p.y + doc.pageH > sh + 0.01) { w.push('Part of the page is outside the paper.'); break; }
        if (p.x < NONPRINT || p.y < NONPRINT || p.x + doc.pageW > sw - NONPRINT || p.y + doc.pageH > sh - NONPRINT) { w.push(`Most printers cannot print within about ${NONPRINT} mm of the paper edge.`); break; }
      }
    }
    side.querySelector('#pd-warn').innerHTML = w.map(t => `<div class="warn">${t}</div>`).join('');
    const n = lay.sheets.length;
    if (!sending) info.textContent = `${n} sheet${n === 1 ? '' : 's'} · ${round(sw)} × ${round(sh)} mm · prints at 100% (actual size)`;
  }

  function currentLayout() {
    const pages = parsePages(o, doc.pages.length, pageIndex);
    return layout(doc, o, pages);
  }

  function renderPreview() {
    const lay = currentLayout();
    const [sw, sh] = [lay.sw, lay.sh];
    prev.innerHTML = '';
    const maxW = prev.clientWidth - 40 || 600, maxH = (prev.clientHeight || 520) - 50;
    const scale = Math.min(maxW / (sw * 3.7795), maxH / (sh * 3.7795));
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.style.width = sw + 'mm'; sheet.style.height = sh + 'mm'; sheet.style.zoom = scale;
    if (o.mode !== 'actual') {
      const np = document.createElement('div'); np.className = 'nopr';
      np.style.boxShadow = `inset 0 0 0 ${NONPRINT}mm rgba(217,70,184,.07)`;
      sheet.append(np);
    }
    sheetNo = Math.min(sheetNo, Math.max(0, lay.sheets.length - 1));
    const placements = lay.sheets[sheetNo] || [];
    for (const p of placements) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (o.mode === 'single' ? ' drag' : '');
      Object.assign(slot.style, { left: p.x + 'mm', top: p.y + 'mm', width: doc.pageW + 'mm', height: doc.pageH + 'mm' });
      const pg = renderPage(doc, doc.pages[p.pi]);
      slot.append(pg);
      sheet.append(slot);
      if (o.crop && o.mode !== 'actual') cropMarks(sheet, p.x, p.y, doc.pageW, doc.pageH);
      if (o.mode === 'single') slot.addEventListener('pointerdown', (e) => startDrag(e, sheet, sw, sh));
    }
    prev.append(sheet);
    fixLineHeights(sheet);
    if (lay.sheets.length > 1) {
      const nav = document.createElement('div'); nav.className = 'prev-nav';
      nav.innerHTML = `<button class="btn" style="height:22px" data-d="-1">‹</button> Sheet ${sheetNo + 1} of ${lay.sheets.length} <button class="btn" style="height:22px" data-d="1">›</button>`;
      nav.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { sheetNo = Math.max(0, Math.min(lay.sheets.length - 1, sheetNo + +b.dataset.d)); renderPreview(); });
      prev.append(nav);
    }
  }

  function startDrag(e, sheet, sw, sh) {
    e.preventDefault();
    const r = sheet.getBoundingClientRect();
    const k = r.width / sw;
    const sx = e.clientX, sy = e.clientY, ol = o.left, ot = o.top;
    const move = (ev) => {
      let nl = ol + (ev.clientX - sx) / k, nt = ot + (ev.clientY - sy) / k;
      if (!ev.altKey) { nl = Math.round(nl * 2) / 2; nt = Math.round(nt * 2) / 2; }
      // snap to centre
      const cx = (sw - doc.pageW) / 2, cy = (sh - doc.pageH) / 2;
      if (Math.abs(nl - cx) < 2) nl = cx;
      if (Math.abs(nt - cy) < 2) nt = cy;
      o.left = nl; o.top = nt;
      const slot = sheet.querySelector('.slot');
      slot.style.left = nl + 'mm'; slot.style.top = nt + 'mm';
      sheet.querySelectorAll('.kcrop').forEach(c => c.remove());
      if (o.crop) cropMarks(sheet, nl, nt, doc.pageW, doc.pageH);
      const L = side.querySelector('[data-k="left"]'), T = side.querySelector('[data-k="top"]');
      if (L) L.value = round(nl); if (T) T.value = round(nt);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); renderWarn(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  function update() { renderSide(); renderPreview(); }

  function persist() {
    doc.print = clone(o);
    saveSettings({ printNudge: nudge });
    onDocChange && onDocChange();
  }

  // Close / Esc keep what the user set (position, paper, mode …), like Print does.
  // Nothing is written when nothing changed, so just looking at the dialog leaves the publication unchanged.
  let opened = null;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const keepAndClose = () => { if (JSON.stringify([o, nudge]) !== opened) persist(); close(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (!sending) keepAndClose(); } };
  document.addEventListener('keydown', onKey, true);

  back.querySelector('[data-a="close"]').onclick = keepAndClose;
  back.querySelector('[data-a="pdf"]').onclick = async () => {
    const lay = currentLayout(); if (!lay.sheets.length) return toast('Nothing to print with these settings.');
    persist();
    const html = buildOutputHtml(doc, lay, { crop: o.crop && o.mode !== 'actual', nudge: { x: 0, y: 0 } });
    close();
    const p = await api.exportPdf({ html, widthMm: lay.sw, heightMm: lay.sh, defaultName: (doc.name || 'publication') + (o.mode === 'actual' ? '' : '-' + o.sheet) + '.pdf' });
    if (p) toast('Saved ' + p);
  };
  // Print: straight to the chosen printer, no Windows dialog
  printBtn.onclick = async () => {
    const lay = currentLayout(); if (!lay.sheets.length) return toast('Nothing to print with these settings.');
    if (!printer || sending) return;
    persist();
    saveSettings({ printer });
    const actual = o.mode === 'actual';
    const html = buildOutputHtml(doc, lay, { crop: o.crop && !actual, nudge: actual ? { x: 0, y: 0 } : nudge, portraitPaper: !actual });
    const name = ((printers || []).find(p => p.name === printer) || {}).displayName || printer;
    sending = true;
    back.querySelectorAll('.modal-f .btn').forEach(b => b.disabled = true);
    info.textContent = `Sending to ${name}…`;
    const r = await api.printHtml({ html, sheet: actual ? null : o.sheet, widthMm: lay.sw, heightMm: lay.sh, copies: Math.max(1, o.copies | 0), deviceName: printer });
    close();
    const n = lay.sheets.length;
    if (r && r.ok) toast(`Sent ${n} sheet${n === 1 ? '' : 's'} to ${name}`);
    else toast('Print failed: ' + ((r && r.reason) || 'the printer did not take the job'), 6000);
  };

  update();
  opened = JSON.stringify([o, nudge]); // after update(), which fills in the default position
  requestAnimationFrame(renderPreview);
  api.printers().then((list) => {
    printers = list || [];
    if (!printers.some(p => p.name === printer)) printer = (printers.find(p => p.isDefault) || printers[0] || {}).name || null;
    if (back.isConnected) fillPrinters();
  }, () => { printers = []; printer = null; if (back.isConnected) fillPrinters(); });
}
```

(Removed compared to before: the unused `sheetWH()` helper, the inline-styled headings, Copies inside the Pages row, and the "cancelled" check — silent printing has no dialog to cancel.)

- [ ] **Step 5: Styles for the tidier left column**

In `src/app.css`, replace:

```css
/* print dialog */
.print-wrap { display: grid; grid-template-columns: 300px 1fr; gap: 18px; width: min(1000px, calc(100vw - 80px)); }
.print-preview { background: var(--pasteboard); border-radius: 8px; display: flex; align-items: center; justify-content: center; min-height: 520px; position: relative; overflow: hidden; }
```

with:

```css
/* print dialog: settings column (scrolls on its own) | preview */
.print-wrap { display: grid; grid-template-columns: 300px 1fr; gap: 18px; width: min(1000px, calc(100vw - 80px)); height: min(600px, calc(100vh - 170px)); }
.print-side { overflow: auto; min-height: 0; padding-right: 6px; }
.print-side .psec { padding: 0 0 12px; margin-bottom: 12px; }
.print-side .grid2 .field { width: 100%; min-width: 0; }
.pr-printer { display: flex; gap: 6px; margin-bottom: 6px; }
.pr-printer .field { flex: 1; min-width: 0; }
.pr-printer .btn { height: 28px; border-color: var(--line-2); background: #fff; }
.print-preview { background: var(--pasteboard); border-radius: 8px; display: flex; align-items: center; justify-content: center; min-height: 0; position: relative; overflow: hidden; }
```

- [ ] **Step 6: Run it to see it pass, plus the earlier tests**

Run: `npm test`
Expected: all checks in `print-direct`, `print-position`, `save-as`, `theme`, `titlebar` PASS; `All 5 test files passed`.

- [ ] **Step 7: Look at it**

Run: `npm start`, open `samples/card-original.pub` (or any publication), Ctrl+P. Check by eye: Printer (list + Properties, Copies) · Paper · Layout · Pages · Printer adjustment, same heading style and spacing; the column scrolls when the window is short; the preview still drags. Do not press Print here (that would print on paper) — Close.

- [ ] **Step 8: Commit**

```bash
git add tests/print-direct.test.js main.js preload.js src/print.js src/app.css
git commit -m "feat: print dialog picks the printer and prints straight to it; tidier settings column

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: README and final check

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above (documents it).

- [ ] **Step 1: Update the README**

Replace:

```markdown
**Print and export**
- **Print** (Ctrl+P), like Publisher:
```

with:

```markdown
**Print and save**
- **Print** (Ctrl+P), like Publisher:
  - Pick the printer in the dialog; **Print** sends straight to it (**Properties** opens the printer's own settings). The last printer is remembered.
```

Replace:

```markdown
- Export PDF (Ctrl+E), export the current page as a 300 dpi PNG
```

with:

```markdown
  - *Save as PDF* saves the sheets as laid out (e.g. 8 cards on an A4)
- **Save As** (Ctrl+Shift+S) can also save a PDF of the publication (every page at page size); the publication keeps its own file
- File > Export Page as PNG saves the current page as a 300 dpi PNG
```

In the shortcuts table, after the row `| PageUp / PageDown | Previous / next page |` add:

```markdown
| Alt+F, E, I, A, V, H / F10 | Open the File, Edit, Insert, Arrange, View, Help menu / the File menu |
```

In the project layout block, after the line `vendor/libreoffice             The bundled LibreOffice (generated, not edited by hand)` add:

```
tests/                         Electron tests: npm test (each tests/*.test.js runs the real app)
```

- [ ] **Step 2: Full test run**

Run: `npm test`
Expected: `All 5 test files passed`, no FAIL lines.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README for the title row, direct printing and Save As PDF

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Hand over the paper test**

Tell the user: print one sheet on a real printer from the Print dialog — once with A4 portrait and once with A4 landscape — and check the card lands where the preview shows it. The tests never send anything to a printer.
