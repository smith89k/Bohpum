// reader.js, part 2: downloading the Publisher reader from the locked address (the key headers), checking its size and
// SHA-256 before anything is unpacked, unpacking into <pack>.partial and renaming it into place only when complete —
// and nothing left behind when it is refused, damaged, missing, offline or cancelled. One download is shared by every
// window that needs it. The reader folder has a space and Khmer letters in it, as a Windows user name can.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const KEY = { clientId: 'test-id', clientSecret: 'test-secret' };

run(async (t, check) => {
  const reader = require(path.join(ROOT, 'reader.js'));   // here, so a missing file is a FAIL line
  const { keyHeaders } = require(path.join(ROOT, 'updater.js'));
  const { makeFakePack, startServer } = require('./reader-server');
  const { pack, zip } = await makeFakePack(t.ctx.tmp);
  const server = await startServer({ zip, pack, key: KEY });
  const url = reader.packUrl(server.base, pack);
  const headers = keyHeaders(KEY);
  let k = 0;
  const freshRoot = () => path.join(t.ctx.tmp, 'Bohpum test ប្រកាស', 'r' + (++k), 'reader');   // Review Focus 2
  const left = (root) => fs.existsSync(root) ? fs.readdirSync(root) : [];
  const fails = async (p) => { try { await p; return null; } catch (e) { return e; } };
  const get = (o) => reader.downloadPack({ fetch, url, headers, pack, ...o });

  check('The pack address is <base>reader/<name>.zip', url === server.base + 'reader/' + pack.name + '.zip', url);

  // ---- the right key
  let root = freshRoot();
  const seen = [];
  await get({ root, onProgress: (p) => seen.push(p) });
  check('With the key the reader is unpacked into its own folder', fs.existsSync(reader.sofficeIn(path.join(root, pack.name))));
  check('…and nothing else is left in the reader folder', same(left(root), [pack.name]), left(root));
  const lastDl = seen.filter(p => p.phase === 'download').at(-1);
  check('Progress counts the download to its full size, then says it is unpacking',
    lastDl && lastDl.got === pack.size && lastDl.total === pack.size && seen.at(-1).phase === 'unpack', seen.slice(-3));

  // ---- problems leave nothing behind
  root = freshRoot();
  let e = await fails(get({ root, headers: keyHeaders({ clientId: 'test-id', clientSecret: 'wrong' }) }));
  check('A wrong key is refused', e && e.code === 'refused' && e.message === reader.READER_TEXT.refused, e && e.message);
  check('…and nothing is left', same(left(root), []), left(root));
  root = freshRoot();
  e = await fails(get({ root, pack: { ...pack, sha256: 'f'.repeat(64) } }));
  check('A checksum that doesn\'t match: damaged, nothing unpacked or left', e && e.code === 'damaged' && same(left(root), []), { code: e && e.code, left: left(root) });
  root = freshRoot();
  e = await fails(get({ root, pack: { ...pack, size: pack.size + 1 } }));
  check('A size that doesn\'t match: damaged, nothing left', e && e.code === 'damaged' && same(left(root), []), { code: e && e.code, left: left(root) });
  server.setMode('404'); root = freshRoot();
  e = await fails(get({ root }));
  check('Not in the bucket: missing', e && e.code === 'missing' && same(left(root), []), e && e.code);
  server.setMode('slow'); root = freshRoot();
  const ctrl = new AbortController();
  e = await fails(get({ root, signal: ctrl.signal, onProgress: (p) => { if (p.phase === 'download' && p.got > 0) ctrl.abort(); } }));
  check('Cancelled during the download: CANCELLED, nothing left', e === reader.CANCELLED && same(left(root), []), { e: e && String(e), left: left(root) });

  // Review Focus 4 and the other error kinds
  check('A full disk is said in plain words', reader.readerErrorFor(Object.assign(new Error('x'), { code: 'ENOSPC' })).code === 'disk-full');
  check('Another disk problem', reader.readerErrorFor(Object.assign(new Error('x'), { code: 'EPERM' })).code === 'disk');
  check('No connection', reader.readerErrorFor(new TypeError('fetch failed')).code === 'offline');
  check('An AbortError is a cancel', reader.readerErrorFor(Object.assign(new Error('x'), { name: 'AbortError' })) === reader.CANCELLED);
  check('Anything else: failed', reader.readerErrorFor(new Error('odd')).code === 'failed');
  const re = new reader.ReaderError('missing');
  check('A ReaderError passes through', reader.readerErrorFor(re) === re && re.message === reader.READER_TEXT.missing);

  check('The address comes from electron-builder\'s app-update.yml, with a trailing /',
    reader.readBaseUrl('provider: generic\nurl: https://bohpum-update.smith89k.com\nupdaterCacheDirName: bohpum-updater\n') === 'https://bohpum-update.smith89k.com/'
      && reader.readBaseUrl('provider: generic\r\nurl: https://x.example/\r\n') === 'https://x.example/' && reader.readBaseUrl('provider: generic\n') === null);

  // ---- one download shared
  const service = (r) => reader.createReaderService({ download: (onProgress, signal) => get({ root: r, onProgress, signal }) });
  const idle = async (s) => { const t0 = Date.now(); while (s.busy() && Date.now() - t0 < 5000) await t.sleep(50); return !s.busy(); };
  server.setMode('slow');
  root = freshRoot(); let s = service(root);
  let h0 = server.hits(), pa = 0, pb = 0;
  let [ra, rb] = await Promise.all([s.get('a', () => pa++), s.get('b', () => pb++)]);
  check('Two windows needing the reader share one download', server.hits() - h0 === 1 && pa > 0 && pb > 0 && same(ra, { ok: true }) && same(rb, { ok: true }),
    { hits: server.hits() - h0, pa, pb, ra, rb });
  root = freshRoot(); s = service(root);
  const qa = s.get('a', () => {}), qb = s.get('b', () => {});
  await t.sleep(150); s.cancel('a');
  [ra, rb] = await Promise.all([qa, qb]);
  check('One of them cancelling leaves the other\'s download going', same(ra, { cancelled: true }) && same(rb, { ok: true }), { ra, rb });
  root = freshRoot(); s = service(root);
  const qc = s.get('a', () => {});
  await t.sleep(150); s.cancel('a');
  const rc = await qc;
  check('The last one cancelling stops the download: nothing left, not busy', same(rc, { cancelled: true }) && await idle(s) && same(left(root), []), { rc, busy: s.busy(), left: left(root) });
  server.setMode('refuse'); root = freshRoot(); s = service(root);
  [ra, rb] = await Promise.all([s.get('a', () => {}), s.get('b', () => {})]);
  check('A refused download tells every window why', same(ra, { error: reader.READER_TEXT.refused }) && same(rb, ra), { ra, rb });
  server.setMode('ok');
  check('After it ends the next one starts a new download', same(await s.get('a', () => {}), { ok: true }) && !s.busy());

  // ---- offline (last: closes the server)
  await server.close(); root = freshRoot();
  e = await fails(get({ root }));
  check('No server: offline, nothing left', e && e.code === 'offline' && same(left(root), []), e && (e.code || String(e)));
});
