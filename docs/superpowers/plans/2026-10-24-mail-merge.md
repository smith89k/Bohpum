# Mail merge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publisher-style mail merge: an Excel / CSV list, «fields» in text boxes, a photo per person, a preview bar,
choosing people, and printing everyone (several per sheet, front and back, long names shrunk to fit).

**Architecture:** The main process only touches files: a new `list.js` unzips .xlsx (Node `zlib`), reads .csv, converts
.xls with the Publisher reader, and finds / scales photos. The page parses the sheet XML with `DOMParser` in a new
`src/merge.js`, which also *fills* a copy of the document for one person (fields → values, photo frames → photos, too-long
text shrunk). Nothing is merged inside `S.doc`: the editor shows a filled copy while Preview is on, and printing builds a
"merged document" (every person's pages one after another) that the existing `layout()` / `buildOutputHtml()` print as-is.
A new `src/mailings.js` holds the Mailings boxes and the preview bar; `src/app.js` wires them in.

**Tech Stack:** Electron 44, plain ES modules in the page, CommonJS in main, no new dependencies. Tests are
`tests/*.test.js` driving the real app (`pnpm test tests/x.test.js` — no `--` with pnpm 12).

**Spec:** `docs/superpowers/specs/2026-10-24-mail-merge-design.md` (read it first; this plan argues from it).

## Global Constraints

- Work on `main`; commit after each task; every message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never run `pnpm run dist` / `dist:store`, and don't change `package.json`'s version or `src/notes.js` (What's new is
  written with the release).
- No new npm dependencies. Nothing goes online.
- Bohpum never writes to the list file or to photo files; photos are never stored in the .bpum.
- A publication without `doc.merge` must render, save and print byte-for-byte as before (the existing tests prove it).
- Saved shape: `doc.merge = { list: '<absolute path>', sheet: '<sheet name or "">', off: ['<rowKey>', …] }`; a photo field
  is `image.mergePhoto = '<column name>'`; a text field is
  `<span data-field="merge" data-col="<column name, HTML-escaped>" contenteditable="false">«<column name>»</span>`.
- Files list: add `list.js` to `package.json` → `build.files` (Store and installer builds both read it).
- Known failures on this PC, not regressions: controls, convert-task, print-screen, print-sidebar, print-zoom, theme fail;
  font-list, last-folder, dropdowns, colour-list may flake (rerun alone). `print-screen` fails for screen-scale reasons —
  run it anyway after Task 8/9 and compare its failing checks with a run on the commit before Task 8.
- Copy (exact words): menu **Mailings** with **Select List…**, **Choose People…**, **Insert Field** ▸, **Photo from List…**,
  **Preview**, **Remove List**; Print screen **Who**: **Everyone ticked** / **Only the person showing** / **No one (the design
  with blanks)**; order tiles **Different people side by side** / **A full sheet of each person**; **Front and back**;
  **Flip on:** **Long edge** / **Short edge**; problems box **Print anyway** / **Cancel**; missing list **Find the list…** /
  **Later**; list errors "This list has no people in it" / "The first row should hold the column names."
- Numbers: shrink steps of 5 % from 100 % down to `MIN_SCALE = 0.6`; photos larger than 1600 px on the long side are scaled
  to 1600 px; plan for 300 people with photos.

## Review Focus

1. **A list saved by real Excel**, not by our test helper: cells skipped in a row (`<c r="C2">` with no B2), rich-text
   shared strings (`<si><r><t>…</t></r><r><t>…</t></r></si>`), `t="inlineStr"`, formula results `t="str"`, booleans
   `t="b"`, errors `t="e"`, trailing empty rows, the 1904 date system. Expect every value in its right column and blank
   rows dropped. → Task 2 test `real Excel cell kinds`. Before calling the feature done, also open one list the user saved
   in Excel (ask them for one).
2. **Photo paths as Windows "Copy as path" makes them**, with Khmer letters and spaces in folders and file names, forward
   slashes, or a bare file name. Expect each found. → Task 5 test `photo paths: quotes, Khmer, spaces, bare name`.
3. **Phone-size photos** (4000 × 3000 JPEG) for many people: expect a 1600 px copy and a print / PDF where every photo is
   drawn (the hidden print window must wait for pictures, not only fonts). → Task 5 test `big photo is scaled to 1600 px`,
   Task 8 test `PDF waits for every photo`.
4. **Column names** in Khmer, with quotes, `&`, `<`, duplicates or blank header cells: expect them escaped in the text,
   shown in the Insert Field menu, and kept distinct ("Name", "Name (2)"; a blank header becomes "Column C"). → Task 2
   test `header names: blank and duplicate`, Task 4 test `field with odd column name survives save and reopen`.
5. **Undo / redo across Mailings actions** (Select list, Insert field, Photo from list, Choose people, Remove list): expect
   each to be one undo step, and undoing Select list to bring back the old list (or none). → Task 3 test
   `undo Select list`, Task 7 test `undo Choose people`.

---

### Task 1: Read list files in the main process

**Files:**
- Create: `list.js`
- Modify: `main.js` (IPC next to `pick-images`; `convertOne` gains an output format), `preload.js`, `package.json` (`build.files`)
- Create: `tests/make-xlsx.js` (test helper), `tests/mail-list-read.test.js`

**Interfaces:**
- Produces (`list.js`, CommonJS):
  - `unzipEntries(buf: Buffer, want: (name: string) => boolean) → Map<string, Buffer>` — stored (0) and deflated (8)
    entries, read through the central directory; throws `Error('not a zip')`.
  - `async readList(p: string, { convertXls?: (p) => Promise<Buffer> }) → { kind: 'xlsx', files: { [name]: string } } | { kind: 'csv', text: string } | { error: string }`
    — `files` holds only `xl/workbook.xml`, `xl/_rels/workbook.xml.rels`, `xl/sharedStrings.xml`, `xl/styles.xml`,
    `xl/worksheets/*.xml`, decoded UTF-8. CSV: UTF-8 (BOM dropped); if `TextDecoder('utf-8', { fatal: true })` throws,
    decode as `windows-1252`.
  - `listError(err) → string` — plain words: `ENOENT` "The list was moved or deleted.", `EBUSY`/`EPERM`/`EACCES` "The
    list is open in another program, or Bohpum may not read it. Close it in Excel and try again.", not a zip / bad file
    "This file isn't an Excel list Bohpum can read."
- Produces (preload `window.api`): `pickList() → Promise<string|null>` (dialog filters xlsx, xls, csv; remembers
  `lastListDir` like `lastImageDir`), `readList(p) → Promise<readList result & { locale: string }>` (`locale` =
  `app.getSystemLocale()`).
- `.xls`: `convertXls` = `convertOne(p, job, soffice, 'xlsx')` through the existing queue; `convertOne(inputPath, job,
  soffice, to = 'fodg')` returns the text for fodg as today, a Buffer for xlsx. No reader (`chooseReader().need`) →
  `{ error: "Bohpum can't read old .xls lists on this PC. Open it in Excel and save it as .xlsx." }`.

- [ ] **Step 1: Write the test helper** `tests/make-xlsx.js`: `makeXlsx(file, { sheets: [{ name, rows: (string|number|{ v, t, s, f })[][] }], numFmts?: { [id]: code }, date1904?: bool, raw?: { [entryName]: string } })`
  writes a real deflated .xlsx (Node `zlib.deflateRawSync`, CRC32 written by hand) with shared strings, a styles.xml with
  the given number formats, and `raw` entries overriding generated XML (Task 2 uses it for hand-written Excel XML).
- [ ] **Step 2: Write the failing test** `tests/mail-list-read.test.js` (main process: `require('../list.js')`, plus
  `t.js('window.api.readList(...)')` for the IPC):
  - `reads the xlsx parts` — a 2-sheet file → `kind === 'xlsx'` and `Object.keys(files)` contains workbook, rels,
    sharedStrings, styles, `xl/worksheets/sheet1.xml`, `sheet2.xml`, nothing else.
  - `Khmer survives` — a shared string `សុខ ដារា` comes back unchanged inside `xl/sharedStrings.xml`.
  - `csv: UTF-8 with BOM` → text starts with `Name`, no `\uFEFF`; `csv: Windows-1252` (bytes `Caf\xe9`) → `Café`.
  - `missing file` → `{ error: 'The list was moved or deleted.' }`; `listError({ code: 'EBUSY' })` → the "open in another
    program" text; a .xlsx that is really text → "This file isn't an Excel list Bohpum can read."
  - `xls without a reader` (no LibreOffice on this PC; `LIBREOFFICE_DIR` pointed at an empty folder) → the "save it as
    .xlsx" error.
  - `IPC adds the locale` → `readList` result has a non-empty `locale` string.
- [ ] **Step 3: Run it** — `pnpm test tests/mail-list-read.test.js` → FAIL (`Cannot find module '../list.js'`).
- [ ] **Step 4: Implement** `list.js`, the IPC handlers `pick-list` / `read-list`, the preload entries, `convertOne`'s
  `to` parameter, and add `list.js` to `build.files`.
- [ ] **Step 5: Run it** → all PASS; also `pnpm test tests/open-progress.test.js tests/reader-convert.test.js` still PASS.
- [ ] **Step 6: Commit** — `feat: read Excel and CSV lists for mail merge`.

### Task 2: Turn a list into columns and rows (page side)

**Files:**
- Create: `src/merge.js`
- Test: `tests/mail-list-parse.test.js` (runs in the page: `t.js("import('./merge.js').then(m => …)")`; files built with
  `tests/make-xlsx.js` and read through `window.api.readList`)

**Interfaces:**
- Consumes: Task 1's `readList` result.
- Produces (`src/merge.js`, ES module):
  - `parseList(r: readList result, { sheet?: string }) → { sheets: string[], sheet: string, columns: string[], rows: string[][] }`
    — sheet names in workbook order (`[]` for CSV); `sheet` defaults to the first; every row has `columns.length` strings;
    rows whose cells are all blank are dropped; throws `Error('This list has no people in it')` (header only, or empty)
    and `Error('The first row should hold the column names.')` (first row all blank).
  - Header rules: blank header → `Column <letter>`; a repeat → `Name (2)`, `Name (3)`; spaces trimmed.
  - `formatCell(v: number, code: string, { date1904: boolean, locale: string }) → string` — Excel's built-in ids
    0–49 mapped to their codes (id 14 → the locale's short date, `Intl.DateTimeFormat(locale, { day: '2-digit', month:
    '2-digit', year: 'numeric' })`), and codes built from `0 # , . % E` `d m y h s AM/PM`, `[$…]` currency, quoted text and
    `\x` literals, `;` sections (positive;negative;zero;text), `@`. Anything else → the plain value (`String(v)`, up to 10
    significant digits).
  - `csvRows(text) → string[][]` — RFC 4180 quotes, `,` or `;` (whichever splits the first line into more columns), CRLF/LF.
  - `rowKey(row: string[]) → string` = `JSON.stringify(row)`.

- [ ] **Step 1: Write the failing test** with these checks (values exact):
  - `first sheet, header, rows` — sheet `People` rows `[['Name','Title'],['សុខ ដារា','Director'],['Chan Mony','']]` →
    `columns` `['Name','Title']`, `rows` `[['សុខ ដារា','Director'],['Chan Mony','']]`, `sheets` `['People','Other']`.
  - `chosen sheet` — `{ sheet: 'Other' }` gives Other's rows.
  - `real Excel cell kinds` (Review Focus 1) — via `raw` sheet XML: A1 `Name`, C1 `Photo` (no B1); row 2 has a rich-text
    shared string `សុខ` + ` ដារា`, `t="inlineStr"` `Mony`, a `t="str"` formula result `=A2` cached `X`, `t="b"` `1` →
    `TRUE`, `t="e"` `#N/A`; rows 5–9 empty → `columns` `['Name','Column B','Photo']`, row 2 values in the right columns,
    no blank rows.
  - `dates and numbers` — 45597 with id 14 and locale `en-GB` → `01/11/2024`; with code `d mmmm yyyy` → `1 November
    2024`; date1904 with 44135 + `yyyy-mm-dd` → `2024-11-01`; `#,##0.00` 1234.5 → `1,234.50`; `0%` 0.256 → `26%`;
    `"$"#,##0` 12 → `$12`; text cell `012345` (shared string) → `012345`; `0` code with 7 → `7`; a weird code
    `[Red][<10]0;0` 3 → `3` (falls back to the plain value is acceptable: assert it is `'3'`).
  - `header names: blank and duplicate` (Review Focus 4) — header `['Name','', 'Name', ' ឈ្មោះ ']` →
    `['Name','Column B','Name (2)','ឈ្មោះ']`.
  - `empty list` → throws "This list has no people in it"; `header row blank` → throws "The first row should hold the
    column names."
  - `csv` — `Name;Title\r\n"Sok, Dara";"He said ""hi"""\r\n` → columns `['Name','Title']`, row `['Sok, Dara','He said "hi"']`.
- [ ] **Step 2: Run it** — `pnpm test tests/mail-list-parse.test.js` → FAIL (module not found).
- [ ] **Step 3: Implement** `parseList`, `formatCell`, `csvRows`, `rowKey` in `src/merge.js` (`DOMParser` for the XML;
  cell refs decide the column; style index → `cellXfs[i].numFmtId` → custom `numFmts` or the built-in table; date1904 from
  `workbook.xml` `<workbookPr date1904="1">`).
- [ ] **Step 4: Run it** → all PASS.
- [ ] **Step 5: Commit** — `feat: mail merge list parsing with Excel number formats`.

### Task 3: Mailings menu, Select List, remembering and reopening the list

**Files:**
- Create: `src/mailings.js` (boxes and the bar; receives what it needs from app.js, like `print.js` does)
- Modify: `main.js` (`buildMenu`: Mailings between Arrange and View; `ipcMain.on('mail-menu')`), `preload.js`
  (`setMailMenu`), `src/index.html` (menu button `data-menu="4"` Mailings; View 5, Help 6; empty `<div id="mailbar" hidden>`
  between `#textbar` and the workspace), `src/app.js` (`MENU_KEYS` `{ f: 0, e: 1, i: 2, a: 3, m: 4, v: 5, h: 6 }`, `cmd()`
  cases, `S.mail`, `loadDoc`), `src/app.css`, `tests/titlebar.test.js` (seven menus)
- Test: `tests/mail-select.test.js`

**Interfaces:**
- Consumes: `api.pickList`, `api.readList`, `parseList`.
- Produces:
  - Menu commands sent to the page: `mail-select`, `mail-people`, `mail-field-<i>` (i = column index), `mail-photo`,
    `mail-preview`, `mail-remove`. Main keeps `mailMenu = { list: false, columns: [], field: false, photo: false,
    preview: false }` and rebuilds the menu on `mail-menu`; items are `enabled` per spec ("Everything but Select list is
    greyed out while the publication has no list"; Insert Field only while editing text; Photo from List only with one
    picture selected); Preview is a checkbox item.
  - `api.setMailMenu(state)`; app.js `syncMailMenu()` sends it only when the JSON differs; called from `selectionChanged`,
    `startEditing`, `finishEditing`, `renderAll`.
  - `S.mail = null | { list: parseList result, at: 0, preview: false, photos: new Map(), error: null }` (not saved).
  - app.js `async loadMailList(askIfMissing = true)` — reads `S.doc.merge.list` / `.sheet`; on error keeps `S.mail =
    { …, list: null, error }` and (when asked) `choiceBox(<error>, 'The design still opens and shows its «blanks».',
    ['Find the list…', 'Later'])`; Find → same as Select List but keeps `off`.
  - app.js `async selectList()` — pick → read → if `sheets.length > 1`, a box with a `<select>` of sheet names (first
    chosen) → `S.doc.merge = { list, sheet, off: [] }`, `commit()`, `renderAll()`.

- [ ] **Step 1: Write the failing test** `tests/mail-select.test.js` (stub `dialog.showOpenDialog` in main to return the
  test's xlsx, as `tests/save-as.test.js` stubs dialogs):
  - `seven menus` (and update `tests/titlebar.test.js`' check to `File Edit Insert Arrange Mailings View Help`).
  - `menu greyed out without a list` — `Menu.getApplicationMenu()` Mailings items: only Select List… enabled.
  - `Select List with two sheets asks which` — the box lists both names; choosing the second → `S.doc.merge.sheet`
    is it, `S.mail.list.columns` matches, `#mailbar` visible, publication dirty.
  - `saved and reopened` — save to tmp .bpum, open another sample, reopen → `S.mail.list.rows.length` right, not dirty.
  - `list gone on open` — rename the xlsx, reopen → box with **Find the list…** / **Later**; Later → the design is on
    screen, `S.mail.error` set, `#mailbar` shows the problem in words.
  - `undo Select list` (Review Focus 5) — choose list A, then list B, Ctrl+Z → `S.doc.merge.list` is A and `S.mail`
    follows (after `restore()`, call `loadMailList(false)` when `doc.merge` changed); Ctrl+Z again → no list, bar hidden.
  - `empty list says so` — a list with only a header → "This list has no people in it" shown, `S.doc.merge` unchanged.
- [ ] **Step 2: Run it** → FAIL.
- [ ] **Step 3: Implement** the menu, IPC, `selectList`, `loadMailList` (called from `loadDoc` when `doc.merge`),
  the sheet box in `src/mailings.js`, and the bar's empty shell (filled by Task 6).
- [ ] **Step 4: Run it** → PASS; `pnpm test tests/titlebar.test.js` PASS.
- [ ] **Step 5: Commit** — `feat: Mailings menu, Select List, list kept with the publication`.

### Task 4: Fields in text

**Files:**
- Modify: `src/merge.js`, `src/textedit.js` (`cleanAttrs` keeps `data-col`, and `contenteditable` only on
  `span[data-field]`), `src/app.js` (`mail-field-<i>` → `insertField`), `src/app.css`
- Test: `tests/mail-fields.test.js`

**Interfaces:**
- Produces (`src/merge.js`): `fieldHtml(col: string) → string` (the span in Global Constraints); `fieldsIn(doc) →
  { text: Set<string>, photo: Set<string> }` (page + master objects).
- app.js `insertField(col)` — at the caret of the text box being edited (use the kept range `S.savedRange` /
  `restoreRange` as the text bar does, since the menu takes the focus), via `document.execCommand('insertHTML')`;
  the field takes the formatting at the caret.
- Editor look (app.css, not `RENDER_CSS`, so print shows no tint): `.kpage.editor .kt [data-field="merge"]` light accent
  tint, 0.5 mm radius; `[data-missing]` (set by `renderStage` when the column isn't in `S.mail.list.columns`) a red tint and
  the text `«Name ?»` via `::after { content: ' ?' }`.

- [ ] **Step 1: Write the failing test** `tests/mail-fields.test.js`:
  - `Insert Field puts «Name» at the caret` — edit a text box, type `Dear `, `cmd('mail-field-0')`, type `!` → `o.html`
    text is `Dear «Name»!` with one `span[data-field="merge"][data-col="Name"]`.
  - `field is one piece` — caret after the field, Backspace once → the whole field is gone (text `Dear !`); Ctrl+Z
    back.
  - `takes the formatting` — bold + 20 pt at the caret → the field span is inside the bold 20 pt span.
  - `survives copy and paste` — select all in the box, Ctrl+C, new box, Ctrl+V → the field span with `data-col`
    survives `sanitizeHtml`.
  - `field with odd column name survives save and reopen` (Review Focus 4) — column `ឈ្មោះ "A" & <B>` → save, reopen →
    the span's `dataset.col` is exactly that string; Insert Field menu label shows it.
  - `missing column is marked` — choose a list without that column → the field has `data-missing`.
  - `Insert Field greyed out unless editing text` — menu item `enabled` false with a picture selected, true while editing.
- [ ] **Step 2: Run it** → FAIL.
- [ ] **Step 3: Implement** `fieldHtml`, `fieldsIn`, `insertField`, the cleaner change and the CSS.
- [ ] **Step 4: Run it** → PASS; `pnpm test tests/controls.test.js tests/sastra-bar.test.js` no new failing checks.
- [ ] **Step 5: Commit** — `feat: merge fields in text boxes`.

### Task 5: Photo fields and finding photos

**Files:**
- Modify: `list.js` (photos), `main.js` (`mail-photos` IPC), `preload.js`, `src/mailings.js` (Photo from List box),
  `src/app.js` (`mail-photo`, Picture panel shows "Photo from list: <column>")
- Test: `tests/mail-photos.test.js`

**Interfaces:**
- Produces (`list.js`): `photoPath(cell: string, listPath: string) → string|null` — trims spaces and one pair of `"` or
  `'`, `/` → `\`; absolute → itself; else joined to the list's folder; returns it if `fs.existsSync`, else null.
  `photoUrl(p: string) → string` — data URL; `.jpg/.jpeg/.png` whose long side is over 1600 px are scaled to 1600 px with
  `nativeImage` (`toJPEG(90)` / `toPNG()`), other formats as they are; cached by path + mtime + size.
- IPC `mail-photos` (cells: string[], listPath) → `{ [cell]: { url } | { missing: '<path tried>' } | { empty: true } }`;
  preload `mailPhotos(cells, listPath)`.
- `src/mailings.js` `photoBox(columns, current) → Promise<string|null|undefined>` (a column, `null` = "Not from the list",
  `undefined` = cancelled); default choice: a column named like `/photo|picture|image|pic|រូប/i`, else the first column
  whose first non-empty value ends in an image extension.

- [ ] **Step 1: Write the failing test** `tests/mail-photos.test.js` (photos made in the test with `nativeImage`):
  - `photo paths: quotes, Khmer, spaces, bare name` (Review Focus 2) — files `tmp\រូបថត\Sok Dara.png` and
    `tmp\list\mony.jpg`; cells `"C:\…\រូបថត\Sok Dara.png"` (with quotes), `  C:/…/រូបថត/Sok Dara.png `, `mony.jpg` (list in
    `tmp\list`) → all three found; `nobody.png` → `{ missing: '<list folder>\nobody.png' }`; `''` → `{ empty: true }`.
  - `big photo is scaled to 1600 px` (Review Focus 3) — a 4000 × 3000 JPEG → the data URL decodes (in the page, `Image`)
    to 1600 × 1200; a 300 × 300 PNG stays 300 × 300.
  - `Photo from List` — select a picture, `cmd('mail-photo')`, the box preselects `Photo`, OK → `o.mergePhoto === 'Photo'`,
    one undo step; the Picture panel says `Photo from list: Photo`.
  - `greyed out` — Photo from List disabled with a text box or two pictures selected.
- [ ] **Step 2: Run it** → FAIL.
- [ ] **Step 3: Implement** `photoPath`, `photoUrl`, the IPC, `photoBox`, and the command.
- [ ] **Step 4: Run it** → PASS.
- [ ] **Step 5: Commit** — `feat: photo fields, photos found from Copy-as-path cells`.

### Task 6: Filling one person, the preview bar, shrink to fit

**Files:**
- Modify: `src/merge.js` (filling), `src/mailings.js` (`renderMailBar`), `src/app.js` (`viewDoc()` used by `renderStage`
  and `renderThumbs`; `startEditing` shows the design while Preview is on), `src/app.css`
- Test: `tests/mail-preview.test.js`

**Interfaces:**
- Produces (`src/merge.js`):
  - `MIN_SCALE = 0.6`
  - `ticked(list, off: string[]) → number[]` — row indices not in `off` (by `rowKey`).
  - `fillPage(doc, page, ctx) → { page, problems: string[] }` with `ctx = { columns, row: string[], photos: Map<cell,
    result> }` — returns a new page: master objects (unless `page.hideMaster`) copied in front of the page's objects and
    `hideMaster: true`; every field span's text → the value (span kept, `data-field`/`data-col`/`contenteditable` removed);
    `mergePhoto` frames get `src` = photo url (none → `src: ''`, `note: null`, rendered empty — add a `.kimg-empty` case
    in `renderImage` that draws nothing for `o.mergePhoto && !o.src`); then `fitText` on boxes with fields. Problems
    (plain words): `photo not found: <path>`, `no photo`, `no column «X» in the list`, `the text doesn't fit its box`.
  - `fitText(o) → { o, fits: boolean }` — renders `renderObject(o)` off-screen at 100 % (`position:fixed; left:-100000px`),
    `fixLineHeights`, fits when the `.kt`'s `scrollHeight` ≤ the box's inner height (h − pad.t − pad.b, in px) + 0.5 and its
    `scrollWidth` ≤ inner width + 0.5. If not, tries 0.95, 0.90 … 0.60: `scaleText(o, f)` multiplies `o.size` and every
    inline `font-size` (pt or px) by f. Returns the first that fits, else the 0.60 version with `fits: false`.
  - `scaleText(o, f) → o` (copy).
- app.js `removeList()` (`mail-remove`) — field spans → plain text `«Name»` keeping the span's style; `mergePhoto`
  deleted (if Preview is on and that person has a photo, it becomes `src`); `delete S.doc.merge`; `S.mail = null`; one
  `commit()`.
- app.js `viewDoc()` — `S.doc` unless `S.mail?.preview && S.mail.list`; then a copy whose pages / master are filled for
  person `ticked()[S.mail.at]` (photos from `S.mail.photos`, fetched with `api.mailPhotos` for that person, re-render when
  they arrive). Selection, ids and editing still use `S.doc`.
- Preview bar (`#mailbar`, shown while `S.doc.merge`): `◀` `Person 3 of 40` `▶` · first column's value · Preview
  switch · **Choose people** button; error text instead when `S.mail.error`. ◀ ▶ step through ticked people only, wrap
  off (disabled at the ends). `cmd('mail-preview')` toggles; menu checkbox follows.

- [ ] **Step 1: Write the failing test** `tests/mail-preview.test.js` (list: 3 people, Khmer names, photos for 2):
  - `Preview shows the person` — Preview on → the stage's text box reads `សុខ ដារា`, photo frame `img.src` starts with
    `data:image/`; ▶ → second person's name; bar says `Person 2 of 3`.
  - `thumbnails follow` — the Pages panel thumbnail shows the same name.
  - `design is untouched` — `S.doc` html still holds the field span; publication not dirty after stepping.
  - `editing shows the design` — double-click the box with Preview on → it shows `«Name»`; finish → back to the name.
  - `no photo → empty frame` — person 3 → frame has no `img` and no "Picture" placeholder text.
  - `long Khmer name shrinks` — a 40 × 8 mm box, 14 pt, a name of 60 Khmer letters → filled box's sizes are 14 × f with
    0.6 ≤ f < 1 and the rendered `.kt` fits; a name that can't fit even at 0.6 → `fits: false` and the problem `the text
    doesn't fit its box`.
  - `boxes without fields never shrink` — an overflowing box without a field keeps its size.
  - `Remove List` — with Preview on at person 1: the field becomes plain text «Name», the photo frame a plain picture
    with person 1's photo, the bar hides; one Ctrl+Z brings the list, the field and the photo field back.
- [ ] **Step 2: Run it** → FAIL.
- [ ] **Step 3: Implement** `ticked`, `fillPage`, `fitText`, `scaleText`, `viewDoc`, the bar, `mail-preview` and `removeList`.
- [ ] **Step 4: Run it** → PASS.
- [ ] **Step 5: Commit** — `feat: mail merge preview, one person at a time, long text shrinks to fit`.

### Task 7: Choose People

**Files:**
- Modify: `src/mailings.js` (`peopleBox`), `src/app.js` (`mail-people`, the bar's button)
- Test: `tests/mail-people.test.js`

**Interfaces:**
- Produces: `peopleBox(list, off: string[]) → Promise<string[]|null>` — `modal()` box, class `people`, a table (tick box +
  every column), **Tick all** / **Untick all** (act on the rows shown), a search field filtering rows by any cell
  (case-insensitive, Khmer as typed), OK / Cancel. Returns the new `off` (row keys), or null.
- app.js: OK → `S.doc.merge.off = result`, `commit()`, `S.mail.at` clamped, `renderAll()`.

- [ ] **Step 1: Write the failing test** `tests/mail-people.test.js`:
  - `untick one` — untick row 2, OK → bar `Person 1 of 2`, ▶ skips that person.
  - `search then Untick all` — search `Chan` → 1 row shown; Untick all → only that row unticked.
  - `remembered by content` — save; insert a new row at the top of the xlsx (rewrite with the helper); reopen → the same
    person is unticked, the new row is ticked.
  - `undo Choose people` (Review Focus 5) — Ctrl+Z → all ticked again.
  - `Cancel changes nothing` — not dirty.
- [ ] **Step 2: Run it** → FAIL.
- [ ] **Step 3: Implement** `peopleBox` and the command.
- [ ] **Step 4: Run it** → PASS.
- [ ] **Step 5: Commit** — `feat: Choose People for mail merge`.

### Task 8: Printing everyone

**Files:**
- Modify: `src/merge.js` (`mergedDoc`), `src/print.js` (`openPrintDialog` takes `mail`; Who; tile labels; progress;
  problems before output), `src/app.js` (`printDialog` passes `mail`; `savePdf` / `exportPng`), `src/mailings.js`
  (`problemsBox`), `main.js` (`withHiddenWindow` also waits for every `img` to `decode()`)
- Test: `tests/mail-print.test.js`

**Interfaces:**
- Produces (`src/merge.js`): `async mergedDoc(doc, people: number[], pageIdxs: number[], ctx: { list, photos, fetchPhotos:
  (cells) => Promise<void> }, onProgress?: (done, total) => void) → { doc, problems: { row: number, name: string, text:
  string }[] }` — fetches the photos of those people in chunks of 20, awaits `document.fonts.ready`, then for each person
  (yielding to the page every 10 people) `fillPage` for each `pageIdxs` page; `doc.pages` = person 1's pages, person 2's …;
  `row` is the Excel row number (header = 1), `name` the first column's value.
- `openPrintDialog({ …, mail })` with `mail = null | { count: number, build: (who: 'all'|'one', pageIdxs) => Promise<{ doc,
  problems }> }`; `pageIdxs` = `parsePages(o, doc.pages.length, pageIndex)` on the design (the range counts within one
  person's pages). New options in `o`: `who: 'all'` (default), `duplex`, `flip` (Task 9). With `who !== 'none'`:
  `currentLayout()` uses the merged doc and `layout(merged, o, all its pages)`; the merged doc is cached per
  `who + pageIdxs` and rebuilt only when those change; while building, `info` says `Preparing 12 of 40 people…` and Print
  / Save as PDF are disabled. Who sits at the top of Settings as a `bigSelect` (icons `all` / `current` / `custom`).
- Tile labels with a list: `repeat` → **A full sheet of each person**, `sequence` → **Different people side by side**;
  with a list and no saved `doc.print.order`, `order` defaults to `sequence`.
- `problemsBox(problems) → Promise<boolean>` — lists `Row 5 · សុខ ដារា · photo not found: C:\Photos\dara.jpg` (scrolls past
  ~12), **Print anyway** (true) / **Cancel**; skipped (true) when there are none. Shown before Print and before Save as PDF.
- File › Save As → PDF (`savePdf`) with a list: everyone ticked, every page at page size, the same problems box;
  Export Page as PNG: `viewDoc()`'s current page.

- [ ] **Step 1: Write the failing test** `tests/mail-print.test.js` (printing stubbed as in `tests/print-direct.test.js`;
  3 people, 1-page 85.6 × 54 mm card, one photo missing):
  - `Who is at the top, Everyone ticked chosen` — first `big` select in Settings, value `all`.
  - `many per sheet, people side by side` — grid mode, A4: 1 sheet, its slots hold the 3 names in order.
  - `A full sheet of each person` — `repeat` → 3 sheets, each full of one name.
  - `Only the person showing` — at person 2 → every slot shows person 2.
  - `No one` → slots show `«Name»`.
  - `problems before printing` — Print → the box lists `Row 3 · <name> · photo not found: …`; Cancel → nothing sent;
    Print anyway → one job.
  - `PDF waits for every photo` (Review Focus 3) — Save as PDF (stub the file dialog) of 3 people with 1600 px photos →
    in the hidden window every `img.complete && img.naturalWidth > 0` at `printToPDF` time (stub `printToPDF` to check).
  - `File Save As PDF prints everyone` — page count of the html = 3.
  - `300 people stay responsive` — 300 rows with 2 photos reused: building finishes under 60 s and a `setInterval` in
    the page keeps ticking (no gap over 1 s) while it builds.
  - `no list: unchanged` — `tests/print-direct.test.js` and `tests/print-position.test.js` still PASS.
- [ ] **Step 2: Run it** → FAIL.
- [ ] **Step 3: Implement** `mergedDoc`, the Print screen changes, `problemsBox`, `savePdf` / `exportPng`, and the image
  wait in `withHiddenWindow`.
- [ ] **Step 4: Run it** → PASS; run `tests/print-screen.test.js` and compare with its baseline failures (Global
  Constraints).
- [ ] **Step 5: Commit** — `feat: print and save everyone on the list`.

### Task 9: Front and back

**Files:**
- Modify: `src/print.js` (`layoutDuplex`, Print screen controls)
- Test: `tests/mail-duplex.test.js`

**Interfaces:**
- Produces (`src/print.js`): `layoutDuplex(doc, o, pageIdxs: number[], perPerson: number) → lay` (same shape as
  `layout()`). Units = page pairs within each person (1–2, 3–4 …; an odd last page has no back). `sequence`: chunks of
  `slots.length` units → a fronts sheet (unit k's front in slot k) then a backs sheet (unit k's back at `mirror(slot k)`);
  `repeat`: per unit, a fronts sheet full of it, then a backs sheet. Mirror, in the sheet's own frame (sw × sh as laid out):

  ```
  longEdgeMirrorsX = (sw <= sh) === (o.flip !== 'short')
  mirror(s) = longEdgeMirrorsX ? { x: sw - s.x - doc.pageW, y: s.y } : { x: s.x, y: sh - s.y - doc.pageH }
  ```
  (portrait sheet + long edge → left/right swap; landscape sheet + long edge → top/bottom swap — the landscape sheet goes
  to the printer turned onto portrait paper, so its paper's long edge is the layout's top/bottom.)
- Print screen (grid mode with a list, chosen pages per person ≥ 2): **Front and back** tick (`o.duplex`, on by default
  when exactly 2 pages per person and `doc.print.duplex` was never saved) and **Flip on:** `<select>` **Long edge** /
  **Short edge** (`o.flip`, default `long`), with a muted line "Turn on two-sided printing in Printer Properties."
  Unticked → Task 8's layout.

- [ ] **Step 1: Write the failing test** `tests/mail-duplex.test.js` (3 people, 2 pages: front `«Name»`, back
  `back «Name»`; 85.6 × 54 card on A4 portrait, margins 10, gaps 0, not centred → 2 × 5 slots):
  - `fronts sheet then backs sheet` — 2 sheets; sheet 1 fronts of persons 1–3, sheet 2 their backs.
  - `long edge, portrait: left and right swap` — person 1's front at x = 10 → its back at x = 210 − 10 − 85.6 = 114.4,
    same y.
  - `short edge, portrait: top and bottom swap` — back at y = 297 − 10 − 54 = 233, same x.
  - `landscape, long edge: top and bottom swap` — A4 landscape: back y = 210 − y − 54, same x.
  - `full sheet of each person` — `repeat` → 6 sheets alternating fronts / backs per person.
  - `off by default for one page; tick hidden` — a 1-page card shows no Front and back tick.
  - `untick → Task 8 layout` — persons' fronts and backs side by side in order.
- [ ] **Step 2: Run it** → FAIL.
- [ ] **Step 3: Implement** `layoutDuplex` and the controls.
- [ ] **Step 4: Run it** → PASS; `pnpm test tests/mail-print.test.js` still PASS.
- [ ] **Step 5: Commit** — `feat: front and back cards for mail merge`.

### Task 10: Whole-feature check

**Files:** none new (fixes only).

- [ ] **Step 1:** `pnpm test` (all files). Expected: every `mail-*` file passes; failures limited to the known list in
  Global Constraints (rerun flaky ones alone).
- [ ] **Step 2:** Start the app (`pnpm start`) and walk through the spec's "How it works for the user" end to end with a
  list containing Khmer names and Copy-as-path photos; then ask the user for one list saved in their own Excel and open it
  (Review Focus 1).
- [ ] **Step 3: Commit** any fixes — `fix: mail merge — <what>`.
