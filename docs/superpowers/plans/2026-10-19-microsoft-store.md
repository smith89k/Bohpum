# Bohpum in the Microsoft Store — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Release run makes the unchanged NSIS installer and, next to it, a Microsoft Store MSIX package (Publisher reader inside, no update key, Store updates), which the user submits in Partner Center so Microsoft signs it.

**Architecture:** A plain-Node module `store.js` holds the Store copy's rules (which copy is the Store one, its Partner Center identity in `store.json`, the Store page link, the bundled reader's path). main.js asks it and switches off self-update, the reader download, and the right-click menu setup in the Store copy. A second electron-builder run (`build/store.config.js` → `scripts/store-config.js`) builds the appx target from the installer's own config, with a custom manifest (`build/store-manifest.xml`) that declares the file types and the File Explorer menu. The release job builds it only once `store.json` exists, checks it (`scripts/store-check.js`), and attaches it to the GitHub release.

**Tech Stack:** Electron 44, electron-builder 26 (appx target), plain CommonJS, GitHub Actions (windows-latest + ubuntu-latest), the repo's Electron test harness (`tests/harness.js`, `run(async (t, check) => …)`).

Design: `docs/superpowers/specs/2026-10-19-microsoft-store-design.md`.

## Global Constraints

- Work and commit on `main` only: no branches, no worktrees.
- Never build the installer or the Store package (`pnpm run dist`, `pnpm run dist:store`, any `electron-builder` run) without the user's yes. Never push without the user's yes.
- Run one test file with `pnpm test tests/<file>.test.js` (no `--`: pnpm passes it on as a file and the runner hangs). Several files: `pnpm test tests/a.test.js tests/b.test.js`.
- Tests never write a real or made-up Windows program (PE/"MZ" bytes) to disk: this PC's Trend Micro deletes them. A stand-in `soffice.exe` holds the text `x`, as the existing tests do.
- The installer stays exactly as it is: `package.json` `build` changes only by adding `"store.js"` to `files`.
- Store package: target `appx`, output folder `dist-store/`, file `Bohpum-Store-${version}.msix` (electron-builder's own ext would be .appx: the same format), `applicationId` `Bohpum`, `displayName` `Bohpum`, `minVersion` `10.0.19041.0`, `maxVersionTested` `10.0.26100.0`.
- Never inside the Store package: `update-config.json` (the update key), `reader-pack.json`, `app-update.yml`, `Bohpum.ExplorerMenu.msix`.
- The menu CLSID is `1e11f0a8-6fc0-4a9c-9031-6924b71a4d77` (explorer-menu.js `CLSID`, with braces there).
- The unsigned test identity's publisher: `CN=Bohpum, OID.2.25.311729368913984317654407730594956997722=1`.
- Store ID format: 12 characters, digits and capital letters (e.g. `9NBLGGH4NNS1`).
- Comments in the repo's own style: plain sentences saying why, at the density of the surrounding code.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (PowerShell: `git commit -q -m @'…'@`, closing `'@` at column 0).

---

### Task 1: store.js — the Store copy's rules

**Files:**
- Create: `store.js`
- Modify: `package.json:26-36` (`build.files`)
- Test: `tests/store.test.js`

**Interfaces:**
- Produces: `isStoreCopy({ windowsStore, test = false }) → boolean`; `parseStoreInfo(text) → { identityName, publisher, publisherDisplayName, storeId } | null`; `readStoreInfo(file) → same | null`; `SIDELOAD` (frozen `{ identityName: 'Bohpum.StoreTest', publisher: 'CN=Bohpum, OID.2.25.311729368913984317654407730594956997722=1', publisherDisplayName: 'Sunnguon Taing', storeId: null }`); `storePageUrl(info) → string`; `bundledSoffice(resourcesPath) → string`.

- [ ] **Step 1: Write the failing test** — create `tests/store.test.js`:

```js
// store.js: the Microsoft Store copy's rules, with no Electron inside — which copy is the Store one, its Partner Center
// identity (store.json), the unsigned test identity, the Store page Check for Updates opens, and where the reader inside
// the package is.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ID = { identityName: 'SunnguonTaing.Bohpum', publisher: 'CN=12345678-90AB-CDEF-1234-567890ABCDEF', publisherDisplayName: 'Sunnguon Taing', storeId: '9NBOHPUM0000' };

run(async (t, check) => {
  const store = require(path.join(ROOT, 'store.js'));   // here, so a missing file is a FAIL line
  check('The Store copy: Windows says so (process.windowsStore), or a test says so',
    store.isStoreCopy({ windowsStore: true }) === true && store.isStoreCopy({ windowsStore: undefined, test: true }) === true
      && store.isStoreCopy({ windowsStore: undefined }) === false && store.isStoreCopy({ windowsStore: false, test: false }) === false);
  check('store.json: the four Partner Center values', same(store.parseStoreInfo(JSON.stringify(ID)), ID));
  const bad = [{ ...ID, identityName: 'x' }, { ...ID, publisher: 'Bohpum' }, { ...ID, publisherDisplayName: ' ' }, { ...ID, storeId: '9nbohpum0000' }, { ...ID, storeId: undefined }];
  check('…one missing or wrong value, or not JSON, is no identity',
    bad.every(b => store.parseStoreInfo(JSON.stringify(b)) === null) && store.parseStoreInfo('nope') === null, bad.map(b => store.parseStoreInfo(JSON.stringify(b))));
  check('A missing store.json is no identity', store.readStoreInfo(path.join(t.ctx.tmp, 'gone', 'store.json')) === null);
  const f = path.join(t.ctx.tmp, 'store.json'); fs.writeFileSync(f, JSON.stringify(ID));
  check('store.json is read from a file', same(store.readStoreInfo(f), ID));
  check('The unsigned test identity carries the OID Windows needs for -AllowUnsigned, and no Store ID',
    store.SIDELOAD.publisher === 'CN=Bohpum, OID.2.25.311729368913984317654407730594956997722=1' && store.SIDELOAD.storeId === null && Object.isFrozen(store.SIDELOAD), store.SIDELOAD);
  check('Check for Updates opens Bohpum\'s Store page…', store.storePageUrl(ID) === 'ms-windows-store://pdp/?ProductId=9NBOHPUM0000');
  check('…or, without a Store ID, the Store\'s Downloads and updates',
    store.storePageUrl(null) === 'ms-windows-store://downloadsandupdates' && store.storePageUrl(store.SIDELOAD) === 'ms-windows-store://downloadsandupdates');
  check('The reader inside the package: resources\\libreoffice\\program\\soffice.exe',
    store.bundledSoffice('C:\\R') === path.join('C:\\R', 'libreoffice', 'program', 'soffice.exe'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('The app carries store.js (main.js needs it in both copies)', pkg.build.files.includes('store.js'), pkg.build.files);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test tests/store.test.js`
Expected: `FAIL  test ran to the end` with `Cannot find module` …`store.js`, and `1 of 1 test files failed`.

- [ ] **Step 3: Write store.js** — create `store.js`:

```js
// Bohpum — the Microsoft Store copy: an MSIX package that Microsoft signs and the Store updates (design:
// docs/superpowers/specs/2026-10-19-microsoft-store-design.md). It carries the Publisher reader inside
// (resources\libreoffice), has no update key, and gets its right-click menu and file types from its package manifest
// (build/store-manifest.xml). No Electron here: main.js and build/store.config.js use it, so the rules are plain-Node
// testable.
const fs = require('fs'), path = require('path');

// store.json = Partner Center › Product identity: { identityName, publisher, publisherDisplayName, storeId } → that,
// or null when anything is off. Not secret: anyone can read it in the Store package.
function parseStoreInfo(text) {
  let c; try { c = JSON.parse(text); } catch { return null; }
  const { identityName, publisher, publisherDisplayName, storeId } = c || {};
  if (typeof identityName !== 'string' || !/^[A-Za-z0-9.-]{3,50}$/.test(identityName)) return null;
  if (typeof publisher !== 'string' || !/^CN=./.test(publisher)) return null;
  if (typeof publisherDisplayName !== 'string' || !publisherDisplayName.trim()) return null;
  if (typeof storeId !== 'string' || !/^[0-9A-Z]{12}$/.test(storeId)) return null;
  return { identityName, publisher, publisherDisplayName, storeId };
}
function readStoreInfo(file) { try { return parseStoreInfo(fs.readFileSync(file, 'utf8')); } catch { return null; } }

// A test package for this PC, installed with Add-AppxPackage -AllowUnsigned: Windows takes an unsigned package only
// with this OID in Publisher (as explorer-menu/AppxManifest.xml). Never sent to the Store, so it has no Store ID.
const SIDELOAD = Object.freeze({
  identityName: 'Bohpum.StoreTest', publisher: 'CN=Bohpum, OID.2.25.311729368913984317654407730594956997722=1',
  publisherDisplayName: 'Sunnguon Taing', storeId: null
});

// Windows sets process.windowsStore in an app started from its MSIX package; tests say so with BOHPUM_STORE_TEST.
function isStoreCopy({ windowsStore, test = false }) { return windowsStore === true || test === true; }

// Help › Check for Updates in the Store copy: Bohpum's page in the Store app (its Update button), or the Store's
// Downloads and updates when the copy has no Store ID (the sideloaded test package).
function storePageUrl(info) {
  return info && info.storeId ? `ms-windows-store://pdp/?ProductId=${info.storeId}` : 'ms-windows-store://downloadsandupdates';
}

// The Publisher reader inside the Store package (build/store.config.js puts it there)
const bundledSoffice = (resourcesPath) => path.join(resourcesPath, 'libreoffice', 'program', 'soffice.exe');

module.exports = { parseStoreInfo, readStoreInfo, SIDELOAD, isStoreCopy, storePageUrl, bundledSoffice };
```

- [ ] **Step 4: Add store.js to the app's files** — in `package.json`, `build.files`, after `"reader.js",` add a line `"store.js",`:

```json
      "reader.js",
      "store.js",
      "update-config.json",
```

- [ ] **Step 5: Run the test and the packaging check that reads package.json**

Run: `pnpm test tests/store.test.js tests/update-wiring.test.js`
Expected: every line `PASS`, `All 2 test files passed`.

- [ ] **Step 6: Commit**

```powershell
git add store.js tests/store.test.js package.json
git commit -q -m @'
feat: store.js — the Microsoft Store copy's rules (identity in store.json, Store page, reader inside)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 2: reader.js — the reader inside the Store package comes first

**Files:**
- Modify: `reader.js:6-8` (header comment), `reader.js:39-49` (`chooseReader`)
- Test: `tests/reader.test.js` (after line 51)

**Interfaces:**
- Consumes: nothing new.
- Produces: `chooseReader({ root, pack, bundled = null, dev = null, installed = null })`. `bundled` is used first, and only when the file is there.

- [ ] **Step 1: Write the failing test** — in `tests/reader.test.js`, right after the check that ends `reader.chooseReader({ root, pack }));` (line 51), add:

```js
  const B = path.join(fresh(), 'soffice.exe'); fs.writeFileSync(B, 'x');
  root = fresh(); mk(root, NAME);
  check('The reader inside the Store package wins over everything else',
    same(reader.chooseReader({ root, pack, bundled: B, dev: 'D', installed: 'I' }), { soffice: B, need: null }));
  check('…but only when it is there', same(reader.chooseReader({ root: fresh(), pack, bundled: path.join(fresh(), 'gone.exe'), installed: 'I' }), { soffice: 'I', need: null }));
```

Also change the file's first comment line to name the new first choice:

```js
// reader.js, part 1: the Publisher reader (a trimmed LibreOffice downloaded once) — its pack name and info, which
// LibreOffice Bohpum uses (the one inside the Store package, the expected pack, the developer's copy, an installed
// LibreOffice, then an older pack), and what is left over to clean up. A folder that was never finished (.partial, or no
// soffice.exe) is never used.
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test tests/reader.test.js`
Expected: `FAIL  The reader inside the Store package wins over everything else` (it returns the pack's soffice instead); `PASS  …but only when it is there`.

- [ ] **Step 3: Implement** — in `reader.js`, replace the header lines 6-8:

```js
// Which LibreOffice is used, in this order: (0) in the Microsoft Store copy, the one inside its package (store.js);
// (1) the pack this Bohpum expects; (2) in `pnpm start` only, the developer's vendor\libreoffice; (3) a LibreOffice
// installed on the PC; (4) an older downloaded pack (and a newer one is offered). None of them → ask to download.
// No Electron here: main.js wires it, so the rules are plain-Node testable.
```

and replace `chooseReader` (lines 39-49):

```js
// → { soffice, need }: need 'download' (nothing to read with), 'newer' (an older pack works, the expected one isn't
// here yet) or null. bundled / dev / installed are soffice paths main.js found, or null; bundled (the Store copy's own)
// only counts when the file is there.
function chooseReader({ root, pack, bundled = null, dev = null, installed = null }) {
  if (bundled && isFile(bundled)) return { soffice: bundled, need: null };
  const done = completePacks(root);
  if (pack && done.includes(pack.name)) return { soffice: sofficeIn(path.join(root, pack.name)), need: null };
  if (dev) return { soffice: dev, need: null };
  if (installed) return { soffice: installed, need: null };
  const older = done.filter(n => !pack || n !== pack.name);
  if (older.length) return { soffice: sofficeIn(path.join(root, older.at(-1))), need: pack ? 'newer' : null };
  return { soffice: null, need: 'download' };
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm test tests/reader.test.js`
Expected: every line `PASS`, `All 1 test files passed`.

- [ ] **Step 5: Commit**

```powershell
git add reader.js tests/reader.test.js
git commit -q -m @'
feat: reader.js — the reader inside the Store package is the first choice, when it is there

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 3: updater.js — the Store copy never updates itself

**Files:**
- Modify: `updater.js:10-11`
- Test: `tests/updater.test.js` (after line 15)

**Interfaces:**
- Produces: `updatesRunHere({ packaged, platform, store = false }) → boolean` (false when `store === true`).

- [ ] **Step 1: Write the failing test** — in `tests/updater.test.js`, after the check `'Updates run only in the installed Windows app'` (ends line 15), add:

```js
  check('…and not in the Microsoft Store copy (the Store updates it)',
    up.updatesRunHere({ packaged: true, platform: 'win32', store: true }) === false && up.updatesRunHere({ packaged: true, platform: 'win32', store: false }) === true);
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test tests/updater.test.js`
Expected: `FAIL  …and not in the Microsoft Store copy (the Store updates it)`.

- [ ] **Step 3: Implement** — in `updater.js`, replace lines 10-11:

```js
// Only the installed Windows app updates itself: not `pnpm start`, and not the Microsoft Store copy (the Store updates
// it; store.js).
function updatesRunHere({ packaged, platform, store = false }) { return packaged === true && platform === 'win32' && store !== true; }
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm test tests/updater.test.js`
Expected: every line `PASS`.

- [ ] **Step 5: Commit**

```powershell
git add updater.js tests/updater.test.js
git commit -q -m @'
feat: updater.js — the Microsoft Store copy never updates itself

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 4: main.js and the page — wire the Store copy

**Files:**
- Modify: `main.js:8-29` (requires, Store block, menu commands), `main.js:94-97` (`chooseReader`), `main.js:439-441` (`check-updates`), `main.js:456` (menu repair), `main.js:635` (`cleanOld`), `main.js:642-644` (updater)
- Modify: `src/app.js:1977` (`checkUpdatesCmd`)
- Test: `tests/store-wiring.test.js`

**Interfaces:**
- Consumes: Task 1 `store.isStoreCopy`, `store.readStoreInfo`, `store.storePageUrl`, `store.bundledSoffice`; Task 2 `chooseReader({ bundled })`; Task 3 `updatesRunHere({ store })`.
- Produces: IPC `check-updates` answers `{ kind: 'store' }` in the Store copy (after opening the Store page); test switch `BOHPUM_STORE_TEST = '{"resources":"<dir>"}'` (ignored in a packaged app).

- [ ] **Step 1: Write the failing test** — create `tests/store-wiring.test.js`:

```js
// main.js as the Microsoft Store copy (BOHPUM_STORE_TEST stands in for process.windowsStore and the package's resources
// folder): the Publisher reader inside the package is used and nothing is downloaded; Help › Check for Updates opens
// Bohpum's page in the Store (store.js storePageUrl) and leaves no box — the Store updates this copy.
const { shell, Menu } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, ROOT } = require('./harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-store-'));
const RES = tmp();
const PACK = { name: 'LibreOffice-25.8.2-pack1', size: 1048576, sha256: '0'.repeat(64) };

run(async (t, check) => {
  const store = require(path.join(ROOT, 'store.js'));
  await t.ready(null);   // the welcome screen and What's new closed; nothing opened (that would start LibreOffice)
  const bundled = store.bundledSoffice(RES);

  const st = await t.js('api.readerStatus()');
  check('The reader inside the package: nothing to download', st.need === null, st);
  fs.rmSync(path.join(RES, 'libreoffice'), { recursive: true, force: true });
  const gone = await t.js('api.readerStatus()');
  check('A package without its reader (never expected) can\'t download one either', gone.need === 'download' && gone.canDownload === false, gone);
  fs.mkdirSync(path.dirname(bundled), { recursive: true }); fs.writeFileSync(bundled, 'x');

  const opened = [];
  shell.openExternal = async (u) => { opened.push(u); };
  const want = store.storePageUrl(store.readStoreInfo(path.join(ROOT, 'store.json')));
  check('Check for Updates: the Store copy answers "store" and opens Bohpum in the Store',
    same(await t.js('api.checkUpdates()'), { kind: 'store' }) && same(opened, [want]), { opened, want });
  opened.length = 0;
  Menu.getApplicationMenu().items.find(i => i.label === 'Help').submenu.items.find(i => i.label === 'Check for Updates…').click();
  await t.sleep(800);
  check('Help › Check for Updates… opens the Store and leaves no box',
    same(opened, [want]) && await t.js(`!document.querySelector('#modal-root').children.length`), { opened, want });
}, {
  setup: () => {
    process.env.LOCALAPPDATA = tmp(); process.env.ProgramFiles = tmp(); process.env['ProgramFiles(x86)'] = tmp();
    process.env.BOHPUM_READER_TEST = JSON.stringify({ base: 'http://127.0.0.1:9/', pack: PACK });   // no developer copy
    const prog = path.join(RES, 'libreoffice', 'program'); fs.mkdirSync(prog, { recursive: true }); fs.writeFileSync(path.join(prog, 'soffice.exe'), 'x');
    process.env.BOHPUM_STORE_TEST = JSON.stringify({ resources: RES });
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test tests/store-wiring.test.js`
Expected: `FAIL  The reader inside the package: nothing to download` (`need: 'download'`) and `FAIL  Check for Updates: …` (`{ kind: 'dev' }`).

- [ ] **Step 3: main.js — the Store block** — after `const reader = require('./reader');` (line 10) add:

```js
const store = require('./store');
```

and after `let up = null;              // automatic updates (updater.js), only in the installed app with the key` (line 17) add:

```js

// The Microsoft Store copy (store.js): Windows says so (process.windowsStore). Tests only (never in the installed app):
// BOHPUM_STORE_TEST = { resources } makes `electron .` act as one, with <resources> standing in for its resources folder.
const storeTest = (() => {
  if (app.isPackaged || !process.env.BOHPUM_STORE_TEST) return null;
  try { return JSON.parse(process.env.BOHPUM_STORE_TEST) || {}; } catch { return null; }
})();
const STORE = store.isStoreCopy({ windowsStore: process.windowsStore, test: !!storeTest });
const STORE_INFO = STORE ? store.readStoreInfo(path.join(__dirname, 'store.json')) : null;   // its Store ID, for Check for Updates
const RESOURCES = (storeTest && storeTest.resources) || process.resourcesPath;
```

- [ ] **Step 4: main.js — menu commands do nothing in the Store copy** — replace

```js
  process.exit(app.isPackaged ? menu.runCommand(menuCmd, {
```

with

```js
  // the Store copy's menu comes with its package (build/store-manifest.xml): nothing to set up or remove
  process.exit(STORE ? 0 : app.isPackaged ? menu.runCommand(menuCmd, {
```

- [ ] **Step 5: main.js — the bundled reader** — in `function chooseReader()`, replace

```js
  const r = reader.chooseReader({ root: READER.root, pack: READER.pack, dev: devSoffice(), installed: installedSoffice() });
```

with

```js
  const r = reader.chooseReader({ root: READER.root, pack: READER.pack, bundled: STORE ? store.bundledSoffice(RESOURCES) : null,
    dev: devSoffice(), installed: installedSoffice() });
```

- [ ] **Step 6: main.js — Check for Updates opens the Store** — replace

```js
ipcMain.handle('check-updates', () => up ? up.checkNow() : { kind: 'dev' });
```

with

```js
// The Store copy: the Store updates it, so Check for Updates opens Bohpum's page there (store.js storePageUrl).
ipcMain.handle('check-updates', () => {
  if (STORE) { shell.openExternal(store.storePageUrl(STORE_INFO)).catch(() => {}); return { kind: 'store' }; }
  return up ? up.checkNow() : { kind: 'dev' };
});
```

- [ ] **Step 7: main.js — no menu repair, no DLL clean-up, no updater in the Store copy**

Replace `    return { needed: app.isPackaged && menu.repairNeeded({` with:

```js
    return { needed: app.isPackaged && !STORE && menu.repairNeeded({
```

Replace `    if (app.isPackaged) menu.cleanOld(path.dirname(process.execPath)); // menu DLLs moved aside by an update` with:

```js
    if (app.isPackaged && !STORE) menu.cleanOld(path.dirname(process.execPath)); // menu DLLs moved aside by an update
```

Replace

```js
    // only a copy built by the release job carries the key (update-config.json), so a copy without it doesn't check.
    if (updates.updatesRunHere({ packaged: app.isPackaged, platform: process.platform })) {
```

with

```js
    // only a copy built by the release job carries the key (update-config.json), so a copy without it doesn't check;
    // the Store copy never does (the Store updates it).
    if (updates.updatesRunHere({ packaged: app.isPackaged, platform: process.platform, store: STORE })) {
```

- [ ] **Step 8: the page — no box for the Store answer** — in `src/app.js`, `checkUpdatesCmd`, after `  m.close();` add:

```js
  if (a.kind === 'store') return;   // main opened Bohpum's page in the Store, which updates this copy
```

- [ ] **Step 9: Run the new test and the ones around it**

Run: `pnpm test tests/store-wiring.test.js tests/update-wiring.test.js tests/update-boxes.test.js tests/reader-nokey.test.js`
Expected: every line `PASS`, `All 4 test files passed`.

- [ ] **Step 10: Commit**

```powershell
git add main.js src/app.js tests/store-wiring.test.js
git commit -q -m @'
feat: the Microsoft Store copy uses the reader inside, never updates itself, and Check for Updates opens the Store

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 5: the Store package's build files — config, manifest, pictures

**Files:**
- Create: `scripts/store-config.js`, `build/store.config.js`, `build/store-manifest.xml`
- Create (generated): `build/appx/StoreLogo.png`, `build/appx/Square44x44Logo.png`, `build/appx/Square150x150Logo.png`, `build/appx/BpumFile.png`
- Modify: `scripts/make-icons.js:1-17`, `package.json:10-18` (`scripts`), `.gitignore`
- Test: `tests/store-package.test.js`

**Interfaces:**
- Consumes: Task 1 `store.SIDELOAD`, `store.readStoreInfo`; explorer-menu.js `CLSID`.
- Produces: `scripts/store-config.js` → `NOT_IN_STORE` (`['update-config.json', 'reader-pack.json']`), `storeBuildConfig({ base, id, readerDir, storeJson }) → electron-builder config`; `build/store.config.js` (env `BOHPUM_STORE_SIDELOAD=1`, `BOHPUM_STORE_READER=<folder>`); `pnpm run dist:store`; output `dist-store/Bohpum-Store-<version>.msix` and `dist-store/win-unpacked/`.

- [ ] **Step 1: Write the failing test** — create `tests/store-package.test.js`:

```js
// The Microsoft Store package's build files (scripts/store-config.js, build/store.config.js, build/store-manifest.xml,
// build/appx/): the installer's own config with no update key and no pack info inside, the Publisher reader and the menu
// DLL (not its sparse package), the appx target into dist-store; the manifest's file types and right-click menu (the
// installer menu's CLSID), and the pictures it names. Nothing is built here.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pngSize = (f) => { const b = fs.readFileSync(f); return b.toString('ascii', 12, 16) === 'IHDR' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

run(async (t, check) => {
  const store = require(path.join(ROOT, 'store.js'));
  const { storeBuildConfig, NOT_IN_STORE } = require(path.join(ROOT, 'scripts', 'store-config.js'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const id = { identityName: 'Test.Bohpum', publisher: 'CN=TEST', publisherDisplayName: 'Test', storeId: '9TEST0000000' };
  const c = storeBuildConfig({ base: pkg.build, id, readerDir: 'dist-reader/LibreOffice', storeJson: true });

  check('No update key and no pack info in the Store package',
    same(NOT_IN_STORE, ['update-config.json', 'reader-pack.json']) && NOT_IN_STORE.every(f => !c.files.includes(f)), c.files);
  check('…everything else the installer carries, and store.json',
    pkg.build.files.filter(f => !NOT_IN_STORE.includes(f)).every(f => c.files.includes(f)) && c.files.includes('store.json'), c.files);
  check('A sideloaded test package has no store.json',
    !storeBuildConfig({ base: pkg.build, id: store.SIDELOAD, readerDir: 'x', storeJson: false }).files.includes('store.json'));
  check('The reader goes inside as resources/libreoffice; the menu DLL without its sparse package',
    same(c.extraResources, [{ from: 'explorer-menu/out', to: 'explorer-menu', filter: ['BohpumMenu.dll'] }, { from: 'dist-reader/LibreOffice', to: 'libreoffice' }]), c.extraResources);
  check('appx target into dist-store, with the app icon and no update address',
    c.win.target === 'appx' && c.win.icon === pkg.build.win.icon && c.directories.output === 'dist-store' && c.publish === null, { win: c.win, dirs: c.directories, publish: c.publish });
  check('The identity from Partner Center, and Bohpum\'s own Store settings',
    c.appx.identityName === id.identityName && c.appx.publisher === id.publisher && c.appx.publisherDisplayName === id.publisherDisplayName
      && c.appx.applicationId === 'Bohpum' && c.appx.displayName === 'Bohpum' && c.appx.minVersion === '10.0.19041.0'
      && c.appx.maxVersionTested === '10.0.26100.0' && c.appx.customManifestPath === 'build/store-manifest.xml'
      && c.appx.artifactName === 'Bohpum-Store-${version}.msix', c.appx);
  check('The installer\'s own config is untouched', pkg.build.win.target === 'nsis' && pkg.build.files.includes('update-config.json'), pkg.build.win);

  // build/store.config.js: what electron-builder loads
  process.env.BOHPUM_STORE_SIDELOAD = '1'; process.env.BOHPUM_STORE_READER = 'vendor/libreoffice';
  const side = require(path.join(ROOT, 'build', 'store.config.js'));
  check('build/store.config.js with BOHPUM_STORE_SIDELOAD=1: the unsigned test identity and the reader folder given',
    side.appx.publisher === store.SIDELOAD.publisher && side.extraResources[1].from === 'vendor/libreoffice' && !side.files.includes('store.json'), side.appx);
  const real = path.join(ROOT, 'store.json');
  if (fs.existsSync(real)) check('store.json holds a valid Partner Center identity', !!store.readStoreInfo(real), fs.readFileSync(real, 'utf8'));

  // ---- the manifest
  const xml = fs.readFileSync(path.join(ROOT, 'build', 'store-manifest.xml'), 'utf8');
  const clsid = require(path.join(ROOT, 'explorer-menu.js')).CLSID.replace(/[{}]/g, '');
  check('The manifest has the .bpum and .pub file types, with the Bohpum file picture',
    /<uap:FileType>\.bpum<\/uap:FileType>/.test(xml) && /<uap:FileType>\.pub<\/uap:FileType>/.test(xml)
      && (xml.match(/<uap:Logo>assets\\BpumFile\.png<\/uap:Logo>/g) || []).length === 2);
  check('…the right-click menu on .pub, with the installer menu\'s CLSID (the verb and the COM class)',
    /<desktop5:ItemType Type="\.pub">/.test(xml) && (xml.toLowerCase().match(new RegExp(clsid, 'g')) || []).length === 2);
  check('…the menu DLL from inside the package (Bohpum.exe two folders above it, as menu.cpp expects)',
    /<com:Class Id="[^"]+" Path="app\\resources\\explorer-menu\\BohpumMenu\.dll" ThreadingModel="STA" \/>/.test(xml));
  const macros = [...xml.matchAll(/\$\{([a-zA-Z0-9]+)\}/g)].map(m => m[1]);
  const known = ['identityName', 'arch', 'publisher', 'version', 'displayName', 'publisherDisplayName', 'description', 'logo', 'resourceLanguages',
    'minVersion', 'maxVersionTested', 'capabilities', 'applicationId', 'executable', 'backgroundColor', 'square150x150Logo', 'square44x44Logo'];
  check('…only electron-builder\'s own macros, and not its extensions (the file types are written here)',
    macros.every(m => known.includes(m)) && !macros.includes('extensions'), macros);
  check('…every namespace prefix it uses is declared', ['uap', 'desktop4', 'desktop5', 'com', 'rescap'].every(p => new RegExp(`xmlns:${p}="`).test(xml)));

  // ---- the pictures (build/appx, made by pnpm run icons)
  const A = (f) => path.join(ROOT, 'build', 'appx', f);
  const sizes = Object.fromEntries(['StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png', 'BpumFile.png'].map(f => [f, fs.existsSync(A(f)) ? pngSize(A(f)) : null]));
  check('Store pictures: StoreLogo 50, Square44x44Logo 44, Square150x150Logo 150, BpumFile 256 high',
    same(sizes['StoreLogo.png'], [50, 50]) && same(sizes['Square44x44Logo.png'], [44, 44]) && same(sizes['Square150x150Logo.png'], [150, 150])
      && !!sizes['BpumFile.png'] && sizes['BpumFile.png'][1] === 256, sizes);

  check('pnpm run dist:store builds the Store package with build/store.config.js',
    /electron-builder --win appx --publish never --config build\/store\.config\.js/.test(pkg.scripts['dist:store'] || ''), pkg.scripts);
  const ignored = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map(s => s.trim());
  check('dist-store/ is never committed', ignored.includes('dist-store/'), ignored);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test tests/store-package.test.js`
Expected: `FAIL  test ran to the end` with `Cannot find module` …`store-config.js`.

- [ ] **Step 3: Create scripts/store-config.js**

```js
// The electron-builder config of the Microsoft Store package, made from the installer's own (package.json "build"): no
// update key and no reader pack info inside (anyone can download a Store package and open it, and the Store copy
// downloads nothing), the Publisher reader inside as resources\libreoffice, the menu DLL without its sparse package (the
// package manifest has the menu: build/store-manifest.xml), the appx target, into dist-store\. build/store.config.js
// hands it the identity and the reader folder. No Electron here.
const NOT_IN_STORE = Object.freeze(['update-config.json', 'reader-pack.json']);

// id: { identityName, publisher, publisherDisplayName } (store.js); readerDir: the LibreOffice folder to put inside;
// storeJson: carry store.json (its Store ID, for Check for Updates; a sideloaded test package has none)
function storeBuildConfig({ base, id, readerDir, storeJson }) {
  return {
    ...base,
    directories: { ...(base.directories || {}), output: 'dist-store' },
    files: [...base.files.filter(f => !NOT_IN_STORE.includes(f)), ...(storeJson ? ['store.json'] : [])],
    extraResources: [
      { from: 'explorer-menu/out', to: 'explorer-menu', filter: ['BohpumMenu.dll'] },
      { from: readerDir, to: 'libreoffice' }
    ],
    win: { ...base.win, target: 'appx' },
    publish: null,   // no app-update.yml: the Store updates this copy
    appx: {
      identityName: id.identityName, publisher: id.publisher, publisherDisplayName: id.publisherDisplayName,
      applicationId: 'Bohpum', displayName: 'Bohpum', backgroundColor: 'transparent', languages: ['en-US'],
      minVersion: '10.0.19041.0', maxVersionTested: '10.0.26100.0',   // the menu's FileExplorerContextMenus needs 2004+
      customManifestPath: 'build/store-manifest.xml',
      artifactName: 'Bohpum-Store-${version}.msix'
    }
  };
}

module.exports = { NOT_IN_STORE, storeBuildConfig };
```

- [ ] **Step 4: Create build/store.config.js**

```js
// electron-builder loads this for the Microsoft Store package: `pnpm run dist:store`, and the release job
// (.github/workflows/release.yml). The rules: scripts/store-config.js. The identity is store.json (Partner Center ›
// Product identity, docs/updates-setup.md section 8); BOHPUM_STORE_SIDELOAD=1 makes the unsigned test package for this
// PC instead (store.js SIDELOAD). BOHPUM_STORE_READER: the LibreOffice folder to put inside — dist-reader/LibreOffice
// by default (what the release job has), vendor/libreoffice on a PC (pnpm run bundle-libreoffice).
const path = require('path');
const store = require('../store');
const { storeBuildConfig } = require('../scripts/store-config');

const sideload = process.env.BOHPUM_STORE_SIDELOAD === '1';
const id = sideload ? store.SIDELOAD : store.readStoreInfo(path.join(__dirname, '..', 'store.json'));
if (!id) throw new Error('store.json is missing or not valid: put Partner Center › Product identity in it (docs/updates-setup.md section 8), or set BOHPUM_STORE_SIDELOAD=1 for a test package');

module.exports = storeBuildConfig({
  base: require('../package.json').build, id, storeJson: !sideload,
  readerDir: process.env.BOHPUM_STORE_READER || 'dist-reader/LibreOffice'
});
```

- [ ] **Step 5: Create build/store-manifest.xml** (electron-builder fills each dollar-brace macro; no other macro may appear, not even in a comment)

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Bohpum - the Microsoft Store package's manifest (build/store.config.js; electron-builder fills in its macros).
     electron-builder's own template, plus: the .bpum and .pub file types (Publisher keeps .pub: Windows never makes a
     packaged app the default by itself), and the File Explorer menu "Convert to Bohpum (.bpum)" on .pub files - the
     same BohpumMenu.dll and CLSID as explorer-menu/AppxManifest.xml, from inside this package (no sparse package and
     no HKCU keys). menu.cpp finds Bohpum.exe two folders above the DLL: app\Bohpum.exe. -->
<Package
   xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
   xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
   xmlns:desktop4="http://schemas.microsoft.com/appx/manifest/desktop/windows10/4"
   xmlns:desktop5="http://schemas.microsoft.com/appx/manifest/desktop/windows10/5"
   xmlns:com="http://schemas.microsoft.com/appx/manifest/com/windows10"
   xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
   IgnorableNamespaces="uap desktop4 desktop5 com rescap">
  <!-- single quotes around Publisher: its value may hold double quotes -->
  <Identity Name="${identityName}" ProcessorArchitecture="${arch}" Publisher='${publisher}' Version="${version}" />
  <Properties>
    <DisplayName>${displayName}</DisplayName>
    <PublisherDisplayName>${publisherDisplayName}</PublisherDisplayName>
    <Description>${description}</Description>
    <Logo>${logo}</Logo>
  </Properties>
  <Resources>
    ${resourceLanguages}
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="${minVersion}" MaxVersionTested="${maxVersionTested}" />
  </Dependencies>
  ${capabilities}
  <Applications>
    <Application Id="${applicationId}" Executable="${executable}" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements BackgroundColor="${backgroundColor}" DisplayName="${displayName}" Description="${description}"
        Square150x150Logo="${square150x150Logo}" Square44x44Logo="${square44x44Logo}" />
      <Extensions>
        <uap:Extension Category="windows.fileTypeAssociation">
          <uap:FileTypeAssociation Name="bpum">
            <uap:DisplayName>Bohpum publication</uap:DisplayName>
            <uap:Logo>assets\BpumFile.png</uap:Logo>
            <uap:SupportedFileTypes><uap:FileType>.bpum</uap:FileType></uap:SupportedFileTypes>
          </uap:FileTypeAssociation>
        </uap:Extension>
        <uap:Extension Category="windows.fileTypeAssociation">
          <uap:FileTypeAssociation Name="pub">
            <uap:DisplayName>Microsoft Publisher file</uap:DisplayName>
            <uap:Logo>assets\BpumFile.png</uap:Logo>
            <uap:SupportedFileTypes><uap:FileType>.pub</uap:FileType></uap:SupportedFileTypes>
          </uap:FileTypeAssociation>
        </uap:Extension>
        <desktop4:Extension Category="windows.fileExplorerContextMenus">
          <desktop4:FileExplorerContextMenus>
            <desktop5:ItemType Type=".pub">
              <desktop5:Verb Id="Bohpum" Clsid="1e11f0a8-6fc0-4a9c-9031-6924b71a4d77" />
            </desktop5:ItemType>
          </desktop4:FileExplorerContextMenus>
        </desktop4:Extension>
        <com:Extension Category="windows.comServer">
          <com:ComServer>
            <com:SurrogateServer DisplayName="Bohpum Explorer menu">
              <com:Class Id="1e11f0a8-6fc0-4a9c-9031-6924b71a4d77" Path="app\resources\explorer-menu\BohpumMenu.dll" ThreadingModel="STA" />
            </com:SurrogateServer>
          </com:ComServer>
        </com:Extension>
      </Extensions>
    </Application>
  </Applications>
</Package>
```

- [ ] **Step 6: The pictures** — in `scripts/make-icons.js`, replace the header comment's second and fourth lines and the `JOBS` entries so the Store pictures are made with the others:

```js
// Makes every icon from the two source pictures (pnpm run icons; run it again after changing either picture):
//   build/logo.png       → build/icon.ico (16–256) + icon.png (the app: exe, installer, windows, Explorer menu item),
//                          explorer-menu/Assets/* (the Windows 11 menu package), build/appx/* (the Microsoft Store
//                          package's logos), src/img/logo.png (title row, welcome)
//   build/bpum-file.png  → build/bpum.ico (.bpum files in Explorer), src/img/bpum-file.png (the convert window),
//                          build/appx/BpumFile.png (the Store package's .bpum and .pub file types)
```

```js
const JOBS = [
  { src: 'build/logo.png', ico: 'build/icon.ico', png: { 'build/icon.png': 256, 'explorer-menu/Assets/Square44x44Logo.png': 44,
    'explorer-menu/Assets/Square150x150Logo.png': 150, 'explorer-menu/Assets/StoreLogo.png': 50, 'src/img/logo.png': 128,
    'build/appx/StoreLogo.png': 50, 'build/appx/Square44x44Logo.png': 44, 'build/appx/Square150x150Logo.png': 150 } },
  { src: 'build/bpum-file.png', ico: 'build/bpum.ico', png: { 'src/img/bpum-file.png': 120, 'build/appx/BpumFile.png': 256 } }
];
```

Then run: `pnpm run icons`
Expected: two `make-icons: …` lines naming the new `build/appx/…` files. Then `git status --short`: the four new `build/appx/*.png`. If any existing icon file shows as modified, put it back with `git checkout -- <that file>` (only the new pictures are wanted).

- [ ] **Step 7: The script and the ignore line** — in `package.json` `scripts`, after the `"dist"` line add:

```json
    "dist:store": "node scripts/check-notes.js && node scripts/build-explorer-menu.js && electron-builder --win appx --publish never --config build/store.config.js",
```

In `.gitignore`, after the `dist/` line add:

```
dist-store/
```

- [ ] **Step 8: Run the test to make sure it passes**

Run: `pnpm test tests/store-package.test.js tests/update-wiring.test.js`
Expected: every line `PASS`, `All 2 test files passed`.

- [ ] **Step 9: Commit**

```powershell
git add scripts/store-config.js build/store.config.js build/store-manifest.xml build/appx scripts/make-icons.js package.json .gitignore tests/store-package.test.js
git commit -q -m @'
build: the Microsoft Store package's config, manifest (file types, right-click menu) and logos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 6: scripts/store-check.js — the built package has the reader and the menu, and no key

**Files:**
- Create: `scripts/store-check.js`
- Test: `tests/store-check.test.js`

**Interfaces:**
- Consumes: Task 5's output layout (`<dist>/<msix>`, `<dist>/win-unpacked/resources/…`).
- Produces: `asarFiles(file) → string[]` (paths inside an app.asar, `/`-separated); `storeProblems(dist, msix) → string[]` (empty = good); CLI `node scripts/store-check.js <dist-store> <msix name>` exits 1 with `::error::` lines on problems, 0 with one `store-check: …` line.

- [ ] **Step 1: Write the failing test** — create `tests/store-check.test.js`:

```js
// scripts/store-check.js on made-up build folders (nothing is built here): a Store package passes only with the
// Publisher reader and the menu DLL inside, and with no update key (inside app.asar or next to it), no app-update.yml
// and no sparse menu package. Also run as the release job runs it.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

// an app.asar with these (empty) files: the 16-byte pickle head, then the JSON header (as Electron writes it)
function fakeAsar(file, names) {
  const files = {};
  for (const n of names) { let node = files; const parts = n.split('/'); for (const p of parts.slice(0, -1)) node = (node[p] = node[p] || { files: {} }).files; node[parts.at(-1)] = { size: 0, offset: '0' }; }
  const json = Buffer.from(JSON.stringify({ files }));
  const head = Buffer.alloc(16); head.writeUInt32LE(4, 0); head.writeUInt32LE(json.length + 8, 4); head.writeUInt32LE(json.length + 4, 8); head.writeUInt32LE(json.length, 12);
  fs.writeFileSync(file, Buffer.concat([head, json]));
}

run(async (t, check) => {
  const { asarFiles, storeProblems } = require(path.join(ROOT, 'scripts', 'store-check.js'));
  let k = 0;
  const MSIX = 'Bohpum-Store-9.9.9.msix';
  const make = ({ key = false, keyBeside = false, reader = true, dll = true, sparse = false, updateYml = false, msix = true } = {}) => {
    const dist = path.join(t.ctx.tmp, 'dist' + (++k)), res = path.join(dist, 'win-unpacked', 'resources');
    fs.mkdirSync(path.join(res, 'explorer-menu'), { recursive: true });
    fakeAsar(path.join(res, 'app.asar'), ['main.js', 'store.js', 'src/app.js', ...(key ? ['update-config.json'] : [])]);
    if (keyBeside) { fs.mkdirSync(path.join(res, 'app'), { recursive: true }); fs.writeFileSync(path.join(res, 'app', 'update-config.json'), '{}'); }
    if (reader) { fs.mkdirSync(path.join(res, 'libreoffice', 'program'), { recursive: true }); fs.writeFileSync(path.join(res, 'libreoffice', 'program', 'soffice.exe'), 'x'); }
    if (dll) fs.writeFileSync(path.join(res, 'explorer-menu', 'BohpumMenu.dll'), 'x');
    if (sparse) fs.writeFileSync(path.join(res, 'explorer-menu', 'Bohpum.ExplorerMenu.msix'), 'x');
    if (updateYml) fs.writeFileSync(path.join(res, 'app-update.yml'), 'url: x');
    if (msix) fs.writeFileSync(path.join(dist, MSIX), 'x');
    return dist;
  };

  const good = make();
  check('app.asar\'s file list is read from its header', JSON.stringify(asarFiles(path.join(good, 'win-unpacked', 'resources', 'app.asar'))) === '["main.js","store.js","src/app.js"]');
  check('A good Store package: no problems', storeProblems(good, MSIX).length === 0, storeProblems(good, MSIX));
  const cases = {
    'the update key in app.asar': make({ key: true }), 'the update key next to it': make({ keyBeside: true }), 'no reader': make({ reader: false }),
    'no menu DLL': make({ dll: false }), 'the sparse menu package': make({ sparse: true }), 'app-update.yml': make({ updateYml: true }), 'no .msix': make({ msix: false })
  };
  for (const [what, dist] of Object.entries(cases)) check(`A package with ${what} is refused`, storeProblems(dist, MSIX).length === 1, storeProblems(dist, MSIX));

  const cli = (dist) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'store-check.js'), dist, MSIX], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  const ok = cli(good), bad = cli(cases['the update key in app.asar']);
  check('As the release runs it: 0 for a good package, 1 with an ::error:: line for a bad one',
    ok.status === 0 && /^store-check: /m.test(ok.stdout) && bad.status === 1 && /::error::.*update key/.test(bad.stderr), { ok, bad });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test tests/store-check.test.js`
Expected: `FAIL  test ran to the end` with `Cannot find module` …`store-check.js`.

- [ ] **Step 3: Create scripts/store-check.js**

```js
// After electron-builder made the Microsoft Store package (build/store.config.js): the app inside it has the
// Publisher reader and the menu DLL, and none of what only the installer may carry — the update key (anyone can
// download a Store package and open it), app-update.yml, the sparse menu package.
// `node scripts/store-check.js <dist-store> <msix name>`; run by .github/workflows/release.yml.
const fs = require('fs'), path = require('path');

// The files in an Electron app.asar: its header is JSON after a 16-byte pickle head (the JSON's length at offset 12)
function asarFiles(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(16); fs.readSync(fd, head, 0, 16, 0);
    const json = Buffer.alloc(head.readUInt32LE(12)); fs.readSync(fd, json, 0, json.length, 16);
    const out = [];
    const walk = (node, at) => { for (const [k, v] of Object.entries(node.files || {})) { const p = at ? at + '/' + k : k; if (v.files) walk(v, p); else out.push(p); } };
    walk(JSON.parse(json.toString('utf8')), '');
    return out;
  } finally { fs.closeSync(fd); }
}

// → the problems, in plain words (none = good)
function storeProblems(dist, msix) {
  const res = path.join(dist, 'win-unpacked', 'resources'), there = (...p) => fs.existsSync(path.join(...p)), problems = [];
  if (!there(dist, msix)) problems.push(`there is no ${msix}`);
  if (!there(res, 'libreoffice', 'program', 'soffice.exe')) problems.push('the Publisher reader is not inside (resources/libreoffice/program/soffice.exe)');
  if (!there(res, 'explorer-menu', 'BohpumMenu.dll')) problems.push('the menu DLL is not inside (resources/explorer-menu/BohpumMenu.dll)');
  if (there(res, 'explorer-menu', 'Bohpum.ExplorerMenu.msix')) problems.push('the sparse menu package is inside (the Store package has its own menu)');
  if (there(res, 'app-update.yml')) problems.push('app-update.yml is inside (the Store updates this copy)');
  let files = [];
  try { files = asarFiles(path.join(res, 'app.asar')); } catch (e) { problems.push('app.asar could not be read: ' + e.message); }
  if (files.includes('update-config.json') || there(res, 'app', 'update-config.json')) problems.push('the update key (update-config.json) is inside');
  return problems;
}

if (require.main === module) {
  const [dist, msix] = process.argv.slice(2);
  if (!dist || !msix) { console.error('Usage: node scripts/store-check.js <dist-store> <msix name>'); process.exit(2); }
  const problems = storeProblems(path.resolve(dist), msix);
  for (const p of problems) console.error('::error::Store package: ' + p);
  if (problems.length) process.exit(1);
  console.log(`store-check: ${msix} has the Publisher reader and the menu, and no update key`);
}

module.exports = { asarFiles, storeProblems };
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm test tests/store-check.test.js`
Expected: every line `PASS`, `All 1 test files passed`.

- [ ] **Step 5: Commit**

```powershell
git add scripts/store-check.js tests/store-check.test.js
git commit -q -m @'
build: scripts/store-check.js — the Store package has the reader and the menu, and no update key

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 7: scripts/store-reader.js — the reader for the Store package when the pack is already in R2

**Files:**
- Create: `scripts/store-reader.js`
- Test: `tests/store-reader.test.js`

**Interfaces:**
- Consumes: reader.js `downloadPack`, `packUrl`, `readPackInfo`; updater.js `keyHeaders`, `readUpdateConfig`; tests/reader-server.js `makeFakePack`, `startServer`.
- Produces: `storeReader({ out, base, pack, key, fetch? }) → Promise<string>` (the folder `<out>/LibreOffice`); CLI `node scripts/store-reader.js <out folder>` (reads `package.json` `build.publish.url`, `reader-pack.json`, `update-config.json`).

- [ ] **Step 1: Write the failing test** — create `tests/store-reader.test.js`:

```js
// scripts/store-reader.js with a fake private bucket (tests/reader-server.js): the Store package's reader is the pack
// already in R2, downloaded with the update key and checked like installed copies check it, unpacked into
// <out>\LibreOffice; a refused or damaged download leaves no LibreOffice folder behind.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');
const { makeFakePack, startServer } = require('./reader-server');

const KEY = { clientId: 'store-id', clientSecret: 'store-secret' };

run(async (t, check) => {
  const { storeReader } = require(path.join(ROOT, 'scripts', 'store-reader.js'));
  const { zip, pack } = await makeFakePack(t.ctx.tmp);
  const server = await startServer({ zip, pack, key: KEY });
  try {
    const out = path.join(t.ctx.tmp, 'out1');
    const dir = await storeReader({ out, base: server.base, pack, key: KEY });
    check('The pack from R2 is unpacked into <out>\\LibreOffice', dir === path.join(out, 'LibreOffice') && fs.existsSync(path.join(dir, 'program', 'soffice.exe')), dir);
    check('…and nothing else is left in <out>', JSON.stringify(fs.readdirSync(out)) === '["LibreOffice"]', fs.readdirSync(out));

    const out2 = path.join(t.ctx.tmp, 'out2');
    let err = null; try { await storeReader({ out: out2, base: server.base, pack, key: { clientId: 'x', clientSecret: 'y' } }); } catch (e) { err = e; }
    check('A wrong key is refused, and no LibreOffice folder is made', !!err && !fs.existsSync(path.join(out2, 'LibreOffice')), String(err));

    const out3 = path.join(t.ctx.tmp, 'out3');
    err = null; try { await storeReader({ out: out3, base: server.base, pack: { ...pack, sha256: '0'.repeat(64) }, key: KEY }); } catch (e) { err = e; }
    check('A pack that doesn\'t match reader-pack.json is refused, and no LibreOffice folder is made', !!err && !fs.existsSync(path.join(out3, 'LibreOffice')), String(err));
  } finally { await server.close(); }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test tests/store-reader.test.js`
Expected: `FAIL  test ran to the end` with `Cannot find module` …`store-reader.js`.

- [ ] **Step 3: Create scripts/store-reader.js**

```js
// For the Microsoft Store package when a release reuses the Publisher reader pack already in R2 (the job then builds
// no pack): download that pack with the update key the job already wrote into the app (update-config.json — this step
// gets no secret), check it against reader-pack.json exactly as installed copies do (reader.js downloadPack), and
// unpack it into <out>\LibreOffice, where build/store.config.js takes it from.
// `node scripts/store-reader.js <out folder>`; run by .github/workflows/release.yml.
const fs = require('fs'), path = require('path');
const reader = require('../reader'), updates = require('../updater');
const ROOT = path.join(__dirname, '..');

async function storeReader({ out, base, pack, key, fetch = (url, o) => globalThis.fetch(url, { headers: o.headers, signal: o.signal }) }) {
  const root = path.join(out, 'store-download'), dest = path.join(out, 'LibreOffice');
  try {
    await reader.downloadPack({ fetch, url: reader.packUrl(base, pack), headers: updates.keyHeaders(key), pack, root });
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(path.join(root, pack.name), dest);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  return dest;
}

if (require.main === module) {
  const out = process.argv[2];
  if (!out) { console.error('Usage: node scripts/store-reader.js <out folder>'); process.exit(2); }
  const base = require('../package.json').build.publish.url.replace(/\/*$/, '/');
  const pack = reader.readPackInfo(path.join(ROOT, 'reader-pack.json')), key = updates.readUpdateConfig(path.join(ROOT, 'update-config.json'));
  if (!pack || !key) { console.error('::error::store-reader needs reader-pack.json and update-config.json (it runs after "Put the update key into the app")'); process.exit(1); }
  storeReader({ out: path.resolve(out), base, pack, key }).then(
    (d) => console.log(`store-reader: ${pack.name} → ${path.relative(ROOT, d)}`),
    (e) => { console.error('::error::store-reader: ' + (e && e.message || e)); process.exit(1); });
}

module.exports = { storeReader };
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `pnpm test tests/store-reader.test.js`
Expected: every line `PASS`, `All 1 test files passed`.

- [ ] **Step 5: Commit**

```powershell
git add scripts/store-reader.js tests/store-reader.test.js
git commit -q -m @'
build: scripts/store-reader.js — the Store package's reader is the pack already in R2, checked like installed copies

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 8: the release job makes the Store package and attaches it to the GitHub release

**Files:**
- Modify: `.github/workflows/release.yml` (header comment, top `env`, build job after "The build has the installer…", publish job downloads and "GitHub release")
- Test: `tests/release-workflow.test.js` (header comment; new checks after line 86)

**Interfaces:**
- Consumes: Task 5 `build/store.config.js` and `dist-store/`; Task 6 `scripts/store-check.js`; Task 7 `scripts/store-reader.js`.
- Produces: top-level env `MSIX: Bohpum-Store-${{ inputs.version }}.msix`; artifact `store`; GitHub release asset `Bohpum-Store-<version>.msix` (only when `store.json` exists).

- [ ] **Step 1: Write the failing test** — in `tests/release-workflow.test.js`, after the check `'"Is it in R2?" goes through r2_has, …'` (ends line 86), add:

```js

  // ---- the Microsoft Store package: only once store.json holds the Partner Center identity
  const storeSteps = J.build.steps.filter(s => s.name.startsWith('For the Store:') || /^ {10}name: store$/m.test(s.text));
  check('build: four Store steps, each only when store.json is there',
    storeSteps.length === 4 && storeSteps.every(s => /if: hashFiles\('store\.json'\) != ''/.test(s.text)), storeSteps.map(s => s.name));
  const sr = step('build', 'For the Store: the Publisher reader');
  check('…after the installer; the reader comes from R2 only when this run didn\'t build the pack',
    inOrder('build', ['Build the installer', 'For the Store: the Publisher reader', 'For the Store: build the Store package', 'For the Store: the package has'])
      && /needs\.check\.outputs\.have == 'true'/.test(sr.text) && /node scripts\/store-reader\.js dist-reader/.test(sr.run), sr.text);
  const sb = step('build', 'For the Store: build the Store package').run;
  check('…the update key is deleted before the Store package is built with build/store.config.js',
    pos(sb, /rm -f update-config\.json/) >= 0 && pos(sb, /electron-builder --win appx --publish never --config build\/store\.config\.js/) > pos(sb, /rm -f update-config\.json/), sb);
  check('…then scripts/store-check.js checks it', /node scripts\/store-check\.js dist-store "\$MSIX"/.test(step('build', 'For the Store: the package has').run));
  const storeDl = J.publish.steps.filter(s => /^ {10}name: store$/m.test(s.text));
  const ghRelease = step('publish', 'GitHub release').run;
  check('publish: the Store package goes to the GitHub release (when there is one), never to R2',
    storeDl.length === 1 && /if: hashFiles\('store\.json'\) != ''/.test(storeDl[0].text) && /dist-store\/\$MSIX/.test(ghRelease)
      && !/MSIX|dist-store/.test(upload.run + step('publish', 'Remove older installers').run) && /^ {2}MSIX: Bohpum-Store-\$\{\{ inputs\.version \}\}\.msix$/m.test(topEnv), ghRelease);
```

Also add to the file's header comment, after `…overwrite a reader pack installed copies already trust.`:

```js
// Once store.json holds the Partner Center identity, build also makes the Microsoft Store package (no update key in
// it, checked) and publish attaches it to the GitHub release only, never to R2.
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `pnpm test tests/release-workflow.test.js`
Expected: `FAIL  build: four Store steps, each only when store.json is there` and the other new checks FAIL; the old ones PASS.

- [ ] **Step 3: The workflow — header and env** — in `.github/workflows/release.yml`, after line 14 (`# but install nothing and run only this repository's own scripts.`) add:

```yaml
# Once store.json holds the Partner Center identity (docs/updates-setup.md section 8), build also makes the Microsoft
# Store package (store.js, build/store.config.js): the same app with the Publisher reader inside and no update key. It
# goes to the GitHub release only, never to R2; the user submits it in Partner Center, and Microsoft signs it.
```

In the top `env:`, after `  EXE: Bohpum-Setup-${{ inputs.version }}.exe` add:

```yaml
  MSIX: Bohpum-Store-${{ inputs.version }}.msix
```

- [ ] **Step 4: The workflow — build job** — after the step `The build has the installer, its blockmap and latest.yml naming it` (its `run:` block ends with the `grep -q "url: $EXE\$"` line) and before `# What publish uploads; also kept a few days…`, add:

```yaml
      # The Microsoft Store package. The reader inside it: the pack this run just built (dist-reader/LibreOffice), or the
      # one already in R2, downloaded with the key already in update-config.json and checked like installed copies do.
      - name: "For the Store: the Publisher reader unpacked (the pack already in R2)"
        if: hashFiles('store.json') != '' && needs.check.outputs.have == 'true'
        run: node scripts/store-reader.js dist-reader

      # The installer is built: the update key leaves the workspace before the Store package is made.
      - name: "For the Store: build the Store package (no update key inside)"
        if: hashFiles('store.json') != ''
        run: |
          rm -f update-config.json
          pnpm exec electron-builder --win appx --publish never --config build/store.config.js

      - name: "For the Store: the package has the reader and the menu, and no update key"
        if: hashFiles('store.json') != ''
        run: node scripts/store-check.js dist-store "$MSIX"

      - uses: actions/upload-artifact@v7
        if: hashFiles('store.json') != ''
        with:
          name: store
          path: dist-store/${{ env.MSIX }}
          if-no-files-found: error
          retention-days: 5
          compression-level: 0
```

- [ ] **Step 5: The workflow — publish job** — after the `installer` download step:

```yaml
      - uses: actions/download-artifact@v8
        with:
          name: installer
          path: dist
```

add:

```yaml
      - uses: actions/download-artifact@v8
        if: hashFiles('store.json') != ''
        with:
          name: store
          path: dist-store
```

and in the step `GitHub release (notes from What's new)`, replace the last line

```bash
          gh release create "v$VERSION" "dist/$EXE" --target "$GITHUB_SHA" --title "Bohpum $VERSION" --notes-file notes.md
```

with

```bash
          files=("dist/$EXE")
          if [ -f "dist-store/$MSIX" ]; then
            files+=("dist-store/$MSIX")
            printf '\n%s is for the Microsoft Store: submit it in Partner Center (docs/updates-setup.md section 8). Microsoft signs it.\n' "$MSIX" >> notes.md
          fi
          gh release create "v$VERSION" "${files[@]}" --target "$GITHUB_SHA" --title "Bohpum $VERSION" --notes-file notes.md
```

- [ ] **Step 6: Run it to make sure it passes**

Run: `pnpm test tests/release-workflow.test.js`
Expected: every line `PASS`, `All 1 test files passed`.

- [ ] **Step 7: Commit**

```powershell
git add .github/workflows/release.yml tests/release-workflow.test.js
git commit -q -m @'
ci: the release also makes the Microsoft Store package (once store.json is there), checks it, attaches it to the GitHub release

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 9: the setup guide, the Store listing texts, the README

**Files:**
- Modify: `docs/updates-setup.md` (new section 8 before `## Good to know`; one line in "Good to know")
- Create: `docs/store-listing.md`
- Modify: `README.md:33-51` (Releasing)

No test: these are documents. Check by reading them once.

- [ ] **Step 1: docs/updates-setup.md section 8** — before `## Good to know` add:

```markdown
## 8. The Microsoft Store

The Store version is the same Bohpum with the Publisher reader inside and no update key. Microsoft signs it, so
Windows shows no warning, and the Store keeps it up to date. The installer (sections 1–7) stays as it is.

**Once:**
1. Open a free developer account at https://storedeveloper.microsoft.com with your Microsoft account. Microsoft checks
   a photo of your ID and a selfie; this can take a few days.
2. Partner Center → **Apps and games** → **New product** → **MSIX or PWA app** → reserve the name **Bohpum**.
3. Bohpum → **Product management** → **Product identity**. Copy four values into `store.json` at the top of the
   repository, then commit and push it (they are not secret):
   ```json
   {
     "identityName": "<Package/Identity/Name>",
     "publisher": "<Package/Identity/Publisher, CN=…>",
     "publisherDisplayName": "<Package/Properties/PublisherDisplayName>",
     "storeId": "<Store ID, 12 characters>"
   }
   ```
   From then on every release also makes `Bohpum-Store-<version>.msix` and puts it on the GitHub release.
4. Put the privacy policy from `docs/store-listing.md` on a page of your website (for example
   https://smith89k.com/bohpum/privacy) — Partner Center asks for its address.
5. The first submission: **Pricing and availability** (Free; markets: all), **Properties** (category Productivity;
   privacy policy address), **Age ratings** (the questionnaire: no violence, no user content shared, no purchases),
   **Store listings** (English: description, features and keywords from `docs/store-listing.md`, at least one
   screenshot of Bohpum with a publication open), **Submission options** → restricted capabilities: paste the
   `runFullTrust` sentence from `docs/store-listing.md`.

**Each release:**
1. Release as in section 6.
2. Open the GitHub release `v<version>` and download `Bohpum-Store-<version>.msix`.
3. Partner Center → Bohpum → **Start update** (or, the first time, the submission above) → **Packages** → drag the
   `.msix` in → wait until it says it is valid → **Submit to the Store**.
4. Microsoft checks it, usually in 1 to 3 days. Store users then get the update by themselves. If certification asks a
   question (most likely about `runFullTrust` or the LibreOffice inside), answer it in **Notes for certification** and
   submit again.

**Trying the Store package on this PC first** (before a first submission, or after changing the manifest):
`pnpm run bundle-libreoffice`, then in PowerShell
`$env:BOHPUM_STORE_SIDELOAD='1'; $env:BOHPUM_STORE_READER='vendor/libreoffice'; pnpm run dist:store`, then in an
administrator PowerShell `Add-AppxPackage -Path dist-store\Bohpum-Store-<version>.msix -AllowUnsigned`. It installs as
"Bohpum" (identity `Bohpum.StoreTest`); remove it with `Get-AppxPackage Bohpum.StoreTest | Remove-AppxPackage`.
```

In `## Good to know`, after the `**Windows SmartScreen**` item add:

```markdown
- **Without the warning:** the Microsoft Store version (section 8) is signed by Microsoft. Send people the Store link
  instead of the installer when they shouldn't see SmartScreen at all.
```

- [ ] **Step 2: docs/store-listing.md** — create it:

```markdown
# Bohpum — Microsoft Store listing texts

Copy these into Partner Center (docs/updates-setup.md section 8). Written for people who find Bohpum in the Store.

## Description

Bohpum (បោះពុម្ព, "to print" in Khmer) opens, edits and prints Microsoft Publisher files (.pub) — no Publisher
needed. Open an old greeting card, flyer or newsletter, change the text and pictures, and print it or save it as a
Bohpum publication (.bpum). You can also start a new publication from a blank page.

Your files stay on your computer. Bohpum has no account, no ads and sends nothing about you or your files.

## Features

- Opens Microsoft Publisher (.pub) files, with their text, pictures and shapes
- Edit text, pictures, shapes, colours and pages; Khmer and English text
- Print with a preview, or save as a Bohpum publication
- Right-click .pub files in File Explorer: Convert to Bohpum (.bpum)
- Works offline

## Keywords

publisher, pub, desktop publishing, greeting card, flyer, khmer, print

## Privacy policy

Bohpum does not collect, store or send any personal information. Your publications and pictures stay on your computer
and are never uploaded. Bohpum has no account, no analytics and no ads. Updates come from the Microsoft Store.
Questions: open an issue at https://github.com/smith89k/Bohpum/issues

## Restricted capability: runFullTrust

Bohpum is a classic desktop app (Electron). It needs full trust to open and save files the user picks anywhere on the
PC, to print, to read Publisher files with the LibreOffice that comes inside the package, and to add "Convert to Bohpum"
to the File Explorer menu for .pub files.

## Notes for certification

The package includes LibreOffice (Mozilla Public License 2.0) under resources\libreoffice. Bohpum runs it in the
background only to read Publisher files; it is never shown and downloads nothing. To try it: open any .pub file with
Bohpum (File › Open), or right-click a .pub file in File Explorer › Convert to Bohpum (.bpum).
```

- [ ] **Step 3: README** — in `## Releasing`, after step 4 (`4. GitHub → **Actions** → …`) add:

```markdown
5. Once `store.json` is in place (the Microsoft Store identity), the release also has `Bohpum-Store-<version>.msix`:
   submit it in Partner Center. Microsoft signs it, so Store users see no warning
   ([docs/updates-setup.md](docs/updates-setup.md) section 8).
```

- [ ] **Step 4: Read the three documents once** (`docs/updates-setup.md` section 8, `docs/store-listing.md`, README Releasing) and fix anything that doesn't match what Tasks 1–8 built (names, paths, commands).

- [ ] **Step 5: Commit**

```powershell
git add docs/updates-setup.md docs/store-listing.md README.md
git commit -q -m @'
docs: the Microsoft Store setup and each release's upload, the Store listing texts, README

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

---

### Task 10: try the Store package on this PC (needs the user's yes)

**Files:** none changed (unless a problem is found: fix it in the file it belongs to, add a check to that file's test, commit).

- [ ] **Step 1: Run the whole test suite**

Run: `pnpm test`
Expected: only the known environment failures of this PC fail (see the memory notes); every Store test passes.

- [ ] **Step 2: Ask the user** — "May I build a test copy of the Store version on this PC and install it? Windows will ask once for permission." Wait for yes.

- [ ] **Step 3: Build the test package** (PowerShell):

```powershell
$env:BOHPUM_STORE_SIDELOAD = '1'; $env:BOHPUM_STORE_READER = 'vendor/libreoffice'; pnpm run dist:store
node scripts/store-check.js dist-store Bohpum-Store-0.2.4.msix
```

Expected: electron-builder ends with `Bohpum-Store-0.2.4.msix` in `dist-store`; store-check prints `store-check: Bohpum-Store-0.2.4.msix has the Publisher reader and the menu, and no update key`. (If package.json's version moved on, use that version in the file name.)

- [ ] **Step 4: Install it** — in an administrator PowerShell (UAC asks once):

```powershell
Add-AppxPackage -Path E:\_httdocs\Bohpum\dist-store\Bohpum-Store-0.2.4.msix -AllowUnsigned
```

Expected: no error; Start menu has **Bohpum**.

- [ ] **Step 5: Check by hand** (with the user watching if they like):
  1. Start Bohpum from the Start menu → What's new → close; Help › About shows the version.
  2. File › Open → `samples\demo-card.pub` → it opens with no "download the Publisher reader?" question.
  3. File Explorer → right-click `samples\demo-card.pub` → **Convert to Bohpum (.bpum)** is in the first menu → the convert window converts it (this also checks that the list file the menu writes to %TEMP%\Bohpum reaches the app inside the package).
  4. Double-click the `.bpum` it made → it opens in Bohpum, with the Bohpum file icon in Explorer.
  5. Help › Check for Updates → the Store app opens on Downloads and updates.

- [ ] **Step 6: Microsoft's checker** — in an administrator PowerShell:

```powershell
& "C:\Program Files (x86)\Windows Kits\10\App Certification Kit\appcert.exe" test -appxpackagepath E:\_httdocs\Bohpum\dist-store\Bohpum-Store-0.2.4.msix -reportoutputpath "$env:TEMP\bohpum-wack.xml"
Select-String -Path "$env:TEMP\bohpum-wack.xml" -Pattern 'OVERALL_RESULT'
```

Expected: `OVERALL_RESULT="PASS"` (or only warnings). Any FAIL: read its test name in the report, fix, rebuild from Step 3.

- [ ] **Step 7: Remove the test package**

```powershell
Get-AppxPackage Bohpum.StoreTest | Remove-AppxPackage
```

- [ ] **Step 8: Tell the user what passed** (and anything fixed on the way, with its commit).

---

### Task 11: store.json — the real identity, then the first submission (needs the user's Partner Center values)

**Files:**
- Create: `store.json`

- [ ] **Step 1: Get the four values from the user** (Partner Center → Bohpum → Product management → Product identity): Package/Identity/Name, Package/Identity/Publisher, Package/Properties/PublisherDisplayName, Store ID. Never guess or invent them.

- [ ] **Step 2: Write store.json** at the top of the repository, with the user's values:

```json
{
  "identityName": "<Package/Identity/Name from the user>",
  "publisher": "<Package/Identity/Publisher from the user>",
  "publisherDisplayName": "<Package/Properties/PublisherDisplayName from the user>",
  "storeId": "<Store ID from the user>"
}
```

- [ ] **Step 3: Check it** (store-package.test.js checks a store.json that is there; store-wiring.test.js then expects the Store page link):

Run: `pnpm test tests/store-package.test.js tests/store-wiring.test.js tests/store.test.js`
Expected: `PASS  store.json holds a valid Partner Center identity` and every other line `PASS`.

- [ ] **Step 4: Commit, then ask before pushing**

```powershell
git add store.json
git commit -q -m @'
chore: store.json — Bohpum's Microsoft Store identity from Partner Center

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
'@
```

Ask the user: push to GitHub? Then: release the next version (it needs a version bump and What's new, docs/updates-setup.md section 6)? Each needs its own yes.

- [ ] **Step 5: After the release** — download `Bohpum-Store-<version>.msix` from the GitHub release and run Microsoft's checker on it as in Task 10 Step 6 (the real identity this time; it can't be installed here, it is unsigned until Microsoft signs it). Then tell the user: the GitHub release has the `.msix`; follow docs/updates-setup.md section 8 "The first submission" with the texts in docs/store-listing.md.
