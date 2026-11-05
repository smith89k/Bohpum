// A stand-in for store-update/out/BohpumStoreUpdate.exe in the update panel tests: main.js runs it (BOHPUM_STORE_HELPER,
// from source only) with ELECTRON_RUN_AS_NODE. It speaks the helper's JSON lines. What it answers comes from the JSON
// file named by BOHPUM_FAKE_STORE, read on every run, so a test changes the Store's answers between steps:
//   { check: { count, version, silent, delay } | null (dies with nothing said),
//     download: { steps, total, delay, end: 'completed' | 'cancelled' | 'nothing' | null (dies) },
//     install: { delay, end: 'completed' | 'cancelled' | 'error' | null } }
// Every run's arguments are added to <that file>.log, one JSON line each.
const fs = require('fs');

const file = process.env.BOHPUM_FAKE_STORE;
const s = JSON.parse(fs.readFileSync(file, 'utf8'));
const [cmd, ...rest] = process.argv.slice(2);
fs.appendFileSync(file + '.log', JSON.stringify([cmd, ...rest]) + '\n');
const say = e => process.stdout.write(JSON.stringify(e) + '\n');
const wait = ms => new Promise(r => setTimeout(r, ms || 0));

(async () => {
  say({ event: 'start', package: 'Bohpum.StoreTest_fake' });
  if (cmd === 'check') {
    const c = s.check;
    await wait(c && c.delay);
    if (!c) return;
    say({ event: 'check', count: c.count, version: c.version || '', silent: !!c.silent });
  } else if (cmd === 'download') {
    const d = s.download || {};
    if (rest.includes('--silent-only') && !(s.check && s.check.silent)) return say({ event: 'done', state: 'cancelled' });
    const steps = d.steps || 4, total = d.total || 64 * 1048576;
    for (let i = 1; i <= steps; i++) {
      await wait(d.delay || 100);
      const done = Math.round(total * i / steps);
      say({ event: 'progress', done, total, fraction: done / total });
    }
    if (d.end) say({ event: 'done', state: d.end });
  } else if (cmd === 'install') {
    const i = s.install || {};
    await wait(i.delay);
    if (i.end === 'error') say({ event: 'error', code: '0x80070005' });
    else if (i.end) say({ event: 'done', state: i.end });
  }
})();
