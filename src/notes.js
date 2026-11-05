// Bohpum — What's new: what changed in each version, newest first, and when the window shows by itself
// (as in Sastra PDF). Written by hand at release time, in plain words: what someone can now do. Text only.
// The newest entry must be package.json's version: scripts/check-notes.js stops `pnpm run dist` otherwise,
// because a release with no notes would show nothing and nobody would notice.
// A classic script (not a module) so check-notes.js can run it; index.html loads it before app.js (openNotes there).
(() => {
'use strict';

const KINDS = Object.freeze(['new', 'improved', 'fixed', 'removed']); // the window lists them in this order, each tagged
const N = (version, date, notes) => Object.freeze({ version, date, notes: Object.freeze(notes.map(([kind, text]) => Object.freeze({ kind, text }))) });

const NOTES = Object.freeze([
  N('0.3.2', '2026-11-05', [
    ['new', 'When a newer Bohpum is in the Microsoft Store, a small badge appears at the right end of the title bar. Click it to see the download go from this version to the new one, then press Install. Nothing opens over your work by itself.'],
    ['improved', 'Help › Check for Updates opens the same panel and tells you whether you have the newest version.']
  ]),
  N('0.3.1', '2026-11-03', [
    ['new', 'Tables have their own Table section on the right: insert or delete rows and columns, merge and unmerge cells, make columns or rows the same size, and change the cell colour, border, inner space and where the text sits.'],
    ['new', 'Click in a cell to change that cell, drag across cells to change several, or press Whole table to change them all.'],
    ['new', 'Pictures can be cropped: press Crop and drag the black bars on the edges. Reset crop brings the cut part back.'],
    ['new', 'Pictures also get Brightness, Contrast, Recolour (Grayscale, Black & white, Washout), Rotate 90° and Flip, and Reset picture undoes them all.'],
    ['fixed', 'Tables in Publisher files no longer show as a missing picture. They open as tables with their own column widths and row heights.'],
    ['fixed', 'A table can be moved by dragging its edge, even while you are typing in it.']
  ]),
  N('0.3.0', '2026-10-24', [
    ['new', 'Mail merge, as in Publisher: Mailings › Select Recipients picks an Excel or CSV list, and Bohpum makes one card or certificate for each recipient. Khmer names work.'],
    ['new', 'Insert Merge Field puts a «Name» field in a text box. A name too long for its box gets a little smaller, for that recipient only.'],
    ['new', 'Picture Field gives each recipient their own photo: in File Explorer, right-click the photo › Copy as path, then paste it in the Excel list.'],
    ['new', 'Preview Results shows each recipient on the page, one at a time. Edit Recipient List ticks who gets a copy.'],
    ['new', 'Print every ticked recipient at once, several on one sheet or a full sheet each, or save them as one PDF. A card with a front and a back prints a sheet of fronts, then the matching backs. Before printing, Bohpum lists anyone whose photo is missing.'],
    ['new', 'While a publication has a list, a mail merge toolbar above the page has every Mailings button.'],
    ['improved', 'Text boxes work as in Publisher: over the words the pointer is an I-beam and one click puts the cursor there. Drag a box by its edge to move it.'],
    ['fixed', 'The text pointer over text boxes is dark, so it shows on the white page.']
  ]),
  N('0.2.5', '2026-10-20', [
    ['new', 'Print: Undo and Redo for where the page sits on the paper, after you drag it, use the 3×3 pad or type Top / Left. Press Ctrl+Z / Ctrl+Y, or use the buttons under the pad.'],
    ['improved', 'Text boxes with no border no longer show a dashed line on the page. Light dots appear when you point at one or move it.'],
    ['improved', 'The print preview no longer draws a line around the page, so it looks just as it will print. Light dots show the page when you point at it or drag it.'],
    ['improved', 'Like other Windows apps, the words in menus, panels and buttons no longer turn blue when you drag across them. Text boxes, and the text you are editing, select as before.'],
    ['fixed', 'The Bohpum icon in "Open with" and on the taskbar no longer sits in a box.']
  ]),
  N('0.2.4', '2026-10-19', [
    ['new', 'Bohpum is in the Microsoft Store, signed by Microsoft, so Windows doesn\'t warn you when you install it from there.'],
    ['removed', 'Help › About no longer links to Bohpum\'s code on GitHub.']
  ]),
  N('0.2.3', '2026-10-19', [
    ['new', 'Bohpum is open source, under the GNU GPL 3.0: anyone can read its code and download it on GitHub. Help › About says so and links to it.'],
    ['improved', 'Releases are ready for a free digital signature from SignPath Foundation, so Windows can stop warning about the installer once the signature is in place.']
  ]),
  N('0.2.2', '2026-10-18', [
    ['improved', 'Publisher (.pub) files you open with Bohpum show the Bohpum file icon. To open every .pub with Bohpum: right-click one › Open with › Choose another app › Bohpum › Always.']
  ]),
  N('0.2.1', '2026-10-18', [
    ['improved', 'The panel on the right is tidier: Position & size at the top, then Arrange, Shape and Text. An object\'s name is no longer shown twice.'],
    ['improved', 'Shape offers only choices that look different: Rectangle and Ellipse (a text box also shows Text box). Round the corners with Corner.'],
    ['fixed', 'Rounded shapes from Publisher files can be made square again: Corner now shows how round they are.']
  ]),
  N('0.2.0', '2026-10-18', [
    ['new', 'Bohpum now updates itself. When a new version is ready it asks to restart, or installs it when you close Bohpum. Check by hand from Help › Check for Updates.'],
    ['improved', 'The installer is much smaller. The Publisher reader downloads once, the first time you open a Publisher file.']
  ]),
  N('0.1.0', '2026-10-17', [
    ['new', 'Open Microsoft Publisher (.pub) files, edit them and print them. Save them as Bohpum files (.bpum); the .pub is never changed.'],
    ['new', 'Text boxes with Khmer and English text, shapes, lines and pictures, on many pages with a master page.'],
    ['new', 'A Print screen like Publisher: one card anywhere on A4, or many copies on one sheet, with a preview you can zoom. Save as PDF saves exactly what would print.'],
    ['new', 'Right-click .pub files in File Explorer → Convert to Bohpum.'],
    ['new', 'While a .pub file opens, a small box shows that it is being read, with Cancel to stop.'],
    ['new', 'Drag pages in the Pages panel to change their order. Make the panel wider or narrower by dragging its edge.'],
    ['new', 'Each section of the panel on the right folds and opens from its heading, and stays that way after a restart. Bring to front, Send to back, Group and Ungroup are in its Arrange section.'],
    ['new', 'System, Light and Dark themes, and Maximize to give the page the whole window.'],
    ['new', 'This What\'s new window. It opens once after each update. Open it again from Help › What\'s New.']
  ])
]);

// Order in the list is the only notion of "older": nothing compares version numbers.
const noteFor = (v) => NOTES.find(e => e.version === v) || null;
// the versions before v; all of them when v has no entry, so the menu always has something to show
const earlierNotes = (v) => { const i = NOTES.findIndex(e => e.version === v); return i < 0 ? NOTES.slice() : NOTES.slice(i + 1); };
// inequality, not "newer": a downgrade or a lost memory shows the notes once, then repairs itself
const shouldShow = (v, seen) => !!noteFor(v) && seen !== v;

window.BohpumNotes = Object.freeze({ KINDS, NOTES, noteFor, earlierNotes, shouldShow });
})();
