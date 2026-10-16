# Publisher-Style Print Screen and Custom Dropdowns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every dropdown gets Bohpum's own look; the print screen fills the window under the title row; its left column becomes a stack of big Publisher-style dropdowns.

**Architecture:** All dropdowns stay real `<select>` elements styled with Chromium's customizable select (`appearance: base-select`, Chromium 152 in Electron 44.8). Big dropdowns put a picture + title + explanation inside each `<option>` and mirror the choice with `<button><selectedcontent>`. The print screen is the same modal, with a `print-screen` class that pins it under the title row.

**Tech Stack:** Electron 44.8 / Chromium 152, plain JS + CSS, Electron test harness (`npm test`, `tests/harness.js`).

**Spec:** `docs/superpowers/specs/2026-10-16-print-screen-publisher-dropdowns-design.md`

## Global Constraints

- Work on branch `feature/titlebar-theme-print-saveas` (continues the previous plan).
- Colours only from the existing tokens: `--accent #1f7a4c`, `--accent-soft #e6f2eb`, `--chrome`, `--chrome-2`, `--line`, `--line-2`, `--ink-2`, `--ink-3`; focus ring `#cfe8d9`.
- Title row height 37 px (print screen starts at `top: 37px`).
- Keyboard in a dropdown (verified in Electron): **Down** opens the list, Down/Up move, **Enter** picks, **Esc** closes the list only.
- Print screen UI text exactly: "Copies", headings "Printer", "Settings", "Printer adjustment"; "Printer Properties"; dropdown titles/explanations as in the spec; "Move right" / "Move down".
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Never print on paper in tests; stub `getPrintersAsync` / `webContents.print` / `Menu.prototype.popup` as the existing tests do.

## File map

| File | Change | Task |
|---|---|---|
| `src/app.css` | dropdown look; print screen; big dropdowns + left column | 1, 2, 3 |
| `src/app.js` | keys inside an open dropdown; menus off while a dialog is open | 1, 2 |
| `src/print.js` | print screen class, resize, Esc; Publisher-style column | 2, 3 |
| `tests/dropdowns.test.js` (new) | custom look, mouse, keyboard, arrows don't nudge | 1 |
| `tests/print-screen.test.js` (new) | fills window, resize, menus off, Esc in open list | 2 |
| `tests/print-sidebar.test.js` (new) | Publisher-style column | 3 |
| `tests/print-direct.test.js` | headings / option text | 3 |
| `README.md` | print screen description | 4 |

---

### Task 1: Custom look for every dropdown

**Files:**
- Create: `tests/dropdowns.test.js`
- Modify: `src/app.css` (after the `.field:focus` rule)
- Modify: `src/app.js` (`onKey` input check; `modal()` key handler)

**Interfaces:**
- Consumes: harness `run`, `t.ready`, `t.js`, `t.click`, `t.key`, `t.waitFor`.
- Produces: global CSS for `select` / `::picker(select)` / `select option`; the class `select.big` is styled in Task 3.

- [ ] **Step 1: Write the failing test**

Create `tests/dropdowns.test.js`:

```js
// Every dropdown uses Bohpum's own look (customizable select); mouse and keyboard still work, and
// keys pressed inside an open list don't reach the editor (no nudging the selection).
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const apps = await t.js(`[...document.querySelectorAll('select')].map(s => (s.id || s.closest('[id]').id) + ':' + getComputedStyle(s).appearance)`);
  check('Every dropdown in the editor uses the custom look', apps.length >= 3 && apps.every(a => a.endsWith(':base-select')), apps);

  await t.click('#zoom-sel');
  const opened = await t.js('document.getElementById("zoom-sel").matches(":open")');
  await t.click('#zoom-sel option[value="100"]');
  const z = await t.js('({ zoom: window.__bohpumApp.state.zoom, open: document.getElementById("zoom-sel").matches(":open") })');
  check('Mouse: the zoom dropdown opens, picking 100% zooms to 100%', opened && !z.open && z.zoom === 1, { opened, z });

  await t.js('window.__bohpumApp.cmd("select-all")');
  const pos = () => t.js('JSON.stringify(window.__bohpumApp.state.doc.pages[0].objects.map(o => [o.x, o.y]))');
  const before = await pos();
  await t.js('document.getElementById("tb-ls").value = "1"; document.getElementById("tb-ls").focus()');
  await t.key('Down');
  const open2 = await t.js('document.getElementById("tb-ls").matches(":open")');
  await t.key('Down');
  await t.key('Enter');
  const after = await pos();
  const v = await t.js('document.getElementById("tb-ls").value');
  check('Keyboard: Down opens the list, Down + Enter picks the next value', open2 && v === '1.15', { open2, v });
  check('Arrow keys inside an open list do not move the selected objects', before === after, { before, after });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- tests/dropdowns.test.js`
Expected: `FAIL  Every dropdown in the editor uses the custom look` (appearance `auto`); the mouse check fails (a native list is not in the page); the arrow check FAILs because the second Down nudges the objects.

- [ ] **Step 3: Styles**

In `src/app.css`, after the line starting `.field:focus {`, add:

```css
/* ---------- dropdowns: Bohpum's own look (customizable <select>, Chromium 135+) ---------- */
select, ::picker(select) { appearance: base-select; }
select { display: inline-flex; align-items: center; border: 1px solid var(--line-2); border-radius: 6px; background: #fff; padding: 0 8px; white-space: nowrap; cursor: default; }
select::picker-icon { content: ""; flex: none; width: 6px; height: 6px; margin: 0 2px 3px auto; border-right: 1.6px solid var(--ink-2); border-bottom: 1.6px solid var(--ink-2); transform: rotate(45deg); transition: transform .12s; }
select:open::picker-icon { transform: translateY(3px) rotate(225deg); border-color: var(--accent); }
select:open, select:focus-visible { border-color: var(--accent); box-shadow: 0 0 0 2px #cfe8d9; outline: 0; }
select:disabled { opacity: .5; }
::picker(select) { border: 1px solid var(--line-2); border-radius: 8px; background: #fff; box-shadow: 0 10px 30px rgba(0,0,0,.18); padding: 4px; margin: 4px 0; }
select option { display: flex; align-items: center; gap: 8px; min-height: 28px; padding: 6px 8px; border-radius: 5px; white-space: nowrap; }
select option:hover, select option:focus-visible { background: var(--chrome); outline: 0; }
select option:checked { background: var(--accent-soft); }
select option::checkmark { order: 1; margin-left: auto; padding-left: 12px; color: var(--accent); }
```

- [ ] **Step 4: Keys inside an open list stay in the list**

In `src/app.js` `onKey`, replace:

```js
  if (e.target.matches('input, select, textarea, [contenteditable="true"]')) { if (k === 'Escape') e.target.blur(); return; }
```

with:

```js
  // (option = an item in an open dropdown list: its keys belong to the list)
  if (e.target.matches('input, select, option, textarea, [contenteditable="true"]')) { if (k === 'Escape') e.target.blur(); return; }
```

In `modal()`, replace:

```js
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(null); } if (e.key === 'Enter' && !e.target.matches('textarea')) { const p = buttons.find(x => x[2]); if (p) { e.preventDefault(); close(p[1]); } } };
```

with:

```js
  const key = (e) => {
    const s = e.target.closest && e.target.closest('select');
    if (s && s.matches(':open')) return; // an open dropdown list handles its own Esc / Enter
    if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    if (e.key === 'Enter' && !e.target.matches('textarea')) { const p = buttons.find(x => x[2]); if (p) { e.preventDefault(); close(p[1]); } }
  };
```

- [ ] **Step 5: Run it to see it pass, plus the others**

Run: `npm test`
Expected: the 4 new checks PASS; all earlier checks PASS; `All 6 test files passed`.

- [ ] **Step 6: Look at it**

Take a window screenshot (scratch script with `desktopCapturer`, as before) with the zoom dropdown open. Expected: white rounded list, grey hover, green tick on the current zoom, chevron turned up and green.

- [ ] **Step 7: Commit**

```bash
git add tests/dropdowns.test.js src/app.css src/app.js
git commit -m "feat: Bohpum's own dropdown look everywhere (customizable select)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: The print screen fills the window

**Files:**
- Create: `tests/print-screen.test.js`
- Modify: `src/print.js` (backdrop / modal classes, `close`, `onKey`, resize)
- Modify: `src/app.css` (print dialog block, menus while a dialog is open)
- Modify: `src/app.js` (`openMenu`)

**Interfaces:**
- Consumes: Task 1 CSS; existing `openPrintDialog`.
- Produces: classes `.modal-back.print-screen`, `.modal.print`; `pickerOpen(e)` helper in `src/print.js` (Task 3 keeps it).

- [ ] **Step 1: Write the failing test**

Create `tests/print-screen.test.js`:

```js
// The print screen fills the window under the title row, follows resizing, blocks the menus,
// and Esc in an open dropdown closes only the list.
const { Menu } = require('electron');
const { run } = require('./harness');

const popups = [];

run(async (t, check) => {
  await t.ready();
  await t.js('window.__bohpumApp.cmd("print")');
  await t.waitFor('!!document.querySelector(".print-preview .slot")');
  await t.sleep(300);
  const geo = () => t.js(`(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const m = r('.modal'), tb = r('#titlebar'), sh = r('.print-preview .sheet');
    return { top: Math.round(m.top), left: Math.round(m.left), right: Math.round(m.right), bottom: Math.round(m.bottom), tb: Math.round(tb.bottom), w: innerWidth, h: innerHeight, sheetH: Math.round(sh.height) };
  })()`);
  const g1 = await geo();
  check('Print screen fills the window under the title row', g1.top === g1.tb && g1.left === 0 && g1.right === g1.w && g1.bottom === g1.h, g1);

  await t.click('#menus [data-menu="0"]');
  await t.key('F', ['alt']);
  check('Menus do nothing while the print screen is open', popups.length === 0, { popups: popups.length });

  t.win.unmaximize();
  t.win.setContentSize(1100, 760);
  await t.sleep(900);
  const g2 = await geo();
  check('After resizing it still fills the window, and the preview re-fits', g2.w === 1100 && g2.h === 760 && g2.right === g2.w && g2.bottom === g2.h && g2.sheetH > 50 && g2.sheetH < g1.sheetH, { g1, g2 });

  await t.click('select[data-k="sheet"]');
  const listOpen = await t.js('document.querySelector(\'select[data-k="sheet"]\').matches(":open")');
  await t.key('Escape');
  const st = await t.js('({ list: document.querySelector(\'select[data-k="sheet"]\').matches(":open"), screen: !!document.querySelector(".print-preview") })');
  check('Esc in an open dropdown closes the list, not the print screen', listOpen && !st.list && st.screen, { listOpen, st });
  await t.key('Escape');
}, {
  setup: () => {
    Menu.prototype.popup = function (opts = {}) { popups.push(this); if (opts.callback) setTimeout(opts.callback, 10); };
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `npm test -- tests/print-screen.test.js`
Expected: FAIL on "fills the window" (centred box), "Menus do nothing" (File pops up), "After resizing…", and "Esc in an open dropdown…" (the print screen closes).

- [ ] **Step 3: Print screen classes, resize, Esc**

In `src/print.js`, add after the `const esc = …` line:

```js
// An open dropdown list handles its own Esc / Enter
const pickerOpen = (e) => { const s = e.target.closest && e.target.closest('select'); return !!(s && s.matches(':open')); };
```

Replace:

```js
  back.className = 'modal-back';
  back.innerHTML = `
  <div class="modal" role="dialog" aria-label="Print">
```

with:

```js
  back.className = 'modal-back print-screen';
  back.innerHTML = `
  <div class="modal print" role="dialog" aria-label="Print">
```

Replace:

```js
  let opened = null;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const keepAndClose = () => { if (JSON.stringify([o, nudge]) !== opened) persist(); close(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (!sending) keepAndClose(); } };
  document.addEventListener('keydown', onKey, true);
```

with:

```js
  let opened = null, resizeT = 0;
  const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(renderPreview, 100); }; // re-fit the preview
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); clearTimeout(resizeT); };
  const keepAndClose = () => { if (JSON.stringify([o, nudge]) !== opened) persist(); close(); };
  const onKey = (e) => { if (e.key === 'Escape' && !pickerOpen(e)) { e.stopPropagation(); if (!sending) keepAndClose(); } };
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
```

- [ ] **Step 4: Styles**

In `src/app.css`, replace the whole print dialog block that starts with `/* print dialog: settings column (scrolls on its own) | preview */` and ends with the `.print-preview { … }` rule:

```css
/* print dialog: settings column (scrolls on its own) | preview */
.print-wrap { display: grid; grid-template-columns: 300px 1fr; gap: 18px; width: min(1000px, calc(100vw - 80px)); height: min(600px, calc(100vh - 170px)); }
.print-side { overflow: auto; min-height: 0; padding-right: 6px; }
.print-side .psec { padding: 0 0 12px; margin-bottom: 12px; }
.print-side .grid2 .field { width: 100%; min-width: 0; }
.print-side input[type=radio], .print-side input[type=checkbox] { accent-color: var(--accent); }
.pr-printer { display: flex; gap: 6px; margin-bottom: 6px; }
.pr-printer .field { flex: 1; min-width: 0; }
.pr-printer .btn { height: 28px; border-color: var(--line-2); background: #fff; }
.print-preview { background: var(--pasteboard); border-radius: 8px; display: flex; align-items: center; justify-content: center; min-height: 0; position: relative; overflow: hidden; }
```

with:

```css
/* print screen: fills the window under the title row (37 px), like Publisher's print screen */
.modal-back.print-screen { top: 37px; background: var(--chrome); align-items: stretch; justify-content: stretch; }
.modal.print { width: 100%; max-width: none; max-height: none; border-radius: 0; box-shadow: none; }
.modal.print .modal-b { flex: 1; min-height: 0; padding: 0; overflow: hidden; }
.print-wrap { display: grid; grid-template-columns: 340px 1fr; height: 100%; }
.print-side { overflow: auto; min-height: 0; padding: 14px 16px 16px; background: #fff; border-right: 1px solid var(--line); }
.print-side .psec { padding: 0 0 12px; margin-bottom: 12px; }
.print-side .grid2 .field { width: 100%; min-width: 0; }
.print-side input[type=radio], .print-side input[type=checkbox] { accent-color: var(--accent); }
.pr-printer { display: flex; gap: 6px; margin-bottom: 6px; }
.pr-printer .field { flex: 1; min-width: 0; }
.pr-printer .btn { height: 28px; border-color: var(--line-2); background: #fff; }
.print-preview { background: var(--pasteboard); display: flex; align-items: center; justify-content: center; min-height: 0; position: relative; overflow: hidden; }
```

After the `.menu-btn.open { … }` rule add:

```css
/* while a dialog is open (e.g. the print screen, which leaves the title row visible) the menus are off */
body:has(#modal-root > *) #menus { opacity: .45; pointer-events: none; }
```

- [ ] **Step 5: Menus off in code too (Alt+letter, F10)**

In `src/app.js` `openMenu`, replace:

```js
  if (!b || !api.showMenu) return;
```

with:

```js
  if (!b || !api.showMenu || $('modal-root').children.length) return; // not behind a dialog / the print screen
```

(Alt+F / F10 already stop in `onKey` while a dialog is open; this covers clicks that slip through.)

- [ ] **Step 6: Run it to see it pass, plus the others**

Run: `npm test`
Expected: 4 new checks PASS; all earlier checks PASS; `All 7 test files passed`.

- [ ] **Step 7: Commit**

```bash
git add tests/print-screen.test.js src/print.js src/app.css src/app.js
git commit -m "feat: print screen fills the window under the title row and follows resizing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Publisher-style left column

**Files:**
- Create: `tests/print-sidebar.test.js`
- Modify: `tests/print-direct.test.js` (headings, option text)
- Modify: `src/print.js` (from `// ---------------- dialog ----------------` to the end)
- Modify: `src/app.css` (big dropdowns; left column)

**Interfaces:**
- Consumes: `pickerOpen`, `.print-screen` (Task 2); dropdown CSS (Task 1).
- Produces: `select.big` markup `<select class="big"><button><selectedcontent></selectedcontent></button><option><span class="ic">svg</span><span class="t"><b>title</b><small>explanation</small></span></option>…</select>`; `data-k` keys `pages`, `range`, `mode`, `sheet`, `orient`, `crop`, `copies`, `left`, `top`, `marginT/L/B/R`, `gapX/Y`, `center`, `order`, `x`, `y`; `#pd-printer`, `#pd-props`, `#pd-pos [data-pos]`.

- [ ] **Step 1: Write the failing test and update the old one**

Create `tests/print-sidebar.test.js`:

```js
// Publisher-style left column: big dropdowns with picture + title + explanation; extra boxes only when needed.
const { run } = require('./harness');

run(async (t, check) => {
  t.wc.getPrintersAsync = async () => [{ name: 'Office HP', displayName: 'Office HP', isDefault: true, description: '', status: 0, options: {} }];
  await t.ready();
  await t.js('window.__bohpumApp.cmd("print")');
  await t.waitFor('!!document.querySelector(".print-preview .slot") && !document.getElementById("pd-printer").options[0].textContent.startsWith("Finding")');
  const side = () => t.js(`(() => {
    const q = (s) => document.querySelector(s);
    const shown = (s) => { const el = q(s); return !!el && el.getClientRects().length > 0; };
    const sc = (s) => { const el = q(s + ' selectedcontent'); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null; };
    return {
      heads: [...document.querySelectorAll('.print-side h4')].map(h => h.textContent),
      bigs: [...document.querySelectorAll('.print-side select.big')].map(s => s.getAttribute('aria-label')),
      copiesFirst: !!q('.print-side > .pr-copies:first-child [data-k="copies"]'),
      layoutShown: sc('select[data-k="mode"]'), printerShown: sc('#pd-printer'),
      left: shown('[data-k="left"]'), margins: shown('[data-k="marginT"]'), range: shown('[data-k="range"]'),
      paperOff: q('select[data-k="sheet"]').disabled, orientOff: q('select[data-k="orient"]').disabled,
      pad: [...document.querySelectorAll('#pd-pos [data-pos]')].filter(b => b.classList.contains('on')).map(b => b.dataset.pos),
      pos: q('[data-k="left"]') && { left: +q('[data-k="left"]').value, top: +q('[data-k="top"]').value }
    };
  })()`);

  const s1 = await side();
  check('Column: Copies, then Printer, Settings, Printer adjustment',
    s1.copiesFirst && s1.heads.join('|') === 'Printer|Settings|Printer adjustment' && s1.bigs.join('|') === 'Printer|Pages to print|Layout|Paper|Orientation', s1);
  check('Closed dropdowns show the chosen title and explanation',
    /^One per sheet, at a position Place the page anywhere/.test(s1.layoutShown) && /^Office HP Default printer/.test(s1.printerShown), s1);
  check('Position: Left / Top shown, centre of the 3×3 pad lit', s1.left && !s1.margins && s1.pad.join() === 'mc', s1);

  await t.click('#pd-pos [data-pos="tl"]');
  const s2 = await side();
  check('Top-left on the pad: Left 10, Top 10, that cell lit', s2.pos.left === 10 && s2.pos.top === 10 && s2.pad.join() === 'tl', s2);

  await t.click('select[data-k="mode"]');
  await t.click('select[data-k="mode"] option[value="grid"]');
  const s3 = await side();
  check('Mouse: Multiple copies per sheet shows margins, hides Left / Top', s3.margins && !s3.left && /^Multiple copies per sheet/.test(s3.layoutShown), s3);

  await t.click('select[data-k="mode"]');
  await t.click('select[data-k="mode"] option[value="actual"]');
  const s4 = await side();
  check('Page size = paper size turns Paper and Orientation off', s4.paperOff && s4.orientOff, s4);

  await t.click('select[data-k="pages"]');
  await t.click('select[data-k="pages"] option[value="range"]');
  const s5 = await side();
  check('Custom Print shows the Pages box', s5.range, s5);
  await t.key('Escape');
});
```

In `tests/print-direct.test.js` replace:

```js
    await t.waitFor('!!document.querySelector(".print-preview .slot") && document.getElementById("pd-printer").options[0].textContent !== "Finding printers…"');
```

with:

```js
    await t.waitFor('!!document.querySelector(".print-preview .slot") && !document.getElementById("pd-printer").options[0].textContent.startsWith("Finding printers")');
```

replace:

```js
      heads: [...document.querySelectorAll('.print-side .psec h4')].map(h => h.textContent),
```

with:

```js
      heads: [...document.querySelectorAll('.print-side h4')].map(h => h.textContent),
```

replace:

```js
  check('Left column: Printer, Paper, Layout, Pages, Printer adjustment', u1.heads.join('|') === 'Printer|Paper|Layout|Pages|Printer adjustment', u1.heads);
```

with:

```js
  check('Left column: Printer, Settings, Printer adjustment', u1.heads.join('|') === 'Printer|Settings|Printer adjustment', u1.heads);
```

and replace:

```js
    u3.firstOption === 'No printers installed' && u3.disabled && !u3.props && u3.printDisabled && !u3.pdfDisabled, u3);
```

with:

```js
    u3.firstOption.startsWith('No printers installed') && u3.disabled && !u3.props && u3.printDisabled && !u3.pdfDisabled, u3);
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test -- tests/print-sidebar.test.js tests/print-direct.test.js`
Expected: print-sidebar FAILs (no big dropdowns, no `.pr-copies`); print-direct FAILs on the headings check only.

- [ ] **Step 3: The left column**

In `src/print.js`, replace everything from the line `// ---------------- dialog ----------------` to the end of the file with:

```js
// ---------------- dialog ----------------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
// An open dropdown list handles its own Esc / Enter
const pickerOpen = (e) => { const s = e.target.closest && e.target.closest('select'); return !!(s && s.matches(':open')); };
// Pictures for the big dropdowns (24 × 24, drawn in currentColor)
const ICON = {
  printer: '<path d="M7 9V3h10v6M7 18H5a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z"/>',
  all: '<path d="M8 3h9l3 3v13H8zM4 7v14h12"/>',
  current: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 12h6"/>',
  custom: '<path d="M6 3h9l3 3v15H6z"/><path d="M9 11h6M9 15h4"/>',
  single: '<path d="M5 3h14v18H5z"/><path d="M8 10h8v5H8z" fill="currentColor" stroke="none"/>',
  grid: '<path d="M5 3h14v18H5z"/><path d="M7 6h4v3H7zM13 6h4v3h-4zM7 11h4v3H7zM13 11h4v3h-4zM7 16h4v3H7zM13 16h4v3h-4z" fill="currentColor" stroke="none"/>',
  actual: '<path d="M5 3h14v18H5z"/><path d="M7 5h10v14H7z" fill="currentColor" stroke="none"/>',
  paper: '<path d="M6 3h12v18H6z"/>',
  portrait: '<path d="M7 3h10v18H7z"/><path d="M10 7h4"/>',
  landscape: '<path d="M3 7h18v10H3z"/><path d="M7 10h4"/>'
};
const svg = (k) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;
// Big Publisher-style dropdown (a real <select>): items [{ v, icon, title, sub }]; the closed box shows the
// chosen item through <selectedcontent>
const bigOptions = (items, value) => '<button><selectedcontent></selectedcontent></button>' + items.map(it =>
  `<option value="${esc(it.v)}"${it.v === value ? ' selected' : ''}><span class="ic">${svg(it.icon)}</span><span class="t"><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></span></option>`).join('');
const bigSelect = (attrs, items, value) => `<select class="big" ${attrs}>${bigOptions(items, value)}</select>`;
// The 3×3 position pad: snap points 10 mm from the paper edges, or centred
const PAD = [['tl', 'Top left'], ['tc', 'Top centre'], ['tr', 'Top right'], ['ml', 'Middle left'], ['mc', 'Centre'], ['mr', 'Middle right'], ['bl', 'Bottom left'], ['bc', 'Bottom centre'], ['br', 'Bottom right']];

export function openPrintDialog({ doc, pageIndex, api, settings, saveSettings, toast, onDocChange }) {
  const small = doc.pageW * 2 <= 210 || doc.pageH * 2 <= 297;
  const o = Object.assign({
    sheet: 'A4', orient: 'portrait', mode: small ? 'single' : 'actual',
    left: null, top: null,
    marginT: 10, marginL: 10, marginR: 10, marginB: 10, gapX: 0, gapY: 0, center: true, order: 'repeat',
    crop: false, pages: 'all', range: '', copies: 1
  }, clone(doc.print || {}));
  const nudge = Object.assign({ x: 0, y: 0 }, settings.printNudge || {});
  let sheetNo = 0;
  let printers = null;                     // null until Windows has listed them
  let printer = settings.printer || null;  // printer name; remembered app-wide
  let sending = false;

  const back = document.createElement('div');
  back.className = 'modal-back print-screen';
  back.innerHTML = `
  <div class="modal print" role="dialog" aria-label="Print">
    <div class="modal-h">Print</div>
    <div class="modal-b"><div class="print-wrap">
      <div class="print-side" id="pd-side"></div>
      <div class="print-preview" id="pd-prev"></div>
    </div></div>
    <div class="modal-f">
      <span class="muted" style="margin-right:auto" id="pd-info"></span>
      <button class="btn" data-a="close">Close</button>
      <button class="btn" data-a="pdf">Save as PDF</button>
      <button class="btn primary" data-a="print">Print</button>
    </div>
  </div>`;
  document.getElementById('modal-root').append(back);
  const side = back.querySelector('#pd-side'), prev = back.querySelector('#pd-prev'), info = back.querySelector('#pd-info');
  const printBtn = back.querySelector('[data-a="print"]');

  // A labelled number box (label above, unit inside)
  const field = (key, label, obj = o, step = 0.5, unit = 'mm') => `<label class="pf"><span>${label}</span><span class="numf"><input type="number" step="${step}" data-k="${key}" data-o="${obj === nudge ? 'n' : 'o'}" value="${round(obj[key])}">${unit ? `<em>${unit}</em>` : ''}</span></label>`;
  const round = (v) => v == null ? '' : Math.round(v * 10) / 10;

  function ensurePos() {
    const [sw, sh] = sheetSize(o.sheet, o.orient);
    if (o.left == null || o.left > sw) o.left = Math.max(0, (sw - doc.pageW) / 2);
    if (o.top == null || o.top > sh) o.top = Math.max(0, (sh - doc.pageH) / 2);
  }
  function padPos(k) {
    const [sw, sh] = sheetSize(o.sheet, o.orient), m = 10;
    return {
      left: k[1] === 'l' ? m : k[1] === 'r' ? sw - doc.pageW - m : (sw - doc.pageW) / 2,
      top: k[0] === 't' ? m : k[0] === 'b' ? sh - doc.pageH - m : (sh - doc.pageH) / 2
    };
  }
  // Light the pad cell that matches the current position (none when the card is somewhere else)
  function markPad() {
    side.querySelectorAll('#pd-pos [data-pos]').forEach(b => {
      const p = padPos(b.dataset.pos);
      b.classList.toggle('on', Math.abs(p.left - o.left) < 0.05 && Math.abs(p.top - o.top) < 0.05);
    });
  }

  function renderSide() {
    if (o.mode === 'single') ensurePos();
    const [sw, sh] = sheetSize(o.sheet, o.orient);
    const g = gridInfo(doc, o, sw, sh);
    const n = doc.pages.length, actual = o.mode === 'actual';
    side.innerHTML = `
      <div class="pr-copies">${field('copies', 'Copies', o, 1, '')}</div>
      <h4>Printer</h4>
      <select class="big" id="pd-printer" aria-label="Printer"></select>
      <button class="linkbtn" id="pd-props" title="Opens Windows' printing preferences for this printer. Changes there become this printer's defaults.">Printer Properties</button>
      <h4>Settings</h4>
      ${bigSelect('data-k="pages" aria-label="Pages to print"', [
        { v: 'all', icon: 'all', title: 'Print All Pages', sub: `The whole publication (${n} page${n === 1 ? '' : 's'})` },
        { v: 'current', icon: 'current', title: 'Print Current Page', sub: `Page ${pageIndex + 1}` },
        { v: 'range', icon: 'custom', title: 'Custom Print', sub: 'Type which pages to print' }
      ], o.pages)}
      ${o.pages === 'range' ? `<label class="pf pr-sub"><span>Pages</span><input class="field" data-k="range" placeholder="e.g. 1-3, 5" value="${esc(o.range || '')}"></label>` : ''}
      ${bigSelect('data-k="mode" aria-label="Layout"', [
        { v: 'single', icon: 'single', title: 'One per sheet, at a position', sub: 'Place the page anywhere on the paper' },
        { v: 'grid', icon: 'grid', title: 'Multiple copies per sheet', sub: g.cols * g.rows ? `${g.cols * g.rows} per sheet (${g.cols} × ${g.rows})` : 'Page is larger than the paper' },
        { v: 'actual', icon: 'actual', title: 'Page size = paper size', sub: `Print on ${round(doc.pageW)} × ${round(doc.pageH)} mm paper` }
      ], o.mode)}
      ${o.mode === 'single' ? `<div class="pr-sub pr-pos">${field('left', 'Left')}${field('top', 'Top')}
        <div class="pos-pad" id="pd-pos" role="group" aria-label="Snap to">${PAD.map(([k, t]) => `<button data-pos="${k}" title="${t}" aria-label="${t}"></button>`).join('')}</div></div>` : ''}
      ${o.mode === 'grid' ? `<div class="pr-sub">
        <div class="grid2">${field('marginT', 'Top')}${field('marginL', 'Left')}${field('marginB', 'Bottom')}${field('marginR', 'Right')}${field('gapX', 'Gap ↔')}${field('gapY', 'Gap ↕')}</div>
        <label class="chk"><input type="checkbox" data-k="center" ${o.center ? 'checked' : ''}> Center the block on the sheet</label>
        <select class="field" data-k="order" aria-label="Page order" style="width:100%"><option value="repeat" ${o.order === 'repeat' ? 'selected' : ''}>Fill each sheet with one page</option><option value="sequence" ${o.order === 'sequence' ? 'selected' : ''}>Different pages in sequence</option></select>
      </div>` : ''}
      ${bigSelect(`data-k="sheet" aria-label="Paper"${actual ? ' disabled' : ''}`,
        Object.entries(SHEETS).map(([k, [w, h]]) => ({ v: k, icon: 'paper', title: k, sub: `${round(w)} × ${round(h)} mm` })), o.sheet)}
      ${bigSelect(`data-k="orient" aria-label="Orientation"${actual ? ' disabled' : ''}`, [
        { v: 'portrait', icon: 'portrait', title: 'Portrait Orientation', sub: 'Tall sheet' },
        { v: 'landscape', icon: 'landscape', title: 'Landscape Orientation', sub: 'Wide sheet' }
      ], o.orient)}
      <label class="chk"><input type="checkbox" data-k="crop" ${o.crop ? 'checked' : ''} ${actual ? 'disabled' : ''}> Crop marks</label>
      <h4>Printer adjustment</h4>
      <div class="grid2">${field('x', 'Move right', nudge, 0.1)}${field('y', 'Move down', nudge, 0.1)}</div>
      <div class="muted">If your printer prints a little off, enter the correction in mm. It is remembered for next time.</div>
      <div id="pd-warn"></div>`;
    side.querySelectorAll('[data-k]').forEach(inp => {
      const ev = inp.type === 'number' || inp.tagName === 'INPUT' && inp.type !== 'checkbox' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        const target = inp.dataset.o === 'n' ? nudge : o;
        const k = inp.dataset.k;
        if (inp.type === 'checkbox') target[k] = inp.checked;
        else if (inp.type === 'number') { const v = parseFloat(inp.value); target[k] = isNaN(v) ? 0 : v; }
        else target[k] = inp.value;
        if (k === 'sheet' || k === 'orient') { o.left = null; o.top = null; }
        if (k === 'mode') sheetNo = 0;
        if (inp.tagName === 'SELECT' || inp.type === 'checkbox') update(); else { renderPreview(); renderWarn(); markPad(); }
      });
    });
    side.querySelectorAll('#pd-pos [data-pos]').forEach(b => b.onclick = () => { Object.assign(o, padPos(b.dataset.pos)); update(); });
    side.querySelector('#pd-printer').addEventListener('change', (e) => { printer = e.target.value; saveSettings({ printer }); });
    side.querySelector('#pd-props').onclick = () => { if (printer) api.printerPrefs(printer); };
    fillPrinters();
    markPad();
    renderWarn();
  }

  // The printer dropdown: the remembered printer if still installed, else Windows' default
  function fillPrinters() {
    const sel = side.querySelector('#pd-printer'), props = side.querySelector('#pd-props');
    const none = !printers || !printers.length;
    const items = !printers ? [{ v: '', icon: 'printer', title: 'Finding printers…', sub: 'One moment' }]
      : none ? [{ v: '', icon: 'printer', title: 'No printers installed', sub: 'Save as PDF still works' }]
      : printers.map(p => ({ v: p.name, icon: 'printer', title: p.displayName, sub: p.isDefault ? 'Default printer' : 'Printer' }));
    sel.innerHTML = bigOptions(items, none ? '' : printer);
    sel.disabled = none; props.disabled = none;
    printBtn.disabled = sending || none || !printer;
  }

  function renderWarn() {
    const w = [];
    const lay = currentLayout();
    const [sw, sh] = [lay.sw, lay.sh];
    if (o.mode !== 'actual') {
      if (!lay.sheets.length || !lay.sheets[0].length) w.push('The page does not fit on this paper. Choose a bigger sheet or landscape.');
      for (const p of (lay.sheets[0] || [])) {
        if (p.x < -0.01 || p.y < -0.01 || p.x + doc.pageW > sw + 0.01 || p.y + doc.pageH > sh + 0.01) { w.push('Part of the page is outside the paper.'); break; }
        if (p.x < NONPRINT || p.y < NONPRINT || p.x + doc.pageW > sw - NONPRINT || p.y + doc.pageH > sh - NONPRINT) { w.push(`Most printers cannot print within about ${NONPRINT} mm of the paper edge.`); break; }
      }
    }
    side.querySelector('#pd-warn').innerHTML = w.map(t => `<div class="warn">${t}</div>`).join('');
    const n = lay.sheets.length;
    if (!sending) info.textContent = `${n} sheet${n === 1 ? '' : 's'} · ${round(sw)} × ${round(sh)} mm · prints at 100% (actual size)`;
  }

  function currentLayout() {
    const pages = parsePages(o, doc.pages.length, pageIndex);
    return layout(doc, o, pages);
  }

  function renderPreview() {
    const lay = currentLayout();
    const [sw, sh] = [lay.sw, lay.sh];
    prev.innerHTML = '';
    const maxW = prev.clientWidth - 40 || 600, maxH = (prev.clientHeight || 520) - 50;
    const scale = Math.min(maxW / (sw * 3.7795), maxH / (sh * 3.7795));
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    sheet.style.width = sw + 'mm'; sheet.style.height = sh + 'mm'; sheet.style.zoom = scale;
    if (o.mode !== 'actual') {
      const np = document.createElement('div'); np.className = 'nopr';
      np.style.boxShadow = `inset 0 0 0 ${NONPRINT}mm rgba(217,70,184,.07)`;
      sheet.append(np);
    }
    sheetNo = Math.min(sheetNo, Math.max(0, lay.sheets.length - 1));
    const placements = lay.sheets[sheetNo] || [];
    for (const p of placements) {
      const slot = document.createElement('div');
      slot.className = 'slot' + (o.mode === 'single' ? ' drag' : '');
      Object.assign(slot.style, { left: p.x + 'mm', top: p.y + 'mm', width: doc.pageW + 'mm', height: doc.pageH + 'mm' });
      const pg = renderPage(doc, doc.pages[p.pi]);
      slot.append(pg);
      sheet.append(slot);
      if (o.crop && o.mode !== 'actual') cropMarks(sheet, p.x, p.y, doc.pageW, doc.pageH);
      if (o.mode === 'single') slot.addEventListener('pointerdown', (e) => startDrag(e, sheet, sw, sh));
    }
    prev.append(sheet);
    fixLineHeights(sheet);
    if (lay.sheets.length > 1) {
      const nav = document.createElement('div'); nav.className = 'prev-nav';
      nav.innerHTML = `<button class="btn" style="height:22px" data-d="-1">‹</button> Sheet ${sheetNo + 1} of ${lay.sheets.length} <button class="btn" style="height:22px" data-d="1">›</button>`;
      nav.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { sheetNo = Math.max(0, Math.min(lay.sheets.length - 1, sheetNo + +b.dataset.d)); renderPreview(); });
      prev.append(nav);
    }
  }

  function startDrag(e, sheet, sw, sh) {
    e.preventDefault();
    const r = sheet.getBoundingClientRect();
    const k = r.width / sw;
    const sx = e.clientX, sy = e.clientY, ol = o.left, ot = o.top;
    const move = (ev) => {
      let nl = ol + (ev.clientX - sx) / k, nt = ot + (ev.clientY - sy) / k;
      if (!ev.altKey) { nl = Math.round(nl * 2) / 2; nt = Math.round(nt * 2) / 2; }
      // snap to centre
      const cx = (sw - doc.pageW) / 2, cy = (sh - doc.pageH) / 2;
      if (Math.abs(nl - cx) < 2) nl = cx;
      if (Math.abs(nt - cy) < 2) nt = cy;
      o.left = nl; o.top = nt;
      const slot = sheet.querySelector('.slot');
      slot.style.left = nl + 'mm'; slot.style.top = nt + 'mm';
      sheet.querySelectorAll('.kcrop').forEach(c => c.remove());
      if (o.crop) cropMarks(sheet, nl, nt, doc.pageW, doc.pageH);
      const L = side.querySelector('[data-k="left"]'), T = side.querySelector('[data-k="top"]');
      if (L) L.value = round(nl); if (T) T.value = round(nt);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); renderWarn(); markPad(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  function update() { renderSide(); renderPreview(); }

  function persist() {
    doc.print = clone(o);
    saveSettings({ printNudge: nudge });
    onDocChange && onDocChange();
  }

  // Close / Esc keep what the user set (position, paper, mode …), like Print does.
  // Nothing is written when nothing changed, so just looking at the dialog leaves the publication unchanged.
  let opened = null, resizeT = 0;
  const onResize = () => { clearTimeout(resizeT); resizeT = setTimeout(renderPreview, 100); }; // re-fit the preview
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); clearTimeout(resizeT); };
  const keepAndClose = () => { if (JSON.stringify([o, nudge]) !== opened) persist(); close(); };
  const onKey = (e) => { if (e.key === 'Escape' && !pickerOpen(e)) { e.stopPropagation(); if (!sending) keepAndClose(); } };
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);

  back.querySelector('[data-a="close"]').onclick = keepAndClose;
  back.querySelector('[data-a="pdf"]').onclick = async () => {
    const lay = currentLayout(); if (!lay.sheets.length) return toast('Nothing to print with these settings.');
    persist();
    const html = buildOutputHtml(doc, lay, { crop: o.crop && o.mode !== 'actual', nudge: { x: 0, y: 0 } });
    close();
    const p = await api.exportPdf({ html, widthMm: lay.sw, heightMm: lay.sh, defaultName: (doc.name || 'publication') + (o.mode === 'actual' ? '' : '-' + o.sheet) + '.pdf' });
    if (p) toast('Saved ' + p);
  };
  // Print: straight to the chosen printer, no Windows dialog
  printBtn.onclick = async () => {
    const lay = currentLayout(); if (!lay.sheets.length) return toast('Nothing to print with these settings.');
    if (!printer || sending) return;
    persist();
    saveSettings({ printer });
    const actual = o.mode === 'actual';
    const html = buildOutputHtml(doc, lay, { crop: o.crop && !actual, nudge: actual ? { x: 0, y: 0 } : nudge, portraitPaper: !actual });
    const name = ((printers || []).find(p => p.name === printer) || {}).displayName || printer;
    sending = true;
    back.querySelectorAll('.modal-f .btn').forEach(b => b.disabled = true);
    info.textContent = `Sending to ${name}…`;
    const r = await api.printHtml({ html, sheet: actual ? null : o.sheet, widthMm: lay.sw, heightMm: lay.sh, copies: Math.max(1, o.copies | 0), deviceName: printer });
    close();
    const n = lay.sheets.length;
    if (r && r.ok) toast(`Sent ${n} sheet${n === 1 ? '' : 's'} to ${name}`);
    else toast('Print failed: ' + ((r && r.reason) || 'the printer did not take the job'), 6000);
  };

  update();
  opened = JSON.stringify([o, nudge]); // after update(), which fills in the default position
  requestAnimationFrame(renderPreview);
  api.printers().then((list) => {
    printers = list || [];
    if (!printers.some(p => p.name === printer)) printer = (printers.find(p => p.isDefault) || printers[0] || {}).name || null;
    if (back.isConnected) fillPrinters();
  }, () => { printers = []; printer = null; if (back.isConnected) fillPrinters(); });
}
```

(Removed compared to before: the layout radio cards and `[data-mode]` handler — Layout is now the `mode` dropdown; the nine arrow buttons — now the 3×3 pad; `num()` — now `field()` with the label above.)

- [ ] **Step 4: Styles for big dropdowns and the column**

In `src/app.css`, after the dropdown block from Task 1 (after the `select option::checkmark` rule) add:

```css
/* big Publisher-style dropdowns (print screen): picture · title · explanation */
select.big { display: flex; width: 100%; min-height: 48px; padding: 6px 10px 6px 8px; border-radius: 7px; }
select.big > button { display: flex; flex: 1; min-width: 0; padding: 0; border: 0; background: none; font: inherit; color: inherit; text-align: left; }
select.big selectedcontent, select.big option { display: flex; align-items: center; gap: 10px; min-width: 0; }
select.big option { padding: 7px 8px; }
.big .ic { flex: none; display: grid; place-items: center; width: 30px; height: 30px; border-radius: 6px; background: var(--accent-soft); color: var(--accent); }
.big .ic svg { width: 18px; height: 18px; }
.big .t { display: flex; flex-direction: column; min-width: 0; }
.big .t b { font-weight: 600; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; }
.big .t small { color: var(--ink-3); font-size: 11.5px; overflow: hidden; text-overflow: ellipsis; }
.big option .ic { background: var(--chrome-2); color: var(--ink-2); }
.big option:checked .ic { background: #fff; color: var(--accent); }
```

In the print block (from Task 2), replace these rules:

```css
.print-side .psec { padding: 0 0 12px; margin-bottom: 12px; }
.print-side .grid2 .field { width: 100%; min-width: 0; }
.print-side input[type=radio], .print-side input[type=checkbox] { accent-color: var(--accent); }
.pr-printer { display: flex; gap: 6px; margin-bottom: 6px; }
.pr-printer .field { flex: 1; min-width: 0; }
.pr-printer .btn { height: 28px; border-color: var(--line-2); background: #fff; }
```

with:

```css
.print-side h4 { margin: 16px 0 6px; font-size: 11px; letter-spacing: .7px; text-transform: uppercase; color: var(--ink-2); font-weight: 600; }
.print-side select.big { margin-bottom: 6px; }
.print-side input[type=checkbox] { accent-color: var(--accent); }
.print-side .muted { font-size: 11.5px; line-height: 1.4; }
.print-side .grid2 { gap: 8px; }
.pf { display: flex; flex-direction: column; gap: 3px; min-width: 0; font-size: 11.5px; color: var(--ink-2); }
.pf .numf, .pf .field { height: 30px; color: var(--ink); }
.pr-copies .pf { flex-direction: row; align-items: center; gap: 10px; font-size: 12.5px; }
.pr-copies .numf { width: 90px; }
.pr-sub { margin: 2px 0 10px; }
.pr-pos { display: flex; align-items: flex-end; gap: 8px; }
.pr-pos .pf { width: 84px; }
.pos-pad { display: grid; grid-template-columns: repeat(3, 18px); gap: 4px; padding: 6px; border: 1px solid var(--line); border-radius: 6px; flex: none; }
.pos-pad button { width: 18px; height: 14px; padding: 0; border: 0; border-radius: 3px; background: var(--chrome-2); cursor: pointer; }
.pos-pad button:hover { background: var(--line-2); }
.pos-pad button.on { background: var(--accent); }
.linkbtn { display: block; border: 0; background: none; padding: 0; margin: 0 0 2px 2px; color: var(--accent); font: inherit; font-size: 12px; cursor: pointer; }
.linkbtn:hover { text-decoration: underline; }
.linkbtn:disabled { opacity: .45; cursor: default; text-decoration: none; }
```

Delete the now-unused rules (their markup is gone):

```css
.pos-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; max-width: 200px; }
.pos-grid .btn { height: 26px; border-color: var(--line); background: #fff; font-size: 12px; }
```

```css
.print-side .radio { display: flex; align-items: flex-start; gap: 8px; padding: 8px 10px; border: 1px solid var(--line); border-radius: 7px; margin-bottom: 6px; cursor: pointer; }
.print-side .radio.on { border-color: var(--accent); background: var(--accent-soft); }
.print-side .radio small { display: block; color: var(--ink-3); }
```

- [ ] **Step 5: Run everything**

Run: `npm test`
Expected: the 7 print-sidebar checks PASS; print-direct PASSes again; all other checks PASS; `All 8 test files passed`.

- [ ] **Step 6: Look at it**

Window screenshots (scratch `desktopCapturer` script): the print screen closed, and with the Layout dropdown open. Compare with mockup D: big dropdowns with green pictures, explanation lines, 3×3 pad, Printer Properties link, preview filling the right side. Fix spacing by eye if needed, then re-run `npm test`.

- [ ] **Step 7: Commit**

```bash
git add tests/print-sidebar.test.js tests/print-direct.test.js src/print.js src/app.css
git commit -m "feat: Publisher-style print column with big dropdowns and a 3x3 position pad

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: README and final check

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README**

Replace:

```markdown
- **Print** (Ctrl+P), like Publisher:
  - Pick the printer in the dialog; **Print** sends straight to it (**Properties** opens the printer's own settings). The last printer is remembered.
```

with:

```markdown
- **Print** (Ctrl+P), like Publisher: the print screen fills the window; each setting is a big dropdown
  (printer, pages, layout, paper, orientation) with the preview beside it
  - Pick the printer; **Print** sends straight to it (**Printer Properties** opens the printer's own settings). The last printer is remembered.
```

Replace:

```markdown
  - *One per sheet, at a position*: drag the card on the A4 preview or type Left/Top in mm
```

with:

```markdown
  - *One per sheet, at a position*: drag the card on the A4 preview, type Left/Top in mm, or click the 3×3 pad
```

- [ ] **Step 2: Full run**

Run: `npm test`
Expected: `All 8 test files passed`, no FAIL lines.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README for the Publisher-style print screen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
