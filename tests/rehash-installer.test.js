// scripts/rehash-installer.js, run by the release job after SignPath signed the installer: the signature changes the
// installer's bytes, and installed copies check an update's SHA-512 and size (latest.yml) and download only its changed
// parts (the .blockmap). So the signed file replaces the unsigned one in dist/, and both are made again from it, the way
// electron-builder makes them. A file from SignPath without a signature is refused and dist/ stays as it was.
// No made-up program is ever written to disk: virus scanners (Trend Micro: "Cryp_Xin1") remove them. The signature
// reader is checked on bytes in memory; the files on disk are plain text.
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { run, ROOT } = require('./harness');

const EXE = 'Bohpum-Setup-9.9.9.exe';
// The smallest PE header: MZ pointing at a PE32+ (or PE32) header whose certificate table (data directory 4, where
// Authenticode puts the signature) is empty, or names `sig` bytes appended at the end. In memory only.
function pe(sig, magic = 0x20b) {
  const head = Buffer.alloc(0x200, 0), body = Buffer.alloc(4096, 0);
  head.write('MZ', 0, 'latin1'); head.writeUInt32LE(0x80, 0x3c); head.write('PE\0\0', 0x80, 'latin1');
  head.writeUInt16LE(magic, 0x98);
  const dirs = 0x98 + (magic === 0x20b ? 112 : 96);
  head.writeUInt32LE(16, dirs - 4);                                            // 16 data directories
  if (sig) { head.writeUInt32LE(0x200 + body.length, dirs + 4 * 8); head.writeUInt32LE(sig, dirs + 4 * 8 + 4); }
  return Buffer.concat([head, body, Buffer.alloc(sig || 0, 0)]);
}
const sha512 = (buf) => crypto.createHash('sha512').update(buf).digest('base64');

run(async (t, check) => {
  const { hasSignature, rehash } = require(path.join(ROOT, 'scripts', 'rehash-installer.js'));
  const lying = pe(null); lying.writeUInt32LE(0x200, 0x98 + 112 + 4 * 8); lying.writeUInt32LE(1e6, 0x98 + 112 + 4 * 8 + 4);
  check('The signature reader: a certificate table → signed (PE32+ and PE32); none, one past the end, or not a PE → not',
    hasSignature(pe(9000)) && hasSignature(pe(9000, 0x10b)) && !hasSignature(pe(null)) && !hasSignature(pe(null, 0x10b))
      && !hasSignature(lying) && !hasSignature(Buffer.from('MZ not really a program')) && !hasSignature(Buffer.alloc(0)));

  const dist = path.join(t.ctx.tmp, 'dist'), signedDir = path.join(t.ctx.tmp, 'signed');
  fs.mkdirSync(dist); fs.mkdirSync(signedDir);
  const unsignedBytes = Buffer.from('the unsigned installer '.repeat(20000)), signedBytes = Buffer.from('the signed installer '.repeat(25000));
  const latest = `version: 9.9.9\nfiles:\n  - url: ${EXE}\n    sha512: ${sha512(unsignedBytes)}\n    size: ${unsignedBytes.length}\npath: ${EXE}\nsha512: ${sha512(unsignedBytes)}\nreleaseDate: '2026-10-19T00:00:00.000Z'\n`;
  const reset = () => {
    fs.writeFileSync(path.join(dist, EXE), unsignedBytes); fs.writeFileSync(path.join(dist, EXE + '.blockmap'), 'old');
    fs.writeFileSync(path.join(dist, 'latest.yml'), latest);
  };
  const unchanged = () => fs.readFileSync(path.join(dist, EXE)).equals(unsignedBytes) && fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8') === latest
    && fs.readFileSync(path.join(dist, EXE + '.blockmap'), 'utf8') === 'old';
  const signed = path.join(signedDir, EXE);
  fs.writeFileSync(signed, signedBytes);

  reset();
  let err = null; try { await rehash(signed, dist, () => true); } catch (e) { err = e; }
  check('It runs', !err, String(err));
  check('The signed installer replaces the unsigned one in dist', fs.readFileSync(path.join(dist, EXE)).equals(signedBytes));
  const yml = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8');
  check('latest.yml: both SHA-512 lines and the size are the signed file\'s; everything else stays',
    yml === latest.split(sha512(unsignedBytes)).join(sha512(signedBytes)).replace(`size: ${unsignedBytes.length}`, `size: ${signedBytes.length}`), yml);
  let map = null; try { map = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dist, EXE + '.blockmap')))); } catch {}
  const builderDir = path.dirname(require.resolve('electron-builder', { paths: [ROOT] }));
  const { buildBlockMap } = require(require.resolve('app-builder-lib/out/targets/blockmap/blockmap', { paths: [builderDir] }));
  const want = path.join(t.ctx.tmp, 'want.blockmap'); await buildBlockMap(signed, 'gzip', want);
  check('The blockmap is made again from the signed file, the same as electron-builder makes it',
    !!map && Array.isArray(map.files) && fs.readFileSync(path.join(dist, EXE + '.blockmap')).equals(fs.readFileSync(want)), map && Object.keys(map));

  reset();
  err = null; try { await rehash(signed, dist); } catch (e) { err = e; }
  check('A file without a signature is refused, and dist stays as it was', !!err && /no signature/.test(err.message) && unchanged(), String(err));

  reset();
  const other = path.join(signedDir, 'Other.exe'); fs.writeFileSync(other, signedBytes);
  err = null; try { await rehash(other, dist, () => true); } catch (e) { err = e; }
  check('A file latest.yml doesn\'t name is refused', !!err && /latest\.yml/.test(err.message) && unchanged(), String(err));

  // as the release job runs it
  reset();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'rehash-installer.js'), signed, dist], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  check('From the command line: a stop says why as a GitHub error line (exit 1)', r.status === 1 && /^::error::.*no signature/m.test(out) && unchanged(), out);
});
