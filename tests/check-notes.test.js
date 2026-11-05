// scripts/check-notes.js stops `pnpm run dist` / `dist:store` when a release has no What's new (as in Sastra PDF): when
// src/notes.js has nothing for package.json's version or a broken entry, or when docs/store-listing.md has no Store notes
// for it. It passes on the real files and names the problem in a broken copy.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const script = path.join(ROOT, 'scripts', 'check-notes.js');
const version = require(path.join(ROOT, 'package.json')).version;
const runCheck = (file, listing) => {
  const args = [script, ...(file || listing ? [file || path.join(ROOT, 'src', 'notes.js')] : []), ...(listing ? [listing] : [])];
  const r = spawnSync(process.execPath, args, { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

run(async (t, check) => {
  const real = runCheck();
  check('The real src/notes.js and Store listing pass', real.code === 0 && real.out.includes('newest ' + version) && real.out.includes('Store listing'), real);
  const src = fs.existsSync(path.join(ROOT, 'src', 'notes.js')) ? fs.readFileSync(path.join(ROOT, 'src', 'notes.js'), 'utf8') : '';
  const broken = (name, change) => { const f = path.join(t.ctx.tmp, name + '.js'); fs.writeFileSync(f, change(src)); return runCheck(f); };
  const cases = [
    ['a newest entry that is not package.json\'s version', broken('version', (s) => s.replace(`N('${version}'`, "N('9.9.9'")), /newest entry is 9\.9\.9/],
    ['a version listed twice', broken('twice', (s) => s.replace('const NOTES = Object.freeze([', `const NOTES = Object.freeze([\n  N('${version}', '2026-10-17', [['new', 'x']]),`)), /listed twice/],
    ['an entry with no date', broken('date', (s) => s.replace(/N\('([^']+)', '\d{4}-\d{2}-\d{2}'/, "N('$1', ''")), /has no date/],
    ['an unknown kind', broken('kind', (s) => s.replace(/^(\s+)\['new', /m, "$1['news', ")), /unknown kind "news"/]
  ];
  for (const [name, r, msg] of cases) check(`It stops the build on ${name}`, r.code === 1 && msg.test(r.out), r);

  // the Store page's "What's new in this version"
  const md = fs.readFileSync(path.join(ROOT, 'docs', 'store-listing.md'), 'utf8');
  const store = (name, text) => { const f = path.join(t.ctx.tmp, name + '.md'); fs.writeFileSync(f, text); return runCheck(null, f); };
  const head = "## What's new in this version\n\n";
  const storeCases = [
    ['no Store notes for this version', store('none', md.replace(`### ${version}`, '### 9.9.9')), new RegExp(`no "### ${version.replace(/\./g, '\\.')}"`)],
    ['a Store section with no notes', store('empty', `${head}### ${version}\n\n(to do)\n\n### 0.0.1\n\n- x\n`), /has no notes/],
    ['Store notes longer than Partner Center takes', store('long', `${head}### ${version}\n\n- ${'x'.repeat(1600)}\n`), /Partner Center takes up to 1500/]
  ];
  for (const [name, r, msg] of storeCases) check(`It stops the build on ${name}`, r.code === 1 && msg.test(r.out), r);
  const ok = store('ok', `${head}### ${version}\n\n- One new thing.\n- Another.\n\n## Keywords\n`);
  check('A short Store section with "- " lines passes', ok.code === 0, ok);
});
