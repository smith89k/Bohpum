// Publisher-style printing: place pages on a sheet (A4 …) at a chosen position, or many per sheet.
import { SHEETS, clone } from './model.js';
import { renderPage, fixLineHeights } from './render.js';
import { RENDER_CSS } from './renderCss.js';

const NONPRINT = 4; // typical printer edge in mm

export function sheetSize(name, orient) {
  const [a, b] = SHEETS[name] || SHEETS.A4;
  return orient === 'landscape' ? [Math.max(a, b), Math.min(a, b)] : [Math.min(a, b), Math.max(a, b)];
}

export function parsePages(spec, n, current) {
  if (spec.pages === 'current') return [current];
  if (spec.pages !== 'range' || !spec.range) return Array.from({ length: n }, (_, i) => i);
  const out = [];
  for (const part of spec.range.split(',')) {
    const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) continue;
    const a = +m[1], b = m[2] ? +m[2] : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= n) out.push(i - 1);
  }
  return out.length ? out : [current];
}

export function gridInfo(doc, o, sw, sh) {
  const pw = doc.pageW, ph = doc.pageH;
  const cols = Math.max(0, Math.floor((sw - o.marginL - o.marginR + o.gapX) / (pw + o.gapX) + 1e-9));
  const rows = Math.max(0, Math.floor((sh - o.marginT - o.marginB + o.gapY) / (ph + o.gapY) + 1e-9));
  let x0 = o.marginL, y0 = o.marginT;
  if (o.center && cols && rows) {
    x0 = (sw - (cols * pw + (cols - 1) * o.gapX)) / 2;
    y0 = (sh - (rows * ph + (rows - 1) * o.gapY)) / 2;
  }
  const slots = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slots.push({ x: x0 + c * (pw + o.gapX), y: y0 + r * (ph + o.gapY) });
  return { cols, rows, slots };
}

export function layout(doc, o, pageIdxs) {
  if (o.mode === 'actual') return { sw: doc.pageW, sh: doc.pageH, sheets: pageIdxs.map(pi => [{ pi, x: 0, y: 0 }]) };
  const [sw, sh] = sheetSize(o.sheet, o.orient);
  if (o.mode === 'single') {
    const x = o.left ?? (sw - doc.pageW) / 2, y = o.top ?? (sh - doc.pageH) / 2;
    return { sw, sh, sheets: pageIdxs.map(pi => [{ pi, x, y }]) };
  }
  const g = gridInfo(doc, o, sw, sh);
  const sheets = [];
  if (!g.slots.length) return { sw, sh, sheets: [], grid: g };
  if (o.order === 'sequence') {
    for (let i = 0; i < pageIdxs.length; i += g.slots.length)
      sheets.push(pageIdxs.slice(i, i + g.slots.length).map((pi, k) => ({ pi, ...g.slots[k] })));
  } else {
    for (const pi of pageIdxs) sheets.push(g.slots.map(s => ({ pi, ...s })));
  }
  return { sw, sh, sheets, grid: g };
}

function cropMarks(sheetEl, x, y, w, h) {
  const L = 4, off = 1.5, t = 0.15;
  const add = (l, tp, ww, hh) => { const d = document.createElement('div'); d.className = 'kcrop'; Object.assign(d.style, { left: l + 'mm', top: tp + 'mm', width: ww + 'mm', height: hh + 'mm' }); sheetEl.append(d); };
  for (const [cx, sx] of [[x, -1], [x + w, 1]]) for (const [cy, sy] of [[y, -1], [y + h, 1]]) {
    // horizontal mark
    add(sx < 0 ? cx - off - L : cx + off, cy - t / 2, L, t);
    // vertical mark
    add(cx - t / 2, sy < 0 ? cy - off - L : cy + off, t, L);
  }
}

// Build a standalone HTML document for the hidden print window.
// portraitPaper: a landscape sheet goes out as portrait paper with the content turned 90° (its top along
// the paper's left edge, the way drivers print landscape), so no printer driver turns it a second time.
export function buildOutputHtml(doc, lay, { crop = false, nudge = { x: 0, y: 0 }, portraitPaper = false } = {}) {
  const turn = portraitPaper && lay.sw > lay.sh;
  const pw = turn ? lay.sh : lay.sw, ph = turn ? lay.sw : lay.sh;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-100000px;top:0;';
  document.body.append(host);
  for (const sheet of lay.sheets) {
    const s = document.createElement('div');
    s.className = 'sheet-out';
    let t = s;
    if (turn) { t = document.createElement('div'); t.className = 'sheet-turn'; s.append(t); }
    for (const p of sheet) {
      const pg = renderPage(doc, doc.pages[p.pi]);
      pg.style.position = 'absolute';
      pg.style.left = (p.x + (nudge.x || 0)) + 'mm';
      pg.style.top = (p.y + (nudge.y || 0)) + 'mm';
      t.append(pg);
      if (crop) cropMarks(t, p.x + (nudge.x || 0), p.y + (nudge.y || 0), doc.pageW, doc.pageH);
    }
    host.append(s);
  }
  fixLineHeights(host);
  const body = host.innerHTML;
  host.remove();
  return `<!doctype html><html><head><meta charset="utf-8"><title>${(doc.name || 'Publication').replace(/</g, '')}</title><style>${RENDER_CSS}
@page { size: ${pw}mm ${ph}mm; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet-out { position: relative; width: ${pw}mm; height: ${ph}mm; overflow: hidden; break-after: page; page-break-after: always; }
.sheet-out:last-child { break-after: auto; page-break-after: auto; }
.sheet-turn { position: absolute; left: 0; top: 0; width: ${lay.sw}mm; height: ${lay.sh}mm; transform-origin: 0 0; transform: translateY(${lay.sw}mm) rotate(-90deg); }
</style></head><body>${body}</body></html>`;
}

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
      ${o.mode === 'single' ? `<div class="pr-box pr-pos">${field('top', 'Top')}${field('left', 'Left')}
        <div class="pos-pad" id="pd-pos" role="group" aria-label="Snap to">${PAD.map(([k, t]) => `<button data-pos="${k}" title="${t}" aria-label="${t}"></button>`).join('')}</div></div>` : ''}
      ${o.mode === 'grid' ? `<div class="pr-box">
        <label class="chk"><input type="checkbox" data-k="center" ${o.center ? 'checked' : ''}> Center the block on the sheet</label>
        <select class="field" data-k="order" aria-label="Page order" style="width:100%"><option value="repeat" ${o.order === 'repeat' ? 'selected' : ''}>Fill each sheet with one page</option><option value="sequence" ${o.order === 'sequence' ? 'selected' : ''}>Different pages in sequence</option></select>
        <div class="grid2">${field('marginT', 'Top')}${field('marginL', 'Left')}${field('marginB', 'Bottom')}${field('marginR', 'Right')}${field('gapX', 'Gap ↔')}${field('gapY', 'Gap ↕')}</div>
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
