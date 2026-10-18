// .github/workflows/release.yml, read as text (no YAML library): it runs only by hand with a typed version, in three
// jobs. "check" holds the R2 key but installs nothing; "build" runs other people's code (pnpm install, the MSI unpack,
// electron-builder) and gets neither the R2 key nor the GitHub token, only the update key that goes into the app;
// "publish" uploads the built files with the key and installs nothing. Uploads put the file that points at the others
// LAST, the lock check also tries the reader pack, and "is it in R2?" counts only a real "not found" as absent — a
// passing network error must never make the job rebuild and overwrite a reader pack installed copies already trust.
const { spawnSync } = require('child_process');
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
  const topEnv = (/^env:\n((?: {2}.*\n)+)/m.exec(text) || [])[1] || '';
  check('No secret is given to the whole workflow', !/secrets\./.test(topEnv), topEnv);

  // jobs: from each "  <name>:" under "jobs:" to the next; steps: from each "      - name:" / "      - uses:" to the next
  const jobsText = text.slice(text.search(/^jobs:\n/m));
  const jobs = {};
  let cur = null;
  for (const l of jobsText.split('\n').slice(1)) {
    if (/^\s*#/.test(l)) continue;   // comments (one above each job describes the next job)
    const m = /^ {2}([\w-]+):\s*$/.exec(l); if (m) jobs[cur = m[1]] = []; else if (cur) jobs[cur].push(l);
  }
  const stepsOf = (lines) => {
    const steps = [];
    for (const l of lines) { if (/^ {6}- (name|uses):/.test(l)) steps.push([l]); else if (steps.length) steps.at(-1).push(l); }
    return steps.map((s) => {
      const name = (/^ {6}- name:\s*(.*)$/.exec(s[0]) || [])[1]?.replace(/^["']|["']$/g, '') || s[0].trim();
      const at = s.findIndex(l => /^ {8}env:\s*$/.test(l)), env = [];
      if (at >= 0) for (let i = at + 1; i < s.length && /^ {10}/.test(s[i]); i++) env.push(s[i].trim());
      const runAt = s.findIndex(l => /^ {8}run:/.test(l));
      return { name, text: s.join('\n'), env: env.join('\n'), run: runAt >= 0 ? s.slice(runAt).join('\n') : '' };
    });
  };
  const J = Object.fromEntries(Object.entries(jobs).map(([k, v]) => [k, { text: v.join('\n'), steps: stepsOf(v) }]));
  check('Three jobs: check, build, publish', ['check', 'build', 'publish'].every(k => J[k]), Object.keys(J));
  if (!['check', 'build', 'publish'].every(k => J[k])) return;
  const jobEnv = (j) => (/^ {4}env:\n((?: {6}.*\n)+)/m.exec(J[j].text + '\n') || [])[1] || '';
  check('No job gives a secret to all its steps', ['check', 'build', 'publish'].every(j => !/secrets\./.test(jobEnv(j))));
  check('build waits for check; publish waits for both',
    /^ {4}needs: check\s*$/m.test(J.build.text) && /^ {4}needs: \[check, build\]\s*$/m.test(J.publish.text));

  // ---- who sees which key
  const otherPeoplesCode = /pnpm install|pnpm exec|electron-builder|msiexec|reader-pack\.js\b|pnpm\/action-setup/;
  check('check and publish install and build nothing (no pnpm, no electron-builder, no MSI)',
    !otherPeoplesCode.test(J.check.text) && !otherPeoplesCode.test(J.publish.text));
  check('build never gets the R2 key or the GitHub token', !/secrets\.R2_|github\.token|secrets\.GITHUB_TOKEN/.test(J.build.text));
  const keySteps = J.build.steps.filter(s => /secrets\./.test(s.text));
  check('…its only secret is the update key, in the one step that writes it into the app',
    keySteps.length === 1 && keySteps[0].name.startsWith('Put the update key') && !/secrets\.(?!CF_ACCESS_CLIENT_(ID|SECRET)\b)/.test(keySteps[0].text), keySteps.map(s => s.name));
  check('build may only read the repository; publish may write releases',
    /^ {4}permissions:\n {6}contents: read/m.test(J.build.text) && /^ {4}permissions:\n {6}contents: write/m.test(J.publish.text));

  // ---- order
  const idx = (job, start) => J[job].steps.findIndex(s => s.name.startsWith(start));
  const inOrder = (job, names) => { const at = names.map(n => idx(job, n)); return at.every(i => i >= 0) && at.every((v, i) => !i || v > at[i - 1]); };
  check('check: the version and secrets first, then whether the reader pack is in R2', inOrder('check', ['The version matches package.json', 'Is the reader pack in R2?']));
  check('build: install, the reader pack (only when R2 hasn\'t got it), the update key, the installer',
    inOrder('build', ['Install', 'Build the reader pack', 'Put the update key', 'Build the installer']) && /if: needs\.check\.outputs\.have != 'true'/.test(J.build.steps[idx('build', 'Build the reader pack')].text));
  check('publish: the reader pack, then the installer files, the lock check, prune, the GitHub release',
    inOrder('publish', ['Upload the reader pack', 'Upload to R2', 'The update address is locked', 'Remove older installers', 'GitHub release']));

  const step = (job, start) => J[job].steps[idx(job, start)] || { run: '', text: '' };
  const upload = step('publish', 'Upload to R2'), readerUp = step('publish', 'Upload the reader pack'), pos = (s, re) => s.search(re);
  check('Upload to R2: latest.yml goes after the installer', pos(upload.run, /put "dist\/\$EXE"/) >= 0 && pos(upload.run, /latest\.yml/) > pos(upload.run, /put "dist\/\$EXE"/), upload.run);
  check('Upload the reader pack: its .json goes after its .zip', pos(readerUp.run, /\.zip"/) >= 0 && pos(readerUp.run, /\.json"/) > pos(readerUp.run, /\.zip"/), readerUp.run);
  const lock = step('publish', 'The update address is locked');
  check('The lock check also tries the reader pack, without and with the key',
    /reader\//.test(lock.run) && /bohpum-update\.smith89k\.com/.test(lock.run) && /CF-Access-Client-Id/.test(lock.run), lock.run);
  check('The GitHub release says the reader downloads once', /The Publisher reader \(LibreOffice .*\) downloads once, the first time a Publisher file is opened\./.test(text));
  check('Prune goes through scripts/r2-prune.js', /node scripts\/r2-prune\.js "\$EXE"/.test(step('publish', 'Remove older installers').run));
  check('"Is it in R2?" goes through r2_has, for the installer and for the reader pack',
    /r2_has "\$EXE"/.test(step('check', 'The version matches package.json').run) && /r2_has "reader\/\$name\.json"/.test(step('check', 'Is the reader pack in R2?').run)
      && !/head-object/.test(J.check.text));

  // ---- scripts/r2-put.sh, run for real in bash with a stand-in aws
  const sh = path.join(ROOT, 'scripts', 'r2-put.sh'), shText = fs.existsSync(sh) ? fs.readFileSync(sh, 'utf8') : '';
  check('scripts/r2-put.sh has the put() that checks the stored size', /put\(\)\s*\{[\s\S]*head-object[\s\S]*ContentLength/.test(shText));
  const bash = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'].find(p => fs.existsSync(p)) || 'bash';
  const has = (awsSays, code) => {
    const r = spawnSync(bash, ['-c', `aws() { echo "${awsSays}" >&2; return ${code}; }; source scripts/r2-put.sh; r2_has some/key; echo "rc=$?"`], { cwd: ROOT, encoding: 'utf8' });
    return { out: (r.stdout || '') + (r.stderr || ''), status: r.status };
  };
  const there = has('', 0), absent = has('An error occurred (404) when calling the HeadObject operation: Not Found', 254);
  const blip = has('Could not connect to the endpoint URL: "https://x.r2.cloudflarestorage.com/b/some/key"', 255), refused = has('An error occurred (403) when calling the HeadObject operation: Forbidden', 254);
  check('r2_has: there → yes', /rc=0/.test(there.out), there);
  check('r2_has: only a real 404 "Not Found" → absent', /rc=1/.test(absent.out), absent);
  check('r2_has: any other error (no connection, refused) stops the job instead of guessing "absent"',
    blip.status === 1 && !/rc=/.test(blip.out) && /::error::/.test(blip.out) && refused.status === 1 && !/rc=/.test(refused.out), { blip, refused });

  // the Windows runner checks out with core.autocrlf: a CRLF .sh breaks bash's `source`
  const attrs = fs.existsSync(path.join(ROOT, '.gitattributes')) ? fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8') : '';
  check('Shell scripts are checked out with LF line ends', /^\*\.sh\s+text\s+eol=lf\s*$/m.test(attrs), attrs);
});
