// Does a (trimmed) LibreOffice really open a Publisher file? The release job runs this on the new reader pack before
// uploading it: a headless convert to .fodg with a throwaway profile, with the same flags as main.js convertOne.
// `node scripts/reader-check.js <soffice.exe> <file.pub>` exits 1 with ::error:: when it doesn't.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

function checkReader(soffice, file) {
  return new Promise((resolve) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-check-'));
    const input = path.join(tmp, 'input' + (path.extname(file) || '.pub').toLowerCase());
    fs.copyFileSync(file, input);
    const profileUrl = pathToFileURL(path.join(tmp, 'profile')).href;
    const args = ['-env:UserInstallation=' + profileUrl, '--headless', '--norestore', '--nolockcheck', '--convert-to', 'fodg', '--outdir', tmp, input];
    execFile(soffice, args, { timeout: 300000, windowsHide: true }, (err) => {
      const out = path.join(tmp, 'input.fodg');
      const ok = fs.existsSync(out) && fs.readFileSync(out, 'utf8').includes('<office:document');
      if (!ok) console.error('soffice:', err ? err.message : 'no output');
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
      resolve(ok);
    });
  });
}

if (require.main === module) {
  const [soffice, file] = process.argv.slice(2);
  if (!soffice || !file) { console.error('Usage: node scripts/reader-check.js <soffice.exe> <file.pub>'); process.exit(2); }
  checkReader(path.resolve(soffice), path.resolve(file)).then((ok) => {
    if (!ok) { console.error(`::error::The reader pack could not open ${file}: it would not read Publisher files.`); process.exit(1); }
    console.log(`The reader pack opens ${path.basename(file)}.`);
  });
}

module.exports = { checkReader };
