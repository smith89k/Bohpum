// Copies the LibreOffice installed on this PC into vendor/libreoffice, trimmed to what background
// file conversion needs, so the installer ships it (see "extraResources" in package.json).
// Re-copies only when the installed LibreOffice changes.
// Usage: node scripts/bundle-libreoffice.js [--force]   (LIBREOFFICE_DIR overrides the source folder)
const fs = require('fs');
const path = require('path');

const SRC = process.env.LIBREOFFICE_DIR || path.join(process.env.ProgramFiles || 'C:\\Program Files', 'LibreOffice');
const DEST = path.join(__dirname, '..', 'vendor', 'libreoffice');
const STAMP = path.join(__dirname, '..', 'vendor', 'libreoffice.stamp');
const TRIM_REV = 2; // bump when SKIP changes so existing bundles are rebuilt

// Not needed to convert files in the background (paths relative to the LibreOffice folder)
const SKIP = [
  /^help$/, /^readmes$/,
  /^share\/(extensions|gallery|template|wizards|xpdfimport|tipoftheday)$/, // dictionaries, clip-art, templates, PDF import
  /^share\/config\/images_(?!colibre\.zip$)/,                              // keep one icon theme
  /^program\/(python|pyuno)/i, /^program\/[^/]+\.pyi?$/,                   // Python scripting
  /^program\/services\/(pyuno|scriptproviderforpython)\.rdb$/,
  /\.dmp$/i                                                                // crash dumps
];
// LibreOffice's own installer puts the Visual C++ runtime into Windows, so ship a private copy
const VC_RUNTIME = ['msvcp140.dll', 'msvcp140_1.dll', 'msvcp140_2.dll', 'vcruntime140.dll', 'vcruntime140_1.dll'];

function buildId(dir) {
  try { return /^buildid=(.+)$/m.exec(fs.readFileSync(path.join(dir, 'program', 'version.ini'), 'utf8'))[1].trim(); }
  catch { return null; }
}
function dirSize(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}

const srcId = buildId(SRC);
const want = srcId && `${srcId} trim${TRIM_REV}`;
const have = fs.existsSync(STAMP) && fs.existsSync(DEST) ? fs.readFileSync(STAMP, 'utf8').trim() : null;

if (!srcId) {
  if (have) { console.warn(`LibreOffice not found at ${SRC}; using the existing bundle.`); process.exit(0); }
  console.error(`LibreOffice not found at ${SRC}. Install it, or set LIBREOFFICE_DIR to its folder.`);
  process.exit(1);
}
if (have === want && !process.argv.includes('--force')) {
  console.log('LibreOffice bundle is up to date.');
  process.exit(0);
}

console.log(`Copying LibreOffice from ${SRC} ...`);
fs.rmSync(DEST, { recursive: true, force: true });
fs.cpSync(SRC, DEST, {
  recursive: true,
  filter: (src) => !SKIP.some((re) => re.test(path.relative(SRC, src).split(path.sep).join('/')))
});
const system32 = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
for (const dll of VC_RUNTIME) {
  const to = path.join(DEST, 'program', dll);
  if (!fs.existsSync(to)) fs.copyFileSync(path.join(system32, dll), to);
}
fs.writeFileSync(STAMP, want);
console.log(`LibreOffice bundled: ${Math.round(dirSize(DEST) / 1048576)} MB in vendor/libreoffice`);
