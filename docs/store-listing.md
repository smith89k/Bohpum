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

## What's new in this version

(Partner Center: the submission › Store listings › English › What's new in this version; up to 1500 characters.
Newest first; the app's own What's new window is src/notes.js.)

### 0.3.1

- Tables have their own Table section: insert or delete rows and columns, merge and unmerge cells, make columns or
  rows the same size, and change the cell colour, border, inner space and where the text sits.
- Click in a cell to change that cell, drag across cells to change several, or press Whole table to change them all.
- Crop pictures: press Crop and drag the black bars on the edges. Reset crop brings the cut part back.
- Pictures also get Brightness, Contrast, Recolour (Grayscale, Black & white, Washout), Rotate 90° and Flip.
- Tables in Publisher files no longer show as a missing picture; they keep their column widths and row heights.
- A table can be moved by dragging its edge, even while you are typing in it.

### 0.3.0

- Mail merge, as in Publisher: Mailings › Select Recipients picks an Excel or CSV list, and Bohpum makes one card or
  certificate for each recipient. Khmer names work.
- Insert Merge Field puts a «Name» field in a text box. A name too long for its box gets a little smaller.
- Picture Field gives each recipient their own photo: right-click the photo in File Explorer › Copy as path, then paste
  it in the Excel list.
- Preview Results shows each recipient; Edit Recipient List ticks who gets a copy.
- Print every ticked recipient at once, several on one sheet or a full sheet each, or save them as one PDF. Cards with a
  front and a back print a sheet of fronts, then the matching backs.
- A mail merge toolbar above the page has every Mailings button.
- Text boxes work as in Publisher: an I-beam over the words, one click to type, drag the edge to move.
- The text pointer is dark, so it shows on the white page.

### 0.2.5

- Print: Undo and Redo for where the page sits on the paper. Press Ctrl+Z / Ctrl+Y, or use the buttons under the
  position pad.
- Text boxes with no border no longer show a dashed line. Light dots appear when you point at one or move it.
- The print preview no longer draws a line around the page, so it looks just as it will print.
- Words in menus, panels and buttons no longer turn blue when you drag across them, like in other Windows apps.
- The Bohpum icon in "Open with" and on the taskbar no longer sits in a box.

## Keywords

publisher, desktop publishing, pub file, greeting card, flyer, khmer, print

## Privacy policy

Bohpum does not collect, store or send any personal information. Your publications and pictures stay on your computer
and are never uploaded. Bohpum has no account, no analytics and no ads. Updates come from the Microsoft Store: the app
asks the Microsoft Store, through Windows, whether a newer version exists, when it starts and every 6 hours; the app adds
nothing about you or your files.

(Partner Center takes this as text: Properties › Privacy policy › Provide privacy policy text. A URL is not needed.
Changed 2026-11-05 for the update panel: paste the new text in the next submission.)

## Short description

Open, edit and print Microsoft Publisher (.pub) files without Publisher. Your files stay on your computer.

## Copyright and developer

© 2026 smith89k · Developed by Taing Sunnguon

## Restricted capability: runFullTrust

Bohpum is a classic desktop app (Electron). It needs full trust to open and save files the user picks anywhere on the
PC, to print, to read Publisher files with the LibreOffice that comes inside the package, and to add "Convert to Bohpum"
to the File Explorer menu for .pub files.

## Notes for certification

The package includes LibreOffice (Mozilla Public License 2.0) under resources\libreoffice. Bohpum runs it in the
background only to read Publisher files; it is never shown and downloads nothing. To try it: open any .pub file with
Bohpum (File › Open), or right-click a .pub file in File Explorer › Convert to Bohpum (.bpum). The app's only network
use is asking the Microsoft Store, through Windows, for a newer version; a small badge in the title row shows when one
is found.
