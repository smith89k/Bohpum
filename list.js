// Reading a mail merge list (Excel .xlsx/.xls or .csv): the file's bytes → plain data for the page to parse.
// Bohpum never writes to the list file.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BAD = "This file isn't an Excel list Bohpum can read.";
const NO_XLS = "Bohpum can't read old .xls lists on this PC. Open it in Excel and save it as .xlsx.";
const XLSX_PARTS = (n) => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' ||
  n === 'xl/styles.xml' || /^xl\/worksheets\/[^/]+\.xml$/.test(n);

// The wanted entries of a zip, through its central directory → Map name → Buffer. Stored (0) and deflated (8).
function unzipEntries(buf, want) {
  const out = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('not a zip');
  try {
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    for (let n = 0; n < count; n++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad directory');
      const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
      const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
      const local = buf.readUInt32LE(p + 42);
      const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
      p += 46 + nameLen + extraLen + commentLen;
      if (!want(name)) continue;
      if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('bad entry');
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + csize);
      if (method === 0) out.set(name, Buffer.from(data));
      else if (method === 8) out.set(name, zlib.inflateRawSync(data));
      else throw new Error('method');
    }
  } catch { throw new Error('not a zip'); }
  return out;
}

function xlsxResult(buf) {
  const parts = unzipEntries(buf, XLSX_PARTS);
  if (!parts.has('xl/workbook.xml')) throw new Error('not a zip');
  const files = {};
  for (const [name, data] of parts) files[name] = data.toString('utf8');
  return { kind: 'xlsx', files };
}

function csvText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); }
  catch { return new TextDecoder('windows-1252').decode(buf); }
}

// In plain words, for the page to show
function listError(err) {
  const c = err && err.code;
  if (c === 'ENOENT') return 'The list was moved or deleted.';
  if (c === 'EBUSY' || c === 'EPERM' || c === 'EACCES') return 'The list is open in another program, or Bohpum may not read it. Close it in Excel and try again.';
  if (c === 'NO_XLS_READER') return NO_XLS;
  if (err && err.plain) return err.message;
  return BAD;
}

// opts.convertXls(p) → the .xlsx bytes of an old .xls (LibreOffice); it rejects with code 'NO_XLS_READER' when there is none
async function readList(p, opts = {}) {
  try {
    const ext = path.extname(p).toLowerCase();
    if (ext === '.csv') return { kind: 'csv', text: csvText(fs.readFileSync(p)) };
    if (ext === '.xls') {
      if (!fs.existsSync(p)) return { error: listError({ code: 'ENOENT' }) };
      if (!opts.convertXls) return { error: NO_XLS };
      return xlsxResult(await opts.convertXls(p));
    }
    return xlsxResult(fs.readFileSync(p));
  } catch (err) { return { error: listError(err) }; }
}

// A photo cell (File Explorer's "Copy as path" gives "C:\Photos\Sokha.jpg" with quotes) → the full path it names, or null if empty
function photoTried(cell, listPath) {
  let c = String(cell == null ? '' : cell).trim();
  const q = c[0];
  if ((q === '"' || q === "'") && c.length > 1 && c.endsWith(q)) c = c.slice(1, -1).trim();
  if (!c) return null;
  c = c.replace(/\//g, '\\');
  return path.isAbsolute(c) ? c : path.join(path.dirname(listPath), c);
}
// … and only if that file is there
function photoPath(cell, listPath) {
  const full = photoTried(cell, listPath);
  return full && fs.existsSync(full) ? full : null;
}

const MAX_SIDE = 1600, CACHE_BYTES = 150 * 1024 * 1024;
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
const DEVICE = /^\\\\[?.]\\/;   // \\?\ and \\.\ reach devices, not files; \\server\share is fine
const urls = new Map();
let cached = 0;

// The EXIF orientation (1-8) of a jpeg, 1 when there is none
function exifOrientation(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return 1;
  for (let p = 2; p + 4 <= buf.length && buf[p] === 0xff;) {
    const m = buf[p + 1], len = buf.readUInt16BE(p + 2);
    if (m === 0xda || m === 0xd9) break;
    if (m === 0xe1 && buf.toString('latin1', p + 4, p + 10) === 'Exif\0\0') {
      const t = p + 10, le = buf.toString('latin1', t, t + 2) === 'II';
      const u16 = (o) => le ? buf.readUInt16LE(o) : buf.readUInt16BE(o), u32 = (o) => le ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
      try {
        const ifd = t + u32(t + 4), n = u16(ifd);
        for (let i = 0; i < n; i++) if (u16(ifd + 2 + i * 12) === 0x0112) { const v = u16(ifd + 10 + i * 12); return v >= 1 && v <= 8 ? v : 1; }
      } catch {}
      return 1;
    }
    p += 2 + len;
  }
  return 1;
}
// A jpeg with just an orientation tag after SOI (a re-encoded jpeg loses it)
function withOrientation(jpeg, o) {
  const exif = Buffer.from([0xff, 0xe1, 0, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0]);
  return Buffer.concat([jpeg.subarray(0, 2), exif, jpeg.subarray(2)]);
}

// Only pictures are ever opened
const isImage = (p) => Object.prototype.hasOwnProperty.call(MIME, path.extname(p).slice(1).toLowerCase());

// A photo as a data URL; big jpg/png are scaled to 1600 px on the long side, a jpeg keeps its orientation.
// Cached by path + mtime + size, up to CACHE_BYTES. Throws when the file can't be read or decoded.
async function photoUrl(p) {
  const st = await fs.promises.stat(p), key = p + '|' + st.mtimeMs + '|' + st.size;
  if (urls.has(key)) { const u = urls.get(key); urls.delete(key); urls.set(key, u); return u; }
  const ext = path.extname(p).slice(1).toLowerCase();
  let buf = await fs.promises.readFile(p);
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
    const { nativeImage } = require('electron');
    const img = nativeImage.createFromBuffer(buf), { width, height } = img.getSize();
    if (!width || !height) throw new Error('not a picture Bohpum can read');
    if (Math.max(width, height) > MAX_SIDE) {
      const k = MAX_SIDE / Math.max(width, height);
      const small = img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' });
      if (ext === 'png') buf = small.toPNG();
      else { const o = exifOrientation(buf); buf = small.toJPEG(90); if (o > 1) buf = withOrientation(buf, o); }
    }
  }
  const url = 'data:' + MIME[ext] + ';base64,' + buf.toString('base64');
  urls.set(key, url); cached += url.length;
  while (cached > CACHE_BYTES && urls.size > 1) { const k = urls.keys().next().value; cached -= urls.get(k).length; urls.delete(k); }
  return url;
}

// One cell of a photo column → { url } | { missing: path tried } | { unreadable: path } | { empty: true }
async function photoResult(cell, listPath) {
  const tried = photoTried(cell, listPath);
  if (!tried) return { empty: true };
  if (DEVICE.test(tried) || !isImage(tried) || !fs.existsSync(tried)) return { missing: tried };
  try { return { url: await photoUrl(tried) }; }
  catch (err) { console.error('photo', tried, err); return { unreadable: tried }; }
}

module.exports = { unzipEntries, readList, listError, photoPath, photoTried, photoUrl, photoResult };
