// For the Microsoft Store package when a release reuses the Publisher reader pack already in R2 (the job then builds
// no pack): download that pack with the update key the job already wrote into the app (update-config.json — this step
// gets no secret), check it against reader-pack.json exactly as installed copies do (reader.js downloadPack), and
// unpack it into <out>\LibreOffice, where build/store.config.js takes it from.
// `node scripts/store-reader.js <out folder>`; run by .github/workflows/release.yml.
const fs = require('fs'), path = require('path');
const reader = require('../reader'), updates = require('../updater');
const ROOT = path.join(__dirname, '..');

async function storeReader({ out, base, pack, key, fetch = (url, o) => globalThis.fetch(url, { headers: o.headers, signal: o.signal }) }) {
  const root = path.join(out, 'store-download'), dest = path.join(out, 'LibreOffice');
  try {
    await reader.downloadPack({ fetch, url: reader.packUrl(base, pack), headers: updates.keyHeaders(key), pack, root });
    fs.rmSync(dest, { recursive: true, force: true });
    fs.renameSync(path.join(root, pack.name), dest);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  return dest;
}

if (require.main === module) {
  const out = process.argv[2];
  if (!out) { console.error('Usage: node scripts/store-reader.js <out folder>'); process.exit(2); }
  const base = require('../package.json').build.publish.url.replace(/\/*$/, '/');
  const pack = reader.readPackInfo(path.join(ROOT, 'reader-pack.json')), key = updates.readUpdateConfig(path.join(ROOT, 'update-config.json'));
  if (!pack || !key) { console.error('::error::store-reader needs reader-pack.json and update-config.json (it runs after "Put the update key into the app")'); process.exit(1); }
  storeReader({ out: path.resolve(out), base, pack, key }).then(
    (d) => console.log(`store-reader: ${pack.name} → ${path.relative(ROOT, d)}`),
    (e) => { console.error('::error::store-reader: ' + (e && e.message || e)); process.exit(1); });
}

module.exports = { storeReader };
