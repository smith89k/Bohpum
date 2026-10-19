// scripts/release-notes.js writes a GitHub release's notes from src/notes.js (the What's new window's notes, tags in its
// order), and stops with a plain message for a version with none, so release.yml never publishes empty notes.
const { spawnSync } = require('child_process');
const path = require('path');
const { run, ROOT } = require('./harness');

const script = path.join(ROOT, 'scripts', 'release-notes.js');
const version = require(path.join(ROOT, 'package.json')).version;
const notes = (...args) => {
  const r = spawnSync(process.execPath, [script, ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
};
const WORDS = ['New', 'Improved', 'Fixed', 'Removed'];

run(async (t, check) => {
  const e = await t.js(`window.BohpumNotes.noteFor(${JSON.stringify(version)})`);
  const r = notes(), lines = r.out.trim().split('\n');
  check("Heading: What's new in Bohpum <version> (<date>)", r.code === 0 && lines[0] === `What's new in Bohpum ${version} (${e.date})`, r);
  const items = lines.filter(l => l.startsWith('- '));
  check('One line per note, each tagged', items.length === e.notes.length && e.notes.every(n => r.out.includes(n.text))
    && items.every(l => /^- \*\*(New|Improved|Fixed|Removed):\*\* /.test(l)), r);
  const order = items.map(l => WORDS.indexOf(/\*\*(\w+):/.exec(l)[1]));
  check('Tags in the order New, Improved, Fixed, Removed', order.length > 0 && order.every((k, i) => !i || order[i - 1] <= k), order);
  const none = notes('9.9.9');
  check('A version with no notes stops with a plain message', none.code === 1 && /no notes for 9\.9\.9/.test(none.err), none);
});
