# Bohpum (បោះពុម្ព)

A free, open-source desktop publishing app for Windows. It opens your old Microsoft Publisher (`.pub`) files,
lets you edit them, and prints them, including placing a small card anywhere on A4 the way Publisher does.
*Bohpum* is Khmer for “to print”.

## Download

Get the newest `Bohpum-Setup-<version>.exe` from the [Releases page](https://github.com/smith89k/Bohpum/releases)
and run it (Windows 10 and 11, 64-bit). Installed copies update themselves. The **Publisher reader** (a trimmed
LibreOffice that reads `.pub` files) downloads once, the first time you open a Publisher file, after asking.

**If Windows says “Windows protected your PC”:** until releases carry their free digital signature
(see [Code signing policy](#code-signing-policy)), Microsoft SmartScreen warns about the installer because it is new.
Click **More info**, then **Run anyway**. Or, before opening it: right-click the file → **Properties** → tick
**Unblock** → **OK**. If there is no *Run anyway* button, Smart App Control is on for that PC
(Windows Security → App & browser control → Smart App Control). Updates installed by the app don't show this.

## Build from source

You need **Node.js** (LTS) and **pnpm**. No LibreOffice is needed on the build PC, and the installer doesn't carry it:
installed copies download the **Publisher reader** (a trimmed LibreOffice) once, the first time a Publisher file is
opened, after asking. Users never see LibreOffice in the app.

```
git clone https://github.com/smith89k/Bohpum.git
cd Bohpum
pnpm install
pnpm start
```

`pnpm start` reads `.pub` files with a LibreOffice installed on the PC, or with `vendor\libreoffice` made by
`pnpm run bundle-libreoffice` (it copies the installed LibreOffice, trimmed; `LIBREOFFICE_DIR` names another folder).
With neither, opening a `.pub` says that this copy can't download the Publisher reader.

`pnpm test` runs the tests: each `tests/*.test.js` starts the real app (`pnpm test tests/about.test.js` runs one).
They use the made-up card in `samples/`.

To build an installer on your PC to try it out (`dist\Bohpum-Setup-<version>.exe`, not signed):

```
pnpm run dist
```

It checks What's new (`scripts/check-notes.js`: the newest entry in `src/notes.js` must be `package.json`'s version),
builds the File Explorer menu add-on (`pnpm run build:menu`), then the installer. The menu add-on needs **Visual Studio
Build Tools** ("Desktop development with C++", x64) and the **Windows 10/11 SDK**. A local build has no update key: it
doesn't update itself or download the Publisher reader. Only the release job's installers do.

## Releasing

GitHub Actions builds each release from this repository and puts it in a Cloudflare R2 bucket behind
`https://bohpum-update.smith89k.com/`, locked so that only installed copies (which carry the update key) get in.
Installed copies check when they start and every 6 hours, download a new version quietly, then ask **Restart now** /
**Later** (Later = it installs when Bohpum is closed). **Help › Check for Updates** checks by hand.

1. `pnpm version 0.3.0 --no-git-tag-version --no-git-checks` (only edits package.json).
2. Write that version's notes at the top of `src/notes.js` (What's new) with today's date. They become the GitHub
   release notes; the release stops without them.
3. Commit and push main.
4. GitHub → **Actions** → **Release** → **Run workflow** → type the version (or `gh workflow run release.yml -f version=0.3.0`).
5. Once SignPath is set up: approve the signing request in SignPath (the run waits for it). The release then gets the
   signed installer, and updates use it too.

0.2.0 (2026-10-18) is the first release made this way; private updates and the Publisher reader download are in
place. The one-time Cloudflare, GitHub and SignPath setup, and what each step of the job does:
[docs/updates-setup.md](docs/updates-setup.md).

## The Publisher reader (LibreOffice)

Bohpum reads `.pub` and the other outside formats with LibreOffice, in the background. It is not in the installer.
The release job downloads the LibreOffice pinned in `libreoffice.json` from The Document Foundation (and checks its
SHA-256), trims it as `scripts/bundle-libreoffice.js` does (no help, gallery, templates or Python; one icon theme; the
Visual C++ runtime copied in), checks that the trimmed copy really opens a Publisher file, then zips it and stores it
in the same bucket as `reader/LibreOffice-<version>-pack<n>.zip`. It does this only when that pack isn't there
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
- **Help › About** shows the version, the author, the license (GNU GPL 3.0 or later) with a link to this source code,
  and the open-source parts inside Bohpum

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
main.js          Electron main process: windows, menus, files, LibreOffice import, print/PDF/PNG, updates
preload.js       Safe bridge between the window and main process
updater.js       Automatic updates: when to check, what Check for Updates says, the update key (as Sastra PDF)
reader.js        The Publisher reader: which LibreOffice to use, its download, checksum and unpack, one shared download
libreoffice.json The one pinned LibreOffice the reader pack is made from (version, trim number, MSI, SHA-256)
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
build/           logo.png and bpum-file.png: the logo and the .bpum file icon (source pictures); pnpm run icons
                 makes icon.ico / icon.png, bpum.ico, the menu package logos and src/img from them. installer.nsh:
                 menu install / update / uninstall steps, .pub in "Open with"
scripts/build-explorer-menu.js Builds BohpumMenu.dll and Bohpum.ExplorerMenu.msix into explorer-menu/out
scripts/bundle-libreoffice.js  The trim (trimCopy); copies the installed LibreOffice into vendor/libreoffice for pnpm start
scripts/check-notes.js         Stops pnpm run dist when src/notes.js has no notes for package.json's version
scripts/reader-pack.js         Makes the reader pack (trimmed LibreOffice zip + its name, size, SHA-256); reader-check.js
                               checks it opens a Publisher file
scripts/r2-prune.js, r2-put.sh, release-notes.js  The release job's helpers (which old installers go, uploads, notes)
scripts/rehash-installer.js    After signing: the signed installer's blockmap, SHA-512 and size for latest.yml
.github/workflows/release.yml  The Release button (by hand only): builds, has it signed, uploads to R2, makes the release
docs/updates-setup.md          The Cloudflare, GitHub and SignPath setup, and how to release
vendor/libreoffice             A trimmed LibreOffice for pnpm start only (generated, not edited by hand)
samples/                       demo-card.pub / .bpum (a made-up Publisher card) and test-shapes.fodg, for the tests
tests/                         Electron tests: pnpm test (each tests/*.test.js runs the real app)
LICENSE                        The GNU General Public License 3.0
```

## Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by
[SignPath Foundation](https://signpath.org/).

- **What is signed:** only the installers built by the [release workflow](.github/workflows/release.yml) on GitHub
  from this repository. Installers built on a PC are never signed.
- **Committers and reviewers:** [Sunnguon TAING](https://github.com/smith89k)
- **Approvers:** [Sunnguon TAING](https://github.com/smith89k) approves every signing request by hand.
- Changes from other people are reviewed by a committer before they are merged.
- Until SignPath Foundation accepts the project, releases are not signed (see [Download](#download)).

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user
or the person installing or operating it, with these exceptions:

- **Update checks:** when it starts and every 6 hours, Bohpum asks `https://bohpum-update.smith89k.com/` (run by the
  author on Cloudflare) whether a newer version exists, and downloads it if so. **Help › Check for Updates** does the
  same by hand.
- **The Publisher reader:** only when you click **Download** after Bohpum asks, it is downloaded from the same address.

These requests carry only Bohpum's update key and what any web request carries (such as your IP address). Nothing
about you or your files is sent: your publications stay on your computer. The links in Help › About open in your web
browser only when you click them.

## License

Copyright © 2026 Sunnguon TAING.

Bohpum is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License
as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
It is distributed in the hope that it will be useful, but **without any warranty**; without even the implied warranty
of merchantability or fitness for a particular purpose. See [LICENSE](LICENSE) for the full text.

Parts made by others (also listed in Help › About):

- **Electron** (MIT), with Chromium, Node.js and FFmpeg; their licenses are in `LICENSES.chromium.html` in the app folder.
- **electron-updater** (MIT) for automatic updates, with the small libraries it uses (MIT, ISC, Python-2.0, Blue Oak 1.0.0).
- **LibreOffice** (MPL 2.0), the Publisher reader, downloaded separately. Its `license.txt` and `LICENSE.html` are
  inside its folder.
- **IBM Plex Sans**, **IBM Plex Mono** and **Noto Sans Khmer** (SIL Open Font License 1.1), packaged by Fontsource (MIT).
- The installer is made with electron-builder (MIT) and NSIS (zlib).
