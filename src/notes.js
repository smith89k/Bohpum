// Bohpum — What's new: what changed in each version, newest first, and when the window shows by itself
// (as in Sastra PDF). Written by hand at release time, in plain words: what someone can now do. Text only.
// The newest entry must be package.json's version: scripts/check-notes.js stops `npm run dist` otherwise,
// because a release with no notes would show nothing and nobody would notice.
// A classic script (not a module) so check-notes.js can run it; index.html loads it before app.js (openNotes there).
(() => {
'use strict';

const KINDS = Object.freeze(['new', 'improved', 'fixed', 'removed']); // the window lists them in this order, each tagged
const N = (version, date, notes) => Object.freeze({ version, date, notes: Object.freeze(notes.map(([kind, text]) => Object.freeze({ kind, text }))) });

const NOTES = Object.freeze([
  N('0.1.1', '2026-10-19', [
    ['new', 'Bohpum is open source, under the GNU GPL 3.0. Anyone can read its code on GitHub; Help › About links to it.'],
    ['improved', 'The installer is now built on GitHub from the public code, ready for a free digital signature so Windows can trust it.']
  ]),
  N('0.1.0', '2026-10-17', [
    ['new', 'Open Microsoft Publisher (.pub) files, edit them and print them. Save them as Bohpum files (.bpum); the .pub is never changed.'],
    ['new', 'Text boxes with Khmer and English text, shapes, lines and pictures, on many pages with a master page.'],
    ['new', 'A Print screen like Publisher: one card anywhere on A4, or many copies on one sheet, with a preview you can zoom. Save as PDF saves exactly what would print.'],
    ['new', 'Right-click .pub files in File Explorer → Convert to Bohpum.'],
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
