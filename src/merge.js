// Bohpum – mail merge: a list (Excel or csv) becomes columns and rows of text, formatted the way Excel shows them.

const BUILTIN = { 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 11: '0.00E+00', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM',
  19: 'h:mm:ss AM/PM', 20: 'h:mm', 21: 'h:mm:ss', 37: '#,##0 ;(#,##0)', 38: '#,##0 ;(#,##0)', 39: '#,##0.00;(#,##0.00)', 40: '#,##0.00;(#,##0.00)',
  45: 'mm:ss', 48: '##0.0E+0' };
// Excel keeps 15 significant digits; a whole number below 1e15 never goes into exponent form
const plain = (v) => String(+v.toPrecision(15));
const r15 = (v) => +v.toPrecision(15);
// round half up on the decimal digits, the way Excel does (2.675 -> 2.68)
const roundTo = (v, n) => { v = r15(v); return String(v).includes('e') ? v : Number(Math.round(Number(v + 'e' + n)) + 'e-' + n); };
const letters = (i) => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };
const UNSUPPORTED = new Error('format');
const litText = (toks) => toks.map(c => typeof c === 'string' ? c : c.lit).join('');

// the code's sections (positive;negative;zero;text), each a list of literal pieces ({ lit }) and bare characters
function sections(code) {
  const out = [[]];
  for (let i = 0; i < code.length; i++) {
    const c = code[i], cur = out[out.length - 1];
    if (c === ';') out.push([]);
    else if (c === '"') { const e = code.indexOf('"', i + 1), end = e < 0 ? code.length : e; cur.push({ lit: code.slice(i + 1, end) }); i = end; }
    else if (c === '\\') cur.push({ lit: code[++i] || '' });
    else if (c === '_') { i++; cur.push({ lit: ' ' }); }
    else if (c === '*') i++;
    else if (c === '[') {
      const e = code.indexOf(']', i), inner = code.slice(i + 1, e < 0 ? code.length : e); i = e < 0 ? code.length : e;
      if (inner[0] === '$') cur.push({ lit: inner.slice(1).split('-')[0] });
      else if (!/^(red|blue|green|black|white|cyan|magenta|yellow|color\s*\d+)$/i.test(inner)) throw UNSUPPORTED; // conditions, [h] elapsed time
    } else cur.push(c);
  }
  return out;
}

function dateFields(v, date1904) {
  let days = Math.floor(v), secs = Math.round((v - days) * 86400);
  if (secs === 86400) { days++; secs = 0; }
  const adj = date1904 ? days + 1462 : days;
  return { date: new Date((adj - (adj < 61 ? 25568 : 25569)) * 864e5), secs };
}

function formatDate(v, toks, { date1904, locale }) {
  const { date, secs } = dateFields(v, date1904), parts = [];
  for (let i = 0; i < toks.length; i++) {
    const c = toks[i];
    if (typeof c !== 'string') { parts.push({ k: 'lit', s: c.lit }); continue; }
    const low = c.toLowerCase(), ahead = toks.slice(i, i + 5).join('');
    if (low === 'a' && /^(am\/pm|a\/p)/i.test(ahead)) { const n = /^am\/pm/i.test(ahead) ? 5 : 3; parts.push({ k: 'ampm', n }); i += n - 1; }
    else if ('dmyhs'.includes(low)) { let n = 1; while (toks[i + n] === c) n++; parts.push({ k: low, n }); i += n - 1; }
    else parts.push({ k: 'lit', s: c });
  }
  // m is minutes right after h or right before s, otherwise the month
  const dm = parts.filter(p => p.k !== 'lit' && p.k !== 'ampm');
  dm.forEach((p, i) => { if (p.k === 'm' && !(dm[i - 1]?.k === 'h' || dm[i + 1]?.k === 's')) p.k = 'M'; });
  const twelve = parts.some(p => p.k === 'ampm'), H = Math.floor(secs / 3600), Mi = Math.floor(secs / 60) % 60, S = secs % 60;
  const name = (opt) => { try { return new Intl.DateTimeFormat(locale, { ...opt, timeZone: 'UTC' }).format(date); } catch { return new Intl.DateTimeFormat('en', { ...opt, timeZone: 'UTC' }).format(date); } };
  const pad = (x, n) => String(x).padStart(n >= 2 ? 2 : 1, '0');
  return parts.map(p => {
    switch (p.k) {
      case 'lit': return p.s;
      case 'y': return p.n <= 2 ? pad(date.getUTCFullYear() % 100, 2) : String(date.getUTCFullYear());
      case 'M': return p.n <= 2 ? pad(date.getUTCMonth() + 1, p.n) : p.n === 3 ? name({ month: 'short' }) : p.n === 4 ? name({ month: 'long' }) : name({ month: 'long' })[0];
      case 'd': return p.n <= 2 ? pad(date.getUTCDate(), p.n) : name({ weekday: p.n === 3 ? 'short' : 'long' });
      case 'h': return pad(twelve ? H % 12 || 12 : H, p.n);
      case 'm': return pad(Mi, p.n);
      case 's': return pad(S, p.n);
      default: return (H < 12 ? 'AM' : 'PM').slice(0, p.n === 5 ? 2 : 1);
    }
  }).join('');
}

function formatNumber(v, toks, sign) {
  const raw = v; v = r15(Math.abs(v) * 100 ** toks.filter(c => c === '%').length);
  const isPh = (c) => typeof c === 'string' && '#0?,.'.includes(c);
  const start = toks.findIndex(isPh);
  if (start < 0) return litText(toks.map(c => c === '@' ? { lit: plain(Math.abs(raw)) } : c)); // @ shows the value as it is
  let end = start; while (isPh(toks[end])) end++;
  const [ip, dp = ''] = toks.slice(start, end).join('').split('.');
  let exp = null;
  if (toks[end] === 'E' && '+-'.includes(toks[end + 1]) && toks[end + 2] === '0') {
    let n = 0; while (toks[end + 2 + n] === '0') n++;
    exp = { plus: toks[end + 1] === '+', n }; end += 2 + n;
  }
  if (toks.slice(end).some(isPh)) throw UNSUPPORTED; // fractions and the like
  const minInt = (ip.match(/[0?]/g) || []).length, minDec = (dp.match(/0/g) || []).length;
  let s, tail = '';
  if (exp) {
    const [m, e] = r15(v).toExponential(dp.length).split('e'), n = +e;
    s = m; tail = 'E' + (n < 0 ? '-' : exp.plus ? '+' : '') + String(Math.abs(n)).padStart(exp.n, '0');
  } else s = roundTo(v, dp.length).toFixed(dp.length);
  let [i, d = ''] = s.split('.');
  while (d.length > minDec && d.endsWith('0')) d = d.slice(0, -1);
  i = i.padStart(minInt, '0');
  if (minInt === 0 && i === '0') i = '';
  if (ip.includes(',')) i = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (sign ? '-' : '') + litText(toks.slice(0, start)) + i + (d ? '.' + d : '') + tail + litText(toks.slice(end));
}

// code: an Excel built-in id (number) or a format code (string); anything not understood shows the plain value
export function formatCell(v, code, { date1904 = false, locale = 'en' } = {}) {
  const opts = { date1904, locale };
  try {
    if (code === 14 || code === 22) {
      const short = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(dateFields(v, date1904).date);
      return code === 14 ? short : short + ' ' + formatDate(v, ['h', ':', 'm', 'm'], opts);
    }
    if (typeof code === 'number') code = BUILTIN[code] ?? 'General';
    if (!code || /^general$/i.test(code)) return plain(v);
    const secs = sections(code);
    let sec = secs[0];
    if (secs.length >= 2 && v < 0) sec = secs[1];
    else if (secs.length >= 3 && v === 0) sec = secs[2];
    const text = sec.filter(c => typeof c === 'string').join(''), g = text.search(/general/i);
    if (g >= 0) { // General inside a section: the plain value with the section's literals
      const at = sec.findIndex((c, i) => typeof c === 'string' && /^general$/i.test(sec.slice(i, i + 7).join('')));
      return litText(sec.slice(0, at)) + plain(secs.length >= 2 && v < 0 ? -v : v) + litText(sec.slice(at + 7));
    }
    if (/[dmyhs]/i.test(sec.filter(c => typeof c === 'string').join(''))) return formatDate(v, sec, opts);
    return formatNumber(v, sec, v < 0 && secs.length < 2);
  } catch (e) {
    if (e !== UNSUPPORTED) throw e;
    return plain(v);
  }
}

export function csvRows(text) {
  const first = text.split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '');
  const sep = first.split(';').length > first.split(',').length ? ';' : ',';
  const rows = []; let row = [], cell = '', quoted = false, any = false;
  const endRow = () => { row.push(cell); rows.push(row); row = []; cell = ''; any = false; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) { if (c !== '"') cell += c; else if (text[i + 1] === '"') { cell += '"'; i++; } else quoted = false; continue; }
    if (c === '"') { quoted = true; any = true; }
    else if (c === sep) { row.push(cell); cell = ''; any = true; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; endRow(); }
    else { cell += c; any = true; }
  }
  if (any || cell) endRow();
  return rows;
}

export const rowKey = (row) => JSON.stringify(row);

const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const all = (el, name) => [...el.getElementsByTagNameNS('*', name)];
const kids = (el, name) => [...el.children].filter(k => k.localName === name);
// text of a string item: plain <t> or rich-text runs, never the phonetic hints
const itemText = (si) => [...si.children].flatMap(k => k.localName === 't' ? [k] : k.localName === 'r' ? kids(k, 't') : []).map(t => t.textContent).join('');

// the chosen sheet as [rowNumber, cells][] in row order, plus the sheet names
function xlsxGrid(files, wanted, locale) {
  const wb = xml(files['xl/workbook.xml']), rels = files['xl/_rels/workbook.xml.rels'] ? xml(files['xl/_rels/workbook.xml.rels']) : null;
  const date1904 = all(wb, 'workbookPr').some(p => /^(1|true)$/.test(p.getAttribute('date1904') || ''));
  const sheets = all(wb, 'sheet').map((s, i) => {
    const rid = s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id');
    const rel = rels && all(rels, 'Relationship').find(r => r.getAttribute('Id') === rid);
    const target = rel ? rel.getAttribute('Target') : `worksheets/sheet${i + 1}.xml`;
    return { name: s.getAttribute('name'), path: target.startsWith('/') ? target.slice(1) : 'xl/' + target };
  });
  const sheet = sheets.find(s => s.name === wanted) || sheets[0];
  if (!sheet || !files[sheet.path]) throw new Error('This list has no people in it');
  const shared = files['xl/sharedStrings.xml'] ? all(xml(files['xl/sharedStrings.xml']), 'si').map(itemText) : [];
  const numFmts = {}, xfs = [];
  if (files['xl/styles.xml']) {
    const st = xml(files['xl/styles.xml']);
    all(st, 'numFmt').forEach(n => { numFmts[n.getAttribute('numFmtId')] = n.getAttribute('formatCode'); });
    const cx = all(st, 'cellXfs')[0];
    if (cx) kids(cx, 'xf').forEach(x => xfs.push(+x.getAttribute('numFmtId') || 0));
  }
  const fmtOf = (s) => { const id = xfs[s]; return id == null ? 0 : numFmts[id] ?? id; };
  const grid = [];
  all(xml(files[sheet.path]), 'row').forEach((row, ri) => {
    const cells = [];
    kids(row, 'c').forEach((c, ci) => {
      let col = ci; const ref = c.getAttribute('r');
      if (ref) { col = 0; for (const ch of ref.replace(/\d+/g, '')) col = col * 26 + ch.charCodeAt(0) - 64; col--; }
      const t = c.getAttribute('t'), vEl = kids(c, 'v')[0], v = vEl ? vEl.textContent : '';
      if (t === 's') cells[col] = shared[+v] ?? '';
      else if (t === 'inlineStr') cells[col] = kids(c, 'is').map(itemText).join('');
      else if (t === 'b') cells[col] = v === '' ? '' : v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== '' && !t && !isNaN(+v) || t === 'n') cells[col] = formatCell(+v, fmtOf(+c.getAttribute('s') || 0), { date1904, locale });
      else cells[col] = v; // str (formula results), e (errors), d
    });
    grid.push([+row.getAttribute('r') || ri + 1, Array.from(cells, x => x ?? '')]);
  });
  return { sheets: sheets.map(s => s.name), sheet: sheet.name, grid: grid.sort((a, b) => a[0] - b[0]) };
}

export function parseList(r, { sheet } = {}) {
  let sheets = [], name = '', table;
  if (r.kind === 'xlsx') {
    const g = xlsxGrid(r.files, sheet, r.locale || navigator.language);
    sheets = g.sheets; name = g.sheet;
    // the names must sit in row 1; rows are only kept in their place by number
    table = !g.grid.length ? [] : g.grid[0][0] === 1 ? g.grid.map(x => x[1]) : [[], ...g.grid.map(x => x[1])];
  } else table = csvRows(r.text || '');
  const blank = (row) => row.every(c => !String(c ?? '').trim());
  const body = table.slice(1).filter(row => !blank(row));
  if (!body.length) throw new Error('This list has no people in it');
  if (blank(table[0])) throw new Error('The first row should hold the column names.');
  let width = table[0].length; while (!String(table[0][width - 1] ?? '').trim()) width--;
  const seen = {}, columns = Array.from({ length: width }, (_, i) => {
    const h = String(table[0][i] ?? '').trim() || 'Column ' + letters(i);
    seen[h] = (seen[h] || 0) + 1;
    return seen[h] > 1 ? `${h} (${seen[h]})` : h;
  });
  return { sheets, sheet: name, columns, rows: body.map(row => Array.from({ length: width }, (_, i) => String(row[i] ?? ''))) };
}
