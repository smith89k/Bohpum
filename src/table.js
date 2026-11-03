// Table helpers for a table inside a text box (the box's html holds <table>…</table>). Pure DOM, no app state.
// Positions are grid positions: row r, column c, counting a merged cell in every row and column it covers.

const cellsOf = (tr) => [...tr.children].filter(c => c.tagName === 'TD' || c.tagName === 'TH');
const rowsOf = (table) => [...table.querySelectorAll(':scope > tr, :scope > tbody > tr, :scope > thead > tr, :scope > tfoot > tr')];
const span = (n) => Math.max(1, parseInt(n, 10) || 1);

// The cell map: cells[r][c] is the td covering that spot (null where a broken old table has none)
export function grid(table) {
  const rows = rowsOf(table), cells = rows.map(() => []);
  rows.forEach((tr, r) => {
    let c = 0;
    for (const td of cellsOf(tr)) {
      while (cells[r][c]) c++;
      const rs = Math.min(span(td.getAttribute('rowspan')), rows.length - r), cs = span(td.getAttribute('colspan'));
      for (let i = 0; i < rs; i++) for (let j = 0; j < cs; j++) cells[r + i][c + j] = td;
      c += cs;
    }
  });
  const cols = Math.max(0, ...cells.map(x => x.length));
  for (const x of cells) for (let c = 0; c < cols; c++) if (!x[c]) x[c] = null;
  return { rows, cells, nRows: rows.length, nCols: cols };
}

// Where a cell sits: its first and last row and column
export function posOf(g, td) {
  let r0 = -1, c0 = -1, r1 = -1, c1 = -1;
  g.cells.forEach((x, r) => x.forEach((t, c) => {
    if (t !== td) return;
    if (r0 < 0) { r0 = r; c0 = c; }
    r1 = Math.max(r1, r); c1 = Math.max(c1, c);
  }));
  return r0 < 0 ? null : { r0, c0, r1, c1 };
}

export function cellAt(table, r, c) {
  const g = grid(table);
  if (!g.nRows || !g.nCols) return null;
  r = Math.max(0, Math.min(g.nRows - 1, r)); c = Math.max(0, Math.min(g.nCols - 1, c));
  return g.cells[r][c] || g.cells[r].find(Boolean) || null;
}

// Every cell in the rectangle two cells span; the rectangle grows until no merged cell sticks out of it
export function cellsBetween(table, a, b) {
  const g = grid(table), pa = posOf(g, a), pb = posOf(g, b);
  if (!pa || !pb) return [a, b].filter(Boolean);
  let r0 = Math.min(pa.r0, pb.r0), c0 = Math.min(pa.c0, pb.c0), r1 = Math.max(pa.r1, pb.r1), c1 = Math.max(pa.c1, pb.c1);
  for (let grown = true; grown;) {
    grown = false;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const t = g.cells[r][c]; if (!t) continue;
      const p = posOf(g, t);
      if (p.r0 < r0 || p.c0 < c0 || p.r1 > r1 || p.c1 > c1) { r0 = Math.min(r0, p.r0); c0 = Math.min(c0, p.c0); r1 = Math.max(r1, p.r1); c1 = Math.max(c1, p.c1); grown = true; }
    }
  }
  const out = new Set();
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (g.cells[r][c]) out.add(g.cells[r][c]);
  return [...out];
}

// A new empty cell with the look of `like` (colour, border, padding, text position, paragraph style)
function newCell(like) {
  const td = document.createElement('td');
  if (like && like.getAttribute('style')) td.setAttribute('style', like.getAttribute('style'));
  const p = document.createElement('p');
  const lp = like && like.querySelector('p');
  if (lp && lp.getAttribute('style')) p.setAttribute('style', lp.getAttribute('style'));
  p.append(document.createElement('br'));
  td.append(p);
  return td;
}
// put td into tr in column order: before the first cell of that row that starts at column >= c
function placeInRow(g, tr, td, c) {
  const next = cellsOf(tr).find(t => { const p = posOf(g, t); return p && p.c0 >= c; });
  if (next) next.before(td); else tr.append(td);
}
const setSpan = (td, name, n) => { if (n > 1) td.setAttribute(name, n); else td.removeAttribute(name); };

// Returns the new row
export function insertRow(table, td, where) {
  const g = grid(table), p = posOf(g, td);
  if (!p) return null;
  const at = where === 'above' ? p.r0 : p.r1 + 1, ref = where === 'above' ? p.r0 : p.r1;
  const tr = document.createElement('tr');
  const refTr = g.rows[ref];
  if (refTr.getAttribute('style')) tr.setAttribute('style', refTr.getAttribute('style'));
  const grownCells = new Set();
  for (let c = 0; c < g.nCols; c++) {
    const up = at > 0 ? g.cells[at - 1][c] : null, down = at < g.nRows ? g.cells[at][c] : null;
    if (up && up === down) { // a merged cell crosses the new line: it grows instead
      if (!grownCells.has(up)) { grownCells.add(up); setSpan(up, 'rowspan', span(up.getAttribute('rowspan')) + 1); }
      continue;
    }
    tr.append(newCell(g.cells[ref][c]));
  }
  if (at < g.nRows) g.rows[at].before(tr); else g.rows[g.nRows - 1].after(tr);
  return tr;
}

// Returns the new column's index
export function insertColumn(table, td, where) {
  const g = grid(table), p = posOf(g, td);
  if (!p) return -1;
  const at = where === 'left' ? p.c0 : p.c1 + 1, ref = where === 'left' ? p.c0 : p.c1;
  const grownCells = new Set();
  g.rows.forEach((tr, r) => {
    const left = at > 0 ? g.cells[r][at - 1] : null, right = at < g.nCols ? g.cells[r][at] : null;
    if (left && left === right) {
      if (!grownCells.has(left)) { grownCells.add(left); setSpan(left, 'colspan', span(left.getAttribute('colspan')) + 1); }
      return;
    }
    placeInRow(g, tr, newCell(g.cells[r][ref]), at);
  });
  return at;
}

// Deletes the row the cell starts in. False for the last row.
export function deleteRow(table, td) {
  const g = grid(table), p = posOf(g, td);
  if (!p || g.nRows <= 1) return false;
  const r = p.r0, tr = g.rows[r], done = new Set();
  for (let c = 0; c < g.nCols; c++) {
    const t = g.cells[r][c]; if (!t || done.has(t)) continue; done.add(t);
    const q = posOf(g, t);
    if (q.r1 === q.r0) continue; // only in this row: goes with it
    setSpan(t, 'rowspan', q.r1 - q.r0); // one row shorter
    if (q.r0 === r) placeInRow(g, g.rows[r + 1], t, q.c0); // it started here: it moves down, with its text
  }
  tr.remove();
  return true;
}

// Deletes the column the cell starts in, and returns its index (-1 for the last column)
export function deleteColumn(table, td) {
  const g = grid(table), p = posOf(g, td);
  if (!p || g.nCols <= 1) return -1;
  const c = p.c0, done = new Set();
  for (let r = 0; r < g.nRows; r++) {
    const t = g.cells[r][c]; if (!t || done.has(t)) continue; done.add(t);
    const n = span(t.getAttribute('colspan'));
    if (n > 1) setSpan(t, 'colspan', n - 1); else t.remove();
  }
  return c;
}

// style: { fill: '#rrggbb' | 'none', borderWidth: mm (0 = no line), borderColor, padding: mm, valign: 'top' | 'middle' | 'bottom' }
export function setCellStyle(cells, style) {
  for (const td of cells) {
    const s = td.style;
    if ('fill' in style) { if (!style.fill || style.fill === 'none') s.removeProperty('background-color'); else s.backgroundColor = style.fill; }
    if ('borderWidth' in style) {
      if (style.borderWidth > 0) { s.borderStyle = 'solid'; s.borderWidth = style.borderWidth + 'mm'; } else { s.borderStyle = 'none'; s.removeProperty('border-width'); }
    }
    if ('borderColor' in style) s.borderColor = style.borderColor;
    if ('padding' in style) s.padding = Math.max(0, style.padding) + 'mm';
    if ('valign' in style) s.verticalAlign = style.valign;
    if (!td.getAttribute('style')) td.removeAttribute('style');
  }
}

// The look of a cell as the panel shows it (inline style, else the default from renderCss.js)
export function cellStyle(td) {
  const s = td.style, mm = (v) => { const m = /^([\d.]+)mm$/.exec(v || ''); return m ? +m[1] : null; };
  return {
    fill: s.backgroundColor ? rgbHex(s.backgroundColor) : 'none',
    borderWidth: s.borderStyle === 'none' ? 0 : (mm(s.borderTopWidth) ?? 0.2),
    borderColor: s.borderTopColor ? rgbHex(s.borderTopColor) : '#000000',
    padding: mm(s.paddingTop) ?? 0.5,
    valign: ['middle', 'bottom'].includes(s.verticalAlign) ? s.verticalAlign : 'top',
  };
}
function rgbHex(v) {
  const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
  return m ? '#' + [m[1], m[2], m[3]].map(n => (+n).toString(16).padStart(2, '0')).join('') : v;
}

// Column widths in mm from the table's colgroup (percentages of the table), or null when it has none
export function columnWidthsMm(table, tableW) {
  const cols = [...table.querySelectorAll(':scope > colgroup > col')];
  const g = grid(table);
  if (!cols.length || cols.length !== g.nCols) return null;
  const pc = cols.map(c => parseFloat(c.style.width));
  if (pc.some(isNaN)) return null;
  const sum = pc.reduce((a, b) => a + b, 0) || 1;
  return pc.map(v => v / sum * tableW);
}
// Writes the colgroup: each width as a share of the whole, so the columns scale with the box
export function setColumnWidthsMm(table, mm) {
  const total = mm.reduce((a, b) => a + b, 0) || 1;
  table.querySelectorAll(':scope > colgroup').forEach(c => c.remove());
  const cg = document.createElement('colgroup');
  for (const w of mm) { const col = document.createElement('col'); col.style.width = (Math.round(w / total * 100000) / 1000) + '%'; cg.append(col); }
  table.prepend(cg);
  table.style.tableLayout = 'fixed';
}
