// Test helper: writes a real .xlsx (deflated zip) with shared strings and a styles.xml.
// rows: (string | number | { v, t, s, f })[][]; `raw` entries replace generated XML parts.
const fs = require('fs');
const zlib = require('zlib');

const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i) => { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; };

function zip(entries) {
  const locals = [], central = []; let offset = 0;
  for (const [name, text] of entries) {
    const nameB = Buffer.from(name), raw = Buffer.from(text, 'utf8'), data = zlib.deflateRawSync(raw), crc = crc32(raw);
    const l = Buffer.alloc(30); l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(8, 8);
    l.writeUInt32LE(crc, 14); l.writeUInt32LE(data.length, 18); l.writeUInt32LE(raw.length, 22); l.writeUInt16LE(nameB.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(raw.length, 24); c.writeUInt16LE(nameB.length, 28); c.writeUInt32LE(offset, 42);
    locals.push(l, nameB, data); central.push(c, nameB);
    offset += 30 + nameB.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function makeXlsx(file, { sheets, numFmts = {}, date1904 = false, raw = {} }) {
  const strings = [], sid = (s) => { let i = strings.indexOf(s); if (i < 0) i = strings.push(s) - 1; return i; };
  const sheetXml = sheets.map(sh => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>' +
    sh.rows.map((row, r) => `<row r="${r + 1}">` + row.map((cell, c) => {
      const o = cell !== null && typeof cell === 'object' ? cell : { v: cell }, ref = colName(c) + (r + 1);
      const s = o.s != null ? ` s="${o.s}"` : '', f = o.f ? `<f>${esc(o.f)}</f>` : '';
      if (o.v === '' || o.v == null) return '';
      if (typeof o.v === 'number' || o.t === 'n') return `<c r="${ref}"${s}>${f}<v>${o.v}</v></c>`;
      if (o.t) return `<c r="${ref}"${s} t="${o.t}">${f}<v>${esc(o.v)}</v></c>`;
      return `<c r="${ref}"${s} t="s">${f}<v>${sid(String(o.v))}</v></c>`;
    }).join('') + '</row>').join('') + '</sheetData></worksheet>');
  const ids = Object.keys(numFmts);
  const entries = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      (date1904 ? '<workbookPr date1904="1"/>' : '') + '<sheets>' + sheets.map((sh, i) => `<sheet name="${esc(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + '</Relationships>'],
    ...sheetXml.map((x, i) => [`xl/worksheets/sheet${i + 1}.xml`, x]),
    ['xl/sharedStrings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${strings.length}" uniqueCount="${strings.length}">` +
      strings.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('') + '</sst>'],
    // cellXfs: 0 = General, then one per number format (s = 1 + index in numFmts' ids)
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (ids.length ? `<numFmts count="${ids.length}">` + ids.map(id => `<numFmt numFmtId="${id}" formatCode="${esc(numFmts[id])}"/>`).join('') + '</numFmts>' : '') +
      '<cellXfs count="' + (ids.length + 1) + '"><xf numFmtId="0"/>' + ids.map(id => `<xf numFmtId="${id}" applyNumberFormat="1"/>`).join('') + '</cellXfs></styleSheet>']
  ];
  const byName = new Map(entries);
  for (const [k, v] of Object.entries(raw)) byName.set(k, v);
  fs.writeFileSync(file, zip([...byName]));
  return file;
}

module.exports = { makeXlsx };
