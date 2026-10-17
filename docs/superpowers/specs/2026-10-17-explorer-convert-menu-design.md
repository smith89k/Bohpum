# Explorer right-click "Convert to Bohpum" — design

Date: 2026-10-17 · Status: approved by the user in chat ("yes"); menu shape chosen: **one item**.

## Goal
Right-click one or more `.pub` files in File Explorer → **Convert to Bohpum (.bpum)**, like Sastra PDF's
Explorer menu (same machinery, same installer behaviour). Each `.pub` becomes a `.bpum` next to it.

## What the user sees

| Selection | Item | Where |
|---|---|---|
| one `.pub` | **Convert to Bohpum (.bpum)** | Windows 11 first menu (Windows 10: its menu) |
| N `.pub` (N ≥ 2) | **Convert N files to Bohpum** | same |
| no `.pub` | hidden | |

- One item, no submenu, Bohpum's icon (`Bohpum.exe,0`). Other files in the selection are ignored.
- A click opens a small **progress window** (no Windows title bar, like Sastra's task window, Bohpum's
  colours and theme): "Converting Report.pub", "File 2 of 5", a progress bar, Cancel. It never opens the
  editor and never touches a publication open in Bohpum. Another click while it runs is queued
  ("2 more waiting").
- Output: `<folder>\<name>.bpum` next to `<folder>\<name>.pub`. The file is **byte-for-byte the file the
  editor saves** after opening that `.pub` and pressing Save (same importer, same defaults, same name
  field). The `.pub` never changes.
- **Name already there**: ONE question per click, inside the progress window: Cancel / Replace /
  **Keep both** (default; `Report (2).bpum`, the first free number). Never overwrites silently.
- **Problems** (a red line each; the other files still convert): the `.pub` can't be read / is damaged
  / too slow ("Opening the file took too long."); the `.bpum` can't be written (no permission, disk full,
  file open elsewhere); the file is gone. **Notes** (grey line, file still saved): the importer's
  warnings (WMF/EMF pictures, OLE objects, simplified shapes).
- End: no problems and no notes → "Done · 5 files saved", closes after 2 s. Otherwise it stays open:
  "Done, with problems" / "Done · 5 files saved · 1 note below", Close button. Cancel stops after the
  current file. Esc: answers Cancel / stops / closes.
- Bohpum not running before → it quits when the progress window closes.

## Installation (as Sastra PDF)
- **Windows 11**, not silent: the installer re-runs Bohpum elevated once ("allow changes" prompt naming
  Bohpum) to add the unsigned sparse package `Bohpum.ExplorerMenu` → first menu. No / not admin /
  failure / landed on another account → **classic** HKCU registration (under "Show more options").
- **Windows 10** and silent installs (`/S`): classic, no prompt.
- **Update**: keeps the package without asking if Windows still starts it (`packageWorks`, the Sastra
  1.0.4 fix); else adds it again (one prompt). Declined once → no more prompts until uninstall.
- **Uninstall**: removes the package and the classic keys; frees the DLL (moves it aside if Explorer holds it).

## How it works

1. **`explorer-menu/menu.cpp`** → `BohpumMenu.dll` (x64, `/MT`, WRL). CLSID
   `{1e11f0a8-6fc0-4a9c-9031-6924b71a4d77}`. ONE `IExplorerCommand` (no sub-commands): `GetTitle` from
   the selection, `GetIcon` = `<install>\Bohpum.exe,0`, `GetState` hidden with no `.pub`, `Invoke` writes
   the `.pub` paths (UTF-8, one per line) to `%TEMP%\Bohpum\menu-<pid>-<tick>-<k>.txt` and starts
   `Bohpum.exe --bohpum-task=convert "--bohpum-list=<file>"` through Explorer (`IShellDispatch2`, so the
   app is not inside the package identity), `CreateProcess` fallback; test override env `BOHPUM_MENU_EXE`.
   Missing exe / list failure → message "Bohpum is missing or damaged. Please reinstall it."
2. **`explorer-menu/AppxManifest.xml`** — sparse package `Bohpum.ExplorerMenu` 1.0.0.0, Publisher
   `CN=Bohpum, OID.2.25.311729368913984317654407730594956997722=1`, Executable `Bohpum.exe`,
   `desktop5:ItemType Type=".pub"`, surrogate COM server `resources\explorer-menu\BohpumMenu.dll`.
   Logos from the new app icon.
3. **`scripts/build-explorer-menu.js`** (vswhere → vcvars64 → cl/link; makeappx) → `explorer-menu/out/`
   (gitignored). `npm run dist` runs it; `npm run build:menu` alone. Checks CLSID / name / version agree.
4. **`explorer-menu.js`** (main process, no Electron): `parseTaskArgs`, `readTaskList` (only
   `%TEMP%\Bohpum\menu-*.txt`, deleted after reading, existing `.pub` files, de-duplicated, name order
   01, 02, 10), classic registration (`HKCU\Software\Classes\SystemFileAssociations\.pub\shell\Bohpum`
   ExplorerCommandHandler + `CLSID\…\InprocServer32`, MultiSelectModel Player), state
   `HKCU\Software\Bohpum\ExplorerMenu`, package add/remove/works, `release` / `cleanOld`, `runCommand`.
   Log `%TEMP%\Bohpum\explorer-menu.log`.
5. **`build/installer.nsh`** (`nsis.include`): `customInstall` → `--explorer-menu=install` (+ `--silent`);
   `customUnInstall` → `release` on update, else `uninstall`.
6. **main.js**: `--explorer-menu=` handled first (before the single-instance lock, no window, exit code).
   `handleTask(argv)` on first launch and in `second-instance` → queue `{ paths }` for the task window
   (`src/task.html`); no main window unless the user opens Bohpum. `second-instance` with a file while
   only the task window is open → creates the main window. `bringUp` (always-on-top for a moment) for
   windows coming up on request. LibreOffice conversions are run one at a time (a queue), so the editor
   and the task window never start two at once on the same profile. New IPC: `name-clashes`,
   `resolve-names` (as Sastra), `task-ready`, `task-focus`, `task-size`. `write-file` reports errors.
7. **`src/docfile.js`** (new, shared): `docFromFodg(xml, base)` → `{ doc, warnings }` (importer + the
   defaults `loadDoc` adds: guides, master) and `bpumText(doc, fileName)` (name from the file, JSON).
   The editor's open/save use them too, so both paths give identical files.
8. **`src/task.html` + `src/task.js`**: the progress window (Bohpum's tokens, light/dark).
9. **App icon** (new; Bohpum had Electron's): green rounded square, white Khmer "ប" (Khmer OS Muol Light),
   `build/icon.ico` (16–256) + `build/icon.png`; package.json `win.icon`. Used by the exe, the
   installer, the menu item and the package logos.

## Testing
- `tests/explorer-menu.test.js`: parseTaskArgs; readTaskList (folder/name guard, deletes the file,
  only existing `.pub`, BOM, de-dup, 01/02/10 order, Khmer names); classic register / unregister /
  state against a test key (`HKCU\Software\BohpumTest`), cleaned up.
- `tests/convert-task.test.js` (app started with `--bohpum-task`): `samples/card-original.pub` copied
  to a temp folder → `.bpum` saved, equal to the editor's Open + Save of the same file; Keep both →
  `(2)`; Replace; Cancel → nothing saved; damaged `.pub` → problem line, the good one still saved;
  queued second click (`second-instance`); no editor window opened; window closes after 2 s.
- C++ harness (scratchpad, not in the project): loads the DLL, 1 / 3 / mixed / Khmer-named / no-`.pub`
  selections → titles, hidden state, icon path; `Invoke` writes the list and starts `BOHPUM_MENU_EXE`
  with the right arguments.
- On this PC with the user: `dist\win-unpacked\Bohpum.exe --explorer-menu=install` (user clicks Yes),
  `packageWorks`, the user right-clicks a `.pub` and converts; `uninstall` → gone. All 16 existing test
  files still pass.

## Not in scope
Other formats (.odg, .vsd, .cdr…), Convert to PDF, signing, ARM64, Khmer menu text.
