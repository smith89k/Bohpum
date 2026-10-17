# Explorer "Convert to Bohpum" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Right-click `.pub` files in File Explorer → "Convert to Bohpum (.bpum)" → a progress window saves each `.bpum` next to its `.pub`.

**Architecture:** Port Sastra PDF's Explorer menu (`E:\_httdocs\SastraPDF`: `explorer-menu/menu.cpp`, `AppxManifest.xml`, `scripts/build-explorer-menu.js`, `explorer-menu.js`, `build/installer.nsh`, main.js task window, `app/task.*`) with Bohpum names, a single command instead of a submenu, and a convert job that reuses the editor's importer through a new shared `src/docfile.js`.

**Tech Stack:** Electron 44.8, plain JS (ES modules in `src/`), C++17 + WRL (MSVC 14.51, Windows SDK 10.0.26100), electron-builder 26 NSIS, Electron test harness (`pnpm test`).

**Spec:** `docs/superpowers/specs/2026-10-17-explorer-convert-menu-design.md`

## Global Constraints

- Branch `feature/explorer-menu` (from `feature/sastra-bar-theme`).
- CLSID `{1e11f0a8-6fc0-4a9c-9031-6924b71a4d77}`; package `Bohpum.ExplorerMenu` version `1.0.0.0`; DLL `BohpumMenu.dll`; exe `Bohpum.exe`.
- Arguments `--bohpum-task=convert` and `--bohpum-list=<file>`; list files only `%TEMP%\Bohpum\menu-*.txt`; test override env `BOHPUM_MENU_EXE`.
- Registry: classic `HKCU\Software\Classes\SystemFileAssociations\.pub\shell\Bohpum`; state `HKCU\Software\Bohpum\ExplorerMenu`; tests only under `HKCU\Software\BohpumTest`.
- Menu text exactly: "Convert to Bohpum (.bpum)" / "Convert N files to Bohpum". Error box: "Bohpum is missing or damaged. Please reinstall it."
- Output file = the editor's Open + Save result, byte for byte.
- Never overwrite without the question; never touch the user's open publication.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- CRLF files: edit with the Edit tool or EOL-aware scripts.

## File map

| File | Change | Task |
|---|---|---|
| `src/docfile.js` (new) | `docFromFodg`, `bpumText` | 1 |
| `src/app.js` | open/save through docfile.js | 1 |
| `main.js` | LibreOffice queue; write-file errors; `--explorer-menu`; task window; name IPC | 1, 3 |
| `explorer-menu.js` (new) | args, list file, registration, installer commands | 2 |
| `tests/explorer-menu.test.js` (new) | unit checks | 2 |
| `preload.js` | task + name APIs | 3 |
| `src/task.html`, `src/task.js` (new) | progress window | 3 |
| `tests/convert-task.test.js` (new) | the convert job end to end | 3 |
| `build/icon.ico`, `build/icon.png`, `explorer-menu/Assets/*` (new) | app icon, package logos | 4 |
| `explorer-menu/menu.cpp`, `menu.def`, `AppxManifest.xml` (new) | the menu DLL and package | 5 |
| `scripts/build-explorer-menu.js` (new) | build DLL + msix | 5 |
| `build/installer.nsh` (new), `package.json`, `.gitignore` | installer hooks, build config | 6 |
| `README.md` | the menu | 7 |

---

### Task 1: One way to turn a .pub into a .bpum

**Files:** Create `src/docfile.js`; modify `src/app.js` (`openFile`, `loadDoc`, `save`), `main.js` (`convertWithLibreOffice`, `write-file`).

**Interfaces — Produces:**
- `docFromFodg(xml: string, base: string) → { doc, warnings: string[] }` — `importFodg` + `guides`/`master` defaults.
- `bpumText(doc, filePath: string) → string` — sets `doc.name` from the file name (without `.bpum`), returns `JSON.stringify(doc)`.
- main `write-file` returns `true` or `{ error }` (was: throws).

- [ ] Write `src/docfile.js`:

```js
// One way to turn LibreOffice's flat ODF into a Bohpum document and a document into .bpum text, used by the
// editor (open / save) and by the Explorer menu's convert window, so both make identical files.
import { importFodg } from './odgImport.js';

export function withDefaults(doc) {
  if (!doc.guides) doc.guides = { v: [], h: [] };
  if (!doc.master) doc.master = { objects: [] };
  return doc;
}
export function docFromFodg(xml, base) {
  const doc = importFodg(xml, base);
  const warnings = doc.importWarnings || []; delete doc.importWarnings;
  return { doc: withDefaults(doc), warnings };
}
export function bpumText(doc, filePath) {
  doc.name = String(filePath).split(/[\\/]/).pop().replace(/\.bpum$/i, '');
  return JSON.stringify(doc);
}
```

- [ ] app.js: import `{ docFromFodg, bpumText, withDefaults }`; `loadDoc` uses `withDefaults(doc)`; `openFile` foreign branch uses `docFromFodg(r.text, base)` (warnings from it); `save` writes `bpumText(S.doc, p)`.
- [ ] main.js: serialize LibreOffice (`let loQueue = Promise.resolve()`; each conversion chains on it); `write-file` catches and returns `{ error: err.code || err.message }`; the editor's `save` shows "Could not save: …" when it gets `{ error }`.
- [ ] Run `pnpm test` → all 16 files pass. Commit.

### Task 2: explorer-menu.js (no Electron in it)

**Files:** Create `explorer-menu.js`, `tests/explorer-menu.test.js`.

Port `E:\_httdocs\SastraPDF\explorer-menu.js` with: `PKG='Bohpum.ExplorerMenu'`, CLSID above, `STATE_KEY='HKCU\\Software\\Bohpum\\ExplorerMenu'`, `TASKS=['convert']`, `LIST_DIR=%TEMP%\Bohpum`, args `--bohpum-task` / `--bohpum-list`, `.pub` instead of `.pdf`, verb key `SystemFileAssociations\.pub\shell\Bohpum`, CLSID default value "Bohpum Explorer menu", old-DLL folder `bohpum-old`, DLL name `BohpumMenu-<time>.dll`. `registerClassic(dll, classes)`, `unregisterClassic(classes)`, `classicRegistered(classes)`, `readState(key)`, `writeState(o, key)`, `clearState(key)` take the key so tests use `HKCU\Software\BohpumTest`. `readTaskList(file, tempDir)` as Sastra (pattern `menu-[\w-]+\.txt`, real-path folder check, delete, BOM, `.pub`, absolute, exists, de-dup, collator numeric sort).

- [ ] Test (`tests/explorer-menu.test.js`, runs under the harness without driving the window): parseTaskArgs (good / wrong task / missing list); readTaskList (outside folder → [] and file kept; wrong name → []; good → sorted 01, 02, 10, de-duplicated, missing and non-.pub dropped, Khmer name kept, BOM ok, file deleted); registerClassic → `reg query` shows ExplorerCommandHandler = CLSID, InprocServer32 = dll, MultiSelectModel = Player → unregister → gone; writeState/readState round trip → clearState. Cleanup `reg delete HKCU\Software\BohpumTest /f`.
- [ ] Run → pass. Commit.

### Task 3: The progress window

**Files:** Modify `main.js`, `preload.js`; create `src/task.html`, `src/task.js`, `tests/convert-task.test.js`.

- [ ] main.js top (after requires): `--explorer-menu=` → `process.exit(app.isPackaged ? menu.runCommand(cmd, { installDir, exe, dll: resources\explorer-menu\BohpumMenu.dll, msix: resources\explorer-menu\Bohpum.ExplorerMenu.msix, silent }) : 2)`.
- [ ] `bringUp(w)`; `handleTask(argv)` → `readTaskList` → `taskQueue.push({ paths })`, `openTaskWindow()`, `flushTasks()`; task window `frame:false`, 440 wide, `useContentSize`, not resizable, `backgroundColor` by theme, same preload; IPC `task-ready`, `task-focus`, `task-size` (100–420), `name-clashes`, `resolve-names` (Sastra's code). `second-instance`: `handleTask` first; a file with no main window → `pendingOpenPath = f; createWindow()`. `whenReady`: `cleanOld` when packaged; `handleTask(process.argv)` → no main window (quit if nothing opened); else `createWindow()` as now. `win.on('closed', () => win = null)`.
- [ ] preload: `taskReady`, `taskSize`, `taskFocus`, `onTaskBatch`, `nameClashes`, `resolveNames`.
- [ ] `src/task.html` (CSP as index.html, `app.css` tokens via `<link>`, own small styles) + `src/task.js` (module): per batch → groups `[{ dir, names:[base+'.bpum'] }]` → one `nameClashes` → `ask` → `resolveNames` → per file: `show('Converting X', 'File k of n', k/n)`, `api.readDocument(p)` → `{ error }` → problem; `docFromFodg` (throws → problem "it may be damaged or not a Publisher file"); warnings → notes; `api.writeFile({ path, text: bpumText(doc, path) })` → `{ error }` → problem (EACCES/EPERM → "no permission to save there", ENOSPC → "the disk is full", EBUSY → "the file is open in another program"); saved++. Finish / Cancel / Esc / 2 s close as Sastra; `body.dataset.done` counter.
- [ ] Test `tests/convert-task.test.js` (setup writes the list file into `%TEMP%\Bohpum` and pushes the two args into `process.argv` before main.js loads): first window is the task window, not the editor; `.bpum` saved and equal to `docFromFodg`+`bpumText` run in the editor page on the same fodg… (opened by `api.readDocument`); second click via `app.emit('second-instance', …)` with the same file → question → Keep both → `card (2).bpum`; third → Replace → same name, newer time; fourth → Cancel → nothing new; a damaged `.pub` with a good one → one problem line, good one saved, window stays open; finished window with no problems closes after 2 s.
- [ ] Run → pass; `pnpm test` → all pass. Commit.

### Task 4: App icon

- [ ] Render (Electron, scratchpad script) a 256 px green (#1f7a4c) rounded square with a white Khmer "ប" (Khmer OS Muol Light) → PNGs at 16, 24, 32, 48, 64, 128, 256 → `build/icon.ico` (PNG-in-ICO), `build/icon.png` (256), `explorer-menu/Assets/Square44x44Logo.png`, `Square150x150Logo.png`, `StoreLogo.png` (50). Look at it. Commit.

### Task 5: Menu DLL and package

- [ ] Port `menu.cpp` (single `Root` command: title from `.pub` count, icon `exe,0`, hidden without `.pub`, `Invoke` → list file + launch), `menu.def` (`LIBRARY BohpumMenu`), `AppxManifest.xml` (names above, `.pub`), `scripts/build-explorer-menu.js` (outputs `BohpumMenu.dll`, `Bohpum.ExplorerMenu.msix`). `pnpm run build:menu` → both files.
- [ ] C++ harness in scratchpad: titles for 1 / 3 / mixed / Khmer / none; hidden state; icon path; `Invoke` with `BOHPUM_MENU_EXE` = a stub exe that writes its command line → list file content + args. Pass. Commit.

### Task 6: Installer and registration

- [ ] `build/installer.nsh` (Sastra's, Bohpum text); package.json: `files` + `explorer-menu.js`, `win.icon`, `nsis.include`, `extraResources` `explorer-menu/out` → `explorer-menu` (filter dll + msix), scripts `build:menu`, `dist` runs it; `.gitignore` `explorer-menu/out/`.
- [ ] `pnpm run dist` → installer + win-unpacked. With the user: `win-unpacked\Bohpum.exe --explorer-menu=install` (UAC Yes) → `Get-AppxPackage Bohpum.ExplorerMenu`, `packageWorks`; user right-clicks a `.pub` → converted; `--explorer-menu=uninstall` → gone. Commit.

### Task 7: Docs

- [ ] README: "Right-click menu" section, build needs (VS Build Tools + SDK), project layout. Commit. Full `pnpm test`.
