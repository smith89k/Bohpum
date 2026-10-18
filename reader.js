// Bohpum — the Publisher reader: a trimmed LibreOffice that reads .pub and the other outside formats. It is not in the
// installer: the release job builds it once per LibreOffice version (scripts/reader-pack.js) and puts it in the private
// R2 bucket as reader/<pack>.zip; Bohpum downloads it the first time it is needed, after asking, into
// %LOCALAPPDATA%\Bohpum\reader\<pack>\ (updates don't touch it; a full uninstall removes it). The pack's name, size
// and SHA-256 are built into the app (reader-pack.json), never read from the server.
// Which LibreOffice is used, in this order: (1) the pack this Bohpum expects; (2) in `pnpm start` only, the developer's
// vendor\libreoffice; (3) a LibreOffice installed on the PC; (4) an older downloaded pack (and a newer one is offered).
// None of them → ask to download. No Electron here: main.js wires it, so the rules are plain-Node testable.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), cp = require('child_process');

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

// ---------- the download ----------
// The pack's address: next to the updates (electron-builder's app-update.yml in the installed app's resources).
function readBaseUrl(appUpdateYml) {
  const m = /^url:\s*['"]?(https?:\/\/[^'"\s]+)/m.exec(String(appUpdateYml || ''));
  return m ? m[1].replace(/\/*$/, '/') : null;
}
const packUrl = (base, pack) => base + 'reader/' + pack.name + '.zip';

// What the boxes say when the download the user asked for doesn't work
const READER_TEXT = Object.freeze({
  offline: "Couldn't download the Publisher reader. Check the internet connection and try again.",
  refused: 'The download was refused. This copy may be too old: install the newest Bohpum, then try again.',
  missing: "The Publisher reader isn't available right now. Try again later.",
  failed: "Couldn't download the Publisher reader. Try again later.",
  damaged: 'The download was damaged. Try again.',
  'disk-full': "There isn't enough free space on the disk for the Publisher reader.",
  disk: "Couldn't save the Publisher reader on this PC.",
  'no-key': "This copy can't download the Publisher reader. Install LibreOffice on this PC, or install Bohpum from a release installer."
});
class ReaderError extends Error { constructor(code) { super(READER_TEXT[code]); this.code = code; } }
const CANCELLED = new Error('cancelled');
function readerErrorFor(err) {
  if (err instanceof ReaderError || err === CANCELLED) return err;
  if (err && (err.name === 'AbortError' || err.code === 'ABORT_ERR')) return CANCELLED;
  if (err && err.code === 'ENOSPC') return new ReaderError('disk-full');
  if (err instanceof TypeError || /^net::ERR_/.test(String(err && err.message))) return new ReaderError('offline');   // fetch / net.fetch
  if (err && typeof err.code === 'string' && /^E[A-Z]+$/.test(err.code)) return new ReaderError('disk');
  return new ReaderError('failed');
}

// Windows' own tar.exe reads and writes zip (never Git's tar). It can't open a full path holding letters outside the
// PC's code page (a Khmer user name), so it runs in the zip's folder and is given names relative to it.
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
function tar(args, cwd, signal) {
  return new Promise((resolve, reject) => {
    cp.execFile(TAR, args, { cwd, windowsHide: true, signal, maxBuffer: 16 << 20 }, (err, _out, stderr) => {
      if (!err) return resolve();
      if (err.name === 'AbortError') return reject(err);
      const said = String(stderr || err.message).trim();
      reject(Object.assign(new Error('tar: ' + said), { code: /space/i.test(said) ? 'ENOSPC' : 'EUNPACK' }));
    });
  });
}
const rel = (from, p) => path.relative(from, p) || '.';
function tarUnzip(zip, dir, signal) { const at = path.dirname(zip); return tar(['-xf', path.basename(zip), '-C', rel(at, dir)], at, signal); }
function tarZip(dir, zip) { const at = path.dirname(zip); return tar(['-a', '-c', '-f', path.basename(zip), '-C', rel(at, dir), '.'], at); }

const closed = (s) => new Promise((r) => (s.closed ? r() : s.once('close', r)));
const drained = (s) => new Promise((r) => { const done = () => { s.off('drain', done); s.off('close', done); r(); }; s.on('drain', done); s.on('close', done); });
const rmQuiet = (p) => { try { fs.rmSync(p, { recursive: true, force: true }); } catch {} };
// A new folder can't be renamed while the virus scanner still reads the files just unpacked: try again for a while.
async function renameSoon(from, to) {
  for (let i = 0; ; i++) {
    try { return fs.renameSync(from, to); }
    catch (e) { if (i >= 25 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) throw e; await new Promise((r) => setTimeout(r, 200)); }
  }
}

// Download <url> into <root>\<name>.download (hashing it), check its size and SHA-256 against the pack info built into
// the app, unpack it into <root>\<name>.partial, and rename that to <root>\<name> only when it holds soffice.exe.
// Any problem or a cancel removes the .download and .partial and throws a ReaderError or CANCELLED.
async function downloadPack({ fetch, url, headers, pack, root, onProgress = () => {}, signal, unzip = tarUnzip }) {
  const dl = path.join(root, pack.name + '.download'), part = path.join(root, pack.name + '.partial'), dest = path.join(root, pack.name);
  const clean = () => { rmQuiet(dl); rmQuiet(part); };
  try {
    fs.mkdirSync(root, { recursive: true });
    clean();
    const res = await fetch(url, { headers, signal, cache: 'no-store' });
    if (!res.ok) {
      try { await res.body?.cancel(); } catch {}
      throw new ReaderError(res.status === 401 || res.status === 403 ? 'refused' : res.status === 404 ? 'missing' : 'failed');
    }
    const hash = crypto.createHash('sha256'), out = fs.createWriteStream(dl);
    let outErr = null, got = 0, shown = 0, ok = false;
    out.on('error', (e) => { outErr = outErr || e; });
    try {
      for await (const chunk of res.body) {
        if (outErr) throw outErr;
        hash.update(chunk); got += chunk.length;
        if (got > pack.size) throw new ReaderError('damaged');
        if (!out.write(chunk)) await drained(out);
        if (Date.now() - shown >= 100) { shown = Date.now(); onProgress({ phase: 'download', got, total: pack.size }); }
      }
      ok = !outErr;
    } finally {
      if (ok) out.end(); else out.destroy();
      await closed(out);
    }
    if (outErr) throw outErr;
    onProgress({ phase: 'download', got, total: pack.size });
    if (got !== pack.size || hash.digest('hex') !== pack.sha256) throw new ReaderError('damaged');
    if (signal && signal.aborted) throw CANCELLED;
    onProgress({ phase: 'unpack' });
    fs.mkdirSync(part);
    await unzip(dl, part, signal);
    if (!isFile(sofficeIn(part))) throw new ReaderError('damaged');
    if (isFile(sofficeIn(dest))) rmQuiet(part);   // already there (never expected: one download at a time)
    else { rmQuiet(dest); await renameSoon(part, dest); }   // dest: a folder that was never finished
    rmQuiet(dl);
  } catch (e) {
    clean();
    throw signal && signal.aborted ? CANCELLED : readerErrorFor(e);
  }
}

// One download at a time, owned by main.js: a window asking while one runs joins it and gets its progress too.
// cancel(id) lets that window go ({ cancelled: true }) and stops the download only when no window is left waiting.
// → get(id, onProgress) resolves { ok: true } | { error: <plain words> } | { cancelled: true }
function createReaderService({ download }) {
  let cur = null, pending = 0, last = Promise.resolve();
  const resultFor = (e) => (e === CANCELLED ? { cancelled: true } : { error: e instanceof ReaderError ? e.message : READER_TEXT.failed });
  function start() {
    const me = { callers: [], ctrl: new AbortController() };
    const progress = (p) => { for (const c of me.callers) { try { c.onProgress(p); } catch {} } };
    const finish = (r) => { if (cur === me) cur = null; for (const c of me.callers.splice(0)) c.resolve(r); };
    pending++;
    // after the last one has finished cleaning up: they use the same file names
    const done = last.then(() => (me.ctrl.signal.aborted ? Promise.reject(CANCELLED) : download(progress, me.ctrl.signal)));
    last = done.then(() => {}, () => {}).then(() => { pending--; });
    done.then(() => finish({ ok: true }), (e) => finish(resultFor(e)));
    return me;
  }
  return {
    get(id, onProgress = () => {}) {
      if (!cur) cur = start();
      const me = cur;
      return new Promise((resolve) => me.callers.push({ id, onProgress, resolve }));
    },
    cancel(id) {
      const me = cur; if (!me) return;
      for (const c of me.callers.filter((x) => x.id === id)) { me.callers.splice(me.callers.indexOf(c), 1); c.resolve({ cancelled: true }); }
      if (!me.callers.length) { cur = null; me.ctrl.abort(); }
    },
    busy: () => !!cur || pending > 0
  };
}

module.exports = {
  PACK_RE, packName, parsePackInfo, readPackInfo, readerRoot, sofficeIn, completePacks, chooseReader, staleEntries, cleanStale,
  readBaseUrl, packUrl, READER_TEXT, ReaderError, CANCELLED, readerErrorFor, tarUnzip, tarZip, downloadPack, createReaderService
};
