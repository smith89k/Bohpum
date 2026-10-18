// Test helper (not a test): a fake Publisher reader pack and a fake private R2 bucket that, like Cloudflare Access,
// refuses requests without the key. Used by reader-download, reader-editor, reader-convert and reader-nokey.
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { ROOT } = require('./harness');

const NAME = 'LibreOffice-25.8.2-pack1';

// <dir>\pack-src (program\soffice.exe + 1 MiB of random bytes) zipped like the release job does → { pack, zip }
async function makeFakePack(dir) {
  const reader = require(path.join(ROOT, 'reader.js'));
  const src = path.join(dir, 'pack-src');
  fs.mkdirSync(path.join(src, 'program'), { recursive: true });
  fs.mkdirSync(path.join(src, 'share'), { recursive: true });
  fs.writeFileSync(path.join(src, 'program', 'soffice.exe'), 'x');
  fs.writeFileSync(path.join(src, 'share', 'big.bin'), crypto.randomBytes(1 << 20));
  const zip = path.join(dir, NAME + '.zip');
  await reader.tarZip(src, zip);
  const bytes = fs.readFileSync(zip);
  return { zip, pack: { name: NAME, size: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') } };
}

// http://127.0.0.1:<port>/reader/<name>.zip, only with both CF-Access headers = key. Modes: 'ok', 'slow' (64 KB every
// 50 ms), '404', 'refuse' (403 even with the key). hits() = requests for the zip.
function startServer({ zip, pack, key }) {
  let mode = 'ok', hits = 0;
  const server = http.createServer((req, res) => {
    if (req.url !== `/reader/${pack.name}.zip`) { res.writeHead(404); return res.end(); }
    hits++;
    const ok = key && req.headers['cf-access-client-id'] === key.clientId && req.headers['cf-access-client-secret'] === key.clientSecret;
    if (!ok || mode === 'refuse') { res.writeHead(403); return res.end('Forbidden'); }
    if (mode === '404') { res.writeHead(404); return res.end(); }
    const bytes = fs.readFileSync(zip);
    res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': bytes.length });
    if (mode !== 'slow') return res.end(bytes);
    let at = 0;
    const tick = setInterval(() => {
      if (res.destroyed) return clearInterval(tick);
      res.write(bytes.subarray(at, at + 65536)); at += 65536;
      if (at >= bytes.length) { clearInterval(tick); res.end(); }
    }, 50);
    res.on('close', () => clearInterval(tick));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    base: `http://127.0.0.1:${server.address().port}/`,
    setMode: (m) => { mode = m; },
    hits: () => hits,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); })
  })));
}

module.exports = { NAME, makeFakePack, startServer };
