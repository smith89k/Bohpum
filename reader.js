// Bohpum — the Publisher reader: a trimmed LibreOffice that reads .pub and the other outside formats. It is not in the
// installer: the release job builds it once per LibreOffice version (scripts/reader-pack.js) and puts it in the private
// R2 bucket as reader/<pack>.zip; Bohpum downloads it the first time it is needed, after asking, into
// %LOCALAPPDATA%\Bohpum\reader\<pack>\ (updates don't touch it; a full uninstall removes it). The pack's name, size
// and SHA-256 are built into the app (reader-pack.json), never read from the server.
// Which LibreOffice is used, in this order: (1) the pack this Bohpum expects; (2) in `pnpm start` only, the developer's
// vendor\libreoffice; (3) a LibreOffice installed on the PC; (4) an older downloaded pack (and a newer one is offered).
// None of them → ask to download. No Electron here: main.js wires it, so the rules are plain-Node testable.
const fs = require('fs'), path = require('path');

const PACK_RE = /^LibreOffice-[0-9][\w.]*-pack\d+$/;

const packName = ({ version, pack }) => `LibreOffice-${version}-pack${pack}`;

// reader-pack.json (and reader/<pack>.json in R2): { name, size, sha256 } → that, or null when anything is off
function parsePackInfo(text) {
  let c; try { c = JSON.parse(text); } catch { return null; }
  const { name, size, sha256 } = c || {};
  if (typeof name !== 'string' || !PACK_RE.test(name)) return null;
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(sha256)) return null;
  return { name, size, sha256 };
}
function readPackInfo(file) { try { return parsePackInfo(fs.readFileSync(file, 'utf8')); } catch { return null; } }

const readerRoot = (localAppData) => path.join(localAppData, 'Bohpum', 'reader');
const sofficeIn = (dir) => path.join(dir, 'program', 'soffice.exe');
const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };
const list = (root) => { try { return fs.readdirSync(root, { withFileTypes: true }); } catch { return []; } };
const byVersion = (a, b) => a.localeCompare(b, 'en', { numeric: true });   // LibreOffice-7… before LibreOffice-25…

// Pack folders that were finished: named exactly like a pack and holding program\soffice.exe (a download is unpacked
// into <pack>.partial and renamed only when complete), oldest version first.
function completePacks(root) {
  return list(root).filter(d => d.isDirectory() && PACK_RE.test(d.name) && isFile(sofficeIn(path.join(root, d.name))))
    .map(d => d.name).sort(byVersion);
}

// → { soffice, need }: need 'download' (nothing to read with), 'newer' (an older pack works, the expected one isn't
// here yet) or null. dev / installed are soffice paths main.js found, or null.
function chooseReader({ root, pack, dev = null, installed = null }) {
  const done = completePacks(root);
  if (pack && done.includes(pack.name)) return { soffice: sofficeIn(path.join(root, pack.name)), need: null };
  if (dev) return { soffice: dev, need: null };
  if (installed) return { soffice: installed, need: null };
  const older = done.filter(n => !pack || n !== pack.name);
  if (older.length) return { soffice: sofficeIn(path.join(root, older.at(-1))), need: pack ? 'newer' : null };
  return { soffice: null, need: 'download' };
}

// Left over in the reader folder: downloads and unpacks that never finished, pack folders without soffice.exe, and —
// once the pack to keep is in place — the older packs (until then one of them may be the one in use).
function staleEntries(root, keep) {
  const done = completePacks(root), keepDone = !!keep && done.includes(keep);
  return list(root).map(d => d.name).filter(n =>
    /\.(partial|download)$/.test(n) || (PACK_RE.test(n) && !done.includes(n)) || (keepDone && PACK_RE.test(n) && n !== keep)
  ).sort();
}
function cleanStale(root, keep) {
  for (const n of staleEntries(root, keep)) { try { fs.rmSync(path.join(root, n), { recursive: true, force: true }); } catch {} }
}

module.exports = { PACK_RE, packName, parsePackInfo, readPackInfo, readerRoot, sofficeIn, completePacks, chooseReader, staleEntries, cleanStale };
