# Bohpum (បោះពុម្ព)

A free, open-source desktop publishing app for Windows. It opens your old Microsoft Publisher (`.pub`) files,
lets you edit them, and prints them, including placing a small card anywhere on A4 the way Publisher does.
*Bohpum* is Khmer for “to print”.

## Download

Get the newest `Bohpum Setup <version>.exe` from the [Releases page](https://github.com/smith89k/Bohpum/releases)
and run it. Windows 10 and 11, 64-bit. Everything it needs is inside, including its own copy of LibreOffice for
reading `.pub` files, so you install nothing else.

**If Windows says “Windows protected your PC”:** until the installer carries its free digital signature
(see [Code signing policy](#code-signing-policy)), Microsoft SmartScreen warns about it because it is new.
Click **More info**, then **Run anyway**. Or, before opening it: right-click the file → **Properties** → tick
**Unblock** → **OK**. If there is no *Run anyway* button, Smart App Control is on for that PC
(Windows Security → App & browser control → Smart App Control).

## What it does

**Open**
- `.pub` (Publisher 98–2019+), plus `.odg`, `.vsd/.vsdx`, `.cdr`, `.p65/.pmd`, `.qxd` through the bundled LibreOffice
- Its own format, `.bpum` (older `.kbach` files still open). Saving an imported `.pub` creates a `.bpum` file; the original `.pub` is never changed.
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

**Right-click in File Explorer** (as in Sastra PDF)
- Right-click one or more `.pub` files → **Convert to Bohpum (.bpum)** (several: "Convert 3 files to Bohpum").
  A small window converts them and saves each `.bpum` next to its `.pub` (the same file as opening it in Bohpum and
  pressing Save); the `.pub` is never changed. It doesn't open the editor or touch an open publication.
- A `.bpum` with that name already there → one question: Replace / Keep both ("Report (2).bpum") / Cancel.
  A damaged file is listed and the others still convert. Clicks while it works wait their turn.
- Installing: on Windows 11 the installer asks Windows' "allow changes" question once. Yes → the item is in the
  first right-click menu; No, no admin rights or a silent install → it is under "Show more options". Windows 10: its
  normal menu. Updates keep it; uninstalling removes it. Log: `%TEMP%\Bohpum\explorer-menu.log`

**Look** (as in Sastra PDF)
- New, Open, Save and Print sit at the start of the toolbar (icon + word; on narrow windows only the icons)
- **Maximize** (F) hides the Pages panel, the side panel and the status bar so the page fills the window; Restore (F) brings them back
- **Theme**: the button at the right end switches System → Light → Dark (also View > Theme); it is remembered,
  and System follows Windows. In Dark the page itself stays white, like paper
- **What's new**: the first start of a new version shows what changed, once, over the welcome screen (each line tagged
  New, Improved, Fixed or Removed; See earlier versions for older ones). **Help > What's New** shows it again
- **Right panel**: each section (Page size, Fill & line, Arrange …) folds and opens from its heading; Bohpum remembers
  which are folded, for every object of that kind and after a restart. **Arrange** holds Bring to front / Send to back
  and **Group / Ungroup** (greyed out when they would do nothing); they are no longer in the toolbar

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

## Build from source

You need **Node.js** (LTS), **LibreOffice**, **Visual Studio Build Tools** ("Desktop development with C++", x64) and
the **Windows 10/11 SDK**. The app ships its own trimmed copy of LibreOffice to read `.pub` files, so users install
nothing extra and never see LibreOffice in the app; LibreOffice and the build tools are only needed on the build PC.

```
git clone https://github.com/smith89k/Bohpum.git
cd Bohpum
npm install
npm run bundle-libreoffice
npm start
```

`npm test` runs the tests (each `tests/*.test.js` starts the real app; `npm test -- tests/about.test.js` runs one).

To build an installer on your own PC (`dist\Bohpum Setup <version>.exe`, not signed):

```
npm run dist
```

`npm run dist` first checks the What's new notes (`scripts/check-notes.js`), then copies the LibreOffice installed on
the build PC into `vendor\libreoffice` (skipped when that version is already bundled), builds the File Explorer menu
add-on (`npm run build:menu`), then builds the installer. To bundle a LibreOffice from another folder, set
`LIBREOFFICE_DIR`.

## Making a release

Releases are built on GitHub, not on a PC, so that they can be signed
([.github/workflows/release.yml](.github/workflows/release.yml)):

1. Change the version in `package.json` (`npm version X.Y.Z --no-git-tag-version`) and write that version's notes at
   the top of `src/notes.js` (the What's new window, also used as the release notes). `npm run dist` and the release
   stop with a plain message when the newest entry is not `package.json`'s version or an entry is broken.
2. Commit, then tag and push the tag: `git tag vX.Y.Z` and `git push origin main vX.Y.Z`.
3. GitHub builds the installer (it installs LibreOffice there and bundles it), sends it to SignPath for signing,
   waits until it is approved there, and publishes the release with the signed installer and the notes.
   Until SignPath is set up, the release gets the unsigned installer. *Actions → Release → Run workflow* only builds
   (the installer is kept with the run) and publishes nothing.

**Setting up SignPath (once):** after SignPath Foundation accepts the project, add the repository variable
`SIGNPATH_ORGANIZATION_ID` and the secret `SIGNPATH_API_TOKEN` (Settings → Secrets and variables → Actions). In
SignPath the project is `Bohpum`, the signing policy `release-signing`, and the artifact configuration signs the
`.exe` inside the GitHub artifact's zip.

**Keeping LibreOffice patched.** The bundled copy only changes when you ship a new Bohpum release. When LibreOffice
publishes a security fix, make a new release: the build installs the newest LibreOffice.

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
src/docfile.js   .pub (via LibreOffice) → document → .bpum text; shared by the editor and the convert window
src/task.html/.js  The Explorer menu's convert window
src/tokens.css   Colours and font (light and dark), shared by the editor and the convert window
src/notes.js     What's new: the notes of each version, newest first (Help > What's New)
explorer-menu.js Explorer menu: reads a menu click, registers / removes the menu (installer hooks)
explorer-menu/   The menu add-on: menu.cpp (BohpumMenu.dll), AppxManifest.xml + Assets (Windows 11 package)
build/           logo.png and bpum-file.png: the logo and the .bpum file icon (source pictures); npm run icons
                 makes icon.ico / icon.png, bpum.ico, the menu package logos and src/img from them. installer.nsh:
                 menu install / update / uninstall steps, .pub in "Open with"
scripts/build-explorer-menu.js Builds BohpumMenu.dll and Bohpum.ExplorerMenu.msix into explorer-menu/out
scripts/bundle-libreoffice.js  Copies a trimmed LibreOffice into vendor/libreoffice for the installer
scripts/check-notes.js         Stops npm run dist when src/notes.js has no notes for package.json's version
scripts/release-notes.js       A version's release notes from src/notes.js (used by the release workflow)
.github/workflows/release.yml  Builds the installer on GitHub from a vX.Y.Z tag, has it signed, publishes the release
vendor/libreoffice             The bundled LibreOffice (generated, not edited by hand)
samples/                       demo-card.pub (a made-up Publisher card) and test-shapes.fodg, used by the tests
tests/                         Electron tests: npm test (each tests/*.test.js runs the real app)
LICENSE                        GNU GPL 3.0
```

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

- **What is signed:** only the installers built by the [release workflow](.github/workflows/release.yml) on GitHub,
  from a version tag of this repository. Installers built on a PC are never signed.
- **Committers and reviewers:** [Sunnguon TAING](https://github.com/smith89k)
- **Approvers:** [Sunnguon TAING](https://github.com/smith89k) approves every signing request by hand.
- Changes from other people are reviewed by a committer before they are merged.
- Until SignPath Foundation accepts the project, releases are not signed (see [Download](#download)).

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user
or the person installing or operating it. Bohpum makes no network connections: your files stay on your computer.
The links in Help › About open in your web browser only when you click them.

## License

Copyright © 2026 Sunnguon TAING.

Bohpum is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License
as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
It is distributed in the hope that it will be useful, but **without any warranty**; without even the implied warranty
of merchantability or fitness for a particular purpose. See [LICENSE](LICENSE) for the full text.

Parts made by others, shipped in the installer (also listed in Help › About):

- **Electron** (MIT), with Chromium, Node.js and FFmpeg; their licenses are in `LICENSES.chromium.html` in the app folder.
- **LibreOffice** (MPL 2.0), used only to read `.pub` and other files. Its `license.txt` and `LICENSE.html` ship inside
  the bundled copy.
- The app's own text uses the fonts of Sastra PDF, shipped in `src/fonts` (same files and `@font-face` rules, made
  from @fontsource packages): **IBM Plex Sans** and **IBM Plex Mono** for English and numbers, **Noto Sans Khmer** for
  Khmer (each file only covers its own letters, by `unicode-range`). All are under the SIL Open Font License 1.1;
  each font's `LICENSE` file ships with it. Text inside a publication keeps the fonts chosen for it.
- The installer is made with electron-builder (MIT) and NSIS (zlib).
