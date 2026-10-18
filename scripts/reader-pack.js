// The Publisher reader pack: a LibreOffice folder (unpacked from The Document Foundation's MSI by the release job) →
// trimmed as scripts/bundle-libreoffice.js trims → <out>\LibreOffice, zipped to <out>\<pack>.zip with Windows' tar.exe,
// and <out>\<pack>.json = { name, size, sha256 }: what the app is built with (reader-pack.json) and what R2 keeps next
// to the zip (reader/<pack>.json). The pack name comes from libreoffice.json (its version and trim number).
// `node scripts/reader-pack.js <LibreOffice folder> <out folder>` prints that JSON. Run by .github/workflows/release.yml.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const reader = require('../reader');
const { trimCopy } = require('./bundle-libreoffice');

const sha256Of = (file) => new Promise((resolve, reject) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')));
});

async function makePack(loDir, outDir) {
  if (!fs.existsSync(reader.sofficeIn(loDir))) throw new Error(`No program\\soffice.exe in ${loDir}`);
  const lo = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'libreoffice.json'), 'utf8'));
  const name = reader.packName(lo), dir = path.join(outDir, 'LibreOffice'), zip = path.join(outDir, name + '.zip');
  fs.mkdirSync(outDir, { recursive: true });
  trimCopy(loDir, dir);
  fs.rmSync(zip, { force: true });
  await reader.tarZip(dir, zip);
  const info = { name, size: fs.statSync(zip).size, sha256: await sha256Of(zip) };
  fs.writeFileSync(path.join(outDir, name + '.json'), JSON.stringify(info));
  return { ...info, zip, dir };
}

if (require.main === module) {
  const [loDir, outDir] = process.argv.slice(2);
  if (!loDir || !outDir) { console.error('Usage: node scripts/reader-pack.js <LibreOffice folder> <out folder>'); process.exit(2); }
  makePack(path.resolve(loDir), path.resolve(outDir))
    .then(({ name, size, sha256 }) => console.log(JSON.stringify({ name, size, sha256 })))
    .catch((e) => { console.error('::error::' + e.message); process.exit(1); });
}

module.exports = { makePack };
