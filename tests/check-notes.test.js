// scripts/check-notes.js stops `npm run dist` when src/notes.js has no What's new for package.json's version, or an
// entry is broken (as in Sastra PDF): it passes on the real file and names the problem in a broken copy.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const script = path.join(ROOT, 'scripts', 'check-notes.js');
const version = require(path.join(ROOT, 'package.json')).version;
const runCheck = (file) => {
  const r = spawnSync(process.execPath, [script, ...(file ? [file] : [])], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

run(async (t, check) => {
  const real = runCheck();
  check('The real src/notes.js passes', real.code === 0 && real.out.includes('newest ' + version), real);
  const src = fs.existsSync(path.join(ROOT, 'src', 'notes.js')) ? fs.readFileSync(path.join(ROOT, 'src', 'notes.js'), 'utf8') : '';
  const broken = (name, change) => { const f = path.join(t.ctx.tmp, name + '.js'); fs.writeFileSync(f, change(src)); return runCheck(f); };
  const cases = [
    ['a newest entry that is not package.json\'s version', broken('version', (s) => s.replace(`N('${version}'`, "N('9.9.9'")), /newest entry is 9\.9\.9/],
    ['a version listed twice', broken('twice', (s) => s.replace('const NOTES = Object.freeze([', `const NOTES = Object.freeze([\n  N('${version}', '2026-10-17', [['new', 'x']]),`)), /listed twice/],
    ['an entry with no date', broken('date', (s) => s.replace(/N\('([^']+)', '\d{4}-\d{2}-\d{2}'/, "N('$1', ''")), /has no date/],
    ['an unknown kind', broken('kind', (s) => s.replace(/^(\s+)\['new', /m, "$1['news', ")), /unknown kind "news"/]
  ];
  for (const [name, r, msg] of cases) check(`It stops the build on ${name}`, r.code === 1 && msg.test(r.out), r);
});
