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

const MAX_SIDE = 1600, MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml' };
const urls = new Map();
// A photo as a data URL; big jpg/png are scaled to 1600 px on the long side. Cached by path + mtime + size.
function photoUrl(p) {
  const st = fs.statSync(p), key = p + '|' + st.mtimeMs + '|' + st.size;
  if (urls.has(key)) return urls.get(key);
  const ext = path.extname(p).slice(1).toLowerCase();
  let buf = fs.readFileSync(p), mime = MIME[ext] || 'image/' + ext;
  if (ext === 'jpg' || ext === 'jpeg' || ext === 'png') {
    const { nativeImage } = require('electron');
    const img = nativeImage.createFromBuffer(buf), { width, height } = img.getSize();
    if (Math.max(width, height) > MAX_SIDE) {
      const k = MAX_SIDE / Math.max(width, height);
      const small = img.resize({ width: Math.round(width * k), height: Math.round(height * k), quality: 'best' });
      buf = ext === 'png' ? small.toPNG() : small.toJPEG(90);
    }
  }
  const url = 'data:' + mime + ';base64,' + buf.toString('base64');
  if (urls.size >= 50) urls.delete(urls.keys().next().value);
  urls.set(key, url);
  return url;
}

module.exports = { unzipEntries, readList, listError, photoPath, photoTried, photoUrl };
