// .github/workflows/release.yml, read as text (no YAML library): it runs only by hand with a typed version; the reader
// pack is reused from R2 or built, checked and uploaded before the installer is built; uploads put the file that points
// at the others LAST; the R2 and update keys never reach a step that runs other people's code (install, MSI unpack,
// build); and the lock check also tries the reader pack.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

run(async (t, check) => {
  const file = path.join(ROOT, '.github', 'workflows', 'release.yml');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
  check('The release workflow exists', !!text);

  const on = (/^on:\n([\s\S]*?)^\S/m.exec(text) || [])[1] || '';
  check('It runs only by hand (workflow_dispatch) with a required version',
    /^ {2}workflow_dispatch:/m.test(on) && !/^ {2}(push|pull_request|schedule|release|workflow_run):/m.test(on)
      && /^ {6}version:\n(?: {8}.*\n)*? {8}required: true/m.test(on), on);
  const jobEnv = (/^ {4}env:\n((?: {6}.*\n)+)/m.exec(text) || [])[1] || '';
  check('No secret is given to the whole job', !/secrets\./.test(jobEnv), jobEnv);

  // steps: from each "      - name:" / "      - uses:" to the next
  const lines = text.split('\n'), steps = [];
  for (const l of lines) { if (/^ {6}- (name|uses):/.test(l)) steps.push([l]); else if (steps.length) steps.at(-1).push(l); }
  const info = steps.map((s) => {
    const name = (/^ {6}- name:\s*(.*)$/.exec(s[0]) || [])[1]?.replace(/^["']|["']$/g, '') || s[0].trim();
    const at = s.findIndex(l => /^ {8}env:\s*$/.test(l)), env = [];
    if (at >= 0) for (let i = at + 1; i < s.length && /^ {10}/.test(s[i]); i++) env.push(s[i].trim());
    const runAt = s.findIndex(l => /^ {8}run:/.test(l));
    return { name, env: env.join('\n'), run: runAt >= 0 ? s.slice(runAt).join('\n') : '' };
  });
  const idx = (start) => info.findIndex(s => s.name.startsWith(start));
  const order = ['Is the reader pack in R2?', 'Build the reader pack', 'Upload the reader pack', 'Put the update key', 'Build the installer',
    'Upload to R2', 'The update address is locked', 'Remove older installers', 'GitHub release'];
  const at = order.map(idx);
  check('Steps in order: reader pack (in R2? / build / upload), update key, installer, upload, lock check, prune, GitHub release',
    at.every(i => i >= 0) && at.every((v, i) => !i || v > at[i - 1]), Object.fromEntries(order.map((n, i) => [n, at[i]])));

  const upload = info[idx('Upload to R2')] || { run: '' }, readerUp = info[idx('Upload the reader pack')] || { run: '' };
  const pos = (s, re) => s.search(re);
  check('Upload to R2: latest.yml goes after the installer', pos(upload.run, /put "dist\/\$EXE"/) >= 0 && pos(upload.run, /latest\.yml/) > pos(upload.run, /put "dist\/\$EXE"/), upload.run);
  check('Upload the reader pack: its .json goes after its .zip', pos(readerUp.run, /\.zip"/) >= 0 && pos(readerUp.run, /\.json"/) > pos(readerUp.run, /\.zip"/), readerUp.run);

  const risky = info.filter(s => /pnpm install|msiexec|electron-builder|reader-pack\.js\b/.test(s.run));   // \b: not reader-pack.json
  check('Steps that run other people\'s code (install, MSI unpack, build, pack) are found', risky.length >= 4, risky.map(s => s.name));
  const leaks = risky.filter(s => /R2_|AWS_|CF_ACCESS_|secrets\./.test(s.env));
  check('…and none of them gets the R2 key, the update key or another secret', !leaks.length, leaks.map(s => s.name));

  const lock = info[idx('The update address is locked')] || { run: '' };
  check('The lock check also tries the reader pack, without and with the key',
    /reader\//.test(lock.run) && /bohpum-update\.smith89k\.com/.test(lock.run) && /CF-Access-Client-Id/.test(lock.run), lock.run);
  check('The GitHub release says the reader downloads once', /The Publisher reader \(LibreOffice .*\) downloads once, the first time a Publisher file is opened\./.test(text));
  const prune = info[idx('Remove older installers')] || { run: '' };
  check('Prune goes through scripts/r2-prune.js', /node scripts\/r2-prune\.js "\$EXE"/.test(prune.run), prune.run);
  check('scripts/r2-put.sh has the put() that checks the stored size', /put\(\)\s*\{[\s\S]*head-object[\s\S]*ContentLength/.test(
    fs.existsSync(path.join(ROOT, 'scripts', 'r2-put.sh')) ? fs.readFileSync(path.join(ROOT, 'scripts', 'r2-put.sh'), 'utf8') : ''));
  // the Windows runner checks out with core.autocrlf: a CRLF .sh breaks bash's `source`
  const attrs = fs.existsSync(path.join(ROOT, '.gitattributes')) ? fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8') : '';
  check('Shell scripts are checked out with LF line ends', /^\*\.sh\s+text\s+eol=lf\s*$/m.test(attrs), attrs);
});
