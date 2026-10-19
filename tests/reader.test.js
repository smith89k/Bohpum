// reader.js, part 1: the Publisher reader (a trimmed LibreOffice downloaded once) — its pack name and info, which
// LibreOffice Bohpum uses (the one inside the Store package, the expected pack, the developer's copy, an installed
// LibreOffice, then an older pack), and what is left over to clean up. A folder that was never finished (.partial, or no
// soffice.exe) is never used.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SHA = 'ab'.repeat(32);

run(async (t, check) => {
  const reader = require(path.join(ROOT, 'reader.js'));   // here, so a missing file is a FAIL line
  let k = 0;
  const fresh = () => { const r = path.join(t.ctx.tmp, 'root' + (++k)); fs.mkdirSync(r, { recursive: true }); return r; };
  const mk = (root, name) => { const p = path.join(root, name, 'program'); fs.mkdirSync(p, { recursive: true }); fs.writeFileSync(path.join(p, 'soffice.exe'), 'x'); };
  const NAME = 'LibreOffice-25.8.2-pack1';
  const pack = { name: NAME, size: 123, sha256: SHA };

  check('The pack name holds the LibreOffice version and the trim number',
    reader.packName({ version: '25.8.2', pack: 1 }) === NAME && reader.PACK_RE.test(NAME) && !reader.PACK_RE.test(NAME + '.partial'));

  const info = (o) => JSON.stringify({ name: NAME, size: 123, sha256: SHA, ...o });
  check('Pack info is read from its JSON', same(reader.parsePackInfo(info()), pack), reader.parsePackInfo(info()));
  const bad = [info({ name: 'LibreOffice-25.8.2' }), info({ size: 0 }), info({ size: '1' }), info({ sha256: SHA.slice(1) }), info({ sha256: SHA.toUpperCase() }), 'x'];
  check('Pack info with a bad name, size or checksum is no pack info', bad.every(s => reader.parsePackInfo(s) === null), bad.map(s => reader.parsePackInfo(s)));
  check('A missing pack file is no pack info', reader.readPackInfo(path.join(t.ctx.tmp, 'gone.json')) === null);

  check('The reader lives in %LOCALAPPDATA%\\Bohpum\\reader', reader.readerRoot('C:\\L') === path.join('C:\\L', 'Bohpum', 'reader'));
  check('soffice.exe is in the program folder', reader.sofficeIn('C:\\R\\x') === path.join('C:\\R\\x', 'program', 'soffice.exe'));

  // ---- which LibreOffice
  let root = fresh(); mk(root, NAME);
  check('The expected pack wins, even over the developer\'s copy and an installed LibreOffice',
    same(reader.chooseReader({ root, pack, dev: 'D', installed: 'I' }), { soffice: reader.sofficeIn(path.join(root, NAME)), need: null }));
  root = fresh();
  check('No pack: the developer\'s copy', same(reader.chooseReader({ root, pack, dev: 'D', installed: 'I' }), { soffice: 'D', need: null }));
  check('No pack, no developer copy: an installed LibreOffice', same(reader.chooseReader({ root, pack, dev: null, installed: 'I' }), { soffice: 'I', need: null }));
  root = fresh(); mk(root, 'LibreOffice-7.0.0-pack1');
  const old7 = reader.sofficeIn(path.join(root, 'LibreOffice-7.0.0-pack1'));
  check('Only an older pack: it is used, and a newer one is offered', same(reader.chooseReader({ root, pack }), { soffice: old7, need: 'newer' }));
  check('…with no pack expected (a copy without pack info) nothing newer is offered', same(reader.chooseReader({ root, pack: null }), { soffice: old7, need: null }));
  mk(root, 'LibreOffice-25.8.1-pack1');
  check('Among older packs, the newest version is used (7 < 25)',
    same(reader.chooseReader({ root, pack }), { soffice: reader.sofficeIn(path.join(root, 'LibreOffice-25.8.1-pack1')), need: 'newer' }));
  root = fresh();
  check('Nothing at all: download', same(reader.chooseReader({ root, pack }), { soffice: null, need: 'download' }));
  check('A missing reader folder: download', same(reader.chooseReader({ root: path.join(root, 'gone'), pack }), { soffice: null, need: 'download' }));
  // Review Focus 3: the PC was turned off mid-unpack
  root = fresh(); mk(root, NAME + '.partial'); fs.mkdirSync(path.join(root, NAME, 'program'), { recursive: true });
  check('A .partial folder holding soffice.exe, and a pack folder without soffice.exe, are never used',
    same(reader.chooseReader({ root, pack }), { soffice: null, need: 'download' }) && same(reader.completePacks(root), []), reader.chooseReader({ root, pack }));
  const B = path.join(fresh(), 'soffice.exe'); fs.writeFileSync(B, 'x');
  root = fresh(); mk(root, NAME);
  check('The reader inside the Store package wins over everything else',
    same(reader.chooseReader({ root, pack, bundled: B, dev: 'D', installed: 'I' }), { soffice: B, need: null }));
  check('…but only when it is there', same(reader.chooseReader({ root: fresh(), pack, bundled: path.join(fresh(), 'gone.exe'), installed: 'I' }), { soffice: 'I', need: null }));

  // ---- what to clean up
  root = fresh(); mk(root, NAME); mk(root, 'LibreOffice-7.0.0-pack1'); mk(root, 'x.partial'); fs.writeFileSync(path.join(root, 'x.download'), 'x');
  check('With the expected pack in place: older packs and leftovers go',
    same(reader.staleEntries(root, NAME), ['LibreOffice-7.0.0-pack1', 'x.download', 'x.partial']), reader.staleEntries(root, NAME));
  reader.cleanStale(root, NAME);
  check('cleanStale removes exactly those', same(fs.readdirSync(root), [NAME]), fs.readdirSync(root));
  root = fresh(); mk(root, 'LibreOffice-7.0.0-pack1'); mk(root, 'x.partial'); fs.writeFileSync(path.join(root, 'x.download'), 'x');
  check('Without the expected pack: only leftovers go (an older pack may be in use)',
    same(reader.staleEntries(root, NAME), ['x.download', 'x.partial']), reader.staleEntries(root, NAME));
  fs.mkdirSync(path.join(root, NAME, 'program'), { recursive: true });
  check('A pack folder that was never finished (no soffice.exe) goes too',
    same(reader.staleEntries(root, NAME), [NAME, 'x.download', 'x.partial']), reader.staleEntries(root, NAME));
  reader.cleanStale(root, NAME);
  check('…and cleanStale keeps the older pack', same(fs.readdirSync(root), ['LibreOffice-7.0.0-pack1']), fs.readdirSync(root));
  const gone = path.join(t.ctx.tmp, 'no-root');
  let threw = false; try { reader.cleanStale(gone, NAME); } catch { threw = true; }
  check('A missing reader folder: nothing to clean, no error', same(reader.staleEntries(gone, NAME), []) && !threw);
});
