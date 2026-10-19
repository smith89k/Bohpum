// .github/workflows/release.yml, read as text (no YAML library): it runs only by hand with a typed version and makes
// only the Microsoft Store package (since 0.2.5: no installer and nothing to R2 — copies installed from an installer
// stay on 0.2.4). Three jobs: "check" (the GitHub token, installs nothing): the version, not released yet, store.json;
// "build" runs other people's code (pnpm install, the MSI unpack, electron-builder) with no secret and no token: the
// Publisher reader from The Document Foundation's MSI (its SHA-256 checked), the menu, the Store package, checked by
// scripts/store-check.js; "publish" (the GitHub token, installs nothing) makes the GitHub release with the package.
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
  check('The package is named Bohpum-Store-<version>.msix', /^ {2}MSIX: Bohpum-Store-\$\{\{ inputs\.version \}\}\.msix$/m.test(topEnv), topEnv);

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
      const runAt = s.findIndex(l => /^ {8}run:/.test(l));
      return { name, text: s.join('\n'), run: runAt >= 0 ? s.slice(runAt).join('\n') : '' };
    });
  };
  const J = Object.fromEntries(Object.entries(jobs).map(([k, v]) => [k, { text: v.join('\n'), steps: stepsOf(v) }]));
  check('Three jobs: check, build, publish', ['check', 'build', 'publish'].every(k => J[k]) && Object.keys(J).length === 3, Object.keys(J));
  if (!['check', 'build', 'publish'].every(k => J[k])) return;
  check('build waits for check; publish waits for both',
    /^ {4}needs: check\s*$/m.test(J.build.text) && /^ {4}needs: \[check, build\]\s*$/m.test(J.publish.text));

  // ---- no installer, nothing to R2, no secret at all
  check('No secret anywhere (no R2 key, no update key)', !/secrets\./.test(text));
  check('No installer and nothing to R2', !/--win nsis|Bohpum-Setup|\bEXE\b|R2_|aws |s3:|r2_has|r2-put|r2-prune|update-config|CF_ACCESS|latest\.yml/.test(text));
  const otherPeoplesCode = /pnpm install|pnpm exec|electron-builder|msiexec|reader-pack\.js\b|pnpm\/action-setup/;
  check('check and publish install and build nothing (no pnpm, no electron-builder, no MSI)',
    !otherPeoplesCode.test(J.check.text) && !otherPeoplesCode.test(J.publish.text));
  check('build never gets the GitHub token', !/github\.token|GITHUB_TOKEN/.test(J.build.text));
  check('build may only read the repository; publish may write releases',
    /^ {4}permissions:\n {6}contents: read/m.test(J.build.text) && /^ {4}permissions:\n {6}contents: write/m.test(J.publish.text));

  // ---- the steps
  const idx = (job, start) => J[job].steps.findIndex(s => s.name.startsWith(start));
  const inOrder = (job, names) => { const at = names.map(n => idx(job, n)); return at.every(i => i >= 0) && at.every((v, i) => !i || v > at[i - 1]); };
  const step = (job, start) => J[job].steps[idx(job, start)] || { run: '', text: '' };
  const first = step('check', 'The version matches package.json').run;
  check('check: the version matches package.json, is not released yet, and store.json holds the Store identity',
    /require\('\.\/package\.json'\)\.version/.test(first) && /gh release view "v\$VERSION"/.test(first) && /readStoreInfo\('store\.json'\)/.test(first), first);
  check('build: install, What\'s new, the reader from the MSI (downloaded, unpacked, trimmed), the menu, the Store package, its check',
    inOrder('build', ['Install', 'Check What\'s new', 'The Publisher reader: download', 'The Publisher reader: unpack', 'The Publisher reader: trim',
      'Build the File Explorer menu', 'Build the Store package', 'The package has']), J.build.steps.map(s => s.name));
  const dl = step('build', 'The Publisher reader: download').run;
  check('…the MSI\'s SHA-256 must match libreoffice.json', /sha256sum lo\.msi/.test(dl) && /libreoffice\.json'\)\.sha256/.test(dl), dl);
  check('…the trimmed reader must open the demo card',
    /reader-check\.js dist-reader\/LibreOffice\/program\/soffice\.exe samples\/demo-card\.pub/.test(step('build', 'The Publisher reader: trim').run));
  check('…the Store package is built with build/store.config.js, then scripts/store-check.js checks it',
    /electron-builder --win appx --publish never --config build\/store\.config\.js/.test(step('build', 'Build the Store package').run)
      && /node scripts\/store-check\.js dist-store "\$MSIX"/.test(step('build', 'The package has').run));
  const gh = step('publish', 'GitHub release').run;
  check('publish: the GitHub release has the Store package and the notes from What\'s new',
    /node scripts\/release-notes\.js "\$VERSION"/.test(gh) && /gh release create "v\$VERSION" "dist-store\/\$MSIX"/.test(gh), gh);
});
