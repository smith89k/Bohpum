# What's new, folding right panel, Arrange in the panel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A What's new window as in Sastra PDF (once per version, over the welcome screen, and Help › What's New), right
panel sections that fold from their headings and stay folded, and the Arrange buttons moved from the top bar into the panel.

**Architecture:** Notes live in a classic script `src/notes.js` (`window.BohpumNotes`), checked at build time by
`scripts/check-notes.js`. `src/app.js` shows them with the existing `modal()` (fixed so only the top box takes Esc / Enter).
Fold state and "seen" version go into Bohpum's settings file (`api.setSettings`), like the theme.

**Tech Stack:** Electron 44, plain ES modules in the page, tests = `tests/*.test.js` driving the real app (`npm test -- tests/x.test.js`).

Spec: `docs/superpowers/specs/2026-10-17-whats-new-props-fold-design.md`.

## Global Constraints
- Work on `main`, commit after each task, message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never run `npm run dist` (the installer build) without the user's yes.
- Settings keys: `notesSeen` (version string), `propsFolded` (array of section keys).
- Section keys: `object`, `arrange`, `fill`, `shape`, `textbox`, `picture`, `line`, `opacity`, `master`, `pagesize`, `margins`, `background`.
- Tag order and words: `new` New, `improved` Improved, `fixed` Fixed, `removed` Removed.
- What's new box: class `notes`, 900 px wide; `<html data-notes>` = `shown | none`.

---

### Task 1: Only the top box takes Esc / Enter

**Files:**
- Modify: `src/app.js` (`modal()`, ~line 1764)
- Test: `tests/modal-stack.test.js`

**Interfaces:** Produces: a `data-enter-self` attribute on a button inside a box keeps Enter for that button.

- [ ] **Step 1: Write the failing test** `tests/modal-stack.test.js`

```js
// Two of the app's boxes at once (New publication or What's new over the welcome screen): Esc and Enter belong to
// the top box only, so closing it leaves the box underneath open. A button marked data-enter-self keeps Enter.
const { run } = require('./harness');

run(async (t, check) => {
  t.win.focus(); t.wc.focus();
  await t.waitFor('!!window.__bohpumApp && !!document.querySelector(".welcome-modal")');
  await t.sleep(600);
  const boxes = () => t.js(`[...document.getElementById('modal-root').children].map(b => (b.querySelector('.modal-h') || {}).textContent || b.querySelector('.modal').className)`);
  const start = await boxes();
  await t.js('window.__bohpumApp.cmd("new")'); await t.sleep(300);
  const two = await boxes();
  check('New publication opens on top of the welcome screen', two.length === start.length + 1 && two[two.length - 1] === 'New publication', two);
  await t.key('Escape');
  check('Esc closes only the top box', (await boxes()).join('|') === start.join('|'), await boxes());

  await t.js('window.__bohpumApp.cmd("new")'); await t.sleep(300);
  await t.key('Enter');
  check('Enter presses the top box\'s button only (the welcome screen stays)', (await boxes()).join('|') === start.join('|'), await boxes());

  await t.js('window.__bohpumApp.cmd("new")'); await t.sleep(300);
  await t.js(`(() => { const b = document.createElement('button'); b.id = 'own-enter'; b.dataset.enterSelf = ''; b.textContent = 'x';
    b.onclick = () => { window.__ownEnter = (window.__ownEnter || 0) + 1; };
    document.querySelector('#modal-root .modal-back:last-child .modal-b').append(b); b.focus(); return true; })()`);
  await t.key('Enter');
  const own = await t.js('window.__ownEnter || 0'), after = await boxes();
  check('A data-enter-self button keeps Enter: it is clicked and the box stays', own === 1 && after.length === start.length + 1, { own, after });
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- tests/modal-stack.test.js` → "Esc closes only the top box" and the Enter checks FAIL (both boxes close).

- [ ] **Step 3: Implement** in `modal()`'s `key` handler:

```js
  const key = (e) => {
    if (back !== $('modal-root').lastElementChild) return; // a box under another one leaves its keys to the top one
    const s = e.target.closest && e.target.closest('select');
    if (s && s.matches(':open')) return; // an open dropdown list handles its own Esc / Enter
    if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    // a button marked data-enter-self (What's new's "See earlier versions") is pressed by Enter itself
    if (e.key === 'Enter' && !e.target.matches('textarea, [data-enter-self]')) { const p = buttons.find(x => x[2]); if (p) { e.preventDefault(); close(p[1]); } }
  };
```

- [ ] **Step 4: Run it, expect PASS** — `npm test -- tests/modal-stack.test.js`.
- [ ] **Step 5: Commit** — `git add src/app.js tests/modal-stack.test.js` · `fix: Esc and Enter act on the top box only, when one box is over another`.

### Task 2: Notes file and the build check

**Files:**
- Create: `src/notes.js`, `scripts/check-notes.js`, `tests/check-notes.test.js`
- Modify: `package.json` (`dist` script), `src/index.html` (load notes.js before app.js)

**Interfaces:** Produces `window.BohpumNotes = { KINDS, NOTES, noteFor(v) → entry|null, earlierNotes(v) → entry[], shouldShow(v, seen) → bool }`,
entry = `{ version, date, notes: [{ kind, text }] }`.

- [ ] **Step 1: Write the failing test** `tests/check-notes.test.js`

```js
// scripts/check-notes.js stops `npm run dist` when src/notes.js has no What's new for package.json's version, or an
// entry is broken (as in Sastra PDF): it passes on the real file and names the problem in a broken copy.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const script = path.join(ROOT, 'scripts', 'check-notes.js');
const version = require(path.join(ROOT, 'package.json')).version;
const runCheck = (file) => {
  const r = spawnSync(process.execPath, [script, ...(file ? [file] : [])], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

run(async (t, check) => {
  const real = runCheck();
  check('The real src/notes.js passes', real.code === 0 && real.out.includes('newest ' + version), real);
  const src = fs.readFileSync(path.join(ROOT, 'src', 'notes.js'), 'utf8');
  const broken = (name, change) => { const f = path.join(t.ctx.tmp, name + '.js'); fs.writeFileSync(f, change(src)); return runCheck(f); };
  const cases = [
    ['a newest entry that is not package.json\'s version', broken('version', (s) => s.replace(`N('${version}'`, "N('9.9.9'")), /newest entry is 9\.9\.9/],
    ['a version listed twice', broken('twice', (s) => s.replace('const NOTES = Object.freeze([', `const NOTES = Object.freeze([\n  N('${version}', '2026-10-17', [['new', 'x']]),`)), /listed twice/],
    ['an entry with no date', broken('date', (s) => s.replace(/N\('([^']+)', '\d{4}-\d{2}-\d{2}'/, "N('$1', ''")), /has no date/],
    ['an unknown kind', broken('kind', (s) => s.replace("['new', ", "['news', ")), /unknown kind "news"/]
  ];
  for (const [name, r, msg] of cases) check(`It stops the build on ${name}`, r.code === 1 && msg.test(r.out), r);
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- tests/check-notes.test.js` (no script, no notes file).

- [ ] **Step 3: Create `src/notes.js`**

```js
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
```

- [ ] **Step 4: Create `scripts/check-notes.js`** — Sastra PDF's script with `src/notes.js`, `window.BohpumNotes`:

```js
// Run first by `npm run dist`: stops the build when src/notes.js has no What's new entry for package.json's
// version, or an entry is broken — a release would otherwise ship an empty What's new and nobody would notice
// (as in Sastra PDF). `node scripts/check-notes.js [file]` checks another copy (tests/check-notes.test.js).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const file = path.resolve(process.argv[2] || path.join(ROOT, 'src', 'notes.js'));
const version = require(path.join(ROOT, 'package.json')).version;
const problems = [];
let N = null;
try { const window = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window }, { filename: file }); N = window.BohpumNotes || null; }
catch (e) { problems.push(`could not run it: ${e.message}`); }
if (N) {
  const list = Array.isArray(N.NOTES) ? N.NOTES : [], kinds = Array.isArray(N.KINDS) ? N.KINDS : [];
  if (!list.length) problems.push('there are no entries');
  else if (list[0].version !== version) problems.push(`the newest entry is ${list[0].version}, but package.json says ${version}: write its notes at the top`);
  const seen = new Set();
  for (const e of list) {
    const v = e && e.version;
    if (typeof v !== 'string' || !v) { problems.push('an entry has no version'); continue; }
    if (seen.has(v)) problems.push(`${v} is listed twice`);
    seen.add(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) problems.push(`${v} has no date (YYYY-MM-DD)`);
    if (!Array.isArray(e.notes) || !e.notes.length) { problems.push(`${v} has no notes`); continue; }
    for (const n of e.notes) {
      if (!kinds.includes(n && n.kind)) problems.push(`${v}: unknown kind "${n && n.kind}" (use ${kinds.join(', ')})`);
      if (typeof (n && n.text) !== 'string' || !n.text.trim()) problems.push(`${v}: a note has no text`);
    }
  }
} else if (!problems.length) problems.push('it does not set window.BohpumNotes');
if (problems.length) {
  console.error(`What's new (${path.relative(ROOT, file)}) is not ready:\n` + problems.map(p => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`What's new: ${N.NOTES.length} versions, newest ${N.NOTES[0].version} = package.json`);
```

- [ ] **Step 5: Wire it** — package.json `"dist": "node scripts/check-notes.js && node scripts/bundle-libreoffice.js && node scripts/build-explorer-menu.js && electron-builder --win nsis"`;
  src/index.html before `<script type="module" src="app.js">`: `<script src="notes.js"></script>`.
- [ ] **Step 6: Run it, expect PASS** — `npm test -- tests/check-notes.test.js`.
- [ ] **Step 7: Commit** — `feat: What's new notes (src/notes.js) and a build check that the new version has them`.

### Task 3: The What's new window

**Files:**
- Modify: `src/app.js` (after `openAbout`; `cmd()`; `init()`), `main.js` (Help menu), `src/app.css` (after the About rules), `tests/harness.js` (`ready()`)
- Test: `tests/whats-new.test.js`

**Interfaces:** Consumes `window.BohpumNotes` (Task 2), `data-enter-self` (Task 1). Produces `cmd('whats-new')`, `<html data-notes>`.

- [ ] **Step 1: Write the failing test** `tests/whats-new.test.js`

```js
// What's new, as in Sastra PDF: the first start of a version opens it by itself over the welcome screen, once;
// Help > What's New opens it again. Each line has its tag (New, Improved, Fixed, Removed); Close stays in view.
const { Menu, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

run(async (t, check) => {
  const version = app.getVersion();
  t.win.focus(); t.wc.focus();
  await t.waitFor('!!document.documentElement.dataset.notes && !!document.querySelector(".welcome-modal")', 15000);
  const state = () => t.js(`(() => { const r = document.getElementById('modal-root'), m = document.querySelector('#modal-root .modal.notes'), top = r.lastElementChild;
    return { boxes: [...r.children].map(b => b.querySelector('.modal').className.replace('modal', '').trim()), topIsNotes: !!top && !!top.querySelector('.modal.notes'),
      title: m && m.querySelector('.modal-h').firstChild.textContent, date: m && (m.querySelector('.notes-date') || {}).textContent,
      tags: m ? [...m.querySelectorAll('.notes-kind')].map(s => s.textContent) : [], earlier: !!(m && m.querySelector('[data-earlier]')),
      width: m && Math.round(m.getBoundingClientRect().width), focus: document.activeElement && document.activeElement.textContent, flag: document.documentElement.dataset.notes }; })()`);
  const s1 = await state();
  check('Fresh profile: What\'s new opens by itself, on top of the welcome screen', s1.flag === 'shown' && s1.topIsNotes && s1.boxes.join('|') === 'welcome-modal|notes', s1);
  const entry = await t.js(`window.BohpumNotes.noteFor(${JSON.stringify(version)})`);
  const older = await t.js(`window.BohpumNotes.earlierNotes(${JSON.stringify(version)}).length`);
  check(`Title "What's new in ${version}", its date, 900 px wide, Close has the focus`, entry && s1.title === `What's new in ${version}` && s1.date === entry.date && s1.width === 900 && s1.focus === 'Close', s1);
  const K = ['new', 'improved', 'fixed', 'removed'], W = { new: 'New', improved: 'Improved', fixed: 'Fixed', removed: 'Removed' };
  const want = entry ? entry.notes.map((n, i) => [n.kind, i]).sort((a, b) => K.indexOf(a[0]) - K.indexOf(b[0]) || a[1] - b[1]).map(([k]) => W[k]) : [];
  check('One tag per line, in the order New, Improved, Fixed, Removed', want.length && s1.tags.join() === want.join(), { tags: s1.tags, want });
  check('"See earlier versions" only when there are earlier versions', s1.earlier === older > 0, { earlier: s1.earlier, older });

  const tag = () => t.js(`(() => { const rgb = (c) => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; };
    return { tag: getComputedStyle(document.querySelector('.notes-kind-new')).color, accent: rgb(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) }; })()`);
  const light = await tag();
  await t.js('window.__bohpumApp.cmd("theme-dark")'); await t.sleep(300);
  const dark = await tag();
  await t.js('window.__bohpumApp.cmd("theme-system")'); await t.sleep(200);
  check('The New tag is the app\'s green, in light and dark', light.tag === light.accent && dark.tag === dark.accent && light.tag !== dark.tag, { light, dark });

  await t.key('Escape');
  const s2 = await state();
  check('Esc closes only What\'s new: the welcome screen is still there', s2.boxes.join('|') === 'welcome-modal', s2);
  await t.sleep(300);
  const saved = JSON.parse(fs.readFileSync(path.join(t.ctx.userData, 'settings.json'), 'utf8'));
  check('The version is remembered as seen', saved.notesSeen === version, saved);

  t.wc.reload();
  await t.sleep(500);
  await t.waitFor('!!document.documentElement.dataset.notes && !!document.querySelector(".welcome-modal")', 15000);
  const s3 = await state();
  check('Next start: it does not open again', s3.flag === 'none' && s3.boxes.join('|') === 'welcome-modal', s3);

  const help = Menu.getApplicationMenu().items.find(i => i.label.replace('&', '') === 'Help').submenu.items;
  check('Help: What\'s New sits just above About', help[0].label === "What's New" && /About/.test(help[1].label), help.map(i => i.label));
  help[0].click(); await t.sleep(400);
  check('While another box is open it does nothing', (await state()).boxes.join('|') === 'welcome-modal', await state());
  await t.key('Escape'); await t.waitFor('!document.querySelector(".modal-back")');
  help[0].click(); await t.waitFor('!!document.querySelector(".modal.notes")');
  const s4 = await state();
  check('Help > What\'s New opens it', s4.topIsNotes && s4.title === `What's new in ${version}`, s4);

  t.win.unmaximize(); t.win.setMinimumSize(300, 300); t.win.setContentSize(800, 420); await t.sleep(600);
  const fit = await t.js(`(() => { const m = document.querySelector('.modal.notes'), b = m.querySelector('.modal-b'), c = m.querySelector('.modal-f .btn.primary').getBoundingClientRect();
    return { scrolls: b.scrollHeight > b.clientHeight, closeIn: c.top >= 0 && c.bottom <= innerHeight, h: Math.round(m.getBoundingClientRect().height), ih: innerHeight }; })()`);
  check('A short window: the list scrolls and Close stays in view', fit.scrolls && fit.closeIn && fit.h <= fit.ih, fit);
  t.win.maximize(); await t.sleep(300);
  await t.key('Enter');
  check('Enter closes it', !(await t.js('!!document.querySelector(".modal.notes")')), null);
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- tests/whats-new.test.js` (times out waiting for `data-notes`).

- [ ] **Step 3: app.js** — after `openAbout()`:

```js
// ---------------------------------------------------------------- What's new (Help > What's New), as in Sastra PDF
// Once per version by itself, over the welcome screen; the notes are in notes.js (window.BohpumNotes)
const NOTES = window.BohpumNotes;
const KIND_WORDS = { new: 'New', improved: 'Improved', fixed: 'Fixed', removed: 'Removed' };
function notesList(notes) {
  const K = NOTES.KINDS, sorted = notes.map((n, i) => [n, i]).sort((a, b) => K.indexOf(a[0].kind) - K.indexOf(b[0].kind) || a[1] - b[1]);
  return `<ul class="notes-list">${sorted.map(([n]) => `<li><span class="notes-kind notes-kind-${n.kind}">${KIND_WORDS[n.kind]}</span><span>${escHtml(n.text)}</span></li>`).join('')}</ul>`;
}
// Closing it in any way counts as seen. A version with no entry (a hand-made build) shows every known one.
function openNotes(version) {
  const cur = NOTES.noteFor(version), past = NOTES.earlierNotes(version);
  const body = document.createElement('div'); body.className = 'notes-body';
  body.innerHTML = (cur ? notesList(cur.notes) : '')
    + (cur && past.length ? '<button class="btn notes-more" data-earlier data-enter-self>See earlier versions ›</button>' : '')
    + (past.length ? `<div class="notes-earlier"${cur ? ' hidden' : ''}>${past.map(e => `<section class="notes-past"><h3>${escHtml(e.version)}<span>${escHtml(e.date)}</span></h3>${notesList(e.notes)}</section>`).join('')}</div>` : '');
  const m = modal(cur ? `What's new in ${escHtml(version)}<span class="notes-date">${escHtml(cur.date)}</span>` : "What's new", body, [['Close', null, true]], 'notes');
  const close = body.closest('.modal').querySelector('.modal-f .btn.primary'), more = body.querySelector('[data-earlier]');
  if (more) more.onclick = () => { more.hidden = true; const list = body.querySelector('.notes-earlier'); list.hidden = false; list.scrollIntoView({ block: 'start' }); close.focus({ preventScroll: true }); };
  close.focus();
  m.done.then(() => api.setSettings({ notesSeen: version }).then((s) => { if (s) S.settings = s; }, () => {}));
}
function whatsNew() {
  if ($('modal-root').children.length) return; // not over another box (the menus are greyed out then anyway)
  api.appInfo().then((i) => openNotes(i.version), () => {});
}
// At start-up, over the welcome screen: the first start of a version this profile hasn't shown (an update or a new
// install). <html data-notes> = shown | none once decided (tests wait on it).
async function notesAtStart() {
  let shown = false;
  try {
    const { version } = await api.appInfo();
    if (NOTES.shouldShow(version, S.settings.notesSeen)) { openNotes(version); shown = true; }
  } catch (err) { console.warn(err); }
  document.documentElement.dataset.notes = shown ? 'shown' : 'none';
}
```

  `cmd()`: after `case 'about': return openAbout();` add `case 'whats-new': return whatsNew();`.
  `init()`: after `if (!window.__noWelcome) newDialog(true);` add `notesAtStart();`.

- [ ] **Step 4: main.js** Help submenu:

```js
    { label: 'Help', submenu: [
      { label: "What's New", click: () => send('whats-new') }, // the page's What's new window (src/notes.js)
      { label: 'About ' + APP_NAME, click: () => send('about') } // the page shows its own About page
    ]}
```

- [ ] **Step 5: app.css** after the About rules:

```css
/* What's new (openNotes in app.js): title + date on top, the list scrolls, Close stays at the bottom (as in Sastra PDF) */
.modal.notes { width: min(900px, calc(100vw - 32px)); }
.notes .modal-h { flex-direction: column; align-items: flex-start; gap: 3px; }
.notes-date { color: var(--ink-2); font-family: var(--mono-font); font-size: 12px; font-weight: 400; }
.notes-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 9px; }
.notes-list li { display: flex; align-items: baseline; gap: 10px; line-height: 1.5; }
.notes-kind { flex: none; box-sizing: border-box; min-width: 72px; padding: 1px 7px; border-radius: 999px; font-size: 10.5px; font-weight: 600; letter-spacing: .04em; line-height: 1.6; text-align: center; text-transform: uppercase; }
.notes-kind-new { background: var(--accent-soft); color: var(--accent); }
.notes-kind-improved { background: var(--chrome-2); color: var(--ink); }
.notes-kind-fixed { background: color-mix(in srgb, var(--sel) 14%, transparent); color: var(--sel); }
.notes-kind-removed { background: var(--chrome-2); color: var(--ink-3); }
.notes-more { margin-top: 14px; padding: 0 6px; color: var(--accent); font-weight: 500; }
.notes-past { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--line); }
.notes-past h3 { display: flex; align-items: baseline; gap: 10px; margin: 0 0 10px; font-size: 14px; font-weight: 600; }
.notes-past h3 span { color: var(--ink-2); font-family: var(--mono-font); font-size: 12px; font-weight: 400; }
```

- [ ] **Step 6: harness.js `ready()`** — close What's new first when a fresh profile shows it:

```js
  const ready = async (sample = 'test-shapes.fodg') => {
    win.focus(); wc.focus();
    await waitFor('!!window.__bohpumApp && !!document.querySelector(".modal-back") && !!document.documentElement.dataset.notes');
    // a fresh profile sees What's new once, over the welcome screen (whats-new.test.js checks it)
    if (await js('!!document.querySelector(".modal.notes")')) { await key('Escape'); await waitFor('!document.querySelector(".modal.notes")'); }
    await key('Escape');
```

- [ ] **Step 7: Run** `npm test -- tests/whats-new.test.js tests/modal-stack.test.js tests/about.test.js` → PASS.
- [ ] **Step 8: Commit** — `feat: What's new window, once per version over the welcome screen and from Help > What's New (as in Sastra PDF)`.

### Task 4: Right panel sections fold

**Files:**
- Modify: `src/app.js` (`ICONS`, `section()`, every `section(...)` call), `src/app.css` (`.psec` rules), `tests/props-icons.test.js`
- Test: `tests/props-fold.test.js`

**Interfaces:** Produces `section(P, title, ic, key)`; `.psec[data-sec=key]`, `.psec-head` button, `.psec.folded`; settings `propsFolded`.

- [ ] **Step 1: Write the failing test** `tests/props-fold.test.js`

```js
// Right panel sections fold and open from their headings, as in Sastra PDF's Tools panel: icon + name on the left,
// a chevron at the right edge. Each folds on its own, per kind of section, and stays folded after a restart.
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const secs = () => t.js(`[...document.querySelectorAll('#props .psec')].map(s => { const b = s.querySelector('h4 > .psec-head'); if (!b) return { key: s.dataset.sec, button: false };
    const r = b.getBoundingClientRect(), svgs = [...b.querySelectorAll('svg')], ic = svgs[0].getBoundingClientRect(), ch = svgs[svgs.length - 1], cr = ch.getBoundingClientRect(), name = b.querySelector('span').getBoundingClientRect();
    return { key: s.dataset.sec, button: b.tagName === 'BUTTON', expanded: b.getAttribute('aria-expanded'), folded: s.classList.contains('folded'),
      shown: [...s.children].filter(c => c.tagName !== 'H4' && getComputedStyle(c).display !== 'none').length,
      iconLeft: ic.right <= name.left, chevRight: ch.classList.contains('chev') && r.right - cr.right <= 9 && cr.left > name.right, turned: getComputedStyle(ch).transform !== 'none' }; })`);
  const by = (list, k) => list.find(s => s.key === k) || {};
  const settings = () => JSON.parse(fs.readFileSync(path.join(t.ctx.userData, 'settings.json'), 'utf8'));

  await t.key('Escape'); await t.sleep(200);
  const page = await secs();
  check('Nothing selected: Page size, Margin guides, Background, each heading a button, icon left, chevron at the right edge, all open',
    page.map(s => s.key).join('|') === 'pagesize|margins|background' && page.every(s => s.button && s.iconLeft && s.chevRight && s.expanded === 'true' && !s.folded && s.shown > 0), page);

  await t.click('#props .psec[data-sec="margins"] .psec-head'); await t.sleep(300);
  const f1 = await secs(), m1 = by(f1, 'margins');
  check('Click folds only that section: its controls hide, aria-expanded false, the chevron turns', m1.folded && m1.shown === 0 && m1.expanded === 'false' && m1.turned, m1);
  check('The other sections stay open', by(f1, 'pagesize').shown > 0 && by(f1, 'background').shown > 0 && !by(f1, 'pagesize').folded, f1);
  await t.click('#props .psec[data-sec="margins"] .psec-head'); await t.sleep(300);
  const m2 = by(await secs(), 'margins');
  check('Click again opens it', !m2.folded && m2.shown > 0 && m2.expanded === 'true' && !m2.turned, m2);

  await t.js(`document.querySelector('#props .psec[data-sec="pagesize"] .psec-head').focus()`);
  await t.key('Enter');
  const e1 = by(await secs(), 'pagesize'), quiet = await t.js(`({ editing: !!window.__bohpumApp.state.editing, sel: window.__bohpumApp.state.sel.size, boxes: document.getElementById('modal-root').children.length })`);
  check('Enter on a focused heading folds it, and does nothing else', e1.folded && quiet.sel === 0 && !quiet.editing && quiet.boxes === 0, { e1, quiet });
  await t.key('Space');
  check('Space opens it again', !by(await secs(), 'pagesize').folded, null);

  // the sample's ids are made when it is opened, so look them up again after the restart
  const findIds = () => t.js(`(() => { const os = window.__bohpumApp.state.doc.pages[0].objects; const f = (p) => (os.find(p) || {}).id;
    return { rect: f(o => o.type === 'box' && o.shape === 'rect'), text: f(o => o.type === 'box' && o.shape === 'none') }; })()`);
  let ids = await findIds();
  await t.click(`#workspace .kcontent > .kobj[data-id="${ids.rect}"]`); await t.sleep(250);
  await t.click('#props .psec[data-sec="fill"] .psec-head'); await t.sleep(250);
  await t.key('Escape'); await t.click(`#workspace .kcontent > .kobj[data-id="${ids.text}"]`); await t.sleep(250);
  const tb = await secs();
  check('A folded "Fill & line" stays folded on another kind of box; the rest are open', by(tb, 'fill').folded && by(tb, 'object').shown > 0 && !by(tb, 'textbox').folded, tb);
  await t.sleep(300);
  check('The folded sections are remembered', JSON.stringify(settings().propsFolded) === '["fill"]', settings());

  t.wc.reload(); await t.sleep(500);
  await t.ready();
  ids = await findIds();
  await t.click(`#workspace .kcontent > .kobj[data-id="${ids.rect}"]`); await t.sleep(250);
  const after = await secs();
  check('After a restart "Fill & line" is still folded', by(after, 'fill').folded && by(after, 'fill').expanded === 'false' && !by(after, 'arrange').folded, after);
  await t.click('#props .psec[data-sec="fill"] .psec-head'); await t.sleep(400);
  check('Opening every section saves an empty list', JSON.stringify(settings().propsFolded) === '[]', settings());
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- tests/props-fold.test.js`.

- [ ] **Step 3: app.js** — ICONS (after `minus`): `chevUp: 'M6 15l6-6 6 6',`. Replace `section()`:

```js
// a right panel section; its heading has an icon in front and folds the section, as in Sastra PDF's Tools panel.
// `key` names the kind of section, so a folded "Fill & line" stays folded for every shape (settings.propsFolded).
function section(P, title, ic, key) {
  const s = document.createElement('div'); s.className = 'psec'; s.dataset.sec = key;
  const folded = (S.settings.propsFolded || []).includes(key);
  if (folded) s.classList.add('folded');
  s.innerHTML = `<h4><button type="button" class="psec-head" aria-expanded="${!folded}">${ic ? icon(ic) : ''}<span>${title}</span>${icon('chevUp').replace('<svg', '<svg class="chev"')}</button></h4>`;
  s.querySelector('.psec-head').onclick = () => foldSection(s);
  P.append(s); return s;
}
// only the class changes (no rebuild), so the focus stays on the heading
function foldSection(s) {
  const folded = s.classList.toggle('folded');
  s.querySelector('.psec-head').setAttribute('aria-expanded', String(!folded));
  const list = (S.settings.propsFolded || []).filter(k => k !== s.dataset.sec);
  if (folded) list.push(s.dataset.sec);
  S.settings.propsFolded = list;
  api.setSettings({ propsFolded: list }).then((r) => { if (r) S.settings = r; }, () => {});
}
```

  Add the key to every call: `section(P, single ? … , …, 'object')`, `section(P, 'Arrange', 'front', 'arrange')`, `'Fill & line', 'fill', 'fill'`,
  `'Shape', 'shapes', 'shape'`, `'Text box', 'text', 'textbox'`, `'Picture', 'image', 'picture'`, `'Line', 'line', 'line'`,
  `'Transparency', 'opacity', 'opacity'`, `'Master page', 'pages', 'master'`, `'Page size', …, 'pagesize'`, `'Margin guides', 'margins', 'margins'`,
  `…'Background', 'bg', 'background'`.

- [ ] **Step 4: app.css** — replace the two `.psec h4` rules:

```css
.psec h4 { margin: 0 0 12px; }
/* the heading folds its section, as in Sastra PDF's Tools panel: icon + name on the left, chevron on the right (up = open) */
.psec-head { display: flex; align-items: center; gap: 8px; width: calc(100% + 16px); margin: -6px -8px; padding: 6px 8px; border: 0; border-radius: 6px; background: transparent; color: var(--ink-2); font: inherit; font-size: 11px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; text-align: left; cursor: pointer; }
.psec-head:hover { background: var(--chrome-2); }
.psec-head:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.psec-head svg { width: 15px; height: 15px; flex: none; color: var(--accent); }
.psec-head svg.chev { margin-left: auto; width: 14px; height: 14px; color: var(--ink-3); transition: transform .15s; }
.psec.folded { padding-bottom: 16px; }
.psec.folded > :not(h4) { display: none; }
.psec.folded h4 { margin-bottom: 0; }
.psec.folded .chev { transform: rotate(180deg); }
```
  and `.psec-head svg.chev` in the reduced-motion rule: `@media (prefers-reduced-motion: reduce) { .about .links a, .psec-head svg.chev { transition: none; } }`.

- [ ] **Step 5: props-icons.test.js** — read the icon inside the button: in `heads`, `const b = h.querySelector('.psec-head'), s = b && b.firstElementChild, cs = s && getComputedStyle(s);` and `gap: b && getComputedStyle(b).columnGap`.
- [ ] **Step 6: Run** `npm test -- tests/props-fold.test.js tests/props-icons.test.js tests/margins-grid.test.js tests/spacing.test.js` → PASS.
- [ ] **Step 7: Commit** — `feat: right panel sections fold from their headings and stay folded, as in Sastra PDF`.

### Task 5: Arrange buttons move from the top bar to the panel

**Files:**
- Modify: `src/index.html` (remove the front/back/group/ungroup `tb-group`), `src/app.js` (`renderProps`), `src/app.css`
- Test: `tests/arrange-panel.test.js`

- [ ] **Step 1: Write the failing test** `tests/arrange-panel.test.js`

```js
// Bring to front, Send to back, Group and Ungroup left the top bar: they are in the right panel's Arrange section
// (Order, and a Group row whose buttons are greyed out when they would do nothing). Shortcuts are unchanged.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready(null);
  const top = await t.js(`['front', 'back', 'group', 'ungroup'].filter(c => document.querySelector('#topbar [data-cmd="' + c + '"]'))`);
  check('The top bar has no Front / Back / Group / Ungroup buttons', top.length === 0, top);

  const draw = async (dy) => {
    await t.js('window.__bohpumApp.cmd("tool-rect")');
    await t.js(`(() => { const b = document.getElementById('page-holder').getBoundingClientRect(); let d = document.getElementById('draw-here'); if (!d) { d = document.createElement('div'); d.id = 'draw-here'; document.body.append(d); }
      Object.assign(d.style, { position: 'fixed', left: b.left + 40 + 'px', top: b.top + ${dy} + 'px', width: '2px', height: '2px', pointerEvents: 'none' }); return true; })()`);
    await t.drag('#draw-here', 90, 50); await t.sleep(200);
  };
  await draw(40); await draw(160);
  const arr = () => t.js(`(() => { const s = document.querySelector('#props .psec[data-sec="arrange"]'); if (!s) return null;
    const rows = [...s.querySelectorAll('.prow > label')].map(l => l.textContent), g = [...s.querySelectorAll('.prow')].find(r => r.querySelector('label').textContent === 'Group');
    return { rows, group: g ? [...g.querySelectorAll('.btn')].map(x => ({ word: x.textContent, off: x.disabled, icon: !!x.querySelector('svg') })) : [],
      first: [...document.querySelectorAll('#props .psec[data-sec="object"] .btn:not(.psec-head)')].map(x => x.textContent.trim()),
      groups: window.__bohpumApp.state.doc.pages[0].objects.map(o => o.groupId || null) }; })()`);
  const one = await arr();
  check('One shape: Arrange has Order and a Group row (Group and Ungroup, with icons, both greyed out)', one && one.rows[0] === 'Order' && one.rows.includes('Group')
    && one.group.map(b => b.word).join() === 'Group,Ungroup' && one.group.every(b => b.icon && b.off), one);

  await t.js('window.__bohpumApp.cmd("select-all")'); await t.sleep(200);
  const two = await arr();
  check('Two shapes: Group is on, Ungroup greyed out; the first section has Lock only', two.group[0] && !two.group[0].off && two.group[1].off && two.first.join() === 'Lock', two);
  const press = async (word) => { await t.js(`(() => { [...document.querySelectorAll('#props .psec[data-sec="arrange"] .btn')].find(b => b.textContent === ${JSON.stringify(word)}).id = 'press-me'; return true; })()`); await t.click('#press-me'); await t.sleep(250); };
  await press('Group');
  const grouped = await arr();
  check('Group joins them; then Group is greyed out and Ungroup is on', grouped.groups.length === 2 && grouped.groups[0] && grouped.groups[0] === grouped.groups[1] && grouped.group[0].off && !grouped.group[1].off, grouped);
  await press('Ungroup');
  const apart = await arr();
  check('Ungroup splits them again', apart.groups.every(g => !g) && !apart.group[0].off && apart.group[1].off, apart);
  await t.key('g', ['control']); await t.sleep(250);
  check('Ctrl+G still groups', (await arr()).groups.every(g => g), await arr());
});
```

- [ ] **Step 2: Run it, expect FAIL** — `npm test -- tests/arrange-panel.test.js`.
- [ ] **Step 3: index.html** — delete the block:

```html
    <div class="tb-group">
      <button class="btn" data-cmd="front" title="Bring to front" data-icon="front"></button>
      <button class="btn" data-cmd="back" title="Send to back" data-icon="back"></button>
      <button class="btn" data-cmd="group" title="Group (Ctrl+G)" data-icon="group"></button>
      <button class="btn" data-cmd="ungroup" title="Ungroup (Ctrl+Shift+G)" data-icon="ungroup"></button>
    </div>
```

- [ ] **Step 4: app.js `renderProps`** — in the several-objects branch keep only Lock:

```js
    const ab = btns(pos);
    ab.append(lockBtn);
```
  and at the end of the Arrange section (after Distribute):

```js
  // Group / Ungroup live here, not in the top bar; each is greyed out when it would do nothing
  const oneGroup = sel.every(o => o.groupId && o.groupId === sel[0].groupId);
  const gb = iconBtn('group', 'Group (Ctrl+G)', () => cmd('group'), false, 'Group');
  const ub = iconBtn('ungroup', 'Ungroup (Ctrl+Shift+G)', () => cmd('ungroup'), false, 'Ungroup');
  gb.disabled = sel.length < 2 || oneGroup; ub.disabled = !sel.some(o => o.groupId);
  const gs = seg(gb, ub); gs.classList.add('words');
  ar.append(row('Group', gs));
```

- [ ] **Step 5: app.css** after `.seg-row`: `.seg.words .btn { gap: 6px; padding: 0 10px; font-size: 12px; }`
- [ ] **Step 6: Run** `npm test -- tests/arrange-panel.test.js tests/sastra-bar.test.js tests/group-resize.test.js tests/spacing.test.js` → PASS.
- [ ] **Step 7: Commit** — `feat: Bring to front, Send to back, Group and Ungroup move from the top bar into the panel's Arrange section`.

### Task 6: README and the whole suite

- [ ] **Step 1: README** — under **Look**: What's new (once per version over the welcome screen; Help › What's New), the
  folding right panel (remembered), Arrange buttons in the panel. Under **Run it**: before `npm run dist`, write the new
  version's notes at the top of `src/notes.js` (the build stops otherwise). Project layout: `src/notes.js`, `scripts/check-notes.js`.
- [ ] **Step 2: Run** `npm test` → all test files pass.
- [ ] **Step 3: Commit** — `docs: README — What's new, the folding right panel, Arrange in the panel`.
