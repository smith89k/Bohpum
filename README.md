# Bohpum (បោះពុម្ព)

A desktop publishing app for Windows that opens your old Microsoft Publisher (`.pub`) files,
lets you edit them, and prints them, including placing a small card anywhere on A4 the way Publisher does.

## Run it

You need **Node.js** (LTS) and, on the build PC only, **LibreOffice**. The app ships its own trimmed copy of
LibreOffice to read `.pub` files, so users install nothing extra and never see LibreOffice in the app.

```
cd E:\_httdocs\Bohpum
npm install
npm run bundle-libreoffice
npm start
```

To build an installer (`dist\Bohpum Setup <version>.exe`):

```
npm run dist
```

`npm run dist` first copies the LibreOffice installed on the build PC into `vendor\libreoffice`
(skipped when that version is already bundled), then builds the installer.

**Keeping LibreOffice patched.** The bundled copy only changes when you ship a new Bohpum release.
When LibreOffice publishes a security fix, update LibreOffice on the build PC, then run `npm run dist`
and ship the new installer. To bundle a LibreOffice from another folder, set `LIBREOFFICE_DIR`.

LibreOffice is licensed under MPL 2.0. Its `license.txt` and `LICENSE.html` ship inside the bundle;
credit LibreOffice on the About page.

## What it does

**Open**
- `.pub` (Publisher 98–2019+), plus `.odg`, `.vsd/.vsdx`, `.cdr`, `.p65/.pmd`, `.qxd` through the bundled LibreOffice
- Its own format, `.bpum` (older `.kbach` files still open). Saving an imported `.pub` creates a `.bpum` file; the original `.pub` is never changed.
- Drag a file onto the window to open it. Drag a picture in to insert it.
- The welcome screen lists recently opened and saved files (files that were moved or deleted drop off the list).

**Edit**
- Text boxes with Khmer and Latin text: font, size, bold/italic/underline/strike, colour, alignment,
  line spacing (0.75 sp …), top/middle/bottom placement, inner margins
- The font box lists every font installed in Windows, Khmer fonts first, each name in its own lettering;
  typing jumps to the matching font. The chosen text stays highlighted while you pick a font, size or colour
- Rectangles, rounded rectangles, ellipses, lines with arrows, pictures (stretch / fit / crop)
- Fill colour or gradient, line colour, weight (pt) and dash
- Move, resize, rotate (Shift = 15° steps), snap to page, margins, guides and other objects (hold Alt to turn off snapping)
- Ctrl+drag to copy, group / ungroup, lock, align, distribute, bring to front / send to back
- Multiple pages, a master page (items appear on every page), margin guides and ruler guides
- Undo / redo, copy / paste between pages and publications, paste pictures from the clipboard

**Print and save**
- **Print** (Ctrl+P), like Publisher: the print screen fills the window; each setting is a big dropdown
  (printer, pages, layout, paper, orientation) with the preview beside it
  - Pick the printer; **Print** sends straight to it (**Printer Properties** opens the printer's own settings). The last printer is remembered.
  - *One per sheet, at a position*: drag the card on the A4 preview, type Left/Top in mm, or click the 3×3 pad
  - *Multiple copies per sheet*: margins, gaps, centred block, the same page or different pages
  - *Page size = paper size*
  - Crop marks, page range, copies
  - *Printer adjustment*: if your printer is a little off, enter X/Y in mm once and it is remembered
  - *Save as PDF* saves the sheets as laid out (e.g. 8 cards on an A4)
- **Save As** (Ctrl+Shift+S) can also save a PDF of the publication (every page at page size); the publication keeps its own file
- File > Export Page as PNG saves the current page as a 300 dpi PNG

**Look** (as in Sastra PDF)
- New, Open, Save and Print sit at the start of the toolbar (icon + word; on narrow windows only the icons)
- **Maximize** (F) hides the Pages panel, the side panel and the status bar so the page fills the window; Restore (F) brings them back
- **Theme**: the button at the right end switches System → Light → Dark (also View > Theme); it is remembered,
  and System follows Windows. In Dark the page itself stays white, like paper

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
| Alt+F, E, I, A, V, H / F10 | Open the File, Edit, Insert, Arrange, View, Help menu / the File menu |

## Known limits of `.pub` import

- WMF/EMF clip-art can't be shown in the app. It shows as a placeholder; re-insert it as PNG/JPG.
- Some Publisher autoshapes (special arrows, banners) may come in as plain rectangles.
- WordArt, mail-merge fields and linked text-box chains come in as normal text boxes.
- Install the original fonts (e.g. Khmer OS Siemreap, Khmer OS Muol Light) for exact line breaks.

## Project layout

```
main.js          Electron main process: windows, menus, files, LibreOffice import, print/PDF/PNG
preload.js       Safe bridge between the window and main process
src/index.html   Editor window
src/app.js       Editor: canvas, tools, panels, pages, undo, shortcuts
src/odgImport.js .pub → (LibreOffice flat ODF) → Bohpum document
src/render.js    Draws objects (shared by editor, thumbnails, print, PDF)
src/textedit.js  Rich-text editing helpers
src/print.js     Publisher-style print dialog and sheet layout
src/model.js     Document model (all sizes in mm)
scripts/bundle-libreoffice.js  Copies a trimmed LibreOffice into vendor/libreoffice for the installer
vendor/libreoffice             The bundled LibreOffice (generated, not edited by hand)
tests/                         Electron tests: npm test (each tests/*.test.js runs the real app)
```
