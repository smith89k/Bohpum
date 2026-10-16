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
  back.className = 'modal-back';
  back.innerHTML = `
  <div class="modal" role="dialog" aria-label="Print">
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

  const num = (key, label, obj = o, step = 0.5) => `<div class="numf" title="${label}"><span>${label}</span><input type="number" step="${step}" data-k="${key}" data-o="${obj === nudge ? 'n' : 'o'}" value="${round(obj[key])}"></div>`;
  const round = (v) => v == null ? '' : Math.round(v * 10) / 10;

  function ensurePos() {
    const [sw, sh] = sheetSize(o.sheet, o.orient);
    if (o.left == null || o.left > sw) o.left = Math.max(0, (sw - doc.pageW) / 2);
    if (o.top == null || o.top > sh) o.top = Math.max(0, (sh - doc.pageH) / 2);
  }

  function renderSide() {
    if (o.mode === 'single') ensurePos();
    const [sw, sh] = sheetSize(o.sheet, o.orient);
    const g = gridInfo(doc, o, sw, sh);
    side.innerHTML = `
      <div class="psec">
        <h4>Printer</h4>
        <div class="pr-printer">
          <select class="field" id="pd-printer" aria-label="Printer"></select>
          <button class="btn" id="pd-props" title="Opens Windows' printing preferences for this printer. Changes there become this printer's defaults.">Properties</button>
        </div>
        <div class="grid2">${num('copies', 'Copies', o, 1)}</div>
      </div>
      <div class="psec">
        <h4>Paper</h4>
        <div class="grid2">
          <select class="field" data-k="sheet" aria-label="Paper size">${Object.keys(SHEETS).map(k => `<option ${k === o.sheet ? 'selected' : ''}>${k}</option>`).join('')}</select>
          <select class="field" data-k="orient" aria-label="Orientation"><option value="portrait" ${o.orient === 'portrait' ? 'selected' : ''}>Portrait</option><option value="landscape" ${o.orient === 'landscape' ? 'selected' : ''}>Landscape</option></select>
        </div>
        <div class="muted">Publication page: ${round(doc.pageW)} × ${round(doc.pageH)} mm</div>
      </div>
      <div class="psec">
        <h4>Layout</h4>
        <div class="radio ${o.mode === 'single' ? 'on' : ''}" data-mode="single"><input type="radio" ${o.mode === 'single' ? 'checked' : ''}><div><b>One per sheet, at a position</b><small>Drag the page on the preview or type the distance from the paper edge.</small></div></div>
        ${o.mode === 'single' ? `<div style="margin:2px 0 10px 24px">
          <div class="grid2">${num('left', 'Left')}${num('top', 'Top')}</div>
          <div class="pos-grid" id="pd-pos">
            ${[['tl', '↖'], ['tc', '↑'], ['tr', '↗'], ['ml', '←'], ['mc', 'Center'], ['mr', '→'], ['bl', '↙'], ['bc', '↓'], ['br', '↘']].map(([k, l]) => `<button class="btn" data-pos="${k}" title="Snap to ${k}">${l}</button>`).join('')}
          </div></div>` : ''}
        <div class="radio ${o.mode === 'grid' ? 'on' : ''}" data-mode="grid"><input type="radio" ${o.mode === 'grid' ? 'checked' : ''}><div><b>Multiple copies per sheet</b><small>${g.cols * g.rows ? `${g.cols * g.rows} per sheet (${g.cols} × ${g.rows})` : 'Page is larger than the paper'}</small></div></div>
        ${o.mode === 'grid' ? `<div style="margin:2px 0 10px 24px">
          <div class="grid2">${num('marginT', 'Top')}${num('marginL', 'Left')}${num('marginB', 'Bottom')}${num('marginR', 'Right')}${num('gapX', 'Gap ↔')}${num('gapY', 'Gap ↕')}</div>
          <label class="chk"><input type="checkbox" data-k="center" ${o.center ? 'checked' : ''}> Center the block on the sheet</label>
          <select class="field" data-k="order" style="width:100%"><option value="repeat" ${o.order === 'repeat' ? 'selected' : ''}>Fill each sheet with one page</option><option value="sequence" ${o.order === 'sequence' ? 'selected' : ''}>Different pages in sequence</option></select>
        </div>` : ''}
        <div class="radio ${o.mode === 'actual' ? 'on' : ''}" data-mode="actual"><input type="radio" ${o.mode === 'actual' ? 'checked' : ''}><div><b>Page size = paper size</b><small>Print each page on paper of the same size (${round(doc.pageW)} × ${round(doc.pageH)} mm).</small></div></div>
      </div>
      <div class="psec">
        <h4>Pages</h4>
        <div class="grid2">
          <select class="field" data-k="pages" aria-label="Pages to print"><option value="all" ${o.pages === 'all' ? 'selected' : ''}>All pages (${doc.pages.length})</option><option value="current" ${o.pages === 'current' ? 'selected' : ''}>Current page</option><option value="range" ${o.pages === 'range' ? 'selected' : ''}>Pages…</option></select>
          ${o.pages === 'range' ? `<input class="field" data-k="range" aria-label="Pages" placeholder="e.g. 1-3, 5" value="${esc(o.range || '')}">` : ''}
        </div>
        <label class="chk"><input type="checkbox" data-k="crop" ${o.crop ? 'checked' : ''} ${o.mode === 'actual' ? 'disabled' : ''}> Crop marks</label>
      </div>
      <div class="psec">
        <h4>Printer adjustment</h4>
        <div class="grid2">${num('x', 'X', nudge, 0.1)}${num('y', 'Y', nudge, 0.1)}</div>
        <div class="muted">If your printer prints a little off, enter the correction in mm (+X moves right, +Y moves down). It is remembered for next time.</div>
      </div>
      <div id="pd-warn"></div>`;
    side.querySelectorAll('[data-mode]').forEach(r => r.onclick = () => { o.mode = r.dataset.mode; sheetNo = 0; update(); });
    side.querySelectorAll('[data-k]').forEach(inp => {
      const ev = inp.type === 'number' || inp.tagName === 'INPUT' && inp.type !== 'checkbox' ? 'input' : 'change';
      inp.addEventListener(ev, () => {
        const target = inp.dataset.o === 'n' ? nudge : o;
        const k = inp.dataset.k;
        if (inp.type === 'checkbox') target[k] = inp.checked;
        else if (inp.type === 'number') { const v = parseFloat(inp.value); target[k] = isNaN(v) ? 0 : v; }
        else target[k] = inp.value;
        if (k === 'sheet' || k === 'orient') { o.left = null; o.top = null; }
        if (inp.tagName === 'SELECT' || inp.type === 'checkbox') update(); else { renderPreview(); renderWarn(); }
      });
    });
    side.querySelectorAll('[data-pos]').forEach(b => b.onclick = () => {
      const [sw, sh] = sheetSize(o.sheet, o.orient);
      const m = 10, k = b.dataset.pos;
      o.left = k[1] === 'l' ? m : k[1] === 'r' ? sw - doc.pageW - m : (sw - doc.pageW) / 2;
      o.top = k[0] === 't' ? m : k[0] === 'b' ? sh - doc.pageH - m : (sh - doc.pageH) / 2;
      update();
    });
    side.querySelector('#pd-printer').addEventListener('change', (e) => { printer = e.target.value; saveSettings({ printer }); });
    side.querySelector('#pd-props').onclick = () => { if (printer) api.printerPrefs(printer); };
    fillPrinters();
    renderWarn();
  }

  // The printer list: the remembered printer if still installed, else Windows' default
  function fillPrinters() {
    const sel = side.querySelector('#pd-printer'), props = side.querySelector('#pd-props');
    const none = !printers || !printers.length;
    sel.innerHTML = !printers ? '<option>Finding printers…</option>'
      : none ? '<option>No printers installed</option>'
      : printers.map(p => `<option value="${esc(p.name)}"${p.name === printer ? ' selected' : ''}>${esc(p.displayName)}</option>`).join('');
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
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); renderWarn(); };
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
  let opened = null;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey, true); };
  const keepAndClose = () => { if (JSON.stringify([o, nudge]) !== opened) persist(); close(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); if (!sending) keepAndClose(); } };
  document.addEventListener('keydown', onKey, true);

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
