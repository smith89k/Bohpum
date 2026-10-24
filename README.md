# Bohpum (បោះពុម្ព)

A desktop publishing app for Windows that opens your old Microsoft Publisher (`.pub`) files,
lets you edit them, and prints them, including placing a small card anywhere on A4 the way Publisher does.

## Run it

You need **Node.js** (LTS) and **pnpm**. No LibreOffice is needed on the build PC, and the installer doesn't carry it:
installed copies download the **Publisher reader** (a trimmed LibreOffice) once, the first time a Publisher file is
opened, after asking. Users never see LibreOffice in the app.

```
cd E:\_httdocs\Bohpum
pnpm install
pnpm start
```

`pnpm start` reads `.pub` files with a LibreOffice installed on the PC, or with `vendor\libreoffice` made by
`pnpm run bundle-libreoffice` (it copies the installed LibreOffice, trimmed; `LIBREOFFICE_DIR` names another folder).
With neither, opening a `.pub` says that this copy can't download the Publisher reader.

To build an installer on your PC to try it out (`dist\Bohpum-Setup-<version>.exe`):

```
pnpm run dist
```

It checks What's new (`scripts/check-notes.js`: the newest entry in `src/notes.js` must be `package.json`'s version),
builds the File Explorer menu add-on (`pnpm run build:menu`), then the installer. The menu add-on needs **Visual Studio
Build Tools** ("Desktop development with C++", x64) and the **Windows 10/11 SDK**. A local build has no update key: it
doesn't update itself or download the Publisher reader. Only the release job's installers do.

## Releasing

Bohpum comes from the **Microsoft Store** (https://apps.microsoft.com/detail/9MWKGK7SCMJS): Microsoft signs it, so
Windows shows no warning, and the Store keeps it up to date. The Store version has the Publisher reader inside.
GitHub Actions builds each release's Store package; you submit it in Partner Center.

1. `pnpm version 0.3.0 --no-git-tag-version --no-git-checks` (only edits package.json).
2. Write that version's notes at the top of `src/notes.js` (What's new) with today's date. They become the GitHub
   release notes; the release stops without them.
3. Commit and push main.
4. GitHub → **Actions** → **Release** → **Run workflow** → type the version (or `gh workflow run release.yml -f version=0.3.0`).
5. Download `Bohpum-Store-<version>.msix` from the GitHub release and submit it in Partner Center.

Up to 0.2.4 releases were an installer with private updates from a Cloudflare R2 bucket behind
`https://bohpum-update.smith89k.com/`. Copies installed that way stay on 0.2.4 (the bucket still serves them, and the
Publisher reader); since 0.2.5 nothing goes there. The Store setup, each release's upload, and the old update setup:
[docs/updates-setup.md](docs/updates-setup.md).

**Privacy.** The Store version never goes online by itself (the Store updates it). An installer copy goes online only
to check for updates, and downloads the Publisher reader only when you say yes. Nothing about you or your files is
sent.

## The Publisher reader (LibreOffice)

Bohpum reads `.pub` and the other outside formats with LibreOffice, in the background. It is not in the installer.
The release job downloads the LibreOffice pinned in `libreoffice.json` from The Document Foundation (and checks its
SHA-256), trims it as `scripts/bundle-libreoffice.js` does (no help, gallery, templates or Python; one icon theme; the
Visual C++ runtime copied in), checks that the trimmed copy really opens a Publisher file, then zips it and stores it
in the same private bucket as `reader/LibreOffice-<version>-pack<n>.zip`. It does this only when that pack isn't there
yet. The pack's name, size and SHA-256 are built into the app, so nothing on the server can swap it.

In the app, the first `.pub` asks "Bohpum needs the Publisher reader" (with its size); **Download** shows the download
in the reading box (Cancel stops it), then opens the file. The reader is kept in `%LOCALAPPDATA%\Bohpum\reader`
across updates; uninstalling removes it. A download that didn't finish is never used and is cleaned up. A LibreOffice
installed normally on the PC is used instead, without asking.

**Moving to a newer LibreOffice** (for example a security fix): put its version, its archive MSI address
(`https://downloadarchive.documentfoundation.org/libreoffice/old/<x.y.z.w>/win/x86_64/LibreOffice_<x.y.z.w>_Win_x86-64.msi`)
and that file's SHA-256 into `libreoffice.json`, then release. Bump `pack` only when the trim in
`scripts/bundle-libreoffice.js` changes. Installed copies then offer "A newer Publisher reader is ready" the next time
a Publisher file is opened (Not now keeps the one they have).

LibreOffice is licensed under MPL 2.0. Its `license.txt` and `LICENSE.html` are inside the pack;
credit LibreOffice on the About page.

The app's own text uses the fonts of Sastra PDF, shipped in `src/fonts` (same files and `@font-face` rules, made from
@fontsource packages): **IBM Plex Sans** and **IBM Plex Mono** for English and numbers, **Noto Sans Khmer** for Khmer
(each file only covers its own letters, by `unicode-range`). All are under the SIL Open Font License 1.1; each font's
`LICENSE` file ships with it. Text inside a publication keeps the fonts chosen for it.

## What it does

**Open**
- `.pub` (Publisher 98–2019+), plus `.odg`, `.vsd/.vsdx`, `.cdr`, `.p65/.pmd`, `.qxd` through the Publisher reader
  (LibreOffice, downloaded once: the first of these files asks first; see above)
- Its own format, `.bpum` (older `.kbach` files still open). Saving an imported `.pub` creates a `.bpum` file; the original `.pub` is never changed.
- While a `.pub` is read, a box with the look of the right-click convert window covers the editor: "Opening card.pub",
  a moving bar, **Cancel** (or Esc; the publication on screen stays as it was). It closes by itself when the file is in;
  a problem stays in it with Close. While the convert window is busy it says it is waiting for those files.
- Drag a file onto the window to open it. Drag a picture in to insert it.
- After installing, double-clicking a `.bpum` file opens it in Bohpum (it has its own file icon). For `.pub` files
  Bohpum is added to "Open with"; Microsoft Publisher stays the default if it is installed.
- The welcome screen lists recently opened and saved files (files that were moved or deleted drop off the list).

**Edit**
- Text boxes with Khmer and Latin text: font, size, bold/italic/underline/strike, colour, alignment,
  line spacing (0.75 sp …), top/middle/bottom placement, inner margins
- The font box lists every font installed in Windows, Khmer fonts first, each name in its own lettering;
  typing jumps to the matching font. The chosen text stays highlighted while you pick a font, size or colour
- Rectangles, rounded rectangles, ellipses, lines with arrows, pictures (stretch / fit / crop)
- Fill colour or gradient, line colour, weight (pt) and dash; **Align** puts the line (or a picture's border) on the
  shape's edge (Center, the default), Inside it or Outside it, as in InDesign. Every colour button opens a list like Publisher 2010 and
  later: Theme Colours with five lighter / darker shades each, Standard Colours, Recent Colours, More Colours…,
  Sample Colour (pick any colour on the screen)
- Move, resize, rotate (Shift = 15° steps), snap to page, margins, guides and other objects (hold Alt to turn off snapping)
- Ctrl+drag to copy, group / ungroup, lock, align, distribute, bring to front / send to back
- Multiple pages, a master page (items appear on every page), margin guides and ruler guides
- Undo / redo, copy / paste between pages and publications, paste pictures from the clipboard

**Print and save**
- **Print** (Ctrl+P), like Publisher: the print screen fills the window; each setting is a big dropdown
  (printer, pages, layout, paper, orientation) with the preview beside it
  - Pick the printer; **Print** sends straight to it (**Printer Properties** opens the printer's own settings). The last printer is remembered.
  - *One per sheet, at a position*: drag the card on the A4 preview, type Left/Top in mm, or click the 3×3 pad
  - *Multiple copies per sheet*: margins, gaps, centred block; two tiles choose the same page on every sheet or different pages in sequence
  - **Zoom** the preview to check gaps and edges: the zoom bar under it (− slider + %, Fit sheet), Ctrl + mouse
    wheel (on the spot under the mouse), Ctrl+0 / Ctrl++ / Ctrl+−; Space + drag or the middle button moves the view
  - *Page size = paper size*
  - Crop marks, page range, copies
  - *Printer adjustment*: if your printer is a little off, enter X/Y in mm once and it is remembered
  - *Save as PDF* saves the sheets as laid out (e.g. 8 cards on an A4)
- **Save As** (Ctrl+Shift+S) can also save a PDF of the publication (every page at page size); the publication keeps its own file
- File > Export Page as PNG saves the current page as a 300 dpi PNG

**Mailings** (mail merge, with Publisher's words: one card or certificate per recipient)
- **Select Recipients…** picks an Excel list (`.xlsx`, `.xls`) or a `.csv`: one row per recipient, the first row holds the
  column names (a workbook with several sheets asks which one). The publication remembers its list; Bohpum never changes it
- **Insert Merge Field** ▸ puts a «Name» field at the cursor in a text box; each recipient's value takes its font and size.
  A name too long for its box is shrunk to fit, for that recipient only
- **Picture Field…** makes the selected picture a picture field. The column holds each photo's path: in File Explorer,
  right-click the photo → **Copy as path**, then paste it in Excel (a bare file name is looked for next to the list)
- **Preview Results** shows real recipients instead of the fields; ◀ Recipient 3 of 40 ▶ steps through them
- **Edit Recipient List…** ticks who gets a copy (search, Tick all / Untick all)
- **Merge to Printer** (or Print) opens the Print screen: **Print All Records** (every ticked recipient), **Print Current
  Record** or **Print the Design**; different recipients side by side on a sheet, or a full sheet of each recipient, and
  Save as PDF. Before it goes out, a box lists who has a missing photo or a name that doesn't fit (Print anyway / Cancel)
- **Front and back**: a card with two pages prints a sheet of fronts, then a sheet of the matching backs (turn on
  two-sided printing in Printer Properties)
- **Remove List** turns the fields back into plain text
- While a publication has a list, the **mail merge toolbar** above the page has all of these as buttons with icons
  (greyed out when they can't be used now), the recipient showing with ◀ ▶, and the list's name

**Right-click in File Explorer** (as in Sastra PDF)
- Right-click one or more `.pub` files → **Convert to Bohpum (.bpum)** (several: "Convert 3 files to Bohpum").
  A small window converts them and saves each `.bpum` next to its `.pub` (the same file as opening it in Bohpum and
  pressing Save); the `.pub` is never changed. It doesn't open the editor or touch an open publication.
- A `.bpum` with that name already there → one question: Replace / Keep both ("Report (2).bpum") / Cancel.
  A damaged file is listed and the others still convert. Clicks while it works wait their turn.
- Installing: on Windows 11 the installer asks Windows' "allow changes" question once. Yes → the item is in the
  first right-click menu; No, no admin rights or a silent install → it is under "Show more options". Windows 10: its
  normal menu. Updates keep it; uninstalling removes it. Log: `%TEMP%\Bohpum\explorer-menu.log`
- If an automatic update left the item under "Show more options", Bohpum offers once to set it up again.
- The first click without the Publisher reader asks the same Download / Not now question inside the small window.

**Look** (as in Sastra PDF)
- New, Open, Save and Print sit at the start of the toolbar (icon + word; on narrow windows only the icons)
- **Maximize** (F) hides the Pages panel, the side panel and the status bar so the page fills the window; Restore (F) brings them back
- **Theme**: the button at the right end switches System → Light → Dark (also View > Theme); it is remembered,
  and System follows Windows. In Dark the page itself stays white, like paper
- **What's new**: the first start of a new version shows what changed, once, over the welcome screen (each line tagged
  New, Improved, Fixed or Removed; See earlier versions for older ones). **Help > What's New** shows it again
- **Right panel**: each section (Page size, Fill & line, Arrange …) folds and opens from its heading; Bohpum remembers
  which are folded, for every object of that kind and after a restart. **Arrange** holds Bring to front / Send to back
  and **Group / Ungroup** (greyed out when they would do nothing); they are no longer in the toolbar. For an object the
  panel starts with Position & size (its icon shows what kind of object it is), then Arrange, then **Shape** (Rectangle /
  Ellipse, and Text box for a text box; Corner rounds the corners) and **Text** (inner margins, Fit height, Edit text)

## Shortcuts

| Key | Action |
| --- | --- |
| V T R E L | Select, Text, Rectangle, Ellipse, Line tool |
| Double-click / Enter | Edit text of a box (Esc to finish) |
| Arrows | Nudge 0.5 mm (Shift = 5 mm, Alt = 0.1 mm) |
| Ctrl+D | Duplicate |
| Ctrl+G / Ctrl+Shift+G | Group / Ungroup |
| Ctrl+] / Ctrl+[ | Forward / Backward (add Shift for Front / Back) |
| Ctrl+0, F9, Ctrl+wheel | Fit page, 100 %, zoom |
| F | Maximize the page area / Restore the panels |
| Space+drag, middle mouse | Pan |
| Ctrl+M | Master page |
| PageUp / PageDown | Previous / next page |
| Alt+F, E, I, A, M, V, H / F10 | Open the File, Edit, Insert, Arrange, Mailings, View, Help menu / the File menu |

## Known limits of `.pub` import

- WMF/EMF clip-art can't be shown in the app. It shows as a placeholder; re-insert it as PNG/JPG.
- Some Publisher autoshapes (special arrows, banners) may come in as plain rectangles.
- WordArt, mail-merge fields and linked text-box chains come in as normal text boxes.
- Install the original fonts (e.g. Khmer OS Siemreap, Khmer OS Muol Light) for exact line breaks.

## Project layout

```
main.js          Electron main process: windows, menus, files, LibreOffice import, print/PDF/PNG, updates
preload.js       Safe bridge between the window and main process
updater.js       Automatic updates: when to check, what Check for Updates says, the update key (as Sastra PDF)
reader.js        The Publisher reader: which LibreOffice to use, its download, checksum and unpack, one shared download
store.js         The Microsoft Store copy: which copy it is, its identity (store.json), the Store page, the reader inside
list.js          Mail merge: reads a list file (xlsx, xls, csv) and the photos it names, never writes to them
libreoffice.json The one pinned LibreOffice the reader pack is made from (version, trim number, MSI, SHA-256)
src/index.html   Editor window
src/app.js       Editor: canvas, tools, panels, pages, undo, shortcuts
src/odgImport.js .pub → (LibreOffice flat ODF) → Bohpum document
src/render.js    Draws objects (shared by editor, thumbnails, print, PDF)
src/textedit.js  Rich-text editing helpers
src/print.js     Publisher-style print dialog and sheet layout
src/merge.js     Mail merge: the list's recipients and columns, «fields», one recipient's page filled in (shrunk to fit), everyone
src/mailings.js  Mailings boxes (sheet, Picture Field, Edit Recipient List, problems) and the mail merge toolbar
src/model.js     Document model (all sizes in mm)
src/docfile.js   .pub (via LibreOffice) → document → .bpum text; shared by the editor and the convert window
src/task.html/.js  The Explorer menu's convert window
src/tokens.css   Colours and font (light and dark), shared by the editor and the convert window
src/notes.js     What's new: the notes of each version, newest first (Help > What's New)
explorer-menu.js Explorer menu: reads a menu click, registers / removes the menu (installer hooks)
explorer-menu/   The menu add-on: menu.cpp (BohpumMenu.dll), AppxManifest.xml + Assets (Windows 11 package)
build/           logo.png and bpum-file.png: the logo and the .bpum file icon (source pictures); pnpm run icons
                 makes icon.ico / icon.png, bpum.ico, the menu package logos and src/img from them. installer.nsh:
                 menu install / update / uninstall steps, .pub in "Open with"
scripts/build-explorer-menu.js Builds BohpumMenu.dll and Bohpum.ExplorerMenu.msix into explorer-menu/out
scripts/bundle-libreoffice.js  The trim (trimCopy); copies the installed LibreOffice into vendor/libreoffice for pnpm start
scripts/check-notes.js         Stops pnpm run dist when src/notes.js has no notes for package.json's version
scripts/reader-pack.js         Makes the reader pack (trimmed LibreOffice zip + its name, size, SHA-256); reader-check.js
                               checks it opens a Publisher file
scripts/release-notes.js       The GitHub release notes from What's new
scripts/store-config.js        The Store package's build config (loaded through build/store.config.js; the manifest is
                               build/store-manifest.xml, the logos build/appx); store-check.js checks the built package
.github/workflows/release.yml  The Release button (by hand only): builds the Store package, makes the GitHub release
docs/updates-setup.md          How to release and submit to the Store; the old installer update setup (R2, Cloudflare)
docs/store-listing.md          The Store page texts (description, privacy policy, notes for certification)
vendor/libreoffice             A trimmed LibreOffice for pnpm start only (generated, not edited by hand)
tests/                         Electron tests: pnpm test (each tests/*.test.js runs the real app)
```
