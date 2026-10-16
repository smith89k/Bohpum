# Own title bar, green theme, direct printing, Save As PDF: design

Date: 2026-10-16 · Status: approved by the user in chat, before implementation

## Goal
Four changes the user asked for together:
1. Bohpum draws its own title bar instead of Windows' title bar and menu row.
2. The accent colour turns green, so Bohpum no longer looks like Sastra PDF (red).
3. The Print dialog picks the printer itself and prints straight to it, like Sastra PDF; its left
   column is tidied up.
4. PDF moves into Save As as a file type; the separate Export PDF command goes away.

Decided in chat: title row + toolbar (not Sastra's single row); from Sastra's printing only the
printer picker and direct printing (no grayscale, no both sides, no Sastra sizing modes); Save As
gets PDF only, no image types.

## 1. Title bar
- `main.js` `createWindow`: `titleBarStyle: 'hidden'`, `titleBarOverlay: { color: '#f7f5f1',
  symbolColor: '#23201b', height: 36 }` (`--chrome` / `--ink`). Windows still draws minimize /
  maximize / close (with Win11 snap layouts) over the right end of the title row.
- New `<header id="titlebar">` above `#topbar` in `src/index.html`, 36 px high, `--chrome`
  background, 1 px `--line` bottom border:
  - left: the brand (`បោះពុម្ព` in `--accent` + `Bohpum`), moved out of `#topbar`;
  - menu words `File Edit Insert Arrange View Help` (buttons, `data-menu` = index in the
    application menu);
  - centre: the publication name, `Untitled` / `card •` (same text and dirty dot as the window
    title, set in `updateTitle`);
  - right padding = the caption-button area, from `env(titlebar-area-x)` /
    `env(titlebar-area-width)`, so nothing sits under ─ □ ✕.
- `#titlebar { -webkit-app-region: drag }`, its buttons `no-drag`. `.modal-back`, `#ctxmenu`,
  `#toast` are `no-drag` (a drag region ignores what is drawn over it). Drag empty space to move,
  double-click to maximize: Windows handles both.
- Clicking a menu word sends `show-menu(index, x, y)` (preload `api.showMenu`), x, y = the word's
  bottom-left in page pixels. Main checks the sender is `win` and the index is in range, then
  `Menu.getApplicationMenu().items[index].submenu.popup({ window: win, x, y })`. The word looks
  pressed while its menu is open.
- Alt+F / E / I / A / V / H (renderer keydown, not while typing in a field or editing text) open the
  matching menu under its word.
- The application menu stays set (`Menu.setApplicationMenu`), so its accelerators (Ctrl+S, Ctrl+P …)
  keep working although it is not drawn. `win.setTitle` stays (taskbar text).
- `body` grid gains a row: `auto auto auto 1fr auto` (title row, toolbar, text bar, main, status).
- Toolbar: the brand block and its divider leave `#topbar`; nothing else in it changes except the
  PDF button (section 4).

## 2. Green theme
`src/app.css` `:root`:
- `--accent: #1f7a4c` (jade green, was `#9a3412`), `--accent-soft: #e6f2eb` (was `#fbeee6`).
- Hard-coded tints derived from the old red become green: `.btn.primary:hover` `#186240` (was
  `#7f2a0e`), `.btn.on` border `#b7d9c4` (was `#e7c2ad`), `.field:focus` outline `#b9dcc6` (was
  `#f0c7b2`), `.numf:focus-within` shadow `#cfe8d9` (was `#f3d2c2`). Sweep `app.css`, `app.js`,
  `print.js` for any other red-derived literal.
- Unchanged: warm neutral chrome and lines, selection blue `--sel`, guide / margin / snap colours,
  the warning yellow, page rendering. No dark theme.

## 3. Print dialog (`src/print.js`)
### Left column, top to bottom
Every section uses the same heading (`.psec h4` style: 11 px caps, `--ink-2`), the same 12 px
spacing and labelled fields; the column scrolls on its own when the window is short.
1. **Printer**: select of installed printers + **Properties** button; **Copies** (1–999).
2. **Paper**: size + orientation (as today).
3. **Layout**: the three cards (One per sheet at a position / Multiple copies per sheet / Page size
   = paper size) with their options (as today).
4. **Pages**: All · Current page · Pages [range] (today's select + range field), **Crop marks**.
5. **Printer adjustment**: X / Y in mm + the one-line note (as today).
6. Warnings (page outside the paper, printer edge) at the bottom (as today).

Footer unchanged: status text · Close · Save as PDF · Print….

### Printer list
- Filled from `api.printers()` → main `win.webContents.getPrintersAsync()` →
  `[{ name, displayName, isDefault }]`. While loading: one disabled option "Finding printers…".
- Selected: `settings.printer` if still installed, else the system default, else the first.
  Changing it saves `settings.printer` (app-wide, next to `printNudge`).
- No printers: "No printers installed", select, Properties and Print disabled; Save as PDF works.
- **Properties** → `api.printerPrefs(name)` → main runs `rundll32.exe printui.dll,PrintUIEntry /e
  /n <name>` (only for a name in the current printer list) = Windows "Printing preferences".
  Tooltip: changes there become this printer's defaults.

### Printing
- Print… builds the sheets as today (`layout`, `buildOutputHtml` with the printer adjustment) and
  calls `api.printHtml({ html, sheet, widthMm, heightMm, copies, deviceName })`.
- Main `print-html`: `silent: true`, `deviceName` (must be in the printer list), `copies` 1–999,
  `printBackground: true`, `margins: { marginType: 'none' }`, `scaleFactor: 100`, `landscape:
  false`. `pageSize`: the named size (`'A4'`, `'A3'`, `'A5'`, `'Letter'`, `'Legal'`) for those
  sheets, the custom size in microns for "Page size = paper size". Every field validated in main.
- Landscape sheets are sent as portrait paper of the same size with the content turned 90°
  (content's top edge along the paper's left edge, as a driver prints landscape), so no driver
  rotates them a second way. Done in `buildOutputHtml` (option `portraitPaper`), after the printer
  adjustment, so X / Y keep meaning right / down on the preview.
- While sending: footer "Sending to <printer>…", buttons disabled. Then the dialog closes and a
  toast says "Sent 3 sheets to <printer>" or "Print failed: <reason>".
- Settings kept as today: dialog settings on the publication (`doc.print`, also on Close / Esc),
  printer adjustment and printer app-wide.

## 4. Save As
- `save(as)`: with `as`, the save dialog offers two file types, *Bohpum publication (\*.bpum)*
  and *PDF (\*.pdf)*. The chosen path's extension decides.
- `.pdf`: every page at page size (today's Export PDF: `buildOutputHtml` one page per sheet) →
  main writes it with `printToPDF` and opens it. The publication's path, name and dirty state do
  not change; toast "Saved card.pdf".
- `.bpum`: as today.
- Plain Save (Ctrl+S, also the first save of a new or imported publication) offers `.bpum` only.
- Main: the PDF writing in `export-pdf` becomes a helper used by a new `write-pdf({ html, widthMm,
  heightMm, path })` (path from the Save As dialog) and by the existing `export-pdf` (own dialog),
  which the Print dialog's Save as PDF keeps using.
- Removed: File > Export PDF… (Ctrl+E), the toolbar PDF button, `cmd('export-pdf')` /
  `exportPdf()`. Kept: File > Export Page as PNG…, the Print dialog's Save as PDF.

## Testing
Electron harness outside the project (like `repro-print.js`): loads the real `main.js` with a
throwaway `userData`, drives the window with real key / mouse input.
- Title row present; Windows' menu row gone; the publication name follows the open file and the
  dirty dot; clicking File and Alt+F call `show-menu` with index 0 (recorded in main; the native
  popup itself is not inspected); Ctrl+P still opens Print; title row is a drag region, its
  buttons are not.
- Computed `--accent` is `#1f7a4c`; the primary Print button background is green.
- Print: printer list filled (installed printers); remembered printer reselected on reopen;
  hidden print windows get `webContents.print` swapped for a stub that records the options and
  writes `printToPDF` output instead of paper. Check `silent`, `deviceName`, `copies`, `pageSize`;
  a landscape A4 layout arrives as portrait A4 with the content turned.
- Save As: `dialog.showSaveDialog` stubbed to return a temp `.pdf`, then a `.bpum`. The PDF exists,
  starts with `%PDF`, has one page per publication page; the publication's path and dirty state are
  unchanged after the PDF, and set after the `.bpum`. Export PDF menu item and toolbar button gone.
- The earlier print-position checks (Esc / Close keep the position) still pass.
- Real paper: the user prints one sheet on an office printer (never sent by the tests).

## Out of scope
Grayscale, both-sides printing, Sastra's Size / Poster / Multiple / Booklet modes, a dark theme,
image types in Save As, removing Export Page as PNG, Sastra's single-row title bar.
