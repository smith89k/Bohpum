// scripts/rehash-installer.js, run by the release job after SignPath signed the installer: the signature changes the
// installer's bytes, and installed copies check an update's SHA-512 and size (latest.yml) and download only its changed
// parts (the .blockmap). So the signed file replaces the unsigned one in dist/, and both are made again from it, the way
// electron-builder makes them. A file from SignPath without a signature is refused and dist/ stays as it was.
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { run, ROOT } = require('./harness');

const EXE = 'Bohpum-Setup-9.9.9.exe';
// The smallest PE file: an MZ header pointing at a PE32+ header whose certificate table (data directory 4, where
// Authenticode puts the signature) is empty, or names `sig` bytes appended at the end. Plain text inside, not random
// bytes: Windows Defender locks a made-up program full of random bytes while it scans it.
function pe(sig) {
  const head = Buffer.alloc(0x200, 0), body = Buffer.alloc(300000, 'Bohpum blockmap test. ');
  head.write('MZ', 0, 'latin1'); head.writeUInt32LE(0x80, 0x3c); head.write('PE\0\0', 0x80, 'latin1');
  head.writeUInt16LE(0x8664, 0x84); head.writeUInt16LE(240, 0x94);             // machine x64, optional header size
  head.writeUInt16LE(0x20b, 0x98); head.writeUInt32LE(16, 0x98 + 108);         // PE32+, 16 data directories
  const file = Buffer.concat([head, body]);
  if (!sig) return file;
  head.writeUInt32LE(file.length, 0x98 + 112 + 4 * 8); head.writeUInt32LE(sig.length, 0x98 + 112 + 4 * 8 + 4);
  return Buffer.concat([head, body, sig]);
}
const sha512 = (buf) => crypto.createHash('sha512').update(buf).digest('base64');

run(async (t, check) => {
  const dist = path.join(t.ctx.tmp, 'dist'), signedDir = path.join(t.ctx.tmp, 'signed');
  fs.mkdirSync(dist); fs.mkdirSync(signedDir);
  const unsignedBytes = pe(null), signedBytes = pe(Buffer.alloc(9000, 'signature '));
  const latest = `version: 9.9.9\nfiles:\n  - url: ${EXE}\n    sha512: ${sha512(unsignedBytes)}\n    size: ${unsignedBytes.length}\npath: ${EXE}\nsha512: ${sha512(unsignedBytes)}\nreleaseDate: '2026-10-19T00:00:00.000Z'\n`;
  const reset = () => {
    fs.writeFileSync(path.join(dist, EXE), unsignedBytes); fs.writeFileSync(path.join(dist, EXE + '.blockmap'), 'old');
    fs.writeFileSync(path.join(dist, 'latest.yml'), latest);
  };
  const rehash = (file) => {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'rehash-installer.js'), file, dist], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
  };

  reset();
  fs.writeFileSync(path.join(signedDir, EXE), signedBytes);
  const r = rehash(path.join(signedDir, EXE));
  check('It runs', r.code === 0, r);
  check('The signed installer replaces the unsigned one in dist', fs.readFileSync(path.join(dist, EXE)).equals(signedBytes));
  const yml = fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8');
  check('latest.yml: both SHA-512 lines and the size are the signed file\'s; everything else stays',
    yml === latest.split(sha512(unsignedBytes)).join(sha512(signedBytes)).replace(`size: ${unsignedBytes.length}`, `size: ${signedBytes.length}`), yml);
  let map = null; try { map = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dist, EXE + '.blockmap')))); } catch {}
  const builderDir = path.dirname(require.resolve('electron-builder', { paths: [ROOT] }));
  const { buildBlockMap } = require(require.resolve('app-builder-lib/out/targets/blockmap/blockmap', { paths: [builderDir] }));
  const want = path.join(t.ctx.tmp, 'want.blockmap'); await buildBlockMap(path.join(signedDir, EXE), 'gzip', want);
  check('The blockmap is made again from the signed file, the same as electron-builder makes it',
    !!map && Array.isArray(map.files) && fs.readFileSync(path.join(dist, EXE + '.blockmap')).equals(fs.readFileSync(want)), map && Object.keys(map));

  reset();
  fs.writeFileSync(path.join(signedDir, EXE), pe(null));
  const bad = rehash(path.join(signedDir, EXE));
  check('A file without a signature is refused with a plain message, and dist stays as it was',
    bad.code === 1 && /no signature/.test(bad.out) && fs.readFileSync(path.join(dist, EXE)).equals(unsignedBytes)
      && fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8') === latest && fs.readFileSync(path.join(dist, EXE + '.blockmap'), 'utf8') === 'old', bad);

  reset();
  fs.writeFileSync(path.join(signedDir, 'Other.exe'), signedBytes);
  const other = rehash(path.join(signedDir, 'Other.exe'));
  check('A file latest.yml doesn\'t name is refused', other.code === 1 && /latest\.yml/.test(other.out) && fs.readFileSync(path.join(dist, 'latest.yml'), 'utf8') === latest, other);
});
