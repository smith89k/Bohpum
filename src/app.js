// Bohpum – editor
import { newDoc, newPage, makeObject, uid, clone, round2, bbox, corners, PAGE_PRESETS, DEFAULT_FONT } from './model.js';
import { renderObject, renderPage, fixLineHeights } from './render.js';
import { RENDER_CSS } from './renderCss.js';
import { docFromFodg, bpumText, withDefaults } from './docfile.js';
import * as TE from './textedit.js';
import { openPrintDialog, buildOutputHtml } from './print.js';
import { parseList, fieldHtml, fieldsIn, ticked, fillPage, mergedDoc } from './merge.js';
import { sheetBox, photoBox, peopleBox, problemsBox, renderMailBar, mailMenuState } from './mailings.js';

const api = window.api;
const PXMM = 96 / 25.4;
const $ = (id) => document.getElementById(id);
const ZOOMS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 5, 6, 8];

const S = {
  doc: newDoc(210, 297), path: null, dirty: false, page: 0, master: false,
  sel: new Set(), tool: 'select', zoom: 1, editing: null, justCreated: null,
  hist: [], hi: -1, mail: null, // mail: null | { list, at, preview, photos, asking, error } (not saved; src/mailings.js)
   showGuides: true, settings: {}, savedRange: null, clip: null, space: false
};
window.__bohpum = S; // handy for debugging

// ---------------------------------------------------------------- icons
const ICONS = {
  new: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', // icons as in Sastra PDF
  save: 'M6 4h10l4 4v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 4v4h7V4M8 20v-5h8v5',
  max: 'M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 9V8h1M16 9V8h-1M8 15v1h1M16 15v1h-1',
  sys: 'M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 20h8M12 16v4',
  sun: 'M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  eyedropper: 'M14.5 4.5l5 5M17 2.5a2.1 2.1 0 0 1 3 3L17.5 8 16 6.5zM15.5 8.5l-9 9L4 20l2.5-2.5M6.5 17.5L4.5 19.5M12.5 5.5l6 6',
  undo: 'M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
  redo: 'M15 14l5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
  select: 'M6 3l12 9-5.5 1.2L15 19l-2.4 1.2-2.6-5.9L6 18z',
  text: 'M5 7V5h14v2M12 5v14M9 19h6',
  rect: 'M4 6h16v12H4z',
  ellipse: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z',
  line: 'M5 19L19 5',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2.5-2.5L20 17M15.5 9.5h.01',
  front: 'M9 9h11v11H9zM4 4h11v3M4 4v11h3',
  back: 'M4 4h11v11H4zM9 20h11V9h-3',
  group: 'M3 3h3M18 3h3v3M21 18v3h-3M6 21H3v-3M7 7h6v6H7zM11 11h6v6h-6z',
  ungroup: 'M5 5h7v7H5zM12 12h7v7h-7z',
  plus: 'M12 5v14M5 12h14',
  // mail merge toolbar
  mlist: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 9.5h16M4 14.5h16M9.5 4v16"/>',
  people: '<circle cx="9" cy="8.5" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.8a3 3 0 0 1 0 5.4M17 13.6a5.5 5.5 0 0 1 3.5 5.4"/>',
  field: 'M9.5 7l-4.5 5 4.5 5M14.5 7l4.5 5-4.5 5',
  photo: '<rect x="4.5" y="3" width="15" height="18" rx="1.5"/><circle cx="12" cy="10" r="3"/><path d="M7.5 18a4.5 4.5 0 0 1 9 0"/>',
  eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  chevLeft: 'M15 6l-6 6 6 6', chevRight: 'M9 6l6 6-6 6', chevDown: 'M7 10l5 5 5-5',
  remove: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M9 9l6 6M15 9l-6 6"/>',
  dupPage: 'M9 7h10v14H9zM5 17V3h10',
  // right panel
  ordFront: 'M5 4h14M12 20V8M7 13l5-5 5 5', ordFwd: 'M12 19V5M7 10l5-5 5 5',
  ordBwd: 'M12 5v14M7 14l5 5 5-5', ordBack: 'M5 20h14M12 4v12M7 11l5 5 5-5',
  alL: 'M4 3v18M8 7h11v4H8zM8 14h6v4H8z', alC: 'M12 3v18M6 7h12v4H6zM8.5 14h7v4h-7z', alR: 'M20 3v18M5 7h11v4H5zM10 14h6v4h-6z',
  alT: 'M3 4h18M7 8h4v11H7zM14 8h4v6h-4z', alM: 'M3 12h18M7 6h4v12H7zM14 8.5h4v7h-4z', alB: 'M3 20h18M7 5h4v11H7zM14 10h4v6h-4z',
  distH: 'M4 3v18M20 3v18M10 7h4v10h-4z', distV: 'M3 4h18M3 20h18M7 10h10v4H7z',
  portrait: 'M7 3h10v18H7z', landscape: 'M3 7h18v10H3z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z', unlock: 'M7 11V8a5 5 0 0 1 9.6-2M5 11h14v10H5z',
  minus: 'M5 12h14',
  chevUp: 'M6 15l6-6 6 6', // a right panel heading's fold arrow (up = open)
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  print: 'M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z',
  al: 'M4 6h16M4 10h10M4 14h16M4 18h10', ac: 'M4 6h16M7 10h10M4 14h16M7 18h10',
  ar: 'M4 6h16M10 10h10M4 14h16M10 18h10', aj: 'M4 6h16M4 10h16M4 14h16M4 18h16',
  vt: 'M4 4h16M8 9h8M8 13h8', vm: 'M8 9h8M8 15h8M4 12h2M18 12h2', vb: 'M4 20h16M8 11h8M8 15h8',
  // right panel headings (as in Sastra PDF's Tools panel); `pages` is Sastra PDF's own. Markup, not one path:
  pages: '<rect x="4" y="5" width="11" height="15" rx="1.5"/><path d="M8 3h10.5A1.5 1.5 0 0 1 20 4.5V17"/>',
  shapes: '<rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/><circle cx="15.5" cy="15.5" r="5"/>',
  fill: '<path d="M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z"/>',
  opacity: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" opacity=".4"/>',
  margins: '<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 3v18M16 3v18M4 7h16M4 17h16" stroke-dasharray="1.5 2.5"/>',
  bg: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12l8-8M4 19.5L19.5 4M11.5 20L20 11.5"/>'
};
const icon = (n) => { const v = ICONS[n] || ''; return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${v.startsWith('<') ? v : `<path d="${v}"/>`}</svg>`; };

// ---------------------------------------------------------------- helpers
const objs = () => S.master ? S.doc.master.objects : S.doc.pages[S.page].objects;
const getObj = (id) => objs().find(o => o.id === id);
const selObjs = () => objs().filter(o => S.sel.has(o.id));
const ptOf = (mm) => Math.round(mm * 72 / 25.4 * 100) / 100;
const mmOfPt = (pt) => Math.round(pt * 25.4 / 72 * 10000) / 10000;
const fmt = (n) => (Math.round(n * 100) / 100).toString();
let pageEl = null;

function toast(msg, ms = 3200) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

function pxPerMm() { return pageEl ? pageEl.getBoundingClientRect().width / S.doc.pageW : PXMM * S.zoom; }
function mmFromEvent(e) {
  const r = pageEl.getBoundingClientRect(), k = r.width / S.doc.pageW;
  return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
}

// ---------------------------------------------------------------- history / dirty
function snapshot() { return JSON.stringify(S.doc); }
function resetHistory() { S.hist = [snapshot()]; S.hi = 0; updateUndo(); }
function commit() {
  const s = snapshot();
  if (s === S.hist[S.hi]) return;
  S.hist = S.hist.slice(0, S.hi + 1); S.hist.push(s);
  if (S.hist.length > 150) S.hist.shift();
  S.hi = S.hist.length - 1;
  setDirty(true); scheduleThumbs(); updateUndo();
}
function restore(i) {
  const was = mergeKey(); // Select List undone / redone: the list follows
  S.hi = i; S.doc = JSON.parse(S.hist[i]);
  S.page = Math.min(S.page, S.doc.pages.length - 1);
  const ids = new Set(objs().map(o => o.id));
  S.sel = new Set([...S.sel].filter(id => ids.has(id)));
  if (mergeKey() !== was) { S.mail = null; if (S.doc.merge) loadMailList(false); }
  setDirty(true); renderAll(); updateUndo();
}
function undo() { if (S.editing) return finishEditing(); if (S.hi > 0) restore(S.hi - 1); }
function redo() { if (S.hi < S.hist.length - 1) restore(S.hi + 1); }
function updateUndo() { $('b-undo').disabled = S.hi <= 0; $('b-redo').disabled = S.hi >= S.hist.length - 1; }
function setDirty(v) { S.dirty = v; api.setDirty(v); updateTitle(); }
function updateTitle() {
  const t = `${S.doc.name || 'Untitled'}${S.dirty ? ' •' : ''}`;
  $('doc-title').textContent = t;
  api.setTitle(`${t} – Bohpum`);
}

// ---------------------------------------------------------------- rendering
function renderAll() { renderStage(); renderThumbs(); renderProps(); updateTextbar(); updateStatus(); updateTools(); renderBar(); syncMailMenu(); }

function renderStage() {
  const holder = $('page-holder');
  holder.innerHTML = '';
  const d = viewDoc(), page = d.pages[S.page];
  const pg = S.master
    ? renderPage(d, { objects: d.master.objects, bg: page.bg }, { includeMaster: false })
    : renderPage(d, page);
  pg.classList.add('editor');
  if (S.master) pg.classList.add('master-mode');
  pg.style.zoom = S.zoom;
  pg.querySelectorAll('.kcontent > .kobj').forEach(el => {
    const o = getObj(el.dataset.id);
    if (!o) return void el.classList.add('from-master'); // Preview puts the filled master objects in the page's layer
    markObjEl(el, o);
  });
  markMissingFields(pg);
  const guides = document.createElement('div'); guides.id = 'guides'; pg.append(guides);
  const ov = document.createElement('div'); ov.id = 'overlay'; pg.append(ov);
  holder.append(pg);
  pageEl = pg;
  renderGuides();
  fixLineHeights(pg);
  renderOverlay();
  drawRulers();
}

// a field whose column is not in the list shows «Name ?» (the mark is only on screen, never saved)
function markMissingFields(root) {
  const cols = S.mail && S.mail.list && S.mail.list.columns;
  root.querySelectorAll('.kt [data-field="merge"]').forEach(s => s.toggleAttribute('data-missing', !!cols && !cols.includes(s.dataset.col)));
}
// The editor's marks on a frame: locked; typein = a text box (the I-beam inside, a click types there); and empty-frame =
// no line, fill or shape (a text box without a border: light dots under the mouse and while it is moved, app.css)
function markObjEl(el, o) {
  if (o.locked) el.classList.add('locked');
  if (typesIn(o)) el.classList.add('typein');
  if (o.type === 'box' && o.shape === 'none' && (!o.fill || o.fill === 'none') && (!o.stroke || o.stroke === 'none')) el.classList.add('empty-frame');
}

function updateObjEl(o) {
  const old = pageEl.querySelector(`.kcontent > .kobj[data-id="${o.id}"]`);
  if (!old) return;
  if (o.type === 'box' && old.style.width === o.w + 'mm' && old.style.height === o.h + 'mm' && !old.querySelector('svg')) {
    old.style.left = o.x + 'mm'; old.style.top = o.y + 'mm'; old.style.transform = o.rot ? `rotate(${o.rot}deg)` : '';
    return;
  }
  const el = renderObject(shownObj(o));
  el.className = old.className;
  old.replaceWith(el);
  fixLineHeights(el);
}

function renderGuides() {
  const g = pageEl.querySelector('#guides'); g.innerHTML = '';
  if (!S.showGuides) return;
  const k = pxPerMm(), px = 1 / k;
  const m = S.doc.margins;
  if (m && (m.t || m.r || m.b || m.l)) {
    const mg = document.createElement('div'); mg.className = 'mguide';
    Object.assign(mg.style, { left: m.l + 'mm', top: m.t + 'mm', right: m.r + 'mm', bottom: m.b + 'mm', borderWidth: px + 'mm' });
    g.append(mg);
  }
  S.doc.guides.v.forEach((x, i) => { const e = document.createElement('div'); e.className = 'uguide v'; e.dataset.axis = 'v'; e.dataset.i = i; e.style.left = (x - 3 * px) + 'mm'; e.style.width = 6 * px + 'mm'; g.append(e); });
  S.doc.guides.h.forEach((y, i) => { const e = document.createElement('div'); e.className = 'uguide h'; e.dataset.axis = 'h'; e.dataset.i = i; e.style.top = (y - 3 * px) + 'mm'; e.style.height = 6 * px + 'mm'; g.append(e); });
}

function renderOverlay() {
  if (!pageEl) return;
  const ov = pageEl.querySelector('#overlay');
  ov.innerHTML = '';
  const sel = selObjs();
  if (!sel.length) return;
  const k = pxPerMm(), hs = 8 / k, lw = 1 / k;
  const single = sel.length === 1 ? sel[0] : null;
  const grouped = sel.length > 1 && sel.every(o => o.groupId && o.groupId === sel[0].groupId);
  const addResizeHandles = (b, w, h) => {
    const pos = { nw: [0, 0], n: [50, 0], ne: [100, 0], e: [100, 50], se: [100, 100], s: [50, 100], sw: [0, 100], w: [0, 50] };
    const cur = { nw: 'nwse', se: 'nwse', ne: 'nesw', sw: 'nesw', n: 'ns', s: 'ns', e: 'ew', w: 'ew' };
    for (const key in pos) {
      if (h * k < 24 && (key === 'e' || key === 'w')) continue;
      if (w * k < 24 && (key === 'n' || key === 's')) continue;
      const el = document.createElement('div'); el.className = 'handle'; el.dataset.h = key;
      Object.assign(el.style, { left: `calc(${pos[key][0]}% - ${hs / 2}mm)`, top: `calc(${pos[key][1]}% - ${hs / 2}mm)`, width: hs + 'mm', height: hs + 'mm', borderWidth: 1.5 * lw + 'mm', cursor: cur[key] + '-resize' });
      b.append(el);
    }
  };
  for (const o of sel) {
    if (o.type === 'line') {
      if (single && !o.locked && !S.editing) {
        const pts = o.dir === 'up' ? [[o.x, o.y + o.h], [o.x + o.w, o.y]] : [[o.x, o.y], [o.x + o.w, o.y + o.h]];
        pts.forEach(([x, y], i) => {
          const h = document.createElement('div'); h.className = 'handle ep'; h.dataset.h = 'p' + (i + 1);
          Object.assign(h.style, { left: (x - hs / 2) + 'mm', top: (y - hs / 2) + 'mm', width: hs + 'mm', height: hs + 'mm', borderWidth: 1.5 * lw + 'mm' });
          ov.append(h);
        });
      } else {
        const b = document.createElement('div'); b.className = 'sel-box multi';
        Object.assign(b.style, { left: o.x + 'mm', top: o.y + 'mm', width: Math.max(o.w, lw) + 'mm', height: Math.max(o.h, lw) + 'mm', outlineWidth: lw + 'mm' });
        ov.append(b);
      }
      continue;
    }
    const b = document.createElement('div');
    b.className = 'sel-box' + (sel.length > 1 ? (grouped ? ' group' : ' multi') : '') + (o.locked ? ' locked' : '');
    Object.assign(b.style, { left: o.x + 'mm', top: o.y + 'mm', width: o.w + 'mm', height: o.h + 'mm', outlineWidth: lw + 'mm', transform: o.rot ? `rotate(${o.rot}deg)` : '' });
    ov.append(b);
    if (single && !o.locked && !S.editing) {
      addResizeHandles(b, o.w, o.h);
      const stem = document.createElement('div'); stem.className = 'rot-stem';
      Object.assign(stem.style, { top: -hs * 2.2 + 'mm', height: hs * 2.2 + 'mm', width: lw + 'mm' }); b.append(stem);
      const r = document.createElement('div'); r.className = 'handle rot'; r.dataset.h = 'rot'; r.title = 'Rotate (Shift = 15° steps)';
      Object.assign(r.style, { left: `calc(50% - ${hs * 0.6}mm)`, top: -(hs * 2.2 + hs * 0.6) + 'mm', width: hs * 1.2 + 'mm', height: hs * 1.2 + 'mm', borderWidth: 1.5 * lw + 'mm' });
      b.append(r);
    }
  }
  if (sel.length > 1) {
    const bb = bbox(sel);
    const b = document.createElement('div'); b.className = 'sel-box multi';
    Object.assign(b.style, { left: bb.x + 'mm', top: bb.y + 'mm', width: bb.w + 'mm', height: bb.h + 'mm', outlineWidth: lw + 'mm', outlineOffset: 2 * lw + 'mm' });
    // a whole group resizes from its outer box, like one object
    if (grouped && !S.editing && !sel.some(o => o.locked)) addResizeHandles(b, bb.w, bb.h);
    ov.append(b);
  }
}

function showSnapLines(lines) {
  const ov = pageEl.querySelector('#overlay');
  ov.querySelectorAll('.snapline').forEach(e => e.remove());
  const lw = 1 / pxPerMm();
  for (const l of lines || []) {
    const e = document.createElement('div'); e.className = 'snapline';
    if (l.axis === 'x') Object.assign(e.style, { left: (l.v - lw / 2) + 'mm', top: '-1000mm', width: lw + 'mm', height: '3000mm' });
    else Object.assign(e.style, { top: (l.v - lw / 2) + 'mm', left: '-1000mm', height: lw + 'mm', width: '3000mm' });
    ov.append(e);
  }
}

// ---------------------------------------------------------------- Pages panel width: drag its right edge
const PAGES_W = 180, PAGES_MIN = 140, PAGES_MAX = 400;
let pagesWidth = PAGES_W;
function setPagesWidth(w) { // null: the normal width
  pagesWidth = w == null ? PAGES_W : Math.round(Math.max(PAGES_MIN, Math.min(PAGES_MAX, w)));
  if (w == null) document.documentElement.style.removeProperty('--pages-w');
  else document.documentElement.style.setProperty('--pages-w', pagesWidth + 'px');
}
function savePagesWidth(w) { api.setSettings({ pagesW: w }).then((s) => { if (s) S.settings = s; }, () => {}); }
function startPagesResize(e) {
  if (e.button !== 0) return;
  e.preventDefault();
  const sx = e.clientX, w0 = pagesWidth;
  document.body.classList.add('pages-resizing');
  dragLoop(e, (ev) => { setPagesWidth(w0 + ev.clientX - sx); drawRulers(); scheduleThumbs(); }, () => {
    document.body.classList.remove('pages-resizing');
    if (pagesWidth === w0) return;
    clearTimeout(thumbTimer); renderThumbs(); savePagesWidth(pagesWidth);
  });
}
function resetPagesWidth() { setPagesWidth(null); drawRulers(); renderThumbs(); savePagesWidth(null); }

// ---------------------------------------------------------------- thumbnails
let thumbTimer = null;
function scheduleThumbs() { clearTimeout(thumbTimer); thumbTimer = setTimeout(renderThumbs, 250); }
function renderThumbs() {
  if (document.body.classList.contains('page-dragging')) return scheduleThumbs(); // not under a page being dragged
  const list = $('page-list');
  list.innerHTML = '';
  const W = S.doc.pageW, H = S.doc.pageH, v = viewDoc();
  const tw = (pagesWidth - 50) / 130 * Math.min(130, 150 * W / H), th = tw * H / W; // they fill the panel's width
  const mk = (label, page, active, isMaster, onClick) => {
    const t = document.createElement('div'); t.className = 'pthumb' + (active ? ' active' : '') + (isMaster ? ' master' : '');
    const box = document.createElement('div'); box.className = 'tw'; box.style.width = tw + 'px'; box.style.height = th + 'px';
    const pg = isMaster ? renderPage(v, { objects: v.master.objects }, { includeMaster: false }) : renderPage(v, page);
    pg.style.zoom = tw / (W * PXMM);
    box.append(pg);
    const n = document.createElement('div'); n.className = 'pn'; n.textContent = label;
    t.append(box, n); t.onclick = onClick;
    t.dataset.page = isMaster ? 'master' : String(v.pages.indexOf(page));
    t.title = isMaster ? 'Master page' : `Page ${label} – right-click for more`;
    list.append(t);
    fixLineHeights(pg);
  };
  // The master page only shows here while it is being edited (Ctrl+M / "Edit master page"), so a
  // one-page card doesn't look like it has two pages
  if (S.master) mk('Master page', null, true, true, () => setMaster(false));
  v.pages.forEach((p, i) => mk(String(i + 1), p, !S.master && i === S.page, false, () => goPage(i)));
  $('page-count').textContent = S.doc.pages.length;
}

// Right-click on the page list: the page under the mouse becomes the current page, then the menu acts on it
function openPageCtx(e) {
  e.preventDefault();
  finishEditing();
  const t = e.target.closest('.pthumb');
  if (t && t.dataset.page === 'master') return showMenu(e, [['Back to pages', 'toggle-master', 'Ctrl+M', true]]);
  if (t && (S.master || +t.dataset.page !== S.page)) goPage(+t.dataset.page);
  const n = S.doc.pages.length, i = S.page, on = !!t;
  showMenu(e, [
    ['Insert page after', 'page-add', '', true], ['Duplicate page', 'page-duplicate', '', on], '-',
    ['Move up', 'page-up', '', on && i > 0], ['Move down', 'page-down', '', on && i < n - 1], '-',
    ['Delete page', 'page-delete', '', on && n > 1], '-',
    [S.master ? 'Back to pages' : 'Edit master page', 'toggle-master', 'Ctrl+M', true]
  ]);
}

// Drag a page in the list to move it: a drop line shows where it lands, the list scrolls near its top or bottom
// edge, Esc cancels. The moved page becomes the current page (one undo step). The master page stays put.
let pageDragClick = false; // the click that ends a drag must not open the page under the mouse
function startPageDrag(e) {
  const t = e.target.closest('.pthumb');
  if (e.button !== 0 || !t || t.dataset.page === 'master') return;
  const list = $('page-list'), from = +t.dataset.page, sx = e.clientX, sy = e.clientY;
  let dragging = false, cancelled = false, to = from, y = sy, timer = null;
  const line = document.createElement('div'); line.className = 'page-drop'; line.hidden = true;
  const place = () => {
    const ts = [...list.querySelectorAll('.pthumb:not(.master)')];
    to = ts.findIndex(x => { const b = x.getBoundingClientRect(); return y < b.top + b.height / 2; });
    if (to < 0) to = ts.length;
    line.hidden = to === from || to === from + 1; // its own place: nothing would change
    const last = ts[ts.length - 1];
    line.style.top = (to < ts.length ? ts[to].offsetTop - 8 : last.offsetTop + last.offsetHeight + 8) - 1.5 + 'px'; // mid-gap (gap 16)
  };
  const edgeScroll = () => {
    const b = list.getBoundingClientRect(), zone = 36;
    const d = y < b.top + zone ? y - (b.top + zone) : y > b.bottom - zone ? y - (b.bottom - zone) : 0;
    if (d) { list.scrollTop += Math.max(-12, Math.min(12, d / 3)); place(); }
  };
  const stop = () => { clearInterval(timer); line.remove(); t.classList.remove('dragged'); document.body.classList.remove('page-dragging'); window.removeEventListener('keydown', key, true); };
  const key = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); cancelled = true; stop(); } };
  dragLoop(e, (ev) => {
    y = ev.clientY;
    if (cancelled) return;
    if (!dragging) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 5) return;
      dragging = true; finishEditing();
      t.classList.add('dragged'); document.body.classList.add('page-dragging'); list.append(line);
      window.addEventListener('keydown', key, true);
      timer = setInterval(edgeScroll, 16);
    }
    place();
  }, () => {
    if (!dragging) return;
    pageDragClick = true; setTimeout(() => { pageDragClick = false; });
    if (cancelled) return;
    stop();
    if (to === from || to === from + 1) return;
    const a = S.doc.pages, [p] = a.splice(from, 1), j = to > from ? to - 1 : to;
    a.splice(j, 0, p);
    S.master = false; S.page = j; S.sel.clear();
    commit(); renderAll();
  });
}

function goPage(i) {
  finishEditing();
  S.master = false; S.page = Math.max(0, Math.min(S.doc.pages.length - 1, i)); S.sel.clear();
  renderAll();
}
function setMaster(v) {
  finishEditing();
  S.master = v; S.sel.clear(); renderAll();
  toast(v ? 'Editing the master page – items here appear on every page.' : 'Back to the pages.');
}

// ---------------------------------------------------------------- rulers
let mouseMm = null;
function drawRulers() {
  for (const id of ['ruler-h', 'ruler-v']) {
    const c = $(id);
    const horiz = id === 'ruler-h';
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (!w || !h || !pageEl) continue;
    c.width = w * dpr; c.height = h * dpr;
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const pr = pageEl.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const k = pr.width / S.doc.pageW;
    const origin = horiz ? pr.left - cr.left : pr.top - cr.top;
    const len = horiz ? w : h;
    // page extent
    g.fillStyle = cssVar('--ruler-page');
    if (horiz) g.fillRect(origin, 0, S.doc.pageW * k, h); else g.fillRect(0, origin, w, S.doc.pageH * k);
    // selection band
    const sel = selObjs();
    if (sel.length) {
      const bb = bbox(sel);
      g.fillStyle = 'rgba(29,111,216,.14)';
      if (horiz) g.fillRect(origin + bb.x * k, 0, bb.w * k, h); else g.fillRect(0, origin + bb.y * k, w, bb.h * k);
    }
    const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
    const major = steps.find(s => s * k >= 55) || 1000;
    const minor = major * k / 10 >= 4 ? major / 10 : major * k / 5 >= 4 ? major / 5 : major / 2;
    g.strokeStyle = cssVar('--ink-3'); g.fillStyle = cssVar('--ink-2'); g.lineWidth = 1;
    g.font = '10px Segoe UI, sans-serif';
    const startMm = Math.floor(-origin / k / minor) * minor, endMm = (len - origin) / k;
    g.beginPath();
    for (let v = startMm; v <= endMm; v += minor) {
      const p = Math.round(origin + v * k) + 0.5;
      const isMajor = Math.abs(v / major - Math.round(v / major)) < 1e-6;
      const half = !isMajor && Math.abs(v / (major / 2) - Math.round(v / (major / 2))) < 1e-6;
      const tl = isMajor ? 22 : half ? 9 : 5;
      if (horiz) { g.moveTo(p, 22); g.lineTo(p, 22 - tl); } else { g.moveTo(22, p); g.lineTo(22 - tl, p); }
      if (isMajor) {
        const label = String(Math.round(v));
        if (horiz) g.fillText(label, p + 3, 10);
        else { g.save(); g.translate(10, p + 3); g.rotate(-Math.PI / 2); g.textAlign = 'right'; g.fillText(label, 0, 0); g.restore(); }
      }
    }
    g.stroke();
    if (mouseMm) {
      g.strokeStyle = cssVar('--accent'); g.beginPath();
      const p = Math.round(origin + (horiz ? mouseMm.x : mouseMm.y) * k) + 0.5;
      if (horiz) { g.moveTo(p, 0); g.lineTo(p, 22); } else { g.moveTo(0, p); g.lineTo(22, p); }
      g.stroke();
    }
  }
}

// ---------------------------------------------------------------- zoom
function setZoom(z, anchor) {
  z = Math.max(0.1, Math.min(16, z));
  const ws = $('workspace');
  let before = null;
  if (anchor && pageEl) before = mmFromEvent(anchor);
  S.zoom = z;
  if (pageEl) pageEl.style.zoom = z;
  if (before) {
    const r = pageEl.getBoundingClientRect(), k = r.width / S.doc.pageW;
    ws.scrollLeft += (r.left + before.x * k) - anchor.clientX;
    ws.scrollTop += (r.top + before.y * k) - anchor.clientY;
  }
  renderGuides(); renderOverlay(); drawRulers(); updateZoomSel(); updateStatus();
}
function zoomStep(dir) {
  const cur = S.zoom;
  const next = dir > 0 ? ZOOMS.find(z => z > cur + 1e-3) || cur * 1.25 : [...ZOOMS].reverse().find(z => z < cur - 1e-3) || cur / 1.25;
  const ws = $('workspace').getBoundingClientRect();
  setZoom(next, { clientX: ws.left + ws.width / 2, clientY: ws.top + ws.height / 2 });
}
function zoomFit() {
  const ws = $('workspace');
  const z = Math.min((ws.clientWidth - 80) / (S.doc.pageW * PXMM), (ws.clientHeight - 80) / (S.doc.pageH * PXMM));
  setZoom(Math.max(0.1, Math.floor(z * 100) / 100));
  requestAnimationFrame(() => {
    const r = pageEl.getBoundingClientRect(), w = ws.getBoundingClientRect();
    ws.scrollLeft += (r.left + r.width / 2) - (w.left + w.width / 2);
    ws.scrollTop += (r.top + r.height / 2) - (w.top + w.height / 2);
    drawRulers();
  });
}
function updateZoomSel() {
  const s = $('zoom-sel');
  const pct = Math.round(S.zoom * 100);
  s.innerHTML = [...new Set([...ZOOMS.map(z => Math.round(z * 100)), pct])].sort((a, b) => a - b)
    .map(p => `<option value="${p}" ${p === pct ? 'selected' : ''}>${p}%</option>`).join('') + '<option value="fit">Fit page</option>';
}

// ---------------------------------------------------------------- snapping
function snapTargets(exclude) {
  const d = S.doc, m = d.margins || { t: 0, r: 0, b: 0, l: 0 };
  const xs = [0, d.pageW / 2, d.pageW, m.l, d.pageW - m.r, ...d.guides.v];
  const ys = [0, d.pageH / 2, d.pageH, m.t, d.pageH - m.b, ...d.guides.h];
  for (const o of objs()) {
    if (exclude.has(o.id)) continue;
    const b = bbox([o]);
    xs.push(b.x, b.x + b.w / 2, b.x + b.w); ys.push(b.y, b.y + b.h / 2, b.y + b.h);
  }
  return { xs, ys };
}
function snapValue(cands, targets, thr) {
  let best = null;
  for (const c of cands) for (const t of targets) {
    const d = t - c;
    if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, v: t };
  }
  return best;
}

// ---------------------------------------------------------------- pointer interaction
function dragLoop(e, onMove, onUp) {
  const move = (ev) => onMove(ev);
  const up = (ev) => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); onUp && onUp(ev); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
}

function onWorkspaceDown(e) {
  if (!pageEl) return;
  closeCtx();
  const t = e.target;
  if (e.button === 1 || (e.button === 0 && S.space)) return startPan(e);
  if (e.button !== 0) return;
  const ae = document.activeElement;
  if (ae && ae !== document.body && !pageEl.contains(ae) && ae.blur) ae.blur();
  if (t.classList.contains('handle')) { e.preventDefault(); return startHandle(e, t.dataset.h); }
  if (t.classList.contains('uguide')) { e.preventDefault(); return startGuideDrag(e, t.dataset.axis, +t.dataset.i); }
  if (S.editing) {
    const ed = pageEl.querySelector('.kobj.editing');
    if (ed && ed.contains(t)) return;
    finishEditing();
  }
  const m = mmFromEvent(e);
  if (S.tool !== 'select') { e.preventDefault(); return startCreate(e, m); }
  const objEl = t.closest('.kcontent > .kobj');
  if (objEl) {
    const o = getObj(objEl.dataset.id);
    // as in Publisher: a click in a text box (not on its edge) puts the typing cursor there
    // (in the empty part below the text, the browser would take the focus away: the cursor goes to the end instead)
    if (typesIn(o) && !e.shiftKey && !e.ctrlKey && !onEdge(o, m)) {
      if (!t.closest('.kt')) e.preventDefault();
      return startEditing(o.id, e);
    }
    e.preventDefault();
    if (!o) return;
    const ids = o.groupId && !e.ctrlKey ? objs().filter(x => x.groupId === o.groupId).map(x => x.id) : [o.id];
    if (e.shiftKey) {
      const has = S.sel.has(o.id);
      ids.forEach(id => has ? S.sel.delete(id) : S.sel.add(id));
      selectionChanged();
      return;
    }
    if (!S.sel.has(o.id)) { S.sel = new Set(ids); selectionChanged(); }
    if (!o.locked) startMove(e, m);
    return;
  }
  e.preventDefault();
  if (!e.shiftKey && S.sel.size) { S.sel.clear(); selectionChanged(); }
  startMarquee(e, m);
}

// A text box shows the I-beam inside and the move arrow on its edge (6 screen px, along its own sides when turned)
const EDGE_PX = 6;
const typesIn = (o) => !!o && o.type === 'box' && o.shape === 'none' && !o.locked && !o.groupId;
function onEdge(o, m) {
  const a = (o.rot || 0) * Math.PI / 180, dx = m.x - (o.x + o.w / 2), dy = m.y - (o.y + o.h / 2);
  const lx = dx * Math.cos(a) + dy * Math.sin(a), ly = -dx * Math.sin(a) + dy * Math.cos(a), band = EDGE_PX / pxPerMm();
  return o.w / 2 - Math.abs(lx) < band || o.h / 2 - Math.abs(ly) < band;
}
let edgeEl = null;
function onWorkspaceHover(e) {
  if (e.buttons || !pageEl) return;
  const el = S.tool === 'select' && e.target.closest ? e.target.closest('.kcontent > .kobj.typein') : null;
  if (edgeEl && edgeEl !== el) edgeEl.classList.remove('edge');
  edgeEl = el;
  if (el) { const o = getObj(el.dataset.id); el.classList.toggle('edge', !!o && onEdge(o, mmFromEvent(e))); }
}

function selectionChanged() { renderOverlay(); renderProps(); updateTextbar(); updateStatus(); drawRulers(); syncMailMenu(); }

function startPan(e) {
  e.preventDefault();
  const ws = $('workspace'), sx = e.clientX, sy = e.clientY, sl = ws.scrollLeft, st = ws.scrollTop;
  ws.style.cursor = 'grabbing';
  dragLoop(e, (ev) => { ws.scrollLeft = sl - (ev.clientX - sx); ws.scrollTop = st - (ev.clientY - sy); drawRulers(); }, () => { ws.style.cursor = ''; });
}

function startMove(e, m0) {
  const k = pxPerMm();
  let moving = selObjs().filter(o => !o.locked);
  let orig = moving.map(o => ({ o, x: o.x, y: o.y }));
  let moved = false, copied = false;
  const sx = e.clientX, sy = e.clientY;
  const bb0 = bbox(moving);
  let targets = null;
  dragLoop(e, (ev) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
    if (!moved && ev.ctrlKey && !copied) {
      // Ctrl+drag = copy
      const copies = cloneObjects(moving);
      objs().push(...copies);
      copies.forEach(c => { const el = renderObject(shownObj(c)); markObjEl(el, c); pageEl.querySelector('.kcontent').append(el); });
      S.sel = new Set(copies.map(c => c.id));
      moving = copies; orig = moving.map(o => ({ o, x: o.x, y: o.y })); copied = true;
    }
    if (!targets) targets = snapTargets(new Set(moving.map(o => o.id)));
    if (!moved) moving.forEach(o => { const el = pageEl.querySelector(`.kcontent > .kobj[data-id="${o.id}"]`); if (el) el.classList.add('moving'); });
    moved = true;
    const m = mmFromEvent(ev);
    let dx = m.x - m0.x, dy = m.y - m0.y;
    if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    const lines = [];
    if (!ev.altKey) {
      const thr = 6 / k;
      const b = { x: bb0.x + dx, y: bb0.y + dy, w: bb0.w, h: bb0.h };
      const sxv = snapValue([b.x, b.x + b.w / 2, b.x + b.w], targets.xs, thr);
      const syv = snapValue([b.y, b.y + b.h / 2, b.y + b.h], targets.ys, thr);
      if (sxv) { dx += sxv.d; lines.push({ axis: 'x', v: sxv.v }); }
      if (syv) { dy += syv.d; lines.push({ axis: 'y', v: syv.v }); }
    }
    for (const r of orig) { r.o.x = round2(r.x + dx); r.o.y = round2(r.y + dy); updateObjEl(r.o); }
    renderOverlay(); showSnapLines(lines); drawRulers(); updateStatus();
  }, () => {
    showSnapLines([]);
    pageEl.querySelectorAll('.kobj.moving').forEach(el => el.classList.remove('moving'));
    if (moved) { commit(); renderProps(); }
  });
}

function startHandle(e, h) {
  const sel = selObjs();
  if (allSameGroup(sel)) return startGroupResize(e, h, sel);
  const o = sel[0];
  if (!o) return;
  const k = pxPerMm();
  const o0 = { ...o };
  const targets = snapTargets(new Set([o.id]));
  if (h === 'rot') {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    dragLoop(e, (ev) => {
      const m = mmFromEvent(ev);
      let a = Math.atan2(m.y - cy, m.x - cx) * 180 / Math.PI + 90;
      if (ev.shiftKey) a = Math.round(a / 15) * 15;
      else for (const s of [0, 90, 180, 270, 360, -90]) if (Math.abs(a - s) < 2) a = s;
      a = ((a + 180) % 360 + 360) % 360 - 180;
      o.rot = round2(a); updateObjEl(o); renderOverlay(); updateStatus();
    }, () => { commit(); renderProps(); });
    return;
  }
  if (h === 'p1' || h === 'p2') {
    const pts = o0.dir === 'up' ? [[o0.x, o0.y + o0.h], [o0.x + o0.w, o0.y]] : [[o0.x, o0.y], [o0.x + o0.w, o0.y + o0.h]];
    const fixed = h === 'p1' ? pts[1] : pts[0];
    dragLoop(e, (ev) => {
      let m = mmFromEvent(ev);
      if (ev.shiftKey) { // constrain to 45°
        const dx = m.x - fixed[0], dy = m.y - fixed[1], len = Math.hypot(dx, dy);
        const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        m = { x: fixed[0] + len * Math.cos(a), y: fixed[1] + len * Math.sin(a) };
      } else if (!ev.altKey) {
        const sxv = snapValue([m.x], targets.xs, 6 / k), syv = snapValue([m.y], targets.ys, 6 / k);
        if (sxv) m.x += sxv.d; if (syv) m.y += syv.d;
      }
      setLineFromPoints(o, fixed, [m.x, m.y]);
      updateObjEl(o); renderOverlay(); updateStatus();
    }, () => { commit(); renderProps(); });
    return;
  }
  const sxn = h.includes('w') ? -1 : h.includes('e') ? 1 : 0;
  const syn = h.includes('n') ? -1 : h.includes('s') ? 1 : 0;
  const a = (o0.rot || 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
  const c0 = { x: o0.x + o0.w / 2, y: o0.y + o0.h / 2 };
  const toLocal = (p) => { const dx = p.x - c0.x, dy = p.y - c0.y; return { x: dx * ca + dy * sa, y: -dx * sa + dy * ca }; };
  const ax = -sxn * o0.w / 2, ay = -syn * o0.h / 2; // anchor in local coords
  const minS = 1;
  dragLoop(e, (ev) => {
    const lm = toLocal(mmFromEvent(ev));
    let w = sxn ? Math.max(minS, (lm.x - ax) * sxn) : o0.w;
    let hh = syn ? Math.max(minS, (lm.y - ay) * syn) : o0.h;
    const keep = ev.shiftKey !== (o.type === 'image' && sxn && syn && !o.freeResize);
    if (keep && sxn && syn) { const s = Math.max(w / o0.w, hh / o0.h); w = o0.w * s; hh = o0.h * s; }
    let lcx = sxn ? ax + sxn * w / 2 : 0, lcy = syn ? ay + syn * hh / 2 : 0;
    let cx = c0.x + lcx * ca - lcy * sa, cy = c0.y + lcx * sa + lcy * ca;
    let nx = cx - w / 2, ny = cy - hh / 2;
    const lines = [];
    if (!o0.rot && !ev.altKey && !keep) {
      const thr = 6 / k;
      if (sxn) { const edge = sxn > 0 ? nx + w : nx; const sv = snapValue([edge], targets.xs, thr); if (sv) { if (sxn > 0) w += sv.d; else { nx += sv.d; w -= sv.d; } lines.push({ axis: 'x', v: sv.v }); } }
      if (syn) { const edge = syn > 0 ? ny + hh : ny; const sv = snapValue([edge], targets.ys, thr); if (sv) { if (syn > 0) hh += sv.d; else { ny += sv.d; hh -= sv.d; } lines.push({ axis: 'y', v: sv.v }); } }
    }
    o.x = round2(nx); o.y = round2(ny); o.w = round2(w); o.h = round2(hh);
    updateObjEl(o); renderOverlay(); showSnapLines(lines); updateStatus(); drawRulers();
  }, () => { showSnapLines([]); commit(); renderProps(); });
}

// Resizes a whole group from its outer box: every member keeps its share of the box (place and size).
// The opposite side stays put; Shift on a corner keeps the proportions (pictures keep them unless freeResize).
function startGroupResize(e, h, sel) {
  const k = pxPerMm();
  const b0 = bbox(sel), orig = sel.map(o => ({ o, cx: o.x + o.w / 2, cy: o.y + o.h / 2, w: o.w, h: o.h }));
  const targets = snapTargets(new Set(sel.map(o => o.id)));
  const sxn = h.includes('w') ? -1 : h.includes('e') ? 1 : 0;
  const syn = h.includes('n') ? -1 : h.includes('s') ? 1 : 0;
  const ax = sxn > 0 ? b0.x : b0.x + b0.w, ay = syn > 0 ? b0.y : b0.y + b0.h; // the sides that stay put
  const lockAspect = sel.some(o => o.type === 'image' && !o.freeResize);
  dragLoop(e, (ev) => {
    const m = mmFromEvent(ev), lines = [];
    let w = sxn ? Math.max(1, (m.x - ax) * sxn) : b0.w;
    let hh = syn ? Math.max(1, (m.y - ay) * syn) : b0.h;
    const keep = ev.shiftKey !== (lockAspect && sxn && syn);
    if (keep && sxn && syn) { const s = Math.max(w / b0.w, hh / b0.h); w = b0.w * s; hh = b0.h * s; }
    else if (!ev.altKey) {
      const thr = 6 / k;
      if (sxn) { const sv = snapValue([ax + sxn * w], targets.xs, thr); if (sv) { w += sxn * sv.d; lines.push({ axis: 'x', v: sv.v }); } }
      if (syn) { const sv = snapValue([ay + syn * hh], targets.ys, thr); if (sv) { hh += syn * sv.d; lines.push({ axis: 'y', v: sv.v }); } }
    }
    const fx = w / b0.w, fy = hh / b0.h;
    const nx = sxn < 0 ? ax - w : b0.x, ny = syn < 0 ? ay - hh : b0.y;
    for (const r of orig) {
      const cw = r.w * fx, ch = r.h * fy;
      r.o.x = round2(nx + (r.cx - b0.x) * fx - cw / 2); r.o.y = round2(ny + (r.cy - b0.y) * fy - ch / 2);
      r.o.w = round2(cw); r.o.h = round2(ch);
      updateObjEl(r.o);
    }
    renderOverlay(); showSnapLines(lines); updateStatus(); drawRulers();
  }, () => { showSnapLines([]); commit(); renderProps(); });
}

function setLineFromPoints(o, p1, p2) {
  o.x = round2(Math.min(p1[0], p2[0])); o.y = round2(Math.min(p1[1], p2[1]));
  o.w = round2(Math.abs(p2[0] - p1[0])); o.h = round2(Math.abs(p2[1] - p1[1]));
  o.dir = (p2[0] - p1[0]) * (p2[1] - p1[1]) < 0 ? 'up' : 'down';
}

function startCreate(e, m0) {
  const ov = pageEl.querySelector('#overlay');
  const k = pxPerMm();
  const tool = S.tool;
  const draft = document.createElement('div'); draft.className = 'draft';
  ov.append(draft);
  let m1 = m0;
  const targets = snapTargets(new Set());
  const snapPt = (p, ev) => {
    if (ev.altKey) return p;
    const sx = snapValue([p.x], targets.xs, 6 / k), sy = snapValue([p.y], targets.ys, 6 / k);
    return { x: p.x + (sx ? sx.d : 0), y: p.y + (sy ? sy.d : 0) };
  };
  m0 = snapPt(m0, e);
  dragLoop(e, (ev) => {
    m1 = snapPt(mmFromEvent(ev), ev);
    if (tool === 'line') {
      if (ev.shiftKey) {
        const dx = m1.x - m0.x, dy = m1.y - m0.y, len = Math.hypot(dx, dy);
        const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
        m1 = { x: m0.x + len * Math.cos(a), y: m0.y + len * Math.sin(a) };
      }
      const len = Math.hypot(m1.x - m0.x, m1.y - m0.y), ang = Math.atan2(m1.y - m0.y, m1.x - m0.x);
      Object.assign(draft.style, { left: m0.x + 'mm', top: m0.y + 'mm', width: len + 'mm', height: '0', borderWidth: 1 / k + 'mm', transformOrigin: '0 0', transform: `rotate(${ang}rad)` });
      return;
    }
    if (ev.shiftKey) { const s = Math.max(Math.abs(m1.x - m0.x), Math.abs(m1.y - m0.y)); m1 = { x: m0.x + Math.sign(m1.x - m0.x || 1) * s, y: m0.y + Math.sign(m1.y - m0.y || 1) * s }; }
    Object.assign(draft.style, { left: Math.min(m0.x, m1.x) + 'mm', top: Math.min(m0.y, m1.y) + 'mm', width: Math.abs(m1.x - m0.x) + 'mm', height: Math.abs(m1.y - m0.y) + 'mm', borderWidth: 1 / k + 'mm' });
  }, () => {
    draft.remove();
    let x = Math.min(m0.x, m1.x), y = Math.min(m0.y, m1.y), w = Math.abs(m1.x - m0.x), h = Math.abs(m1.y - m0.y);
    const tiny = w < 2 && h < 2;
    let o;
    if (tool === 'line') {
      if (tiny) { m1 = { x: m0.x + 40, y: m0.y }; }
      o = makeObject('line'); setLineFromPoints(o, [m0.x, m0.y], [m1.x, m1.y]);
    } else {
      if (tiny) { w = tool === 'text' ? Math.min(60, S.doc.pageW * 0.6) : 30; h = tool === 'text' ? 12 : 20; }
      if (tool === 'text') o = makeObject('box', { x, y, w, h, shape: 'none', html: '<p><br></p>', pad: { t: 1, r: 1, b: 1, l: 1 } });
      else o = makeObject('box', { x, y, w, h, shape: tool === 'ellipse' ? 'ellipse' : 'rect', fill: '#ffffff', stroke: '#000000', strokeW: 0.3528, valign: 'middle', html: '' });
    }
    for (const kk of ['x', 'y', 'w', 'h']) o[kk] = round2(o[kk]);
    objs().push(o);
    S.sel = new Set([o.id]);
    setTool('select');
    if (tool === 'text') { S.justCreated = o.id; renderStage(); startEditing(o.id); }
    else { commit(); renderStage(); renderProps(); updateTextbar(); }
  });
}

function startMarquee(e, m0) {
  const ov = pageEl.querySelector('#overlay');
  const box = document.createElement('div'); box.className = 'marquee'; ov.append(box);
  const k = pxPerMm();
  const base = e.shiftKey ? new Set(S.sel) : new Set();
  dragLoop(e, (ev) => {
    const m = mmFromEvent(ev);
    const x = Math.min(m0.x, m.x), y = Math.min(m0.y, m.y), w = Math.abs(m.x - m0.x), h = Math.abs(m.y - m0.y);
    Object.assign(box.style, { left: x + 'mm', top: y + 'mm', width: w + 'mm', height: h + 'mm', borderWidth: 1 / k + 'mm' });
    const sel = new Set(base);
    for (const o of objs()) {
      const b = bbox([o]);
      if (b.x >= x && b.y >= y && b.x + b.w <= x + w && b.y + b.h <= y + h) {
        if (o.groupId) objs().filter(g => g.groupId === o.groupId).forEach(g => sel.add(g.id)); else sel.add(o.id);
      }
    }
    S.sel = sel; renderOverlay(); ov.append(box);
  }, () => { box.remove(); selectionChanged(); });
}

// ---- ruler guides
function startNewGuide(e, axis) {
  if (!pageEl || e.button !== 0) return;
  e.preventDefault();
  const list = S.doc.guides[axis];
  list.push(axis === 'v' ? mmFromEvent(e).x : mmFromEvent(e).y);
  renderGuides();
  startGuideDrag(e, axis, list.length - 1, true);
}
function startGuideDrag(e, axis, i, isNew = false) {
  const list = S.doc.guides[axis];
  const ruler = $(axis === 'v' ? 'ruler-v' : 'ruler-h');
  const ruler2 = $(axis === 'v' ? 'ruler-h' : 'ruler-v');
  dragLoop(e, (ev) => {
    const m = mmFromEvent(ev);
    let v = axis === 'v' ? m.x : m.y;
    if (!ev.altKey) { const t = snapTargets(new Set()); const s = snapValue([v], axis === 'v' ? t.xs.filter(x => x !== list[i]) : t.ys.filter(y => y !== list[i]), 5 / pxPerMm()); if (s) v += s.d; }
    list[i] = round2(v);
    renderGuides(); mouseMm = m; drawRulers();
  }, (ev) => {
    const over = (el) => { const r = el.getBoundingClientRect(); return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom; };
    if (over(ruler) || over(ruler2) || over($('corner'))) list.splice(i, 1);
    renderGuides(); commit();
  });
}

// ---------------------------------------------------------------- text editing
function startEditing(id, caretAt) {
  if (S.editing && S.editing !== id) finishEditing();
  const o = getObj(id);
  if (!o || o.type !== 'box' || o.locked) return;
  S.editing = id; S.sel = new Set([id]);
  let el = pageEl.querySelector(`.kcontent > .kobj[data-id="${id}"]`);
  if (!el) return;
  if (shownRow()) { // Preview shows a person: the box being edited shows the design (its «fields»)
    const d = renderObject(o); d.className = el.className; el.replaceWith(d); el = d;
    markMissingFields(el); fixLineHeights(el);
  }
  el.classList.add('editing');
  const kt = el.querySelector('.kt');
  kt.contentEditable = 'true';
  TE.ensureParagraphs(kt);
  document.execCommand('defaultParagraphSeparator', false, 'p');
  kt.focus();
  const sel = window.getSelection();
  let r = null;
  if (caretAt && document.caretRangeFromPoint) {
    r = document.caretRangeFromPoint(caretAt.clientX, caretAt.clientY);
    if (r && !kt.contains(r.startContainer)) r = null;
  }
  if (!r) { r = document.createRange(); r.selectNodeContents(kt); r.collapse(false); }
  sel.removeAllRanges(); sel.addRange(r);
  kt.addEventListener('paste', onEditPaste);
  kt.addEventListener('input', () => { fixLineHeights(el); });
  renderOverlay(); updateTextbar(); renderProps(); updateStatus(); syncMailMenu();
}
function finishEditing() {
  if (!S.editing) return;
  const id = S.editing;
  S.editing = null;
  const o = getObj(id);
  const el = pageEl && pageEl.querySelector(`.kcontent > .kobj[data-id="${id}"]`);
  if (o && el) {
    const kt = el.querySelector('.kt');
    kt.contentEditable = 'false';
    const empty = !kt.textContent.replace(/​/g, '').trim() && !kt.querySelector('table');
    if (empty && S.justCreated === id) {
      const arr = objs(); arr.splice(arr.indexOf(o), 1); S.sel.delete(id);
    } else {
      o.html = TE.sanitizeHtml(TE.stripZeroWidth(kt.innerHTML));
    }
  }
  S.justCreated = null; S.savedRange = null;
  window.getSelection().removeAllRanges();
  paintKeptSelection();
  commit();
  renderStage(); renderProps(); updateTextbar(); updateStatus(); syncMailMenu();
}
function editingRoot() {
  if (!S.editing || !pageEl) return null;
  return pageEl.querySelector(`.kcontent > .kobj[data-id="${S.editing}"] .kt`);
}
// copied text that holds merge fields keeps them (its html, without the style the copy added); anything else pastes as plain text
function withFields(h) {
  if (!h || !h.includes('data-field="merge"')) return '';
  const d = document.createElement('div');
  d.innerHTML = h;
  d.querySelectorAll('[style]').forEach(n => n.removeAttribute('style'));
  return TE.sanitizeHtml(d.innerHTML);
}
function onEditPaste(e) {
  const fields = withFields(e.clipboardData.getData('text/html'));
  if (fields) { e.preventDefault(); return void document.execCommand('insertHTML', false, fields); }
  const text = e.clipboardData.getData('text/plain');
  e.preventDefault();
  if (text) document.execCommand('insertText', false, text.replace(/\r\n/g, '\n'));
}
document.addEventListener('selectionchange', () => {
  const kt = editingRoot();
  const sel = window.getSelection();
  if (kt && sel.rangeCount && kt.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    S.savedRange = sel.getRangeAt(0).cloneRange();
    clearTimeout(S._tbT); S._tbT = setTimeout(updateTextbar, 60);
  }
  paintKeptSelection();
});
// When the font box, size box or another text bar control takes the focus, the browser stops showing
// the chosen text; paint it ourselves so it stays visible until the change is made
function paintKeptSelection() {
  if (!window.Highlight) return;
  const kt = editingRoot(), r = S.savedRange;
  if (kt && r && !r.collapsed && !kt.contains(document.activeElement)) CSS.highlights.set('kept', new Highlight(r));
  else CSS.highlights.delete('kept');
}
document.addEventListener('focusin', paintKeptSelection);
document.addEventListener('focusout', () => setTimeout(paintKeptSelection));
function restoreRange(kt) {
  const sel = window.getSelection();
  if (sel.rangeCount && kt.contains(sel.getRangeAt(0).commonAncestorContainer)) return;
  if (S.savedRange) { sel.removeAllRanges(); sel.addRange(S.savedRange); }
}

// Apply text formatting: to the selection while editing, or to whole selected text boxes
function textBoxesSelected() { return selObjs().filter(o => o.type === 'box' && !o.locked); }
function applyText(inline, para, { ls, boxProps } = {}) {
  const kt = editingRoot();
  if (kt) {
    restoreRange(kt);
    if (inline) TE.applyInline(kt, inline);
    if (para || ls !== undefined) TE.applyParagraph(kt, para || {}, { ls });
    if (boxProps) { const o = getObj(S.editing); Object.assign(o, boxProps); const el = kt.closest('.kobj'); el.querySelector('.ktext').className = 'ktext va-' + o.valign; }
    kt.focus();
    updateTextbar();
    return;
  }
  const boxes = textBoxesSelected();
  if (!boxes.length) return;
  for (const o of boxes) withDesignKt(o, (k2) => {
    if (inline) {
      TE.ensureParagraphs(k2);
      TE.applyInline(k2, inline, { whole: true });
      if (inline['font-family']) o.font = inline['font-family'].split(',')[0].replace(/["']/g, '').trim();
      if (inline['font-size']) o.size = parseFloat(inline['font-size']);
      if (inline.color) o.color = inline.color;
    }
    if (para || ls !== undefined) TE.applyParagraph(k2, para || {}, { whole: true, ls });
    if (boxProps) Object.assign(o, boxProps);
    o.html = TE.sanitizeHtml(k2.innerHTML);
  });
  commit(); renderStage(); updateTextbar();
}

const fontFamilyCss = (name) => `"${name}", "Khmer OS Siemreap", "Khmer UI", sans-serif`;

function currentTextStyle() {
  const kt = editingRoot();
  if (kt) return TE.styleAt(kt);
  const b = textBoxesSelected()[0];
  if (!b) return null;
  const st = withDesignKt(b, (el) => TE.styleAt(el));
  if (st) st.valign = b.valign;
  return st;
}
// A whole selected box's text on the stage, or, while Preview shows a person there (a value, maybe shrunk), the box as
// designed, off-screen: whole-box formatting reads and changes the design
function withDesignKt(o, fn) {
  if (!shownRow()) { const el = pageEl.querySelector(`.kcontent > .kobj[data-id="${o.id}"] .kt`); return el ? fn(el) : null; }
  const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-100000px;top:0';
  host.append(renderObject(o)); document.body.append(host); fixLineHeights(host);
  try { return fn(host.querySelector('.kt')); } finally { host.remove(); }
}

function updateTextbar() {
  const tb = $('textbar');
  const st = currentTextStyle();
  tb.classList.toggle('disabled', !st);
  $('tb-hint').textContent = S.editing ? 'Editing text – Esc to finish' : st ? 'Formatting applies to the whole text box. Click in it to type.' : 'Select a text box, or click in one to type';
  if (!st) return;
  if (document.activeElement !== $('tb-font')) $('tb-font').value = st.font;
  if (document.activeElement !== $('tb-size')) $('tb-size').value = st.size;
  $('tb-b').classList.toggle('on', st.bold);
  $('tb-i').classList.toggle('on', st.italic);
  $('tb-u').classList.toggle('on', st.underline);
  $('tb-s').classList.toggle('on', st.strike);
  $('tb-color').setColor(st.color);
  for (const [id, a] of [['tb-al', 'left'], ['tb-ac', 'center'], ['tb-ar', 'right'], ['tb-aj', 'justify']]) $(id).classList.toggle('on', st.align === a);
  const o = S.editing ? getObj(S.editing) : textBoxesSelected()[0];
  const va = o ? o.valign : 'top';
  for (const [id, v] of [['tb-vt', 'top'], ['tb-vm', 'middle'], ['tb-vb', 'bottom']]) $(id).classList.toggle('on', va === v);
  const ls = st.ls || 1;
  const opt = [...$('tb-ls').options].find(op => Math.abs(+op.value - ls) < 0.01);
  if (!opt) $('tb-ls').insertAdjacentHTML('beforeend', `<option value="${ls}">${ls} sp</option>`);
  $('tb-ls').value = String(opt ? opt.value : ls);
}

function setupTextbar() {
  const keepFocus = (el) => el.addEventListener('mousedown', (e) => e.preventDefault());
  ['tb-b', 'tb-i', 'tb-u', 'tb-s', 'tb-al', 'tb-ac', 'tb-ar', 'tb-aj', 'tb-vt', 'tb-vm', 'tb-vb', 'tb-grow', 'tb-shrink'].forEach(id => keepFocus($(id)));
  const toggle = (prop) => {
    const st = currentTextStyle(); if (!st) return;
    if (prop === 'b') applyText({ 'font-weight': st.bold ? '400' : '700' });
    if (prop === 'i') applyText({ 'font-style': st.italic ? 'normal' : 'italic' });
    if (prop === 'u' || prop === 's') {
      const u = prop === 'u' ? !st.underline : st.underline, s = prop === 's' ? !st.strike : st.strike;
      applyText({ 'text-decoration': [u && 'underline', s && 'line-through'].filter(Boolean).join(' ') || 'none' });
    }
  };
  S.toggleFmt = toggle;
  $('tb-b').onclick = () => toggle('b'); $('tb-i').onclick = () => toggle('i');
  $('tb-u').onclick = () => toggle('u'); $('tb-s').onclick = () => toggle('s');
  $('tb-al').onclick = () => applyText(null, { 'text-align': 'left' });
  $('tb-ac').onclick = () => applyText(null, { 'text-align': 'center' });
  $('tb-ar').onclick = () => applyText(null, { 'text-align': 'right' });
  $('tb-aj').onclick = () => applyText(null, { 'text-align': 'justify' });
  $('tb-vt').onclick = () => applyText(null, null, { boxProps: { valign: 'top' } });
  $('tb-vm').onclick = () => applyText(null, null, { boxProps: { valign: 'middle' } });
  $('tb-vb').onclick = () => applyText(null, null, { boxProps: { valign: 'bottom' } });
  $('tb-ls').onchange = () => applyText(null, null, { ls: parseFloat($('tb-ls').value) });
  const SIZES = [6, 7, 8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40, 48, 54, 60, 72, 96];
  const setSize = (v) => { v = parseFloat(v); if (v > 0 && v < 1000) applyText({ 'font-size': v + 'pt' }); };
  const step = (d) => { const st = currentTextStyle(); if (!st) return; const cur = st.size; const next = d > 0 ? SIZES.find(s => s > cur) || cur + 4 : [...SIZES].reverse().find(s => s < cur) || Math.max(1, cur - 1); setSize(next); };
  $('tb-grow').onclick = () => step(1); $('tb-shrink').onclick = () => step(-1);
  comboList($('tb-font'), {
    items: async () => fontItems(await loadLocalFonts()),
    pick: (f) => applyText({ 'font-family': fontFamilyCss(f) }),
    // typing jumps to the first font that starts with (or else contains) the text
    find: (t, vals) => { t = t.trim().toLowerCase(); if (!t) return -1; const l = vals.map(v => v.toLowerCase()); const i = l.indexOf(t); return i >= 0 ? i : (j => j >= 0 ? j : l.findIndex(v => v.includes(t)))(l.findIndex(v => v.startsWith(t))); },
    known: (t) => (fontNames || DEFAULT_FONTS).find(f => f.toLowerCase() === t.trim().toLowerCase()),
    cls: 'fonts'
  });
  comboList($('tb-size'), {
    items: async () => SIZES.map(s => ({ v: String(s), html: String(s) })),
    pick: setSize,
    find: (t, vals) => vals.indexOf(String(parseFloat(t))),
    known: (t) => parseFloat(t) > 0 && parseFloat(t) < 1000 ? String(parseFloat(t)) : null
  });
  const tbColor = colorButton('#000000', (c) => applyText({ color: c }), { title: 'Text colour' });
  tbColor.id = 'tb-color';
  $('tb-color-slot').replaceWith(tbColor);
}

// ---------------------------------------------------------------- font and size lists (like Publisher)
// An editable box with a ▾ button. The list always shows every choice: typing jumps to the first match
// instead of hiding the rest. Arrows move, Enter or a click picks, Esc puts the old value back.
let listPop = null; // { el, input, before } while a list is open
function comboList(input, { items, pick, find, known, cls = '' }) {
  const btn = input.nextElementSibling;
  let fresh = false, typed = false;
  const isOpen = () => !!listPop && listPop.input === input;
  const lis = () => isOpen() ? [...listPop.el.querySelectorAll('.li')] : [];
  const mark = (li, { center = false, fill = false } = {}) => {
    for (const x of lis()) x.classList.toggle('on', x === li);
    if (!li) return;
    const el = listPop.el, top = li.offsetTop, h = li.offsetHeight;
    if (center) el.scrollTop = top - (el.clientHeight - h) / 2;
    else if (top < el.scrollTop) el.scrollTop = top;
    else if (top + h > el.scrollTop + el.clientHeight) el.scrollTop = top + h - el.clientHeight;
    if (fill) input.value = li.dataset.v;
  };
  const markMatch = (opts) => { const all = lis(); mark(all[find(input.value, all.map(x => x.dataset.v))] || null, opts); };
  const open = async () => {
    if (isOpen()) return;
    closeListPop(); closeColorPop(); closeCtx();
    const list = await items();
    if (document.activeElement !== input || isOpen()) return; // the focus moved on while Windows listed the fonts
    closeListPop();
    const el = document.createElement('div');
    el.id = 'listpop'; el.className = cls; el.setAttribute('role', 'listbox');
    el.innerHTML = list.map(x => x.cap ? `<div class="lcap">${x.cap}</div>` : `<div class="li" role="option" data-v="${escHtml(x.v)}">${x.html}</div>`).join('');
    document.body.append(el);
    const r = input.parentElement.getBoundingClientRect();
    el.style.minWidth = r.width + 'px';
    el.style.left = Math.max(8, Math.min(r.left, innerWidth - el.offsetWidth - 8)) + 'px';
    el.style.top = r.bottom + 4 + 'px';
    el.style.maxHeight = Math.max(160, Math.min(440, innerHeight - r.bottom - 16)) + 'px';
    el.addEventListener('mousedown', (e) => e.preventDefault()); // keep the focus, and the chosen text
    el.addEventListener('click', (e) => { const li = e.target.closest('.li'); if (li) done(li.dataset.v); });
    listPop = { el, input, before: input.value };
    btn.classList.add('open');
    markMatch({ center: true });
  };
  const done = (v) => { closeListPop(); typed = false; v = String(v).trim(); if (!v) return updateTextbar(); input.value = v; pick(v); };
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (isOpen()) return closeListPop();
    input.focus(); fresh = false; input.select(); open();
  });
  // the first click into the box selects its text, so typing replaces it (judged on the press: Windows only
  // sends the focus event while Bohpum is the front window)
  input.addEventListener('mousedown', () => { fresh = document.activeElement !== input; });
  input.addEventListener('click', () => { if (fresh) input.select(); fresh = false; open(); });
  input.addEventListener('input', async () => { typed = true; await open(); markMatch(); });
  input.addEventListener('blur', () => {
    if (!document.hasFocus()) return; // only another program came to the front: keep the list and the typing
    closeListPop();
    // a typed value counts when it is a real choice; otherwise the box shows the text's value again
    if (typed) { typed = false; const v = known(input.value); if (v) pick(v); else updateTextbar(); }
  });
  input.addEventListener('keydown', (e) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && !e.ctrlKey) {
      e.preventDefault(); e.stopPropagation();
      if (!isOpen()) return open();
      const all = lis(), i = all.findIndex(x => x.classList.contains('on'));
      mark(all[i < 0 ? 0 : Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))], { fill: true });
      typed = false;
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      const on = isOpen() && listPop.el.querySelector('.li.on');
      done(on ? on.dataset.v : input.value);
    } else if (e.key === 'Escape') {
      typed = false;
      if (isOpen()) { e.preventDefault(); e.stopPropagation(); input.value = listPop.before; closeListPop(); }
      else updateTextbar();
    } else if (e.key === 'Tab') closeListPop();
  });
}
function closeListPop() {
  if (!listPop) return;
  listPop.el.remove(); listPop.input.nextElementSibling.classList.remove('open'); listPop = null;
}

const DEFAULT_FONTS = ['Khmer OS Siemreap', 'Khmer OS Content', 'Khmer OS Battambang', 'Khmer OS', 'Khmer OS System', 'Khmer OS Muol Light', 'Khmer OS Muol',
  'Khmer OS Muol Pali', 'Khmer OS Bokor', 'Khmer OS Freehand', 'Khmer OS Fasthand', 'Khmer OS Metal Chrieng', 'Khmer UI', 'Leelawadee UI',
  'Arial', 'Calibri', 'Cambria', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana'];
const KHMER_FONT = /khmer|moul|muol|battambang|siemreap|hanuman|bayon|bokor|dangrek|kantumruy|koulen|nokora|preahvihear|suwannaphum|taprom|angkor|chenla|fasthand|freehand/i;
const SYMBOL_FONT = /wingdings|webdings|^symbol$|marlett|mt extra|holomdl|mdl2|fluent icons|bookshelf symbol|ms outlook|reference specialty/i;
let fontNames = null; // every font installed in Windows, once Windows has listed them
async function loadLocalFonts() {
  if (!fontNames) {
    try { const fams = [...new Set((await window.queryLocalFonts()).map(f => f.family))]; if (fams.length) fontNames = fams; } catch { /* the usual fonts below */ }
  }
  return fontNames || DEFAULT_FONTS;
}
// Khmer fonts first, then the rest, A–Z; each name is drawn in its own font (symbol fonts in the normal one)
function fontItems(names) {
  const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b));
  const item = (f) => {
    const face = SYMBOL_FONT.test(f) ? '' : ` style="font-family:&quot;${escHtml(f)}&quot;, var(--ui-font)"`;
    return { v: f, html: `<span${face}>${escHtml(f)}</span>` + (KHMER_FONT.test(f) ? `<small${face}>អក្សរខ្មែរ</small>` : '') };
  };
  const km = sorted.filter(f => KHMER_FONT.test(f)), rest = sorted.filter(f => !KHMER_FONT.test(f));
  return [...(km.length ? [{ cap: 'Khmer fonts' }, ...km.map(item)] : []), { cap: km.length ? 'Other fonts' : 'Fonts' }, ...rest.map(item)];
}

// ---------------------------------------------------------------- properties panel
function renderProps() {
  const P = $('props');
  if (document.activeElement && P.contains(document.activeElement) && document.activeElement.matches('input:not([type=checkbox]):not([type=color])')) {
    // don't rebuild while the user is typing in a field
    if (!renderProps._force) return;
  }
  P.innerHTML = '';
  const sel = selObjs();
  if (!sel.length) return renderPageProps(P);
  const single = sel.length === 1 ? sel[0] : null;
  const bb = bbox(sel);

  // position & size: the icon tells what kind of object it is; its name is said once, by its own section below
  // (Shape's type, Picture, Line, Text box), not here as well
  const pos = section(P, single ? 'Position & size' : `${sel.length} objects selected`, single ? iconOf(single) : 'group', 'object');
  const locked = sel.some(o => o.locked);
  const lockBtn = btn(locked ? 'Locked' : 'Lock', () => cmd('lock'), 'cell-btn' + (locked ? ' on' : ''));
  lockBtn.insertAdjacentHTML('afterbegin', icon(locked ? 'lock' : 'unlock'));
  lockBtn.title = locked ? 'Unlock so it can be moved' : 'Lock so it can’t be moved by accident';
  const g = grid(pos);
  if (single) {
    g.append(num('X', single.x, v => moveTo(v, null)), num('Y', single.y, v => moveTo(null, v)));
    if (single.type !== 'line') {
      g.append(num('W', single.w, v => setSize(v, null), 0.1), num('H', single.h, v => setSize(null, v), 0.1));
      g.append(num('↻', single.rot || 0, v => setProp(o => o.rot = v), 1, '°'));
    } else {
      g.append(num('W', single.w, v => setProp(o => o.w = Math.max(0, v))), num('H', single.h, v => setProp(o => o.h = Math.max(0, v))));
      const len = Math.hypot(single.w, single.h);
      g.append(num('Len', len, v => setProp(o => { const l = Math.hypot(o.w, o.h) || 1; o.w = round2(o.w * v / l); o.h = round2(o.h * v / l); })));
    }
    g.append(lockBtn);
  } else {
    g.append(num('X', bb.x, v => moveTo(v, null)), num('Y', bb.y, v => moveTo(null, v)));
    const ab = btns(pos);
    ab.append(lockBtn);
  }
  const types = new Set(sel.map(o => o.type));

  const ar = section(P, 'Arrange', 'front', 'arrange');
  ar.append(row('Order', seg(
    iconBtn('ordFront', 'Bring to front (Ctrl+Shift+])', () => cmd('front')), iconBtn('ordFwd', 'Bring forward (Ctrl+])', () => cmd('forward')),
    iconBtn('ordBwd', 'Send backward (Ctrl+[)', () => cmd('backward')), iconBtn('ordBack', 'Send to back (Ctrl+Shift+[)', () => cmd('back')))));
  // One item lines up with the page; several line up with each other
  const tips = sel.length > 1
    ? ['Align left edges', 'Centre horizontally', 'Align right edges', 'Align top edges', 'Centre vertically', 'Align bottom edges']
    : ['To the left edge of the page', 'Centre across the page', 'To the right edge of the page', 'To the top of the page', 'Centre down the page', 'To the bottom of the page'];
  const alBtn = (k, i) => iconBtn('al' + k.toUpperCase(), tips[i], () => align(k));
  const alRow = document.createElement('div'); alRow.className = 'seg-row';
  alRow.append(seg(...['l', 'c', 'r'].map((k, i) => alBtn(k, i))), seg(...['t', 'm', 'b'].map((k, i) => alBtn(k, i + 3))));
  ar.append(row(sel.length > 1 ? 'Align' : 'On page', alRow));
  if (sel.length > 2) ar.append(row('Distribute', seg(iconBtn('distH', 'Space evenly left to right', () => distribute('x')), iconBtn('distV', 'Space evenly top to bottom', () => distribute('y')))));
  // Group / Ungroup live here, not in the top bar; each is greyed out when it would do nothing
  const oneGroup = sel.every(o => o.groupId && o.groupId === sel[0].groupId);
  const gb = iconBtn('group', 'Group (Ctrl+G)', () => cmd('group'), false, 'Group');
  const ub = iconBtn('ungroup', 'Ungroup (Ctrl+Shift+G)', () => cmd('ungroup'), false, 'Ungroup');
  gb.disabled = sel.length < 2 || oneGroup; ub.disabled = !sel.some(o => o.groupId);
  const gs = seg(gb, ub); gs.classList.add('words');
  ar.append(row('Group', gs));

  // the box itself: its outline, then the words inside it
  if (types.size === 1 && types.has('box')) { shapeProps(P, sel[0]); textProps(P, sel[0]); }

  if (types.size === 1 && types.has('box')) boxProps(P, sel);
  if (types.size === 1 && types.has('image')) imageProps(P, sel);
  if (types.size === 1 && types.has('line')) lineProps(P, sel);
  const op = section(P, 'Transparency', 'opacity', 'opacity');
  const rr = document.createElement('div'); rr.className = 'range-row';
  const r = document.createElement('input'); r.type = 'range'; r.min = 0; r.max = 100; r.value = Math.round((1 - (sel[0].opacity ?? 1)) * 100);
  const rv = document.createElement('span'); rv.textContent = r.value + ' %';
  r.oninput = () => { rv.textContent = r.value + ' %'; };
  r.onchange = () => setProp(o => o.opacity = round2(1 - r.value / 100));
  rr.append(r, rv); op.append(rr);
}
renderProps._force = false;

function iconOf(o) { // the toolbar icon of the object's kind
  if (o.type === 'image') return 'image';
  if (o.type === 'line') return 'line';
  return { ellipse: 'ellipse', none: 'text', path: 'shapes' }[o.shape] || 'rect';
}
function labelOf(o) {
  if (o.type === 'image') return 'Picture';
  if (o.type === 'line') return 'Line';
  if (o.shape === 'ellipse') return 'Ellipse';
  if (o.shape === 'none') return 'Text box';
  if (o.shape === 'path') return 'Shape';
  return 'Rectangle';
}

// Shape: only choices that look different. "Text box" (a plain frame) is listed only for a text box, so its list says
// what it is; a rectangle can't become one (it would look the same). Rounded corners come only from Corner: an older
// rounded shape ('roundrect', from Publisher files) is shown as a Rectangle with the corner it is drawn with
// (render.js: 10 % of the shorter side when it has none), and editing its corner makes it a plain rectangle.
const cornerOf = (o) => o.shape === 'roundrect' ? round2(Math.min(o.radius || Math.min(o.w, o.h) * 0.1, o.w / 2, o.h / 2)) : (o.radius || 0);
function shapeProps(P, o) {
  const s = section(P, 'Shape', 'shapes', 'shape');
  const opts = [...(o.shape === 'none' ? [['none', 'Text box']] : []), ['rect', 'Rectangle'], ['ellipse', 'Ellipse'], ...(o.shape === 'path' ? [['path', 'Custom']] : [])];
  s.append(row('Type', select(opts, o.shape === 'roundrect' ? 'rect' : o.shape, v => setProp(x => {
    const r = cornerOf(x);
    x.shape = v;
    if (v === 'rect') x.radius = r; // a rounded shape keeps the corner it had
  }))));
  if (o.shape !== 'ellipse' && o.shape !== 'path') {
    s.append(row('Corner', numInput(cornerOf(o), v => setProp(x => { if (x.shape === 'roundrect') x.shape = 'rect'; x.radius = Math.max(0, v); }), 0.5, 'mm')));
  }
}

function boxProps(P, sel) {
  const o = sel[0];
  const f = section(P, 'Fill & line', 'fill', 'fill');
  f.append(row('Fill', colorField(o.fill, v => setProp(x => { x.fill = v; if (v === 'none') { x.fill2 = null; x.gradKind = null; } }), 'No Fill')));
  const gr = document.createElement('label'); gr.className = 'chk under-field';
  gr.innerHTML = `<input type="checkbox" ${o.gradKind ? 'checked' : ''}> Gradient`;
  gr.querySelector('input').onchange = (e) => setProp(x => { if (e.target.checked) { x.gradKind = 'linear'; x.fill = x.fill !== 'none' ? x.fill : '#ffffff'; x.fill2 = x.fill2 || '#b7791f'; } else { x.gradKind = null; } });
  f.append(gr);
  if (o.gradKind) {
    f.append(row('To', colorField(o.fill2, v => setProp(x => x.fill2 = v))));
    f.append(row('Type', select([['linear', 'Linear'], ['axial', 'Axial'], ['radial', 'Radial']], o.gradKind, v => setProp(x => x.gradKind = v))));
    f.append(row('Angle', numInput(o.gradAngle || 0, v => setProp(x => x.gradAngle = v), 15, '°')));
  }
  f.append(row('Line', colorField(o.stroke, v => setProp(x => { x.stroke = v; if (v !== 'none' && !x.strokeW) x.strokeW = 0.3528; }), 'No Line')));
  f.append(row('Weight', numInput(ptOf(o.strokeW), v => setProp(x => x.strokeW = mmOfPt(Math.max(0, v))), 0.25, 'pt')));
  f.append(row('Dash', select([['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted'], ['dashdot', 'Dash-dot']], o.dash || 'solid', v => setProp(x => x.dash = v))));
  if (hasLine(o)) f.append(alignLineRow(o, 'line'));
}
// Text: the words inside a box (any box holds text: a text box, a rectangle, an ellipse). Key 'textbox' as before,
// so a section folded earlier stays folded.
function textProps(P, o) {
  const t = section(P, 'Text', 'text', 'textbox');
  caption(t, 'Inner margins (mm)');
  const g = grid(t);
  const pad = o.pad || { t: 0, r: 0, b: 0, l: 0 };
  g.append(num('T', pad.t, v => setProp(x => x.pad = { ...x.pad, t: v }), 0.5), num('B', pad.b, v => setProp(x => x.pad = { ...x.pad, b: v }), 0.5),
    num('L', pad.l, v => setProp(x => x.pad = { ...x.pad, l: v }), 0.5), num('R', pad.r, v => setProp(x => x.pad = { ...x.pad, r: v }), 0.5));
  const b = btns(t); b.style.marginTop = '8px';
  b.append(btn('Fit height to text', () => fitHeight()), btn('Edit text', () => startEditing(o.id)));
}

// Align line (the InDesign / Illustrator name): Center = on the edge (the default), Inside, Outside. Each picture
// shows the line (grey band) against the shape's edge (dashed).
const hasLine = (o) => !!o.stroke && o.stroke !== 'none' && o.strokeW > 0;
const ALIGN_BAND = { center: 3, inside: 4.25, outside: 1.75 };
function alignLineRow(o, what) {
  const cur = o.lineAlign || 'center';
  const b = (k, label) => {
    const x = btn('', () => setProp(t => { if (k === 'center') delete t.lineAlign; else t.lineAlign = k; }), cur === k ? 'on' : '');
    const p = ALIGN_BAND[k], s = 16 - 2 * p;
    x.title = `Align ${what} to ${k}`; x.setAttribute('aria-label', x.title); x.dataset.align = k;
    x.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="${p}" y="${p}" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2.5" opacity=".45"/>`
      + `<rect x="3" y="3" width="10" height="10" fill="none" stroke="currentColor" stroke-width=".9" stroke-dasharray="1.6 1.1"/></svg><span>${label}</span>`;
    return x;
  };
  const g = seg(b('center', 'Center'), b('inside', 'Inside'), b('outside', 'Outside'));
  g.classList.add('align-line');
  return row('Align', g);
}

function imageProps(P, sel) {
  const o = sel[0];
  const s = section(P, 'Picture', 'image', 'picture');
  s.append(row('Fit', select([['fill', 'Stretch'], ['contain', 'Fit inside'], ['cover', 'Fill & crop']], o.fit, v => setProp(x => x.fit = v))));
  s.append(row('Border', colorField(o.stroke, v => setProp(x => { x.stroke = v; if (v !== 'none' && !x.strokeW) x.strokeW = 0.3528; }), 'No Line')));
  s.append(row('Weight', numInput(ptOf(o.strokeW || 0), v => setProp(x => x.strokeW = mmOfPt(Math.max(0, v))), 0.25, 'pt')));
  if (hasLine(o)) s.append(alignLineRow(o, 'border'));
  const b = btns(s); b.style.marginTop = '6px';
  b.append(btn('Replace…', () => replaceImage(o)), btn('Original ratio', () => resetRatio(o)));
  if (o.note && !o.src) s.append(Object.assign(document.createElement('div'), { className: 'warn', textContent: o.note }));
  if (o.mergePhoto) s.append(Object.assign(document.createElement('div'), { className: 'muted', textContent: 'Picture field: ' + o.mergePhoto }));
}

function lineProps(P, sel) {
  const o = sel[0];
  const s = section(P, 'Line', 'line', 'line');
  s.append(row('Colour', colorField(o.stroke, v => setProp(x => x.stroke = v))));
  s.append(row('Weight', numInput(ptOf(o.strokeW), v => setProp(x => x.strokeW = mmOfPt(Math.max(0.05, v))), 0.25, 'pt')));
  s.append(row('Dash', select([['solid', 'Solid'], ['dash', 'Dashed'], ['dot', 'Dotted'], ['dashdot', 'Dash-dot']], o.dash || 'solid', v => setProp(x => x.dash = v))));
  const c1 = document.createElement('label'); c1.className = 'chk'; c1.innerHTML = `<input type="checkbox" ${o.arrowStart ? 'checked' : ''}> Arrow at start`;
  c1.querySelector('input').onchange = (e) => setProp(x => x.arrowStart = e.target.checked);
  const c2 = document.createElement('label'); c2.className = 'chk'; c2.innerHTML = `<input type="checkbox" ${o.arrowEnd ? 'checked' : ''}> Arrow at end`;
  c2.querySelector('input').onchange = (e) => setProp(x => x.arrowEnd = e.target.checked);
  s.append(c1, c2);
}

function renderPageProps(P) {
  const d = S.doc;
  const note = (el, text) => el.append(Object.assign(document.createElement('div'), { className: 'muted', textContent: text }));
  if (S.master) {
    const ms = section(P, 'Master page', 'pages', 'master');
    note(ms, 'Items on the master page appear on every page.');
    const mb = btns(ms); mb.style.marginTop = '6px';
    mb.append(btn('Back to pages', () => setMaster(false)));
  }
  // Size, margins and guides belong to the whole publication, so this isn't labelled "Page 1"
  const s = section(P, 'Page size', d.pageW > d.pageH ? 'landscape' : 'portrait', 'pagesize');
  const cur = PAGE_PRESETS.findIndex(p => p.w === d.pageW && p.h === d.pageH);
  const presets = select([['', cur < 0 ? 'Custom size' : 'Choose a size…'], ...PAGE_PRESETS.map((p, i) => [String(i), p.name])], cur < 0 ? '' : String(cur),
    v => { if (v !== '') { const p = PAGE_PRESETS[+v]; setPageSize(p.w, p.h); } });
  presets.classList.add('full');
  s.append(presets);
  const g = grid(s); g.style.marginTop = '6px';
  g.append(num('W', d.pageW, v => setPageSize(v, null), 0.1), num('H', d.pageH, v => setPageSize(null, v), 0.1));
  const tall = d.pageH >= d.pageW;
  const turn = () => setPageSize(d.pageH, d.pageW);
  const orient = seg(iconBtn('portrait', 'Portrait', () => { if (!tall) turn(); }, tall, 'Portrait'), iconBtn('landscape', 'Landscape', () => { if (tall) turn(); }, !tall, 'Landscape'));
  orient.classList.add('full');
  s.append(orient);
  note(s, 'Every page uses this size.');
  const m = section(P, 'Margin guides', 'margins', 'margins');
  caption(m, 'Distance from the page edge (mm)');
  const g2 = grid(m);
  const mg = d.margins || { t: 0, r: 0, b: 0, l: 0 };
  g2.append(num('T', mg.t, v => setDoc(() => d.margins = { ...mg, t: v }), 0.5), num('B', mg.b, v => setDoc(() => d.margins = { ...mg, b: v }), 0.5),
    num('L', mg.l, v => setDoc(() => d.margins = { ...mg, l: v }), 0.5), num('R', mg.r, v => setDoc(() => d.margins = { ...mg, r: v }), 0.5));
  const sg = document.createElement('label'); sg.className = 'chk';
  sg.innerHTML = `<input type="checkbox" ${S.showGuides ? 'checked' : ''}> Show guides`;
  sg.querySelector('input').onchange = () => cmd('toggle-guides');
  m.append(sg);
  if (d.guides.v.length || d.guides.h.length) btns(m).append(btn('Clear ruler guides', () => setDoc(() => { d.guides = { v: [], h: [] }; })));
  note(m, 'Drag from a ruler to add a guide; drag it back to remove it.');
  if (!S.master) {
    // Background and master visibility are set per page, so name the page when there is more than one
    const bg = section(P, d.pages.length > 1 ? `Background · page ${S.page + 1}` : 'Background', 'bg', 'background');
    const page = d.pages[S.page];
    bg.append(row('Colour', colorField(page.bg || 'none', v => setDoc(() => { if (v === 'none') delete page.bg; else page.bg = v; }), 'No Colour')));
    const c = document.createElement('label'); c.className = 'chk';
    c.innerHTML = `<input type="checkbox" ${page.hideMaster ? '' : 'checked'}> Show master page items`;
    c.querySelector('input').onchange = (e) => setDoc(() => { page.hideMaster = !e.target.checked; });
    bg.append(c);
    const mb = btns(bg); mb.style.marginTop = '4px';
    mb.append(btn('Edit master page (Ctrl+M)', () => setMaster(true)));
  }
}

// ---- panel widgets
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
function grid(parent) { const g = document.createElement('div'); g.className = 'grid2'; parent.append(g); return g; }
function btns(parent) { const b = document.createElement('div'); b.className = 'pbtns'; parent.append(b); return b; }
function btn(label, fn, cls = '') { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.onclick = fn; return b; }
// Icon button for segmented groups; `label` adds visible text next to the icon
function iconBtn(name, title, fn, on = false, label = '') {
  const b = btn('', fn, on ? 'on' : ''); b.title = title;
  b.innerHTML = icon(name) + (label ? `<span>${label}</span>` : '');
  return b;
}
function seg(...buttons) { const g = document.createElement('div'); g.className = 'seg'; g.append(...buttons); return g; }
function caption(parent, text) { parent.append(Object.assign(document.createElement('div'), { className: 'cap', textContent: text })); }
function row(label, field) { const r = document.createElement('div'); r.className = 'prow'; const l = document.createElement('label'); l.textContent = label; r.append(l, field); return r; }
// Number field: `label` shows in front (X, W, T…), `unit` shows after the number (pt, °, mm)
function num(label, value, onChange, step = 0.5, unit) {
  const w = document.createElement('div'); w.className = 'numf'; w.title = label ? `${label} (${unit || 'mm'})` : unit || '';
  if (label) { const sp = document.createElement('span'); sp.textContent = label; w.append(sp); }
  const i = document.createElement('input'); i.type = 'number'; i.step = step; i.value = fmt(value);
  i.onchange = () => { const v = parseFloat(i.value); if (!isNaN(v)) { renderProps._force = true; onChange(v); renderProps._force = false; } };
  i.onkeydown = (e) => { if (e.key === 'Enter') i.blur(); };
  w.append(i);
  if (unit) { const u = document.createElement('em'); u.textContent = unit; w.append(u); }
  return w;
}
function numInput(value, onChange, step, unit) { return num('', value, onChange, step, unit); }
function select(opts, value, onChange) {
  const s = document.createElement('select'); s.className = 'field';
  s.innerHTML = opts.map(([v, l]) => `<option value="${v}" ${v === value ? 'selected' : ''}>${l}</option>`).join('');
  s.onchange = () => onChange(s.value); return s;
}
// none: label of the "no colour" item ('No Fill', 'No Line', …), or null where a colour is required
function colorField(value, onChange, none = null) { return colorButton(value, onChange, { none }); }

// ---------------------------------------------------------------- colour list (like Publisher 2010 and later)
// Theme colours (Office's) with five lighter / darker shades under each, Standard colours, Recent colours,
// More colours… (Windows' colour window) and Sample colour (pick any colour on the screen)
const THEME_COLORS = [['#ffffff', 'White, Background 1'], ['#000000', 'Black, Text 1'], ['#e7e6e6', 'Grey, Background 2'], ['#44546a', 'Blue-Grey, Text 2'],
  ['#4472c4', 'Blue, Accent 1'], ['#ed7d31', 'Orange, Accent 2'], ['#a5a5a5', 'Grey, Accent 3'], ['#ffc000', 'Gold, Accent 4'],
  ['#5b9bd5', 'Blue, Accent 5'], ['#70ad47', 'Green, Accent 6']];
const STANDARD_COLORS = [['#c00000', 'Dark Red'], ['#ff0000', 'Red'], ['#ffc000', 'Orange'], ['#ffff00', 'Yellow'], ['#92d050', 'Light Green'],
  ['#00b050', 'Green'], ['#00b0f0', 'Light Blue'], ['#0070c0', 'Blue'], ['#002060', 'Dark Blue'], ['#7030a0', 'Purple']];
function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return '#' + [r, g, b].map(v => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
}
// Office's shade rows: black gets lighter steps only, white and very light colours darker steps only
function shadesOf(hex) {
  const [h, s, l] = hexToHsl(hex);
  const steps = l === 0 ? [.5, .35, .25, .15, .05] : l === 1 ? [-.05, -.15, -.25, -.35, -.5]
    : l < .2 ? [.9, .75, .5, .25, .1] : l > .8 ? [-.1, -.25, -.5, -.75, -.9] : [.8, .6, .4, -.25, -.5];
  return steps.map(k => [hslToHex(h, s, k > 0 ? l + (1 - l) * k : l * (1 + k)), k > 0 ? `Lighter ${Math.round(k * 100)}%` : `Darker ${Math.round(-k * 100)}%`]);
}
let colorPop = null; // { el, btn } while a colour list is open
// A swatch button that opens the colour list; b.setColor(v) shows a new colour without calling onChange
function colorButton(value, onChange, { none = null, title = '' } = {}) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'cbtn'; if (title) b.title = title;
  b.innerHTML = '<i></i><b></b>';
  b.setColor = (v) => {
    const isNone = !v || v === 'none', i = b.querySelector('i');
    b.dataset.color = isNone ? 'none' : TE.rgbToHex(v).toLowerCase();
    i.className = isNone ? 'none' : ''; i.style.background = isNone ? '' : v;
  };
  b.setColor(value);
  b.addEventListener('mousedown', (e) => e.preventDefault()); // keep the text selection while editing
  b.addEventListener('click', (e) => {
    if (colorPop && colorPop.btn === b) return closeColorPop();
    openColorPop(b, (v) => { b.setColor(v); onChange(v); }, none, e.detail === 0);
  });
  return b;
}
function openColorPop(btn, pick, noneLabel, byKeyboard) {
  closeColorPop(); closeCtx();
  const cur = btn.dataset.color, recent = (S.settings.recentColors || []).slice(0, 10);
  const sw = (c, name, cls = '') => `<button type="button" class="sw${cls}${c === cur ? ' on' : ''}" data-c="${c}" style="background:${c}" title="${escHtml(name)}" aria-label="${escHtml(name)}"></button>`;
  // the theme grid row by row (so the arrow keys move by 10): the colours, then their five shades
  const theme = THEME_COLORS.map(([c, n]) => sw(c, n, ' base')).join('')
    + [0, 1, 2, 3, 4].map(row => THEME_COLORS.map(([c, n]) => { const [v, step] = shadesOf(c)[row]; return sw(v, `${n}, ${step}`, ' sh' + (row === 0 ? ' first' : row === 4 ? ' last' : '')); }).join('')).join('');
  const el = document.createElement('div');
  el.id = 'colorpop'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Colours');
  el.innerHTML = (noneLabel ? `<button type="button" class="ci" data-c="none"><i class="none"></i>${noneLabel}</button>` : '')
    + `<div class="ccap">Theme Colours</div><div class="cgrid theme">${theme}</div>`
    + `<div class="ccap">Standard Colours</div><div class="cgrid std">${STANDARD_COLORS.map(([c, n]) => sw(c, n)).join('')}</div>`
    + (recent.length ? `<div class="ccap">Recent Colours</div><div class="cgrid recent">${recent.map(c => sw(c, c)).join('')}</div>` : '')
    + '<hr><button type="button" class="ci" data-more><i class="more"></i>More Colours…</button>'
    + (window.EyeDropper ? `<button type="button" class="ci" data-sample><i class="eye">${icon('eyedropper')}</i>Sample Colour</button>` : '')
    + '<input type="color" tabindex="-1" aria-hidden="true">';
  document.body.append(el);
  // under the button, or above it when there is no room below; always inside the window
  const r = btn.getBoundingClientRect(), p = el.getBoundingClientRect();
  el.style.left = Math.max(8, Math.min(r.left, innerWidth - p.width - 8)) + 'px';
  el.style.top = Math.max(8, r.bottom + 4 + p.height > innerHeight - 8 ? r.top - 4 - p.height : r.bottom + 4) + 'px';
  const done = (c) => { closeColorPop(); if (c !== 'none') rememberColor(c); pick(c); };
  el.addEventListener('mousedown', (e) => e.preventDefault()); // keep the text selection while editing
  el.querySelectorAll('[data-c]').forEach(x => x.onclick = () => done(x.dataset.c));
  const more = el.querySelector('input[type=color]');
  more.value = /^#[0-9a-f]{6}$/.test(cur) ? cur : '#000000';
  more.addEventListener('change', () => done(more.value.toLowerCase()));
  el.querySelector('[data-more]').onclick = () => { try { more.showPicker(); } catch { more.click(); } }; // Windows' colour window
  // Publisher's "Sample Fill Colour": the list closes and the pointer picks a colour anywhere on the screen (Esc: nothing)
  const sample = el.querySelector('[data-sample]');
  if (sample) sample.onclick = () => { closeColorPop(); new EyeDropper().open().then((res) => done(res.sRGBHex.toLowerCase()), () => {}); };
  el.addEventListener('keydown', onColorKey);
  colorPop = { el, btn };
  btn.classList.add('open');
  if (byKeyboard) (el.querySelector('.sw.on') || el.querySelector('.sw')).focus();
}
function closeColorPop() {
  if (!colorPop) return;
  colorPop.el.remove(); colorPop.btn.classList.remove('open'); colorPop = null;
}
// Keys inside the list stay in the list: arrows move between colours (10 to a row), Esc closes, Enter / Space pick
function onColorKey(e) {
  const sws = [...colorPop.el.querySelectorAll('.sw')], i = sws.indexOf(document.activeElement);
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); const b = colorPop.btn; closeColorPop(); b.focus(); return; }
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -10, ArrowDown: 10 }[e.key];
  if (step) { e.preventDefault(); e.stopPropagation(); sws[i < 0 ? 0 : Math.max(0, Math.min(sws.length - 1, i + step))].focus(); }
  else if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); // the focused button's own click picks it
}
function rememberColor(c) {
  const list = [c, ...(S.settings.recentColors || []).filter(x => x !== c)].slice(0, 10);
  S.settings.recentColors = list;
  api.setSettings({ recentColors: list }).then((s) => { if (s) S.settings = s; }, () => {});
}

// ---- property actions
function setProp(fn) {
  finishEditing();
  for (const o of selObjs()) fn(o);
  commit(); renderStage(); renderProps(); updateTextbar();
}
function setDoc(fn) { fn(); commit(); renderAll(); }
function moveTo(x, y) {
  const sel = selObjs(); const bb = bbox(sel);
  if (sel.length === 1 && sel[0].rot) { setProp(o => { if (x != null) o.x = x; if (y != null) o.y = y; }); return; }
  const dx = x != null ? x - (sel.length === 1 ? sel[0].x : bb.x) : 0, dy = y != null ? y - (sel.length === 1 ? sel[0].y : bb.y) : 0;
  setProp(o => { o.x = round2(o.x + dx); o.y = round2(o.y + dy); });
}
function setSize(w, h) { setProp(o => { if (w != null) o.w = Math.max(0.5, w); if (h != null) o.h = Math.max(0.5, h); }); }
function setPageSize(w, h) { setDoc(() => { if (w) S.doc.pageW = round2(Math.max(5, w)); if (h) S.doc.pageH = round2(Math.max(5, h)); }); requestAnimationFrame(zoomFit); }

function align(kind) {
  const sel = selObjs().filter(o => !o.locked);
  if (!sel.length) return;
  const ref = sel.length > 1 ? bbox(sel) : { x: 0, y: 0, w: S.doc.pageW, h: S.doc.pageH };
  // move whole groups together when only one group is selected
  for (const o of sel) {
    const b = sel.length > 1 && !allSameGroup(sel) ? bbox([o]) : bbox(sel);
    let dx = 0, dy = 0;
    if (kind === 'l') dx = ref.x - b.x; if (kind === 'r') dx = ref.x + ref.w - (b.x + b.w); if (kind === 'c') dx = ref.x + ref.w / 2 - (b.x + b.w / 2);
    if (kind === 't') dy = ref.y - b.y; if (kind === 'b') dy = ref.y + ref.h - (b.y + b.h); if (kind === 'm') dy = ref.y + ref.h / 2 - (b.y + b.h / 2);
    o._dx = dx; o._dy = dy;
  }
  setProp(o => { o.x = round2(o.x + (o._dx || 0)); o.y = round2(o.y + (o._dy || 0)); delete o._dx; delete o._dy; });
}
function allSameGroup(sel) { return sel.length > 1 && sel.every(o => o.groupId && o.groupId === sel[0].groupId); }
function distribute(axis) {
  const sel = selObjs().filter(o => !o.locked);
  if (sel.length < 3) return;
  const items = sel.map(o => ({ o, b: bbox([o]) })).sort((a, b) => axis === 'x' ? a.b.x - b.b.x : a.b.y - b.b.y);
  const first = items[0].b, last = items[items.length - 1].b;
  const total = items.reduce((s, it) => s + (axis === 'x' ? it.b.w : it.b.h), 0);
  const span = axis === 'x' ? last.x + last.w - first.x : last.y + last.h - first.y;
  const gap = (span - total) / (items.length - 1);
  let pos = axis === 'x' ? first.x : first.y;
  for (const it of items) {
    const d = pos - (axis === 'x' ? it.b.x : it.b.y);
    if (axis === 'x') it.o._dx = d; else it.o._dy = d;
    pos += (axis === 'x' ? it.b.w : it.b.h) + gap;
  }
  setProp(o => { o.x = round2(o.x + (o._dx || 0)); o.y = round2(o.y + (o._dy || 0)); delete o._dx; delete o._dy; });
}
function fitHeight() {
  const sel = selObjs().filter(o => o.type === 'box');
  for (const o of sel) {
    // the design's text, not a person's (Preview): measured on the stage (zoomed) or off-screen at 100 %
    const h = withDesignKt(o, (el) => el.getBoundingClientRect().height / (pageEl.contains(el) ? pxPerMm() : PXMM));
    if (h == null) continue;
    const pad = o.pad || { t: 0, b: 0 };
    o._h = round2(h + pad.t + pad.b + 0.5);
  }
  setProp(o => { if (o._h) o.h = o._h; delete o._h; });
}

// ---------------------------------------------------------------- objects: clipboard, arrange, images
function cloneObjects(list, offset = 0) {
  const gmap = {};
  return list.map(o => {
    const c = clone(o); c.id = uid();
    if (c.groupId) c.groupId = gmap[c.groupId] || (gmap[c.groupId] = uid());
    c.x = round2(c.x + offset); c.y = round2(c.y + offset);
    return c;
  });
}
function copySel(cut = false) {
  const sel = selObjs();
  if (!sel.length) return;
  S.clip = clone(sel);
  try { navigator.clipboard.writeText('BOHPUM-OBJECTS:' + JSON.stringify(S.clip)); } catch {}
  if (cut) deleteSel();
}
function pasteObjects(list) {
  const existing = new Set(objs().map(o => `${o.x},${o.y},${o.w}`));
  const clash = list.some(o => existing.has(`${o.x},${o.y},${o.w}`));
  const copies = cloneObjects(list, clash ? 3 : 0);
  objs().push(...copies);
  S.sel = new Set(copies.map(c => c.id));
  commit(); renderStage(); renderProps(); updateTextbar();
}
async function pasteFromSystem() {
  try {
    const items = await navigator.clipboard.read();
    for (const it of items) {
      const imgType = it.types.find(t => t.startsWith('image/'));
      if (imgType) { const blob = await it.getType(imgType); return insertImageBlob(blob); }
      if (it.types.includes('text/plain')) { const t = await (await it.getType('text/plain')).text(); return pasteText(t); }
    }
  } catch { if (S.clip) pasteObjects(S.clip); }
}
function pasteText(t, html = '') {
  if (t.startsWith('BOHPUM-OBJECTS:')) { try { return pasteObjects(JSON.parse(t.slice(15))); } catch { return; } }
  if (!t.trim()) return;
  const w = Math.min(100, S.doc.pageW * 0.7);
  const o = makeObject('box', { x: round2((S.doc.pageW - w) / 2), y: round2(S.doc.pageH / 3), w, h: 20, shape: 'none', html: html || TE.htmlFromPlainText(t) });
  objs().push(o); S.sel = new Set([o.id]);
  commit(); renderStage(); renderProps();
  fitHeight();
}
function deleteSel() {
  const sel = selObjs().filter(o => !o.locked);
  if (!sel.length) return;
  const ids = new Set(sel.map(o => o.id));
  const arr = objs();
  for (let i = arr.length - 1; i >= 0; i--) if (ids.has(arr[i].id)) arr.splice(i, 1);
  S.sel.clear(); commit(); renderStage(); renderProps(); updateTextbar(); updateStatus();
}
function duplicateSel() {
  const sel = selObjs();
  if (!sel.length) return;
  const copies = cloneObjects(sel, 3);
  objs().push(...copies); S.sel = new Set(copies.map(c => c.id));
  commit(); renderStage(); renderProps();
}
function zorder(kind) {
  const arr = objs(); const ids = S.sel;
  if (!ids.size) return;
  if (kind === 'front' || kind === 'back') {
    const sel = arr.filter(o => ids.has(o.id)), rest = arr.filter(o => !ids.has(o.id));
    arr.splice(0, arr.length, ...(kind === 'front' ? [...rest, ...sel] : [...sel, ...rest]));
  } else if (kind === 'forward') {
    for (let i = arr.length - 2; i >= 0; i--) if (ids.has(arr[i].id) && !ids.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
  } else {
    for (let i = 1; i < arr.length; i++) if (ids.has(arr[i].id) && !ids.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
  }
  commit(); renderStage();
}
function loadImageSize(src) { return new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([400, 300]); i.src = src; }); }
async function insertImageData(src, at) {
  const [nw, nh] = await loadImageSize(src);
  const maxW = S.doc.pageW * 0.6, maxH = S.doc.pageH * 0.6;
  let w = nw * 25.4 / 96, h = nh * 25.4 / 96;
  const s = Math.min(1, maxW / w, maxH / h); w *= s; h *= s;
  const x = at ? at.x - w / 2 : (S.doc.pageW - w) / 2, y = at ? at.y - h / 2 : (S.doc.pageH - h) / 2;
  const o = makeObject('image', { x: round2(x), y: round2(y), w: round2(w), h: round2(h), src, fit: 'fill' });
  objs().push(o); S.sel = new Set([o.id]);
  commit(); renderStage(); renderProps();
}
function blobToDataUrl(blob) { return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); }
async function insertImageBlob(blob, at) { insertImageData(await blobToDataUrl(blob), at); }
async function insertImages() {
  finishEditing();
  const imgs = await api.pickImages();
  for (const im of imgs) await insertImageData(im.dataUrl);
}
async function replaceImage(o) {
  const imgs = await api.pickImages();
  if (!imgs.length) return;
  const [nw, nh] = await loadImageSize(imgs[0].dataUrl);
  const keepH = o.src ? o.h : o.w * nh / nw;
  setProp(x => { if (x.id === o.id) { x.src = imgs[0].dataUrl; x.h = round2(keepH); x.note = null; } });
}
async function resetRatio(o) {
  if (!o.src) return;
  const [nw, nh] = await loadImageSize(o.src);
  setProp(x => { if (x.id === o.id) x.h = round2(x.w * nh / nw); });
}

// ---------------------------------------------------------------- pages
function addPage(dup = false) {
  finishEditing();
  const p = dup ? { ...clone(S.doc.pages[S.page]), id: uid(), objects: cloneObjects(S.doc.pages[S.page].objects) } : newPage();
  S.doc.pages.splice(S.page + 1, 0, p);
  S.page += 1; S.master = false; S.sel.clear();
  commit(); renderAll();
}
async function deletePage() {
  if (S.doc.pages.length <= 1) return toast('A publication needs at least one page.');
  const p = S.doc.pages[S.page];
  if (p.objects.length && !(await confirmBox(`Delete page ${S.page + 1}?`, 'Its contents will be removed.', 'Delete'))) return;
  S.doc.pages.splice(S.page, 1);
  S.page = Math.min(S.page, S.doc.pages.length - 1); S.sel.clear();
  commit(); renderAll();
}
function movePage(d) {
  const i = S.page, j = i + d;
  if (j < 0 || j >= S.doc.pages.length) return;
  const a = S.doc.pages; [a[i], a[j]] = [a[j], a[i]]; S.page = j;
  commit(); renderAll();
}

// ---------------------------------------------------------------- files
function loadDoc(doc, path) {
  S.doc = withDefaults(doc); S.path = path; S.page = 0; S.master = false; S.sel.clear(); S.editing = null; S.mail = null;
  resetHistory(); setDirty(false);
  if (S.doc.merge) loadMailList(true);
  renderAll();
  requestAnimationFrame(zoomFit);
}
// ---------------------------------------------------------------- mail merge lists (src/merge.js, src/mailings.js)
const mergeKey = () => S.doc.merge ? JSON.stringify([S.doc.merge.list, S.doc.merge.sheet]) : '';
let lastMailMenu = '';
function syncMailMenu() {
  const m = JSON.stringify(mailMenuState(S.mail, selObjs(), !!S.editing));
  if (m !== lastMailMenu) { lastMailMenu = m; api.setMailMenu(JSON.parse(m)); renderBar(); } // the toolbar greys out as the menu does
}
function renderBar() {
  clampAt();
  renderMailBar($('mailbar'), S.doc, S.mail, { cmd, icon, state: mailMenuState(S.mail, selObjs(), !!S.editing), fieldMenu });
}
// The toolbar's Insert Field: the columns in a list under the button (the caret stays in the text box)
function fieldMenu(b) {
  const r = b.getBoundingClientRect(), cols = S.mail && S.mail.list ? S.mail.list.columns : [];
  showMenu({ clientX: r.left, clientY: r.bottom + 2 }, cols.map((c, i) => [escHtml(c), 'mail-field-' + i, '', true]));
}
// the person showing stays within the ticked people when the list or the ticks change (renderAll draws the bar)
function clampAt() {
  const m = S.mail;
  if (m && m.list && S.doc.merge) m.at = Math.max(0, Math.min(m.at, ticked(m.list, S.doc.merge.off).length - 1));
}

// Preview: the row of the person showing (ticked people only), or null
function shownRow() {
  const m = S.mail;
  if (!m || !m.preview || !m.list || !S.doc.merge) return null;
  const people = ticked(m.list, S.doc.merge.off);
  return people.length ? m.list.rows[people[Math.min(m.at, people.length - 1)]] : null;
}
const fillCtx = (row) => ({ columns: S.mail.list.columns, row, photos: S.mail.photos });
// What the page and the thumbnails show: the design, or a copy filled for the person showing. Selection, ids and
// editing always use S.doc; nothing filled is ever written into it.
function viewDoc() {
  const row = shownRow();
  if (!row) return S.doc;
  askPhotos(row);
  const fill = (p) => fillPage(S.doc, p, fillCtx(row)).page, d = S.doc;
  return { ...d, pages: d.pages.map(fill), master: d.master && { ...d.master, objects: fill({ objects: d.master.objects, hideMaster: true }).objects } };
}
// one object as the page shows it (while dragging and resizing)
function shownObj(o) { const row = shownRow(); return row ? fillPage(S.doc, { objects: [o], hideMaster: true }, fillCtx(row)).page.objects[0] : o; }
// the photo cells of one person
const photoCells = (row) => [...new Set([...fieldsIn(S.doc).photo].map(c => S.mail.list.columns.indexOf(c)).filter(i => i >= 0).map(i => String(row[i] ?? '')))];
// the pixels each cell's photo needs: the largest frame of a column it is in, at 300 dpi, never above 1600
function photoPx(cells) {
  const cols = new Map(), want = new Set(cells), px = new Map(), { columns, rows } = S.mail.list;
  for (const o of [...S.doc.pages.flatMap(p => p.objects), ...(S.doc.master ? S.doc.master.objects : [])])
    if (o.type === 'image' && o.mergePhoto) cols.set(o.mergePhoto, Math.max(cols.get(o.mergePhoto) || 0, Math.min(1600, Math.ceil(Math.max(o.w, o.h) / 25.4 * 300))));
  for (const [col, n] of cols) {
    const i = columns.indexOf(col);
    if (i >= 0) for (const r of rows) { const c = String(r[i] ?? ''); if (want.has(c)) px.set(c, Math.max(px.get(c) || 0, n)); }
  }
  return px;
}
// photos are read once into S.mail.photos (again if a frame grew); a cell already being read is waited for
// (S.mail.asking: cell → promise). A cell main didn't answer (or a failed call) is kept as unreadable until Print or
// Save As PDF reads the list again
function fetchPhotos(cells) {
  const m = S.mail, px = photoPx(cells), size = (c) => px.get(c) || 1600;
  const todo = cells.filter(c => !m.asking.has(c) && (!m.photos.has(c) || m.photos.get(c).url && m.photos.get(c).px < size(c)));
  const sizes = new Map();
  for (const c of todo) sizes.set(size(c), [...(sizes.get(size(c)) || []), c]);
  for (const [n, group] of sizes) {
    const p = api.mailPhotos(group, S.doc.merge.list, n).catch((e) => { console.error('mail-photos', e); return {}; }).then((res) => {
      for (const c of group) m.photos.set(c, res && Object.hasOwn(res, c) ? { ...res[c], px: n } : c.trim() ? { unreadable: c } : { empty: true });
      group.forEach(c => m.asking.delete(c));
    });
    group.forEach(c => m.asking.set(c, p));
  }
  return Promise.all(cells.map(c => m.asking.get(c)));
}
// the person showing's photos; the page is drawn again when they come
function askPhotos(row) {
  const m = S.mail, cells = photoCells(row).filter(c => !m.photos.has(c) && !m.asking.has(c));
  if (!cells.length) return;
  fetchPhotos(cells).then(() => {
    if (S.mail === m && shownRow()) { if (!S.editing) renderStage(); renderThumbs(); } // a box being edited stays as it is
  });
}
// The people who print: everyone ticked, or the person showing (Preview on or off), filled in by merge.js.
// null without a list that could be read.
function mailPeople() {
  const m = S.mail;
  if (!S.doc.merge || !m || !m.list) return null;
  clampAt();
  const people = ticked(m.list, S.doc.merge.off), ctx = { list: m.list, photos: m.photos, fetchPhotos };
  return {
    count: people.length,
    build: (who, pageIdxs, onProgress) => mergedDoc(S.doc, who === 'one' ? people.slice(m.at, m.at + 1) : people, pageIdxs, ctx, onProgress),
    confirm: (problems) => problemsBox(modal, problems)
  };
}
function stepPerson(d) {
  if (!S.mail || !S.mail.list || !S.doc.merge) return;
  clampAt();
  const n = ticked(S.mail.list, S.doc.merge.off).length, at = Math.max(0, Math.min(n - 1, S.mail.at + d));
  if (at === S.mail.at) return;
  finishEditing();
  S.mail.at = at;
  renderStage(); renderThumbs(); renderBar();
}
function togglePreview() {
  if (!S.mail || !S.mail.list) return syncMailMenu();
  finishEditing();
  S.mail.preview = !S.mail.preview;
  renderStage(); renderThumbs(); renderProps(); updateTextbar(); renderBar(); syncMailMenu();
}
// Remove List: fields become plain text showing their name, photo fields ordinary pictures (the photo showing, if any)
function removeList() {
  if (!S.doc.merge) return;
  finishEditing();
  const row = shownRow(), m = S.mail;
  for (const o of [...S.doc.pages.flatMap(p => p.objects), ...(S.doc.master ? S.doc.master.objects : [])]) {
    if (o.type === 'image' && o.mergePhoto) {
      const i = row ? m.list.columns.indexOf(o.mergePhoto) : -1, r = i >= 0 && m.photos.get(String(row[i] ?? ''));
      if (r && r.url) o.src = r.url;
      delete o.mergePhoto;
    }
    if (o.type !== 'box' || !o.html || !o.html.includes('data-field="merge"')) continue;
    const d = document.createElement('div');
    d.innerHTML = o.html;
    d.querySelectorAll('span[data-field="merge"]').forEach(s => {
      const text = '«' + s.dataset.col + '»';
      if (!s.getAttribute('style')) return s.replaceWith(text);
      s.removeAttribute('data-field'); s.removeAttribute('data-col'); s.removeAttribute('contenteditable'); s.textContent = text;
    });
    o.html = TE.sanitizeHtml(d.innerHTML);
  }
  delete S.doc.merge;
  S.mail = null;
  commit(); renderAll();
}
// Reads the file the publication points at. A problem is kept in S.mail.error (the bar says it); when asked, a box too.
// again: Print and Save As PDF read it once more (edited in Excel, a photo put in place): the person showing, Preview
// and the photos found stay, the others are asked again. → whether the list could be read
async function loadMailList(askIfMissing = true, again = false) {
  const m = S.doc.merge, key = mergeKey();
  if (!m) return false;
  let error = null, list = null;
  const r = await api.readList(m.list);
  if (r.error) error = r.error;
  else try {
    list = parseList(r, { sheet: m.sheet });
    if (m.sheet && list.sheet !== m.sheet) { list = null; error = `The sheet «${m.sheet}» is no longer in this list.`; }
  } catch (e) { error = e.message; }
  if (mergeKey() !== key) return false; // another list was chosen (or none) while the file was read
  const old = again && !error && S.mail;
  if (old) {
    old.list = list;
    for (const [c, r] of old.photos) if (!r.url) old.photos.delete(c);
    clampAt(); renderThumbs();
  } else S.mail = { list, at: 0, preview: false, photos: new Map(), asking: new Map(), error };
  renderBar(); syncMailMenu(); renderStage();
  if (error && askIfMissing && (await choiceBox(error, 'The design still opens and shows its «blanks».', ['Find the list…', 'Later'])) === 0) await selectList(true);
  return !error;
}
// Pick a list file (and a sheet) for the publication; keepOff: the same people stay unticked (Find the list…, or the
// same file and sheet chosen again)
async function selectList(keepOff = false) {
  finishEditing();
  const p = await api.pickList();
  if (!p) return;
  const r = await api.readList(p);
  let list;
  try {
    if (r.error) throw new Error(r.error);
    list = parseList(r);
    if (list.sheets.length > 1) {
      const sheet = await sheetBox(modal, list.sheets);
      if (sheet == null) return;
      if (sheet !== list.sheet) list = parseList(r, { sheet });
    }
  } catch (e) { return void choiceBox(e.message, 'Choose another list.', ['OK']); }
  const same = S.doc.merge && S.doc.merge.list.toLowerCase() === p.toLowerCase() && S.doc.merge.sheet === list.sheet;
  S.doc.merge = { list: p, sheet: list.sheet, off: (keepOff || same) && S.doc.merge ? S.doc.merge.off : [] };
  S.mail = { list, at: 0, preview: false, photos: new Map(), asking: new Map(), error: null };
  commit(); renderAll();
}
// Choose People: tick who gets a copy; the unticked are kept by their row's content
async function choosePeople() {
  if (!S.mail || !S.mail.list || !S.doc.merge) return;
  finishEditing();
  const off = await peopleBox(modal, S.mail.list, S.doc.merge.off);
  if (!off) return;
  S.doc.merge.off = off;
  commit(); renderAll();
}
// Photo from List: which column fills the selected picture
async function photoFromList() {
  const o = selObjs()[0];
  if (!S.mail || !S.mail.list || !o || o.type !== 'image') return;
  const col = await photoBox(modal, S.mail.list.columns, o.mergePhoto, S.mail.list.rows);
  if (col === undefined) return;
  setProp(x => { if (col) x.mergePhoto = col; else delete x.mergePhoto; });
  syncMailMenu();
}
// Insert Field: at the caret of the box being edited; the native menu took the focus, so the kept range is put back first
function insertField(col) {
  const kt = editingRoot();
  if (!kt || col == null) return;
  restoreRange(kt); kt.focus();
  // the field is wrapped in the spans around the caret so it takes their formatting; the zero-width space after it
  // is a spot to type in (stripped on finish)
  const sel = window.getSelection();
  let html = fieldHtml(col) + '​';
  for (let n = sel.rangeCount ? sel.getRangeAt(0).startContainer : null; n && n !== kt; n = n.parentNode) {
    if (n.tagName === 'SPAN' && n.getAttribute('style')) html = `<span style="${n.getAttribute('style').replace(/"/g, '&quot;')}">${html}</span>`;
  }
  document.execCommand('insertHTML', false, html);
  fixLineHeights(kt.closest('.kobj'));
}
async function confirmDiscard() {
  if (!S.dirty) return true;
  const r = await choiceBox('Save changes first?', 'Your current publication has unsaved changes.', ['Save', "Don't save", 'Cancel']);
  if (r === 0) return await save();
  return r === 1;
}
// While LibreOffice reads a .pub (or another outside format), a box with the look of the Explorer menu's convert
// window (task.html) covers the editor: the file, what it's doing, a moving bar, Cancel (also Esc). It closes by
// itself when the file is in; a problem stays in it, with Close. main.js says when it waits for other files.
// The same box shows the Publisher reader's download first (progress: a real bar, "12 of 160 MB"; Cancel stops it).
let reading = null; // that box while the file is being read (or { name } while the reader question is up)
const mbOf = (bytes) => Math.max(1, Math.round(bytes / 1048576));
function readingBox(name) {
  const back = document.createElement('div'); back.className = 'modal-back';
  back.innerHTML = `<div class="modal progress" role="dialog">
    <div class="p-head"><img src="img/bpum-file.png" alt="" width="28" height="38" draggable="false"><div><div class="p-what"></div><div class="p-step"></div></div></div>
    <div class="p-bar"><div class="p-fill"></div></div><ul class="p-lines" hidden></ul>
    <div class="p-foot"><button class="btn">Cancel</button></div></div>`;
  const q = (s) => back.querySelector(s), btn = q('.p-foot .btn');
  const steps = { waiting: 'Waiting for the other files to finish…', reading: /\.pub$/i.test(name) ? 'Reading the Publisher file…' : 'Reading the file…' };
  const box = { name, cancelled: false, downloading: false };
  const close = () => { back.remove(); document.removeEventListener('keydown', key, true); if (reading === box) reading = null; };
  const key = (e) => { if (back === $('modal-root').lastElementChild && e.key === 'Escape') { e.stopPropagation(); btn.click(); } };
  const bar = (frac) => { q('.modal').classList.toggle('determinate', frac != null); if (frac != null) q('.modal').style.setProperty('--frac', String(frac)); };
  box.step = (s) => { if (steps[s] && !box.downloading) q('.p-step').textContent = steps[s]; };
  // the reader download: { phase: 'download', got, total } | { phase: 'unpack' }
  box.progress = ({ phase, got = 0, total = 0 }) => {
    if (!box.downloading) return;
    if (phase === 'download') {
      const of = mbOf(total);
      q('.p-step').textContent = `Downloading the Publisher reader… ${Math.min(of, Math.floor(got / 1048576))} of ${of} MB`;
      bar(total ? Math.min(1, got / total) : 0);
    } else if (phase === 'unpack') { q('.p-step').textContent = 'Setting up the Publisher reader…'; bar(null); }
  };
  box.download = (total) => { box.downloading = true; box.progress({ phase: 'download', got: 0, total }); };
  box.reading = () => { box.downloading = false; bar(null); q('.p-step').textContent = steps.reading; };
  box.done = close;
  box.fail = (why) => {
    if (reading === box) reading = null;
    q('.modal').classList.add('failed');
    q('.p-what').textContent = `Couldn't open ${name}`; q('.p-step').textContent = '1 problem below';
    const li = document.createElement('li'); li.textContent = why; q('.p-lines').append(li); q('.p-lines').hidden = false;
    btn.textContent = 'Close'; btn.classList.add('primary'); btn.onclick = close; btn.focus();
  };
  btn.onclick = () => { box.cancelled = true; if (box.downloading) api.cancelReader(); else api.cancelRead(); close(); };
  q('.p-what').textContent = `Opening ${name}`;
  document.addEventListener('keydown', key, true);
  $('modal-root').append(back);
  return reading = box;
}
// Before an outside format is read: the Publisher reader (a trimmed LibreOffice, reader.js) is downloaded once, after
// asking in the app's own box. → null (Not now, or a problem already shown) or { opts, box }: the options for
// readDocument, and the reading box when the download already opened it.
let oldReaderOk = false; // Not now to a newer reader: this run reads with the one already here
async function readerReady(name) {
  const hold = reading = { name }; // from the question on, another file only gets "Please wait"
  try {
    const st = await api.readerStatus();
    if (!st.need || (st.need === 'newer' && oldReaderOk)) return { opts: { oldReader: oldReaderOk }, box: null };
    if (!st.canDownload && st.need === 'download') { await choiceBox('Bohpum needs the Publisher reader', st.why, ['OK']); return null; }
    const mb = mbOf(st.size || 0), newer = st.need === 'newer';
    const r = newer
      ? await choiceBox('A newer Publisher reader is ready', `It's a download of about ${mb} MB. Not now opens the file with the reader you have.`, ['Download', 'Not now'])
      : await choiceBox('Bohpum needs the Publisher reader', `It's a one-time download of about ${mb} MB. Bohpum's own files open without it.`, ['Download', 'Not now']);
    if (r !== 0) { if (!newer) return null; oldReaderOk = true; return { opts: { oldReader: true }, box: null }; }
    const box = readingBox(name);
    box.download(st.size || 0);
    const got = await api.getReader();
    if (box.cancelled) return null;
    if (got.error) { box.fail(got.error); return null; }
    if (!got.ok) { box.done(); return null; }
    box.reading();
    return { opts: {}, box };
  } finally { if (reading === hold) reading = null; }
}
async function openFile(p) {
  if (reading) return toast(`Please wait: ${reading.name} is still opening.`);
  finishEditing();
  if (!(await confirmDiscard())) return;
  if (!p) p = await api.openDialog();
  if (!p) return;
  const isForeign = !/\.(bpum|kbach|json|fodg)$/i.test(p);
  let box = null, opts = {};
  if (isForeign) {
    const name = p.split(/[\\/]/).pop(), ready = await readerReady(name);
    if (!ready) return;
    opts = ready.opts; box = ready.box || readingBox(name);
  }
  const r = await api.readDocument(p, opts);
  if (box && box.cancelled) return; // Cancel: the publication on screen stays as it was
  if (r.needReader) return box.fail('Bohpum needs the Publisher reader. Open the file again to download it.');
  if (r.error) {
    if (r.missing) rememberRecent(p, false);
    return box ? box.fail(r.error) : toast('Could not open the file: ' + r.error, 6000);
  }
  const base = p.split(/[\\/]/).pop().replace(/\.[^.]+$/, '');
  try {
    if (r.kind === 'bpum') {
      const d = JSON.parse(r.text);
      if (d.format !== 'bpum' && d.format !== 'kbach') throw new Error('Not a Bohpum file');
      d.format = 'bpum'; // older files were saved as 'kbach'
      loadDoc(d, p);
      rememberRecent(p);
      toast('Opened ' + base);
    } else {
      const { doc: d, warnings: warn } = docFromFodg(r.text, base);
      if (box) box.done();
      loadDoc(d, null);
      S.importedFrom = p;
      rememberRecent(p);
      toast(`Opened ${base} (${d.pages.length} page${d.pages.length > 1 ? 's' : ''}, ${fmt(d.pageW)} × ${fmt(d.pageH)} mm)` + (warn.length ? ' – ' + warn.join(' ') : '') + ' Save will create a .bpum file.', warn.length ? 9000 : 5000);
    }
  } catch (err) { if (box) box.fail('It may be damaged, or not a Publisher file.'); else toast('Could not read the file: ' + err.message, 6000); }
}
async function save(as = false) {
  finishEditing();
  let p = S.path;
  if (as || !p || !/\.bpum$/i.test(p)) {
    // Save As also offers PDF; plain Save (also a first save) only .bpum
    const filters = [{ name: 'Bohpum publication', extensions: ['bpum'] }];
    if (as) filters.push({ name: 'PDF', extensions: ['pdf'] });
    p = await api.saveDialog({ defaultName: (S.doc.name || 'Untitled') + '.bpum', filters });
    if (!p) return false;
    if (/\.pdf$/i.test(p)) { await savePdf(p); return false; } // a copy: the publication itself is not saved
  }
  const w = await api.writeFile({ path: p, text: bpumText(S.doc, p) });
  if (w && w.error) { toast('Could not save: ' + w.error, 6000); return false; }
  S.path = p; setDirty(false); renderProps();
  rememberRecent(p);
  toast('Saved ' + S.doc.name);
  return true;
}
// ---------------------------------------------------------------- recent files
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
async function rememberRecent(p, keep = true) {
  const rest = (S.settings.recent || []).filter(x => x.toLowerCase() !== p.toLowerCase());
  try { S.settings = await api.setSettings({ recent: keep ? [p, ...rest].slice(0, 6) : rest }); } catch {}
}

let welcome = null; // the welcome screen while it is open (first = true)
function newDialog(first = false) {
  finishEditing();
  let chosen = PAGE_PRESETS[0];
  const body = document.createElement('div');
  const groups = [...new Set(PAGE_PRESETS.map(p => p.group))];
  // "Card 110 × 60 mm" → "Card"; the size goes on its own line so every tile reads the same way
  const shortName = (p) => p.name.replace(/\s*[\d.]+\s*×\s*[\d.]+\s*mm/, '').trim();
  const presets = groups.map(g => `<div class="preset-group">${g}</div><div class="preset-grid">${PAGE_PRESETS.map((p, i) => p.group !== g ? '' : (() => {
      const s = 46 / Math.max(p.w, p.h);
      return `<div class="preset${i === 0 ? ' on' : ''}" data-i="${i}" title="${escHtml(p.name)}"><div class="pv"><div style="width:${p.w * s}px;height:${p.h * s}px"></div></div><div class="nm">${escHtml(shortName(p))}</div><div class="dm">${fmt(p.w)} × ${fmt(p.h)} mm</div></div>`;
    })()).join('')}</div>`).join('') +
    `<div class="preset-group">Custom size</div><div class="custom-size"><div class="numf"><span>W</span><input type="number" id="nd-w" min="1" value="${chosen.w}"></div><span class="x">×</span><div class="numf"><span>H</span><input type="number" id="nd-h" min="1" value="${chosen.h}"></div><span class="muted">mm</span></div>`;
  if (first) {
    const recent = S.settings.recent || [];
    const recentHtml = recent.length
      ? recent.map(p => {
          const name = p.split(/[\\/]/).pop(), dir = p.slice(0, p.length - name.length).replace(/[\\/]$/, '');
          return `<button class="w-recent" data-path="${escHtml(p)}" title="${escHtml(p)}">${icon('new')}<span><b>${escHtml(name)}</b><small>${escHtml(dir)}</small></span></button>`;
        }).join('')
      : `<div class="muted w-empty">Files you open or save will appear here.</div>`;
    body.className = 'welcome';
    body.innerHTML = `
      <div class="w-side">
        <div class="w-brand"><img class="logo" src="img/logo.png" alt="" draggable="false"><div class="w-name"><span>Bohpum</span><span class="km" lang="km">បោះពុម្ព</span></div><span class="muted">Open, edit and print your Publisher files</span></div>
        <button class="w-action" data-open><i>${icon('open')}</i><span><b>Open a file…</b><small>.pub or .bpum file · Ctrl+O</small></span></button>
        <button class="w-action" data-blank><i>${icon('new')}</i><span><b>Blank A4 page</b><small>Empty page, 210 × 297 mm</small></span></button>
        <div class="preset-group">Recent</div>
        <div class="w-recents">${recentHtml}</div>
        <div class="w-tip">Tip: drag a .pub file onto the window to open it.</div>
      </div>
      <div class="w-main"><h3>New publication</h3>${presets}</div>`;
  } else {
    body.className = 'new-pub';
    body.innerHTML = presets;
  }
  const m = first
    ? modal(null, body, [['Close', null], ['Create', 'create', true]], 'welcome-modal')
    : modal('New publication', body, [['Cancel', null], ['Create', 'create', true]]);
  const wIn = body.querySelector('#nd-w'), hIn = body.querySelector('#nd-h');
  body.querySelectorAll('.preset').forEach(el => el.onclick = () => {
    body.querySelectorAll('.preset').forEach(x => x.classList.remove('on')); el.classList.add('on');
    chosen = PAGE_PRESETS[+el.dataset.i]; wIn.value = chosen.w; hIn.value = chosen.h;
  });
  body.querySelectorAll('.preset').forEach(el => el.ondblclick = () => m.resolve('create'));
  // Typing a custom size means no preset tile is chosen any more
  [wIn, hIn].forEach(inp => inp.oninput = () => body.querySelectorAll('.preset').forEach(x => x.classList.remove('on')));
  if (first) { welcome = m; m.done.then(() => { welcome = null; }); }
  const op = body.querySelector('[data-open]'); if (op) op.onclick = () => { m.close(); openFile(); };
  const bl = body.querySelector('[data-blank]'); if (bl) bl.onclick = () => { m.close(); loadDoc(newDoc(210, 297), null); };
  body.querySelectorAll('[data-path]').forEach(el => el.onclick = () => { m.close(); openFile(el.dataset.path); });
  m.done.then(async (a) => {
    if (a !== 'create') return;
    if (!first && !(await confirmDiscard())) return;
    const w = parseFloat(body.querySelector('#nd-w').value) || 210, h = parseFloat(body.querySelector('#nd-h').value) || 297;
    loadDoc(newDoc(w, h), null);
  });
}
function pageSetup() {
  S.sel.clear(); renderProps(); renderOverlay();
  toast('Page size and margins are in the panel on the right.');
}
// Save As → PDF: every page at page size (with a list: everyone ticked, after the problems box). The publication's own
// file, name and unsaved state don't change.
let pdfBusy = false; // one Save As PDF at a time
async function savePdf(p) {
  if (pdfBusy) return toast('A PDF is still being prepared.');
  pdfBusy = true;
  try {
    let doc = S.doc;
    if (S.mail && S.mail.error) return toast(S.mail.error + ' The PDF was not saved.', 6000);
    if (S.mail && S.mail.list && !(await loadMailList(true, true))) return;
    const mail = mailPeople();
    if (mail) {
      if (!mail.count) return toast('No recipients are ticked. Use Edit Recipient List in the Mailings menu.', 6000);
      const r = await mail.build('all', S.doc.pages.map((_, i) => i), (done, total) => toast(`Preparing ${done} of ${total} ${total === 1 ? 'recipient' : 'recipients'}…`));
      if (!(await mail.confirm(r.problems))) return;
      doc = r.doc;
      toast('Preparing the pages…'); // the next step takes a moment: let the text show first
      await new Promise(r => requestAnimationFrame(() => setTimeout(r)));
    }
    const lay = { sw: doc.pageW, sh: doc.pageH, sheets: doc.pages.map((_, i) => [{ pi: i, x: 0, y: 0 }]) };
    const html = buildOutputHtml(doc, lay, { sharePics: doc !== S.doc });
    await api.writePdf({ html, widthMm: lay.sw, heightMm: lay.sh, path: p });
    toast('Saved ' + p.split(/[\\/]/).pop());
  } catch (err) { toast('Could not save the PDF: ' + (err && err.message || err), 6000); }
  finally { pdfBusy = false; }
}
// Export Page as PNG: the page as it shows (with Preview on, the person showing)
async function exportPng() {
  finishEditing();
  const row = shownRow();
  if (row) await fetchPhotos(photoCells(row));
  const lay = { sw: S.doc.pageW, sh: S.doc.pageH, sheets: [[{ pi: S.master ? 0 : S.page, x: 0, y: 0 }]] };
  const html = buildOutputHtml(viewDoc(), lay);
  const p = await api.exportPng({ html, widthMm: lay.sw, heightMm: lay.sh, dpi: 300, defaultName: `${S.doc.name || 'page'}-${S.page + 1}.png` });
  if (p) toast('Exported ' + p);
}
// With a list, the list as it is now (read again); a list that can't be read prints the design with «blanks», said first
let printOpening = false;
async function printDialog() {
  finishEditing();
  if (printOpening) return;
  printOpening = true;
  try { if (S.mail && S.mail.list && !(await loadMailList(true, true))) return; }
  finally { printOpening = false; }
  if (S.mail && S.mail.error) toast(S.mail.error + ' The fields print as «blanks».', 6000);
  openPrintDialog({
    doc: S.doc, pageIndex: S.page, api, settings: S.settings, toast,
    saveSettings: async (patch) => { S.settings = await api.setSettings(patch); },
    onDocChange: () => { commit(); }, mail: mailPeople()
  });
}

// ---------------------------------------------------------------- modal helpers
function modal(title, bodyEl, buttons, cls = '') {
  const back = document.createElement('div'); back.className = 'modal-back';
  const box = document.createElement('div'); box.className = 'modal' + (cls ? ' ' + cls : '');
  if (title) box.innerHTML = `<div class="modal-h">${title}</div>`;
  const b = document.createElement('div'); b.className = 'modal-b'; b.append(bodyEl);
  const f = document.createElement('div'); f.className = 'modal-f';
  let resolve; const done = new Promise(r => resolve = r);
  const close = (v) => { back.remove(); document.removeEventListener('keydown', key, true); resolve(v); };
  const key = (e) => {
    if (back !== $('modal-root').lastElementChild) return; // a box under another one leaves its keys to the top one
    const s = e.target.closest && e.target.closest('select');
    if (s && s.matches(':open')) return; // an open dropdown list handles its own Esc / Enter
    if (e.key === 'Escape') { e.stopPropagation(); close(null); }
    // a button marked data-enter-self (What's new's "See earlier versions") is pressed by Enter itself
    if (e.key === 'Enter' && !e.target.matches('textarea, [data-enter-self]')) { const p = buttons.find(x => x[2]); if (p) { e.preventDefault(); close(p[1]); } }
  };
  document.addEventListener('keydown', key, true);
  for (const [label, val, primary] of buttons) { const bt = document.createElement('button'); bt.className = 'btn' + (primary ? ' primary' : ''); bt.textContent = label; bt.onclick = () => close(val); f.append(bt); }
  box.append(b, f); back.append(box); $('modal-root').append(back);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(null); });
  return { done, close: () => close(null), resolve: close };
}
function confirmBox(title, text, okLabel = 'OK') {
  const d = document.createElement('div'); d.textContent = text;
  return modal(title, d, [['Cancel', false], [okLabel, true, true]]).done.then(v => !!v);
}
function choiceBox(title, text, labels) {
  const d = document.createElement('div'); d.textContent = text;
  return modal(title, d, labels.map((l, i) => [l, i, i === 0])).done.then(v => v == null ? labels.length - 1 : v);
}
// ✕ with unsaved changes (main.js sends 'close-request'): the same question as New / Open, in the app's own box
let closeAsking = false;
async function askClose() {
  if (closeAsking) return; // ✕ clicked again while the question is open
  finishEditing();
  if (!S.dirty) return api.closeNow();
  closeAsking = true;
  const r = await choiceBox('Save changes first?', 'Your publication has unsaved changes. Save them before closing?', ['Save', "Don't save", 'Cancel']);
  const ok = r === 0 ? await save() : r === 1;
  closeAsking = false;
  if (ok) api.closeNow();
}

// ---------------------------------------------------------------- automatic updates (main.js, updater.js), as in Sastra PDF
// Boxes that come by themselves (an update is ready, the right-click menu needs setting up) wait their turn: never over
// another box (the print screen and the reading box are boxes too) or a file being read, and one at a time.
const screenFree = () => !$('modal-root').children.length && !reading;
function whenFree() {
  return new Promise((res) => {
    if (screenFree()) return res();
    const done = () => { if (!screenFree()) return; mo.disconnect(); clearInterval(tick); res(); };
    const mo = new MutationObserver(done);
    mo.observe($('modal-root'), { childList: true });
    const tick = setInterval(done, 500); // a file read ends without a box change when its question was answered Not now
  });
}
let boxTurn = Promise.resolve();
const inTurn = (open) => (boxTurn = boxTurn.then(whenFree).then(open).catch((e) => console.warn(e)));

async function readyBox(v) {
  offered.add(v);
  const r = await choiceBox(`Bohpum ${v} is ready to install`, 'Restart now to use it, or it installs the next time you close Bohpum.', ['Restart now', 'Later']);
  if (r === 0) await restartForUpdate();
}
const offered = new Set(); // asked once per downloaded version while Bohpum runs; Later = it installs on closing
function updateReady(v) { if (offered.has(v)) return; offered.add(v); inTurn(() => readyBox(v)); }
// The installer starts at once and closes Bohpum by force, so the unsaved question comes first.
const RESTART_REFUSED = {
  task: ["Bohpum can't restart while files are being converted", 'Wait for the small convert window to finish, then use Help › Check for Updates. Or close Bohpum later: the update installs then.'],
  reader: ["Bohpum can't restart while the Publisher reader is downloading", 'Wait for the download to finish, then use Help › Check for Updates. Or close Bohpum later: the update installs then.'],
  failed: ["The update couldn't be started", 'Your publication is still open. Bohpum downloads the update again and offers it next time.']
};
async function restartForUpdate() {
  finishEditing();
  if (S.dirty) {
    const r = await choiceBox('Save changes first?', 'Your publication has unsaved changes. Save them before restarting?', ['Save', "Don't save", 'Cancel']);
    if (r === 2 || (r === 0 && !(await save()))) return;
  }
  const res = await api.installUpdate();
  const why = res && !res.ok && RESTART_REFUSED[res.reason];
  if (why) await choiceBox(why[0], why[1], ['OK']);
}
// Help › Check for Updates: "Checking for updates…" (Cancel or Esc drops the answer), then the answer.
async function checkUpdatesCmd() {
  if (!screenFree()) return;
  const m = modal('Checking for updates…', document.createElement('div'), [['Cancel', null]], 'checking');
  let open = true; m.done.then(() => { open = false; });
  let a; try { a = await api.checkUpdates(); } catch { a = { kind: 'failed' }; }
  if (!open) return;
  m.close();
  if (a.kind === 'store') return;   // main opened Bohpum's page in the Store, which updates this copy
  if (a.kind === 'ready') return readyBox(a.version);
  const [title, text] = {
    current: ['You have the latest version', `Bohpum ${a.version} is the newest version.`],
    downloading: [`Version ${a.version} is downloading`, "You'll be asked to restart when it's ready."],
    dev: ["This copy doesn't update itself", 'Copies installed from a Bohpum release do.'] // pnpm start, or built without the update key
  }[a.kind] || ["Couldn't check for updates", 'Check the internet connection and try again.'];
  await choiceBox(title, text, ['OK']);
}
// After an update installed silently, the right-click menu may sit under "Show more options" (main.js menu-repair):
// offer once per version to put it back; Windows then asks for permission. Not now (or Esc) = not again this version.
async function menuRepairAtStart() {
  try {
    if (!(await api.menuRepair('check')).needed) return;
    await inTurn(async () => {
      const r = await choiceBox('The right-click menu needs to be set up again', 'Windows will ask for permission once. Without it, Bohpum\'s items stay under "Show more options".', ['Set up', 'Not now']);
      if (r !== 0) { await api.menuRepair('later'); return; }
      const { result } = await api.menuRepair('fix');
      toast(result === 'ok' ? 'The right-click menu is back' : result === 'declined' ? 'The right-click menu stays under "Show more options"' : "Couldn't set up the right-click menu");
    });
  } catch (e) { console.warn(e); }
}

// ---------------------------------------------------------------- About (Help > About), as in Sastra PDF
const AUTHOR = {
  name: 'Sunnguon Taing', handle: 'smith89k', role: 'Full-stack & DevOps developer · Cambodia', photo: 'img/author.jpg',
  bio: 'I build web apps, run my own servers and make everyday tools.',
  stack: ['Laravel', 'PHP', 'JavaScript', 'TypeScript', 'Tailwind CSS', 'Docker', 'Electron'],
  links: [['Website', 'smith89k.com', 'https://smith89k.com', 'web'], ['LinkedIn', 'in/sunnguon', 'https://www.linkedin.com/in/sunnguon/', 'linkedin'], ['GitHub', 'smith89k', 'https://github.com/smith89k', 'github']]
};
const LINK_ICONS = {
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z"/>',
  linkedin: '<path fill="currentColor" stroke="none" fill-rule="evenodd" d="M5.5 2.5h13a3 3 0 0 1 3 3v13a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3v-13a3 3 0 0 1 3-3zM8 6.1a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8zM6.8 10.1h2.4v7.6H6.8zM11 10.1h2.3v1.1c.4-.7 1.3-1.3 2.6-1.3 2.2 0 2.9 1.4 2.9 3.5v4.3h-2.4v-3.9c0-1-.3-1.8-1.3-1.8s-1.7.8-1.7 1.9v3.8H11z"/>',
  github: '<path fill="currentColor" stroke="none" transform="scale(1.5)" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/>'
};
// open-source code that ships in the app: [name, by, licence, link]; Electron's version comes from the running app
const CREDITS = [
  ['Electron', 'Electron contributors, GitHub Inc.', 'MIT', 'https://www.electronjs.org/'],
  ['LibreOffice', 'The Document Foundation', 'MPL-2.0', 'https://www.libreoffice.org/'],
  ['IBM Plex Sans & Mono', 'IBM', 'SIL OFL 1.1', 'https://github.com/IBM/plex'],
  ['Noto Sans Khmer', 'Google', 'SIL OFL 1.1', 'https://github.com/notofonts/khmer'],
  ['electron-updater', 'electron-builder contributors', 'MIT', 'https://github.com/electron-userland/electron-builder']
];
const CREDITS_NOTE = 'LibreOffice reads Publisher and other files: it is downloaded once, the first time a Publisher file is opened; its licence files are in its folder. Electron includes Chromium, Node.js and FFmpeg; their licences are in LICENSES.chromium.html in the app folder. electron-updater (automatic updates) comes with builder-util-runtime, fs-extra, jsonfile, universalify, js-yaml, lazy-val, lodash.escaperegexp, lodash.isequal, tiny-typed-emitter, debug and ms (MIT), graceful-fs and semver (ISC), argparse (Python-2.0) and sax (Blue Oak 1.0.0). The installer is made with electron-builder (MIT) and NSIS (zlib). The font files are packaged by Fontsource (MIT).';
function openAbout() {
  if (document.querySelector('#modal-root .modal.about')) return;
  const A = AUTHOR, out = 'target="_blank" rel="noopener"'; // links open in the normal browser (main.js)
  const body = document.createElement('div'); body.className = 'about-body';
  body.innerHTML = `
    <div class="about-head"><img src="img/logo.png" alt="" width="56" height="56" draggable="false">
      <div><div class="about-name">Bohpum<span class="km" lang="km">បោះពុម្ព</span></div><div class="about-ver"></div></div></div>
    <p>Open, edit and print Microsoft Publisher files, or start a new publication. Your files stay on this computer.</p>
    <p class="note"><span lang="km">បោះពុម្ព</span> (bohpum) is Khmer for “to print”.</p>
    <section aria-label="Made by"><h3>Made by</h3>
      <div class="author"><img src="${A.photo}" alt="" width="64" height="64" draggable="false"><div><b>${A.name}<span class="nick">${A.handle}</span></b><span>${A.role}</span></div></div>
      <p>${A.bio}</p>
      <ul class="chips" aria-label="Skills">${A.stack.map(s => `<li>${s}</li>`).join('')}</ul>
      <div class="links">${A.links.map(([n, v, u, ic]) => `<a class="link-${ic}" href="${u}" ${out} title="${u}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${LINK_ICONS[ic]}</svg><span><b>${n}</b><small>${v}</small></span></a>`).join('')}</div>
    </section>
    <section aria-label="Open-source credits"><h3>Built with open source</h3>
      <ul class="credits">${CREDITS.map(([n, by, lic, u]) => `<li><span class="cn"><a href="${u}" ${out}>${n}</a>${n === 'Electron' ? ' <span class="cv"></span>' : ''}</span><span>${by}</span><span>${lic}</span></li>`).join('')}</ul>
      <p class="note">${CREDITS_NOTE}</p></section>`;
  modal(null, body, [['Close', null, true]], 'about');
  body.closest('.modal').querySelector('.modal-f').insertAdjacentHTML('afterbegin', '<span class="note">© 2026 smith89k</span>');
  api.appInfo().then(i => { body.querySelector('.about-ver').textContent = 'Version ' + i.version; body.querySelector('.cv').textContent = i.electron; }, () => {});
}

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

// ---------------------------------------------------------------- commands
function setTool(t) { S.tool = t; updateTools(); }
function updateTools() {
  document.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === S.tool));
  document.body.classList.toggle('tool-create', S.tool !== 'select');
}
function cmd(c) {
  switch (c) {
    case 'new': return newDialog();
    case 'open': return openFile();
    case 'save': return save();
    case 'save-as': return save(true);
    case 'close-request': return askClose();
    case 'about': return openAbout();
    case 'whats-new': return whatsNew();
    case 'check-updates': return checkUpdatesCmd();
    case 'export-png': return exportPng();
    case 'print': return printDialog();
    case 'page-setup': return pageSetup();
    case 'mail-select': return selectList();
    case 'mail-people': return choosePeople();
    case 'mail-photo': return photoFromList();
    case 'mail-preview': return togglePreview();
    case 'mail-prev': return stepPerson(-1);
    case 'mail-next': return stepPerson(1);
    case 'mail-remove': return removeList();
    case 'undo': return undo();
    case 'redo': return redo();
    case 'cut': return copySel(true);
    case 'copy': return copySel();
    case 'paste': return pasteFromSystem();
    case 'duplicate': return duplicateSel();
    case 'delete': return deleteSel();
    case 'select-all': finishEditing(); S.sel = new Set(objs().map(o => o.id)); return selectionChanged();
    case 'tool-text': return setTool('text');
    case 'tool-rect': return setTool('rect');
    case 'tool-ellipse': return setTool('ellipse');
    case 'tool-line': return setTool('line');
    case 'insert-image': return insertImages();
    case 'page-add': return addPage(false);
    case 'page-duplicate': return addPage(true);
    case 'page-delete': return deletePage();
    case 'page-up': return movePage(-1);
    case 'page-down': return movePage(1);
    case 'front': case 'back': case 'forward': case 'backward': finishEditing(); return zorder(c);
    case 'group': {
      const sel = selObjs(); if (sel.length < 2) return toast('Select two or more objects to group.');
      const g = uid(); setProp(o => o.groupId = g); return;
    }
    case 'ungroup': return setProp(o => o.groupId = null);
    case 'lock': { const anyLocked = selObjs().some(o => o.locked); return setProp(o => o.locked = !anyLocked); }
    case 'zoom-in': return zoomStep(1);
    case 'zoom-out': return zoomStep(-1);
    case 'zoom-fit': return zoomFit();
    case 'zoom-100': return setZoom(1);
    case 'toggle-master': return setMaster(!S.master);
    case 'toggle-guides': S.showGuides = !S.showGuides; renderGuides(); return renderProps();
    case 'maximize': return toggleMaximize();
    case 'theme-next': return setTheme(THEMES[(THEMES.indexOf(S.theme) + 1) % THEMES.length], true);
    case 'theme-system': case 'theme-light': case 'theme-dark': return setTheme(c.slice(6), true);
  }
  if (c.startsWith('mail-field-') && S.mail && S.mail.list) return insertField(S.mail.list.columns[+c.slice(11)]);
}

// ---------------------------------------------------------------- status / context menu
function updateStatus() {
  $('st-page').innerHTML = S.master ? '<span class="master-badge">Master page</span>' : `Page ${S.page + 1} of ${S.doc.pages.length}`;
  $('st-pos').textContent = mouseMm ? `${fmt(mouseMm.x)}, ${fmt(mouseMm.y)} mm` : '';
  const sel = selObjs();
  if (sel.length === 1) { const o = sel[0]; $('st-sel').textContent = `${labelOf(o)} · ${fmt(o.x)}, ${fmt(o.y)} mm · ${fmt(o.w)} × ${fmt(o.h)} mm${o.rot ? ` · ${fmt(o.rot)}°` : ''}${o.locked ? ' · locked' : ''}`; }
  else $('st-sel').textContent = sel.length ? `${sel.length} objects selected` : '';
  $('st-zoom').textContent = Math.round(S.zoom * 100) + '%';
}
function closeCtx() { $('ctxmenu').style.display = 'none'; }
function openCtx(e) {
  e.preventDefault();
  if (S.editing) return;
  const objEl = e.target.closest('.kcontent > .kobj');
  if (objEl && !S.sel.has(objEl.dataset.id)) {
    const o = getObj(objEl.dataset.id);
    S.sel = new Set(o.groupId ? objs().filter(x => x.groupId === o.groupId).map(x => x.id) : [o.id]); selectionChanged();
  }
  const has = S.sel.size > 0;
  const items = [
    ['Cut', 'cut', 'Ctrl+X', has], ['Copy', 'copy', 'Ctrl+C', has], ['Paste', 'paste', 'Ctrl+V', true], ['Duplicate', 'duplicate', 'Ctrl+D', has], ['Delete', 'delete', 'Del', has], '-',
    ['Bring to front', 'front', 'Ctrl+Shift+]', has], ['Send to back', 'back', 'Ctrl+Shift+[', has], '-',
    ['Group', 'group', 'Ctrl+G', S.sel.size > 1], ['Ungroup', 'ungroup', 'Ctrl+Shift+G', has], ['Lock / unlock', 'lock', '', has], '-',
    ['Insert picture…', 'insert-image', '', true], [S.master ? 'Back to pages' : 'Edit master page', 'toggle-master', 'Ctrl+M', true]
  ];
  showMenu(e, items);
}
// items: [label, command, shortcut, enabled] or '-' for a separator
function showMenu(e, items) {
  const m = $('ctxmenu');
  m.innerHTML = items.map(it => it === '-' ? '<hr>' : `<div class="mi${it[3] ? '' : ' dis'}" data-c="${it[1]}"><span>${it[0]}</span><kbd>${it[2]}</kbd></div>`).join('');
  m.style.display = 'block';
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + 'px';
  m.querySelectorAll('.mi').forEach(mi => mi.onclick = () => { closeCtx(); cmd(mi.dataset.c); });
}

// ---------------------------------------------------------------- Maximize and theme (as in Sastra PDF)
// Maximize: the Pages panel, the side panel and the status bar go; the page fills the window. F or the button again restores.
function toggleMaximize() {
  const on = document.body.classList.toggle('maxi'), b = $('b-max');
  b.classList.toggle('on', on);
  b.querySelector('.lbl').textContent = on ? 'Restore' : 'Maximize';
  b.title = on ? 'Restore the panels (F)' : 'Maximize the page area (F)';
  requestAnimationFrame(() => { zoomFit(); drawRulers(); });
}
// Theme: System → Light → Dark. Main applies it (CSS follows prefers-color-scheme) and saves it.
const THEMES = ['system', 'light', 'dark'], THEME_NAMES = { system: 'System', light: 'Light', dark: 'Dark' };
function setTheme(t, announce) {
  S.theme = t;
  const next = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length], b = $('b-theme');
  b.innerHTML = icon(t === 'system' ? 'sys' : t === 'light' ? 'sun' : 'moon');
  b.title = `Theme: ${THEME_NAMES[t]} (click for ${THEME_NAMES[next]})`;
  api.setTheme(t);
  if (announce) toast('Theme: ' + THEME_NAMES[t] + (t === 'system' ? ' (follows Windows)' : ''));
}
// canvas parts (rulers) read their colours from the theme, and redraw when it changes
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => drawRulers());

// ---------------------------------------------------------------- title row menus
const MENU_KEYS = { f: 0, e: 1, i: 2, a: 3, m: 4, v: 5, h: 6 }; // Alt+F File, Alt+E Edit … (main.js menu order)
const FILE_KEYS = { n: 'new', o: 'open', p: 'print' };    // Ctrl+letter; Ctrl+S / Ctrl+Shift+S below
function openMenu(i) {
  const b = document.querySelector(`#menus [data-menu="${i}"]`);
  if (!b || !api.showMenu || $('modal-root').children.length) return; // not behind a dialog / the print screen
  closeCtx();
  const r = b.getBoundingClientRect();
  b.classList.add('open');
  api.showMenu(i, r.left, r.bottom).finally(() => b.classList.remove('open'));
}

// ---------------------------------------------------------------- keyboard
function onKey(e) {
  if (colorPop && e.key === 'Escape') { e.preventDefault(); return closeColorPop(); }
  if ($('modal-root').children.length) return;
  const ctrl = e.ctrlKey || e.metaKey, k = e.key;
  // File shortcuts work everywhere, also while typing (Windows no longer handles them: see main.js buildMenu)
  if (ctrl && !e.altKey) {
    const lk = k.toLowerCase();
    if (lk === 's') { e.preventDefault(); return cmd(e.shiftKey ? 'save-as' : 'save'); }
    if (!e.shiftKey && FILE_KEYS[lk]) { e.preventDefault(); return cmd(FILE_KEYS[lk]); }
  }
  if (S.editing) {
    if (k === 'Escape') { e.preventDefault(); finishEditing(); }
    else if (ctrl && ['b', 'i', 'u'].includes(k.toLowerCase())) { e.preventDefault(); S.toggleFmt(k.toLowerCase()); }
    return;
  }
  // (option = an item in an open dropdown list: its keys belong to the list)
  if (e.target.matches('input, select, option, textarea, [contenteditable="true"]')) { if (k === 'Escape') e.target.blur(); return; }
  if (e.target.matches('button') && (k === 'Enter' || k === ' ')) return; // the focused button's own click
  if (e.altKey && !ctrl && !e.shiftKey && MENU_KEYS[k.toLowerCase()] != null) { e.preventDefault(); return openMenu(MENU_KEYS[k.toLowerCase()]); }
  if (k === 'F10' && !ctrl && !e.altKey) { e.preventDefault(); return openMenu(0); }
  const sel = selObjs();
  if (k === ' ' && !S.space) { S.space = true; $('workspace').style.cursor = 'grab'; e.preventDefault(); return; }
  if (ctrl) {
    const lk = k.toLowerCase();
    if (lk === 'z' && !e.shiftKey) { e.preventDefault(); return undo(); }
    if (lk === 'y' || (lk === 'z' && e.shiftKey)) { e.preventDefault(); return redo(); }
    if (lk === 'a') { e.preventDefault(); return cmd('select-all'); }
    if (lk === 'c') { e.preventDefault(); return copySel(); }
    if (lk === 'x') { e.preventDefault(); return copySel(true); }
    if (lk === 'd') { e.preventDefault(); return duplicateSel(); }
    if (lk === 'g') { e.preventDefault(); return cmd(e.shiftKey ? 'ungroup' : 'group'); }
    if (k === ']' || k === '}') { e.preventDefault(); return cmd(e.shiftKey ? 'front' : 'forward'); }
    if (k === '[' || k === '{') { e.preventDefault(); return cmd(e.shiftKey ? 'back' : 'backward'); }
    if (k === '=' || k === '+') { e.preventDefault(); return zoomStep(1); }
    if (k === '-') { e.preventDefault(); return zoomStep(-1); }
    if (k === '0') { e.preventDefault(); return zoomFit(); }
    if (lk === 'm') { e.preventDefault(); return cmd('toggle-master'); }
    if (lk === 'b' || lk === 'i' || lk === 'u') { if (textBoxesSelected().length) { e.preventDefault(); S.toggleFmt(lk); } return; }
    return;
  }
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); return deleteSel(); }
  if (k === 'Escape') { if (S.tool !== 'select') setTool('select'); else { S.sel.clear(); selectionChanged(); } return; }
  if (k === 'F9') { e.preventDefault(); return setZoom(1); }
  if (k === 'PageDown') { e.preventDefault(); return goPage(S.page + 1); }
  if (k === 'PageUp') { e.preventDefault(); return goPage(S.page - 1); }
  if ((k === 'Enter' || k === 'F2') && sel.length === 1 && sel[0].type === 'box') { e.preventDefault(); return startEditing(sel[0].id); }
  if (k.startsWith('Arrow') && sel.length) {
    e.preventDefault();
    const st = e.shiftKey ? 5 : e.altKey ? 0.1 : 0.5;
    const dx = k === 'ArrowLeft' ? -st : k === 'ArrowRight' ? st : 0, dy = k === 'ArrowUp' ? -st : k === 'ArrowDown' ? st : 0;
    for (const o of sel) if (!o.locked) { o.x = round2(o.x + dx); o.y = round2(o.y + dy); updateObjEl(o); }
    renderOverlay(); updateStatus(); drawRulers();
    clearTimeout(S._nudgeT); S._nudgeT = setTimeout(() => { commit(); renderProps(); }, 400);
    return;
  }
  if (k.toLowerCase() === 'f' && !e.altKey && !e.shiftKey) { e.preventDefault(); return toggleMaximize(); }
  const tools = { v: 'select', t: 'text', r: 'rect', e: 'ellipse', l: 'line' };
  if (!e.altKey && tools[k.toLowerCase()]) return setTool(tools[k.toLowerCase()]);
}

// ---------------------------------------------------------------- wiring
function wire() {
  // render CSS for the canvas
  const st = document.createElement('style'); st.textContent = RENDER_CSS; document.head.prepend(st);
  document.querySelectorAll('[data-icon]').forEach(el => { el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)); });
  document.querySelectorAll('[data-cmd]').forEach(b => b.addEventListener('click', () => cmd(b.dataset.cmd)));
  document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  document.querySelectorAll('#menus [data-menu]').forEach(b => {
    b.addEventListener('mousedown', (e) => e.preventDefault()); // keep focus (e.g. in a text box being edited)
    b.addEventListener('click', () => openMenu(+b.dataset.menu));
  });
  $('zoom-sel').onchange = () => { const v = $('zoom-sel').value; if (v === 'fit') zoomFit(); else setZoom(+v / 100); };
  const ws = $('workspace');
  ws.addEventListener('pointerdown', onWorkspaceDown);
  ws.addEventListener('pointermove', onWorkspaceHover);
  ws.addEventListener('dblclick', (e) => {
    const objEl = e.target.closest('.kcontent > .kobj');
    if (!objEl) return;
    const o = getObj(objEl.dataset.id);
    if (!o || o.locked) return;
    if (o.type === 'box' && S.editing !== o.id) startEditing(o.id, e); // already typing: the double-click picks a word
    else if (o.type === 'image') replaceImage(o);
  });
  ws.addEventListener('contextmenu', openCtx);
  $('page-list').addEventListener('contextmenu', openPageCtx);
  $('page-list').addEventListener('pointerdown', startPageDrag);
  $('page-list').addEventListener('click', (e) => { if (pageDragClick) e.stopPropagation(); }, true);
  $('page-list').addEventListener('dragstart', (e) => e.preventDefault()); // no browser drag of a thumbnail's picture
  $('pages-resizer').addEventListener('pointerdown', startPagesResize);
  $('pages-resizer').addEventListener('dblclick', resetPagesWidth);
  ws.addEventListener('scroll', () => drawRulers());
  ws.addEventListener('pointermove', (e) => { if (!pageEl) return; mouseMm = mmFromEvent(e); drawRulers(); $('st-pos').textContent = `${fmt(mouseMm.x)}, ${fmt(mouseMm.y)} mm`; });
  ws.addEventListener('wheel', (e) => { if (e.ctrlKey) { e.preventDefault(); setZoom(S.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e); } }, { passive: false });
  $('ruler-h').addEventListener('pointerdown', (e) => startNewGuide(e, 'h'));
  $('ruler-v').addEventListener('pointerdown', (e) => startNewGuide(e, 'v'));
  document.addEventListener('keydown', onKey);
  document.addEventListener('keyup', (e) => { if (e.key === ' ') { S.space = false; $('workspace').style.cursor = ''; } });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#ctxmenu')) closeCtx();
    if (colorPop && !e.target.closest('#colorpop') && !colorPop.btn.contains(e.target)) closeColorPop();
    if (listPop && !e.target.closest('#listpop') && !listPop.input.parentElement.contains(e.target)) closeListPop();
  });
  $('props').addEventListener('scroll', closeColorPop);
  document.addEventListener('paste', (e) => {
    if (S.editing || e.target.matches('input, textarea')) return;
    const items = [...(e.clipboardData?.items || [])];
    const img = items.find(i => i.type.startsWith('image/'));
    if (img) { e.preventDefault(); return insertImageBlob(img.getAsFile()); }
    const t = e.clipboardData.getData('text/plain');
    if (t) { e.preventDefault(); return pasteText(t, withFields(e.clipboardData.getData('text/html'))); }
    if (S.clip) pasteObjects(S.clip);
  });
  // drag & drop
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; document.body.classList.add('dragging'); });
  window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove('dragging'); } });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', async (e) => {
    e.preventDefault(); dragDepth = 0; document.body.classList.remove('dragging');
    const files = [...e.dataTransfer.files];
    for (const f of files) {
      if (f.type.startsWith('image/')) { await insertImageBlob(f, pageEl ? mmFromEvent(e) : null); continue; }
      const p = api.pathForFile(f);
      if (p) { await openFile(p); break; }
    }
  });
  window.addEventListener('resize', () => drawRulers());
  api.onMenu(cmd);
  api.onReadStep((s) => { if (reading && reading.step) reading.step(s); });
  api.onReaderProgress((p) => { if (reading && reading.progress) reading.progress(p); });
  api.onUpdateReady(updateReady);
  // a file double-clicked in Explorer (or "Open with"): it replaces the welcome screen
  api.onOpenPath((p) => { if (welcome) welcome.close(); openFile(p); });
  setupTextbar();
}

window.__bohpumApp = { cmd: (c) => cmd(c), openFile: (p) => openFile(p), startEditing: (id) => startEditing(id), finishEditing: () => finishEditing(), selectionChanged: () => selectionChanged(), state: S,
  updateReady: (v) => updateReady(v), menuRepairAtStart: () => menuRepairAtStart() };

async function init() {
  wire();
  try { S.settings = (await api.getSettings()) || {}; } catch { S.settings = {}; }
  setTheme(THEMES.includes(S.settings.theme) ? S.settings.theme : 'system');
  if (+S.settings.pagesW) setPagesWidth(+S.settings.pagesW);
  loadDoc(newDoc(210, 297), null);
  if (!window.__noWelcome) newDialog(true);
  notesAtStart().then(menuRepairAtStart); // after What's new; the repair box waits its turn behind the open boxes
}
init();
