# Private releases, automatic updates and the Publisher reader download — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Release button in GitHub Actions builds a small Bohpum installer and a trimmed-LibreOffice "Publisher reader" pack, uploads both to a private Cloudflare R2 bucket, and installed copies update themselves and download the reader once, the first time it is needed.

**Architecture:** Two Electron-free main-process modules carry the rules so they are testable in plain Node: `updater.js` (a renamed copy of Sastra PDF's) and `reader.js` (which LibreOffice to use, the pack download/check/unpack, one shared download). main.js wires them to IPC; the editor (src/app.js) and the convert window (src/task.js) ask and show progress in the app's own boxes. The release workflow is Sastra PDF's, plus building the reader pack from The Document Foundation's MSI only when the pinned LibreOffice version changes.

**Tech Stack:** Electron 44, electron-updater 6.8.9, Node 24, pnpm 12.4.1, electron-builder NSIS, GitHub Actions `windows-latest`, AWS CLI against R2, Cloudflare Access service token, Windows' own `tar.exe` for zip.

**Spec:** `docs/superpowers/specs/2026-10-18-private-updates-design.md`. Prior art to copy from: `C:\_httdocs\SastraPDF` (`updater.js`, `.github/workflows/release.yml`, `scripts/r2-prune.js`, `scripts/release-notes.js`, `docs/updates-setup.md`, the update section of `app/index.html`, `repairNeeded` in `explorer-menu.js`, the `menu-repair` / `install-update` handlers in `main.js`).

## Global Constraints

- Update address `https://bohpum-update.smith89k.com/` lives ONLY in package.json `build.publish.url` (+ docs). Never change it after the first release.
- `electron-updater` exactly `6.8.9`, the app's only runtime dependency. Nothing else new at runtime; zip/unzip through `%SystemRoot%\System32\tar.exe` (never Git's `tar`).
- Installer name `Bohpum-Setup-${version}.exe` (nsis `artifactName`). First release made this way: `0.2.0`.
- Reader packs are named `LibreOffice-<version>-pack<n>` and live at `%LOCALAPPDATA%\Bohpum\reader\<pack>\`; in R2 at `reader/<pack>.zip` + `reader/<pack>.json` (`{ name, size, sha256 }`). The workflow never deletes anything under `reader/`.
- The key file `update-config.json` and pack file `reader-pack.json` are written by the release job, never committed (`.gitignore`), packed through `build.files`. No key → no update checks and no reader download.
- Every box is the app's own (`modal` / `choiceBox` in `#modal-root`, or the convert window's `#ask`); boxes that come by themselves never open while `#modal-root` has children.
- Problems with checks and downloads go only to `%TEMP%\Bohpum\update.log` (plus the box text for a download the user asked for).
- Secrets reach only the workflow steps that need them; never the install, LibreOffice-unpack or build steps.
- Windows x64 only. Copy is plain words; where a task gives exact text, use it verbatim.
- Work on branch `private-updates`; merge into main before Task 13. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests are Electron files run by `pnpm test -- tests/<file>` using `tests/harness.js` `run(async (t, check) => …)`. Known environment failures on this PC (memory note): controls, convert-task, print-screen, print-sidebar, print-zoom, theme; flaky: font-list, last-folder, dropdowns, colour-list.

## Review Focus

1. **An office network behind a proxy:** the reader download must go through Electron's network stack (`net.fetch`, system proxy), like electron-updater — pinned in Task 5 (the request is seen by `session.defaultSession.webRequest`).
2. **A Windows user name with spaces or Khmer letters** (`C:\Users\សុខ ចាន់\AppData\Local`): download, unzip and run must work — pinned in Task 3 (root path with a space and Khmer).
3. **The PC is turned off or Bohpum is killed mid-download or mid-unpack:** the next start must ignore and clean the leftovers and ask again — pinned in Task 2 (`.partial` folder holding a soffice.exe is never chosen; `staleEntries` lists it).
4. **The disk fills up during the download:** a plain "not enough space" message and nothing left behind — pinned in Task 3 (`readerErrorFor({ code: 'ENOSPC' })`).
5. **A second .pub opened (double-click in Explorer) while the reader question or download is up:** no second question or download — pinned in Task 5 ("Please wait" toast, one server hit).

---

### Task 1: updater.js — the update rules (copy of Sastra PDF's)

**Files:**
- Create: `updater.js`
- Test: `tests/updater.test.js`

**Interfaces:**
- Produces (all exported): `FIRST_CHECK_MS = 10000`, `CHECK_EVERY_MS = 21600000`,
  `updatesRunHere({ packaged, platform }) → boolean`,
  `checkAnswer({ downloaded, result, error, current }) → { kind: 'ready'|'downloading'|'current'|'failed', version? }`,
  `installBlock({ downloaded, taskOpen, readerBusy }) → 'none'|'task'|'reader'|null`,
  `parseUpdateConfig(text) → { clientId, clientSecret }|null`, `readUpdateConfig(file)` (same, never throws),
  `keyHeaders(key) → { 'CF-Access-Client-Id', 'CF-Access-Client-Secret' }`,
  `logTo(file) → (msg) => void`,
  `createUpdater({ updater, current, send, log, timers, key }) → { checkNow() → Promise<answer>, install() → boolean, downloaded() → string|null }`.

- [ ] **Step 1: Write the failing test** `tests/updater.test.js` with a fake updater (an EventEmitter with `checkForUpdates`, `quitAndInstall`, `quitAndInstallCalled`) and fake timers recording `[fn, ms]`:
  - `updatesRunHere({packaged:true, platform:'win32'})` true; `packaged:false` or `platform:'darwin'` false.
  - `checkAnswer({downloaded:'0.3.0'})` → `{kind:'ready',version:'0.3.0'}`; `{error:new Error()}` → `{kind:'failed'}`; `{result:{isUpdateAvailable:true, updateInfo:{version:'0.3.0'}}}` → `downloading 0.3.0`; `{result:{isUpdateAvailable:false}, current:'0.2.0'}` → `current 0.2.0`.
  - `installBlock`: `{downloaded:null}` → `'none'`; `{downloaded:'0.3.0', taskOpen:true, readerBusy:true}` → `'task'`; `{downloaded:'0.3.0', readerBusy:true}` → `'reader'`; `{downloaded:'0.3.0'}` → `null`.
  - `parseUpdateConfig('{"clientId":"a","clientSecret":"b"}')` → `{clientId:'a',clientSecret:'b'}`; `'{"clientId":"a"}'`, `'{"clientId":"","clientSecret":"b"}'`, `'nope'` → `null`. `readUpdateConfig('<missing file>')` → `null`.
  - `keyHeaders({clientId:'a',clientSecret:'b'})` deep-equals `{'CF-Access-Client-Id':'a','CF-Access-Client-Secret':'b'}`.
  - `createUpdater({…key})`: `updater.requestHeaders` = keyHeaders(key), `autoDownload === true`, `autoInstallOnAppQuit === true`; timers got `10000` (setTimeout) and `21600000` (setInterval); emitting `update-downloaded {version:'0.3.0'}` twice calls `send('update-ready','0.3.0')` once; `checkNow()` then → `ready 0.3.0`; `install()` calls `quitAndInstall(true, true)` and returns `true` when the fake sets `quitAndInstallCalled = true`, else returns `false`, `downloaded()` becomes `null` and `checkForUpdates` is called again.
  - `logTo(<tmp>/x/update.log)('hello')` creates the folder and appends a line ending `hello\r\n`.

- [ ] **Step 2: Run it to make sure it fails** — `pnpm test -- tests/updater.test.js` → FAIL (`Cannot find module '../updater'` / "test ran to the end").

- [ ] **Step 3: Implement `updater.js`** — copy `C:\_httdocs\SastraPDF\updater.js`, rename Sastra PDF → Bohpum in comments, drop the `portable` parameter, add `readerBusy` to `installBlock` (checked after `taskOpen`), add `keyHeaders` and use it in `createUpdater`.

- [ ] **Step 4: Run the test** — same command → every line `PASS`.

- [ ] **Step 5: Commit** — `git add updater.js tests/updater.test.js && git commit -m "feat: update rules (updater.js, from Sastra PDF)"`.

### Task 2: reader.js — which LibreOffice to use, and what to clean up

**Files:**
- Create: `reader.js`
- Test: `tests/reader.test.js`

**Interfaces:**
- Produces: `PACK_RE = /^LibreOffice-[0-9][\w.]*-pack\d+$/`,
  `packName({ version, pack }) → 'LibreOffice-<version>-pack<pack>'`,
  `parsePackInfo(text) → { name, size, sha256 }|null` (name matches PACK_RE, size a positive integer, sha256 64 lowercase hex), `readPackInfo(file)` (same, never throws),
  `readerRoot(localAppData) → <localAppData>\Bohpum\reader`, `sofficeIn(dir) → <dir>\program\soffice.exe`,
  `completePacks(root) → string[]` (folder names matching PACK_RE exactly that contain `program\soffice.exe`, sorted),
  `chooseReader({ root, pack, dev, installed }) → { soffice: string|null, need: null|'download'|'newer' }`,
  `staleEntries(root, keep) → string[]`, `cleanStale(root, keep)` (removes them, ignores errors).

- [ ] **Step 1: Write the failing test** `tests/reader.test.js` (temp root; helper `mk(name)` makes `<root>\<name>\program\soffice.exe`):
  - `packName({version:'25.8.2', pack:1})` → `'LibreOffice-25.8.2-pack1'`.
  - `parsePackInfo` accepts `{"name":"LibreOffice-25.8.2-pack1","size":123,"sha256":"<64 hex>"}`; rejects a bad name, `size:0`, `size:"1"`, a 63-char sha, uppercase sha, `'x'`.
  - `chooseReader` with `pack = {name:'LibreOffice-25.8.2-pack1',…}`:
    - pack folder complete → `{soffice: sofficeIn(<root>\LibreOffice-25.8.2-pack1), need:null}` even when `dev` and `installed` are given.
    - no pack folder, `dev:'D'` → `{soffice:'D', need:null}`; no dev, `installed:'I'` → `{soffice:'I', need:null}`.
    - only `LibreOffice-7.0.0-pack1` complete → `{soffice: <its soffice>, need:'newer'}`; same with `pack:null` → `need:null`.
    - nothing → `{soffice:null, need:'download'}`.
    - **Review Focus 3:** a folder `LibreOffice-25.8.2-pack1.partial` that contains `program\soffice.exe`, and a `LibreOffice-25.8.2-pack1` folder WITHOUT soffice.exe, are never chosen (→ `need:'download'`).
  - `staleEntries(root, 'LibreOffice-25.8.2-pack1')` with that pack complete + `LibreOffice-7.0.0-pack1` + `x.partial` + `x.download` → the other three (sorted); with the keep pack NOT complete → only `x.partial` and `x.download` (old packs stay, they may be in use). `cleanStale` removes exactly those. Missing root → `[]`, no throw.

- [ ] **Step 2: Run it to make sure it fails** — `pnpm test -- tests/reader.test.js` → FAIL.

- [ ] **Step 3: Implement those functions in `reader.js`** — plain Node (`fs`, `path`), no Electron. Header comment says what the reader is and the lookup order from the spec. Among several older packs, `chooseReader` uses the last name in `completePacks` order.

- [ ] **Step 4: Run the test** → all `PASS`.

- [ ] **Step 5: Commit** — `git commit -m "feat: reader.js chooses the LibreOffice to use and what to clean up"`.

### Task 3: reader.js — download, check, unpack, one shared download

**Files:**
- Modify: `reader.js`
- Create: `tests/reader-server.js` (test helper, not a `.test.js`: the fake pack and the fake R2 server, reused by Tasks 5 and 6)
- Test: `tests/reader-download.test.js`

**Interfaces:**
- Consumes: Task 2's functions; Task 1's `keyHeaders` (only in the test).
- Produces:
  - `readBaseUrl(appUpdateYmlText) → 'https://…/'|null` (the `url:` line of electron-builder's `app-update.yml`, with a trailing `/`), `packUrl(base, pack) → base + 'reader/' + pack.name + '.zip'`.
  - `READER_TEXT` (exact copy):
    - `offline`: "Couldn't download the Publisher reader. Check the internet connection and try again."
    - `refused`: "The download was refused. This copy may be too old: install the newest Bohpum, then try again."
    - `missing`: "The Publisher reader isn't available right now. Try again later."
    - `failed`: "Couldn't download the Publisher reader. Try again later."
    - `damaged`: "The download was damaged. Try again."
    - `disk-full`: "There isn't enough free space on the disk for the Publisher reader."
    - `disk`: "Couldn't save the Publisher reader on this PC."
    - `no-key`: "This copy can't download the Publisher reader. Install LibreOffice on this PC, or install Bohpum from a release installer."
  - `class ReaderError extends Error { code }` (message = `READER_TEXT[code]`), `CANCELLED` (a unique Error), `readerErrorFor(err) → ReaderError|CANCELLED` (AbortError → CANCELLED; `ENOSPC` → `disk-full`; other fs codes → `disk`; fetch `TypeError` → `offline`; a ReaderError passes through).
  - `tarUnzip(zip, dir) → Promise<void>`, `tarZip(dir, zip) → Promise<void>` (`%SystemRoot%\System32\tar.exe`: `-xf zip -C dir` / `-a -c -f zip -C dir .`).
  - `downloadPack({ fetch, url, headers, pack, root, onProgress, signal, unzip = tarUnzip }) → Promise<void>`: HTTP 401/403 → `refused`, 404 → `missing`, other non-2xx → `failed`; streams to `<root>\<name>.download` hashing SHA-256; `onProgress({ phase:'download', got, total: pack.size })` at most every 100 ms and once at the end; size or hash ≠ pack → `damaged`; `onProgress({ phase:'unpack' })`; unzip into `<root>\<name>.partial`; no `program\soffice.exe` there → `damaged`; rename to `<root>\<name>`; delete the zip. On any failure or abort: remove `.download` and `.partial`, throw via `readerErrorFor`.
  - `createReaderService({ download }) → { get(id, onProgress) → Promise<{ok:true}|{error:string}|{cancelled:true}>, cancel(id), busy() → boolean }` where `download(onProgress, signal) → Promise`. One download at a time; a `get` while one runs joins it; progress goes to every caller still attached; `cancel(id)` resolves that caller's promise `{cancelled:true}` and aborts the download only when no caller is left; after it ends, the next `get` starts a new one.

- [ ] **Step 1: Write the failing test** `tests/reader-download.test.js`. `tests/reader-server.js` exports `makeFakePack(dir) → Promise<{ pack, zip }>` (folder `program\soffice.exe` = `'x'` and `share\big.bin` = 1 MiB of random bytes, zipped with `tarZip`, `pack = { name: 'LibreOffice-25.8.2-pack1', size, sha256 }`) and `startServer({ zip, pack, key }) → Promise<{ base, setMode(m), hits(), close() }>`: an `http` server on `127.0.0.1:0` serving `/reader/<name>.zip` only when both CF headers equal `key` (else 403); modes `'ok'`, `'slow'` (64 KB chunks every 50 ms), `'404'`, `'refuse'` (403 always); `hits()` counts zip requests. Use `fetch` = global `fetch`. Root = `<tmp>\Bohpum test ប្រកាស\reader` (**Review Focus 2**). Checks:
  - right key → `<root>\<name>\program\soffice.exe` exists, root holds only `<name>`, progress saw `download` with `got === total === pack.size` then `unpack`.
  - wrong key → rejects with `code 'refused'`; root empty.
  - `pack.sha256` altered → `damaged`; root empty. `mode '404'` → `missing`. Server closed → `offline`.
  - `slow` + `AbortController.abort()` after the first progress → rejects with `CANCELLED`; root empty.
  - **Review Focus 4:** `readerErrorFor(Object.assign(new Error('x'), {code:'ENOSPC'})).code === 'disk-full'`; `{code:'EPERM'}` → `disk`; `new TypeError('fetch failed')` → `offline`.
  - `readBaseUrl('provider: generic\nurl: https://bohpum-update.smith89k.com\nupdaterCacheDirName: bohpum-updater\n')` → `'https://bohpum-update.smith89k.com/'`; no url line → `null`.
  - Service (`slow`): `get('a')` and `get('b')` → server hit counter `1`, both get progress, both resolve `{ok:true}`; again with a fresh root: `get('a')`, `get('b')`, `cancel('a')` → `a` resolves `{cancelled:true}`, `b` still `{ok:true}`; then `get('a')`, `cancel('a')` → `{cancelled:true}`, root empty, `busy()` false. A failing download resolves every caller `{error: READER_TEXT.refused}`.

- [ ] **Step 2: Run it to make sure it fails** — `pnpm test -- tests/reader-download.test.js` → FAIL.

- [ ] **Step 3: Implement the Produces list in `reader.js`** — stream with `res.body` (a web stream) → `fs.createWriteStream`; hash with `crypto.createHash('sha256')`; `execFile` for tar with `windowsHide: true`.

- [ ] **Step 4: Run the test** → all `PASS`. Also rerun `tests/reader.test.js` → `PASS`.

- [ ] **Step 5: Commit** — `git commit -m "feat: reader.js downloads, checks and unpacks the Publisher reader, one download shared"`.

### Task 4: main.js, preload.js and packaging wiring

**Files:**
- Modify: `main.js` (requires; `findSoffice` → lookup below; `convertOne(inputPath, job, soffice)`; `readAnyDocument(p, job, opts)`; `read-document`; Help menu; new IPC; whenReady), `preload.js`, `package.json`, `.gitignore`, `build/installer.nsh`
- Test: `tests/update-wiring.test.js`

**Interfaces:**
- Consumes: Task 1 (`updatesRunHere`, `readUpdateConfig`, `keyHeaders`, `logTo`, `createUpdater`, `installBlock`), Tasks 2–3 (`reader.*`).
- Produces (later tasks rely on these exact names):
  - IPC → preload `window.api`: `readerStatus()` → `{ need: null|'download'|'newer', size: number|null, canDownload: boolean, why: string|null }` (`'reader-status'`; `why` = `READER_TEXT['no-key']` when `need === 'download' && !canDownload`, so the pages never hold that text themselves); `getReader()` → service result (`'reader-get'`; returns `{ error: READER_TEXT['no-key'] }` when `!canDownload`); `cancelReader()` (`'reader-cancel'`); `onReaderProgress(fn)` (`'reader-progress'`, `{ phase, got, total }`); `readDocument(p, opts)` with `opts.oldReader` → may return `{ needReader: 'download'|'newer' }`; `checkUpdates()` (`'check-updates'`, `{kind:'dev'}` without an updater); `installUpdate()` (`'install-update'` → `{ ok:true }|{ ok:false, reason:'none'|'task'|'reader'|'failed' }`); `onUpdateReady(fn)` (`'update-ready'`, version string). Menu command `'check-updates'` (sent through `send`).
  - Test hook: env `BOHPUM_READER_TEST` = JSON `{ base, pack, key }`, honoured only when `!app.isPackaged`; it replaces the base URL, pack info and key, and turns off the developer's `vendor\libreoffice`.

- [ ] **Step 1: Write the failing test** `tests/update-wiring.test.js`. `setup`: `LOCALAPPDATA`, `ProgramFiles`, `ProgramFiles(x86)` → fresh empty temp folders; `BOHPUM_READER_TEST` = `{ base:'http://127.0.0.1:9/', pack:{ name:'LibreOffice-25.8.2-pack1', size:1048576, sha256:'0'.repeat(64) } }` (no key). Checks:
  - Help menu labels in order include `'Check for Updates…'` directly before `"What's New"`.
  - `await t.js('api.readerStatus()')` → `{ need:'download', size:1048576, canDownload:false, why: READER_TEXT['no-key'] }`; `api.getReader()` → `{ error: READER_TEXT['no-key'] }`; `api.checkUpdates()` → `{ kind:'dev' }`.
  - After making `<LOCALAPPDATA>\Programs\LibreOffice\program\soffice.exe`, `readerStatus().need === null` (an installed LibreOffice needs no download).
  - package.json: `dependencies['electron-updater'] === '6.8.9'`; `build.publish` deep-equals `{ provider:'generic', url:'https://bohpum-update.smith89k.com/' }`; `build.nsis.artifactName === 'Bohpum-Setup-${version}.${ext}'`; `build.files` includes `updater.js`, `reader.js`, `update-config.json`, `reader-pack.json`; no `extraResources` entry from `vendor/libreoffice`; `scripts.dist` doesn't mention `bundle-libreoffice`.
  - `.gitignore` lists `update-config.json`, `reader-pack.json`, `dist-reader/`.
  - `build/installer.nsh` `customUnInstall`'s non-update branch removes `\Bohpum\reader` under `%LOCALAPPDATA%` (text check: `ExpandEnvStrings` + `RMDir /r`).

- [ ] **Step 2: Run it to make sure it fails** → FAIL.

- [ ] **Step 3: `pnpm add electron-updater@6.8.9 --save-exact`** — check `pnpm-lock.yaml` changed and `pnpm install --frozen-lockfile` passes.

- [ ] **Step 4: Wire main.js**
  - `installedSoffice()` = today's `findSoffice` candidate list without the bundled path (first that exists, or null); `devSoffice()` = `vendor\libreoffice\program\soffice.exe` when `!app.isPackaged`, no test hook, and it exists.
  - Reader config at start: `root = reader.readerRoot(process.env.LOCALAPPDATA)`; `pack` from `reader-pack.json` next to main.js; `base` from `process.resourcesPath\app-update.yml` when packaged; `key` from `update-config.json`; or all three from the test hook. `canDownload = !!(key && pack && base)`.
  - `readAnyDocument(p, job, opts = {})`: for outside formats, `chooseReader(…)`; `need === 'download'`, or `'newer'` without `opts.oldReader` → `{ needReader: need }`; else `convertWithLibreOffice(p, job, soffice)`. `convertOne` gets `soffice` as a parameter (remove `findSoffice` and the "Part of Bohpum is missing" message).
  - `readerService = reader.createReaderService({ download: (onProgress, signal) => reader.downloadPack({ fetch: net.fetch, url: reader.packUrl(base, pack), headers: updates.keyHeaders(key), pack, root, onProgress, signal }) })`; after a successful download, `reader.cleanStale(root, pack.name)` when `loJobs === 0`; errors logged with `updates.logTo(%TEMP%\Bohpum\update.log)`. On `app.whenReady`: `reader.cleanStale(root, pack && pack.name)`.
  - Updates, as Sastra PDF's main.js: created right after `createWindow()` in `whenReady` (a convert-window-only run never checks), only when `updatesRunHere(...)` and the key exists; `check-updates`; `install-update` uses `installBlock({ downloaded, taskOpen: !!taskWin, readerBusy: readerService.busy() })`, sets `dirty = false` before `up.install()` and puts it back when that returns false.
  - Help menu: `{ label: 'Check for Updates…', click: () => send('check-updates') }` above What's New.
  - preload.js: the Produces list.
- [ ] **Step 5: Packaging** — package.json as the test says (keep `bundle-libreoffice` script for developers; `dist` = `node scripts/check-notes.js && node scripts/build-explorer-menu.js && electron-builder --win nsis --publish never`); `.gitignore`; installer.nsh non-update uninstall: `ExpandEnvStrings $0 "%LOCALAPPDATA%"`, `RMDir /r "$0\Bohpum\reader"`, `RMDir "$0\Bohpum"` (do not touch `SetShellVarContext`).

- [ ] **Step 6: Run the tests** — `pnpm test -- tests/update-wiring.test.js tests/open-progress.test.js tests/open-from-explorer.test.js` → all `PASS` (open-progress uses an "installed" stand-in, so it must still pass).

- [ ] **Step 7: Commit** — `git commit -m "feat: main wires updates and the Publisher reader; LibreOffice leaves the installer"`.

### Task 5: Editor — the reader question and download progress

**Files:**
- Modify: `src/app.js` (`readingBox`, `openFile`, new `readerReady`), `src/app.css` (determinate bar)
- Test: `tests/reader-editor.test.js`, `tests/reader-nokey.test.js`

**Interfaces:**
- Consumes: Task 4's `api.readerStatus/getReader/cancelReader/onReaderProgress/readDocument(p, opts)`.
- Produces: `readingBox(name)` gains `box.progress({ phase, got, total })` (`download` → step `Downloading the Publisher reader… <got> of <total> MB` (whole MB) with a determinate bar via class `determinate` + `--frac`; `unpack` → `Setting up the Publisher reader…`, moving bar) and `box.reading()` (back to the reading step, moving bar). While downloading, Cancel/Esc call `api.cancelReader()`.
- Exact copy: question title `Bohpum needs the Publisher reader`, text `It's a one-time download of about ${mb} MB. Bohpum's own files open without it.`, buttons `['Download', 'Not now']` (Download primary, Esc = Not now). Newer: title `A newer Publisher reader is ready`, text `It's a download of about ${mb} MB. Not now opens the file with the reader you have.` No key: title `Bohpum needs the Publisher reader`, text = `readerStatus().why`, button `OK`. Megabytes everywhere: `Math.max(1, Math.round(bytes / 1048576))`.

- [ ] **Step 1: Write the failing test** `tests/reader-editor.test.js`. Reuse open-progress.test.js's `cp.execFile` stand-in (soffice runs finish at once with `samples/test-shapes.fodg`, and record `file`). `setup`: temp `LOCALAPPDATA`/`ProgramFiles`/`ProgramFiles(x86)`; `makeFakePack` + `startServer` from `tests/reader-server.js` (Task 3); `BOHPUM_READER_TEST` with the key. Register `session.defaultSession.webRequest.onBeforeSendHeaders` to record URLs + headers. Checks:
  - Opening `card.pub` → the question with `about 1 MB`, buttons `Download` (primary) and `Not now`; **no** `.progress` box yet.
  - `Not now` → no box, the publication on screen unchanged, server hits `0`.
  - Again → `Download` → the `.progress` box shows `Downloading the Publisher reader…` and ` of 1 MB` (server `slow`), then the publication opens (`state.doc.name === 'card'`), `<LOCALAPPDATA>\Bohpum\reader\<name>\program\soffice.exe` exists, the stand-in ran that soffice.
  - **Review Focus 1:** the recorded requests include `<base>reader/<name>.zip` with both `CF-Access-Client-*` headers (proves `net.fetch`).
  - A second `.pub` opens with no question.
  - **Review Focus 5:** with the reader folder removed and the question open, `openFile(other.pub)` shows the `Please wait` toast and no second question; the same during the download, and server hits stay `1` per download.
  - Cancel during the download → box gone, root has no `.download`/`.partial`, publication unchanged.
  - Server `refuse` mode → the box shows `Couldn't open card.pub` with `READER_TEXT.refused` and Close. Server closed → `READER_TEXT.offline`.
  - Newer: root holds only a complete `LibreOffice-7.0.0-pack1` → `A newer Publisher reader is ready`; `Not now` → it opens with the 7.0.0 soffice; the next `.pub` doesn't ask.
- [ ] **Step 2: Write `tests/reader-nokey.test.js`** — same setup without the key: opening a `.pub` shows the no-key box with `OK`; nothing downloaded.
- [ ] **Step 3: Run both to make sure they fail** → FAIL.
- [ ] **Step 4: Implement `readerReady(name) → Promise<null|{ opts, box }>`** in src/app.js and call it from `openFile` for outside formats before the reading box; keep the existing `reading` guard true from the question onward. A `{ needReader }` from `readDocument` (race) → `box.fail('Bohpum needs the Publisher reader. Open the file again to download it.')`. Not now for "newer" is remembered for this run only.
- [ ] **Step 5: Run both tests, then `tests/open-progress.test.js`** → all `PASS`.
- [ ] **Step 6: Commit** — `git commit -m "feat: the editor asks for the Publisher reader and shows its download"`.

### Task 6: Convert window — the reader question and download

**Files:**
- Modify: `src/task.html` (buttons `#bLater` "Not now", `#bDownload` "Download" primary, hidden), `src/task.js` (`batch`, `convertOne(j, out, opts)`, new `readerFor(jobs)`)
- Test: `tests/reader-convert.test.js`

**Interfaces:**
- Consumes: Task 4's API; Task 5's copy (same title/text in `#askMsg`/`#askDetail`).
- Produces: `readerFor(jobs) → Promise<null|opts>`; asked once per batch (per menu click), before the "already there" question.

- [ ] **Step 1: Write the failing test** (setup and server as Task 5; clicks as convert-task.test.js `app.emit('second-instance', …)`):
  - A click on one `.pub` with no reader → the convert window shows `Bohpum needs the Publisher reader` with Download / Not now.
  - `Not now` (and separately Esc) → one problem line `Not converted: card.pub: Bohpum needs the Publisher reader` (for 2 files: `Not converted: 2 files: …`), no `.bpum` written.
  - `Download` → step text contains ` of 1 MB`, then `card.bpum` is written; the next click doesn't ask.
  - Cancel during the download → `Cancelled`, root clean, no `.bpum`.
  - In `tests/reader-nokey.test.js` (Task 5's file, no key): a click → the problem line is `READER_TEXT['no-key']`, no question.
- [ ] **Step 2: Run it to make sure it fails** → FAIL.
- [ ] **Step 3: Implement `readerFor`** with an `askReader(message, detail)` twin of `ask()` that shows `#bLater`/`#bDownload`; during the download `show('Downloading the Publisher reader', '<got> of <total> MB', got/total)`, then `show('Setting up the Publisher reader', '', 1)`; Cancel calls `api.cancelReader()` too.
- [ ] **Step 4: Run it, then `tests/open-progress.test.js`** → `PASS`.
- [ ] **Step 5: Commit** — `git commit -m "feat: the convert window asks for the Publisher reader too"`.

### Task 7: Update boxes, Check for Updates, and the right-click menu repair

**Files:**
- Modify: `explorer-menu.js` (`FIELDS.Asked = 'asked'`, `repairNeeded`), `main.js` (`'menu-repair'` IPC, as Sastra PDF's), `preload.js` (`menuRepair(action)`), `src/app.js`
- Test: `tests/update-boxes.test.js`, `tests/explorer-menu.test.js` (add cases)

**Interfaces:**
- Consumes: Task 4's `checkUpdates`, `installUpdate`, `onUpdateReady`, menu command `'check-updates'`.
- Produces: `repairNeeded({ build, msixExists, state, version }) → boolean` (= Sastra PDF's); `api.menuRepair('check'|'later'|'fix')` → `{ needed }` / `{}` / `{ result:'ok'|'declined'|'failed' }`; in src/app.js `screenFree()` (`#modal-root` has no children), `whenFree()`, `inTurn(open)`, `readyBox(v)`, `updateReady(v)`, `restartForUpdate()`, `checkUpdatesCmd()`, `menuRepairAtStart()` (called from `init()` after `notesAtStart()`); `window.__bohpumApp` also exposes `updateReady` and `menuRepairAtStart`.
- Exact copy (title / text / buttons, first button primary, Esc = last):
  - Ready: `Bohpum ${v} is ready to install` / `Restart now to use it, or it installs the next time you close Bohpum.` / `Restart now`, `Later`.
  - Unsaved: `Save changes first?` / `Your publication has unsaved changes. Save them before restarting?` / `Save`, `Don't save`, `Cancel`.
  - `task`: `Bohpum can't restart while files are being converted` / `Wait for the small convert window to finish, then use Help › Check for Updates. Or close Bohpum later: the update installs then.` / `OK`.
  - `reader`: `Bohpum can't restart while the Publisher reader is downloading` / `Wait for the download to finish, then use Help › Check for Updates. Or close Bohpum later: the update installs then.` / `OK`.
  - `failed`: `The update couldn't be started` / `Your publication is still open. Bohpum downloads the update again and offers it next time.` / `OK`.
  - Checking: `Checking for updates…` / button `Cancel` (Cancel or Esc drops the answer). Answers: `You have the latest version` / `Bohpum ${v} is the newest version.`; `Version ${v} is downloading` / `You'll be asked to restart when it's ready.`; `This copy doesn't update itself` / `Copies installed from a Bohpum release do.`; `Couldn't check for updates` / `Check the internet connection and try again.`; `ready` → the ready box.
  - Menu repair: `The right-click menu needs to be set up again` / `Windows will ask for permission once. Without it, Bohpum's items stay under "Show more options".` / `Set up`, `Not now`; toasts `The right-click menu is back`, `The right-click menu stays under "Show more options"`, `Couldn't set up the right-click menu`.

- [ ] **Step 1: Write the failing tests.** In `tests/explorer-menu.test.js` add: `repairNeeded` true for `{build:22631, msixExists:true, state:{mode:'classic', declined:'', asked:'0.1.0'}, version:'0.2.0'}`, false when build 19045, no msix, mode `package`, declined `'1'`, or asked `'0.2.0'`; `asked` writes and reads back under the test key. `tests/update-boxes.test.js` (fake handlers with `ipcMain.removeHandler(x); ipcMain.handle(x, …)` after `t.ready()`; count `install-update` calls):
  - Help › Check for Updates… with the real handler → `This copy doesn't update itself`; faked `{kind:'current', version}` → `You have the latest version`; faked slow + Esc → no answer box appears.
  - `updateReady('9.9.9')` while a box is open (open About) → no ready box until it closes, then `Bohpum 9.9.9 is ready to install`; `updateReady('9.9.9')` again after Later → no second box.
  - Restart now with `state.dirty` → `Save changes first?`; Cancel → install calls `0`; again → `Don't save` → install calls `1`. Faked `{ok:false, reason:'task'}` / `'reader'` / `'failed'` → the matching title.
  - Faked `menu-repair` `check → {needed:true}`, `fix → {result:'ok'}`: `menuRepairAtStart()` → the repair box; Set up → toast `The right-click menu is back`; with `needed:true` and Not now → `later` was called.
- [ ] **Step 2: Run them to make sure they fail** → FAIL.
- [ ] **Step 3: Implement** the Produces list (Sastra PDF's `app/index.html` update section and `explorer-menu.js`/`main.js` repair code, in Bohpum's `modal`/`choiceBox`; `api.onUpdateReady(updateReady)` in `wire()`; `cmd('check-updates')`).
- [ ] **Step 4: Run both tests, then `tests/whats-new.test.js tests/close-ask.test.js`** → `PASS`.
- [ ] **Step 5: Commit** — `git commit -m "feat: update ready box, Check for Updates, right-click menu repair after an update"`.

### Task 8: Build scripts — the pinned LibreOffice, the reader pack, prune and notes

**Files:**
- Create: `libreoffice.json`, `scripts/reader-pack.js`, `scripts/reader-check.js`, `scripts/r2-prune.js`, `scripts/release-notes.js`
- Modify: `scripts/bundle-libreoffice.js` (export `trimCopy`; `TRIM_REV` → `libreoffice.json` `pack`), `package.json` (`"reader-pack": "node scripts/reader-pack.js"`)
- Test: `tests/release-scripts.test.js`

**Interfaces:**
- Produces:
  - `libreoffice.json`: `{ "version": "<x.y.z>", "pack": 1, "msi": "https://downloadarchive.documentfoundation.org/libreoffice/old/<x.y.z.w>/win/x86_64/LibreOffice_<x.y.z.w>_Win_x86-64.msi", "sha256": "<64 hex of that file>" }`.
  - `trimCopy(src, dest)` (today's SKIP list + Visual C++ runtime copy), still runnable as before.
  - `makePack(loDir, outDir) → Promise<{ name, size, sha256, zip, dir }>`: trims into `<outDir>\LibreOffice`, zips it with `reader.tarZip` to `<outDir>\<name>.zip`, writes `<outDir>\<name>.json` (`{ name, size, sha256 }`); CLI `node scripts/reader-pack.js <loDir> <outDir>` prints that JSON.
  - `checkReader(soffice, file) → Promise<boolean>` (headless `--convert-to fodg` with a temp profile, the same flags as main.js `convertOne`; true when `input.fodg` contains `<office:document`); CLI exits 1 with `::error::…` on false.
  - `pruneList(keys, keep)` (Sastra PDF's, pattern `/^Bohpum-Setup(-.+)?\.exe$/`); `notesMarkdown(entry, kinds)`, `loadNotes()` reading `window.BohpumNotes` from `src/notes.js`.

- [ ] **Step 1: Pin LibreOffice** — take the newest version listed at `https://download.documentfoundation.org/libreoffice/stable/`, find its Windows x86-64 MSI under `https://downloadarchive.documentfoundation.org/libreoffice/old/`, download it to the scratchpad, compute SHA-256 (`certutil -hashfile <msi> SHA256`), and write `libreoffice.json`. Check `curl -sI <msi url>` → `200`.
- [ ] **Step 2: Write the failing test** `tests/release-scripts.test.js`:
  - `libreoffice.json`: version `/^\d+\.\d+\.\d+$/`, `pack` a positive integer, `msi` starts `https://downloadarchive.documentfoundation.org/` and ends `_Win_x86-64.msi`, `sha256` 64 lowercase hex.
  - `makePack` on a fake LibreOffice folder (`program\soffice.exe`, `program\version.ini`, `help\x.html`, `share\gallery\x`, `share\config\images_colibre.zip`, `share\config\images_sifr.zip`) → `name === reader.packName(libreoffice.json)`; the json's size/sha256 match the zip file; unzipping (`reader.tarUnzip`) gives `program\soffice.exe` and `share\config\images_colibre.zip` but not `help`, `share\gallery`, `images_sifr.zip`.
  - `pruneList(['Bohpum-Setup-0.2.0.exe','Bohpum-Setup-0.2.1.exe\r','Bohpum-Setup-0.2.0.exe.blockmap','latest.yml','reader/LibreOffice-25.8.2-pack1.zip',''], 'Bohpum-Setup-0.2.1.exe')` → `['Bohpum-Setup-0.2.0.exe']`; keep missing → throws.
  - `notesMarkdown` of `{notes:[{kind:'fixed',text:'b'},{kind:'new',text:'a'}]}` with the real KINDS → `'## New\n- a\n\n## Fixed\n- b\n'`; `node scripts/release-notes.js 9.9.9` exits 1.
- [ ] **Step 3: Run it to make sure it fails** → FAIL.
- [ ] **Step 4: Implement** the scripts (copy Sastra PDF's `r2-prune.js` / `release-notes.js` with Bohpum names).
- [ ] **Step 5: Run the test, then `pnpm run bundle-libreoffice`** (expected on this PC: "LibreOffice not found …", exit 1, unchanged behaviour) → test `PASS`.
- [ ] **Step 6: Commit** — `git commit -m "build: pinned LibreOffice, reader pack and check scripts, R2 prune and release notes"`.

### Task 9: The release workflow

**Files:**
- Create: `.github/workflows/release.yml`, `scripts/r2-put.sh` (Sastra PDF's `put()` function: upload, then compare the stored size)
- Test: `tests/release-workflow.test.js`

**Interfaces:**
- Consumes: Task 8's scripts and `libreoffice.json`; Task 4's file names.
- Produces: the workflow, Sastra PDF's `release.yml` with: `EXE: Bohpum-Setup-${{ inputs.version }}.exe`; titles/notes "Bohpum"; lock URL `https://bohpum-update.smith89k.com/latest.yml`; and these steps between "Check What's new" and "Put the update key":
  1. **Is the reader pack in R2?** (R2 secrets; `id: pack`): `name` from libreoffice.json; if `reader/$name.json` exists, download it to `reader-pack.json`, output `have=true`; else `have=false`.
  2. **Build the reader pack** (`if: steps.pack.outputs.have != 'true'`, no secrets): `curl -fL --retry 3` the MSI, compare SHA-256, a `shell: pwsh` sub-step `Start-Process msiexec -ArgumentList '/a', "$pwd\lo.msi", '/qn', "TARGETDIR=$pwd\lo-admin" -Wait`, find `program\soffice.exe` under `lo-admin` (its parent's parent is the LibreOffice folder), `node scripts/reader-pack.js <that> dist-reader`, `node scripts/reader-check.js dist-reader/LibreOffice/program/soffice.exe samples/card-original.pub`, copy `dist-reader/$name.json` to `reader-pack.json`.
  3. **Upload the reader pack** (same `if`, R2 secrets): `put` the zip to `reader/$name.zip`, then the json to `reader/$name.json` (`--content-type application/json`) — json LAST.
  - The lock-check step also checks `https://bohpum-update.smith89k.com/reader/$name.zip` with `curl -sI`: not `200` without the key, `200` with it.
  - The GitHub release notes add: `The Publisher reader (LibreOffice ${lo version}) downloads once, the first time a Publisher file is opened.`
  - Prune unchanged in shape (`scripts/r2-prune.js` never lists `reader/`).

- [ ] **Step 1: Write the failing test** `tests/release-workflow.test.js` (reads the file as text and splits it into steps at each `      - name:` / `      - uses:` line; no YAML library):
  - `on` has only `workflow_dispatch` with required input `version`.
  - Step order: "Is the reader pack in R2?" < "Build the reader pack" < "Upload the reader pack" < "Put the update key" < "Build the installer" < "Upload to R2" < lock check < prune < GitHub release.
  - In "Upload to R2", `latest.yml` is put after the `.exe`; in "Upload the reader pack", `.json` after `.zip`.
  - No step whose `run` contains `pnpm install`, `msiexec`, `electron-builder` or `reader-pack.js` has `R2_`, `AWS_` or `CF_ACCESS_` in its `env`.
  - The lock-check `run` mentions `reader/`.
- [ ] **Step 2: Run it to make sure it fails** → FAIL.
- [ ] **Step 3: Write `release.yml` and `scripts/r2-put.sh`.**
- [ ] **Step 4: Run the test** → `PASS`.
- [ ] **Step 5: Commit** — `git commit -m "ci: release workflow builds the reader pack once and releases privately to R2"`.

### Task 10: Words — What's new 0.2.0, About, README, setup guide

**Files:**
- Modify: `package.json` (`"version": "0.2.0"`), `src/notes.js`, `src/app.js` (`CREDITS`, `CREDITS_NOTE`), `README.md`, `tests/about.test.js`
- Create: `docs/updates-setup.md`

- [ ] **Step 1: Update `tests/about.test.js`** — credits also include `electron-updater` with `MIT`; the note mentions `downloaded once`.
- [ ] **Step 2: Run `pnpm test -- tests/about.test.js tests/check-notes.test.js`** → FAIL (about), check-notes passes still.
- [ ] **Step 3: Write the words**
  - `pnpm version 0.2.0 --no-git-tag-version --no-git-checks`; src/notes.js entry at the top: `N('0.2.0', '<today>', [['new', 'Bohpum now updates itself. When a new version is ready it asks to restart, or installs it when you close Bohpum. Check by hand from Help › Check for Updates.'], ['improved', 'The installer is much smaller. The Publisher reader downloads once, the first time you open a Publisher file.']])`.
  - CREDITS: add `['electron-updater', 'electron-builder contributors', 'MIT', 'https://github.com/electron-userland/electron-builder']`; CREDITS_NOTE: LibreOffice "is downloaded once, the first time a Publisher file is opened; its licence files are in its folder", plus Sastra PDF's electron-updater helper-libraries sentence.
  - README: replace the LibreOffice/build sections (no LibreOffice needed on the build PC; how the pack is made; moving to a newer LibreOffice = edit `libreoffice.json`, bump `pack` only when the trim changes, release), a "Releasing" section pointing to docs/updates-setup.md, and the privacy line from the spec.
  - `docs/updates-setup.md`: Sastra PDF's guide with Bohpum's names from the spec (bucket `bohpum-updates`, token `bohpum-release`, service token `bohpum-updater`, Access app `bohpum-update`, policy **Bohpum app only**, repo smith89k/Bohpum), plus a "The Publisher reader" section (what `reader/` holds, never deleted by the job, how to move LibreOffice).
- [ ] **Step 4: Run `pnpm test -- tests/about.test.js tests/check-notes.test.js tests/whats-new.test.js`** → `PASS`.
- [ ] **Step 5: Commit** — `git commit -m "docs: 0.2.0 What's new, About credits, README and the update setup guide"`.

### Task 11: Local end-to-end — a real update and a real reader download

Nothing here is committed except fixes it finds. Scratch files go in the session scratchpad.

- [ ] **Step 1: Full test run** — `pnpm test` → only the known environment failures (Global Constraints) fail; anything else is fixed first.
- [ ] **Step 2: A real pack** — `msiexec /a <scratch>\lo.msi /qn TARGETDIR=<scratch>\lo-admin` (the MSI from Task 8; UAC may ask once), then `node scripts/reader-pack.js <LibreOffice folder> <scratch>\reader` and `node scripts/reader-check.js <scratch>\reader\LibreOffice\program\soffice.exe samples\card-original.pub` → exit 0.
- [ ] **Step 3: A local "R2"** — a scratch Node server on `127.0.0.1:8765` serving a scratch folder, answering 403 unless both CF headers equal a test key.
- [ ] **Step 4: Three builds** — write `update-config.json` (test key) and `reader-pack.json` (Step 2's json); `pnpm exec electron-builder --win nsis --publish never -c.publish.url=http://127.0.0.1:8765/ -c.extraMetadata.version=0.2.0`, keep its output in `<scratch>\b020`; again for `0.2.1` and `0.2.2`. The server folder starts with `reader/<name>.zip` and 0.2.0's installer, blockmap and `latest.yml`.
- [ ] **Step 5: Check by hand** (with the user watching if they like): install 0.2.0 → open `samples\card-original.pub` → the question → Download → progress → it opens; a second `.pub` doesn't ask; right-click Convert to Bohpum on another `.pub` works without asking. Add 0.2.1's files and its `latest.yml` → within ~10 s the ready box → Later → close → next start About says 0.2.1, What's new shows. Add 0.2.2's files → make an unsaved change → Help › Check for Updates → the ready box → Restart now → Save changes first? → Cancel keeps the work; Restart now again → Don't save → it restarts as 0.2.2. Right-click menu still in the first menu (or the repair box works). Stop the server → Check for Updates says it couldn't check. Delete `%LOCALAPPDATA%\Bohpum\reader` → open a `.pub` → offline message, nothing left behind. Uninstall → `%LOCALAPPDATA%\Bohpum\reader` is gone.
- [ ] **Step 6: Clean up** — delete `update-config.json`, `reader-pack.json`, `dist\`; uninstall the test build. These installers carry a test key and a local address: never hand them out.

### Task 12: Cloudflare and GitHub setup (with the user)

- [ ] **Step 1:** Ask the user whether to do it together in their Chrome now (Claude in Chrome) or by themselves from `docs/updates-setup.md`.
- [ ] **Step 2:** Do sections 1–4 of `docs/updates-setup.md` (bucket + domain, upload token, service token + Access application, six secrets). Secrets go straight from Cloudflare into GitHub; never into a file or the chat.
- [ ] **Step 3: Verify** — `gh secret list -R smith89k/Bohpum` lists the six; `curl -sI https://bohpum-update.smith89k.com/latest.yml` → `403`.
- [ ] **Step 4:** Write the "Set up on <date>" block at the top of `docs/updates-setup.md` (names only, no secrets); commit.

### Task 13: First release, 0.2.0

- [ ] **Step 1:** Merge `private-updates` into main (superpowers:finishing-a-development-branch), push main.
- [ ] **Step 2:** `gh workflow run release.yml -R smith89k/Bohpum -f version=0.2.0`, then watch it (`gh run watch`). Expected: the reader pack is built and uploaded (first run), all checks green, release `v0.2.0` exists with the installer and notes.
- [ ] **Step 3: Verify** — `curl -sI https://bohpum-update.smith89k.com/latest.yml` → `403`; download the installer from the release, install on this PC, open `samples\card-original.pub` → the reader downloads from R2 and the publication opens; About says 0.2.0.
- [ ] **Step 4:** Update `docs/updates-setup.md` and README ("0.2.0 released, private updates in place"); commit and push. The first real update (0.2.1) is the final proof of the update path; note that in the docs as not yet seen on the real address.
