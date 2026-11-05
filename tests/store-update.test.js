// store-update.js: the Store copy's update state behind the badge and panel (as in Sastra PDF), with no Electron inside —
// the helper's lines, the new version's number, when it checks, quiet and asking downloads, install, and stop. The helper
// runs are faked (each one ends when the test says so) and so are the timers; makeRun is tried on a real small program.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tick = () => new Promise(r => setImmediate(r));

// timers you fire by hand: fire(ms) runs every waiting timeout of that length
function fakeTimers() {
  let n = 0; const list = new Map();
  const add = (fn, ms, every) => { const id = ++n; list.set(id, { fn, ms, every }); return id; };
  const clear = id => list.delete(id);
  return {
    timers: { setTimeout: (fn, ms) => add(fn, ms, false), setInterval: (fn, ms) => add(fn, ms, true), clearTimeout: clear, clearInterval: clear },
    has: (ms, every = false) => [...list.values()].some(t => t.ms === ms && t.every === every),
    fire: ms => { for (const [id, t] of [...list]) if (t.ms === ms && !t.every) { list.delete(id); t.fn(); } },
    fireEvery: ms => { for (const t of [...list.values()]) if (t.ms === ms && t.every) t.fn(); }
  };
}
// helper runs that wait: runs[i].say(event), .end(), .killed
function fakeRuns() {
  const runs = [];
  const runFn = (args, onEvent) => {
    let res; const done = new Promise(r => { res = r; });
    const r = { args, killed: false, say: e => onEvent(e), end: () => res() };
    r.kill = () => { r.killed = true; res(); };
    runs.push(r);
    return { done, kill: r.kill };
  };
  return { runs, run: runFn };
}

run(async (t, check) => {
  const su = require(path.join(ROOT, 'store-update.js'));
  const { FIRST_CHECK_MS, CHECK_EVERY_MS } = require(path.join(ROOT, 'updater.js'));

  // ---- the helper's lines and the version
  const lines = ['{"event":"check","count":1}', 'nope', '[1]', '{"count":1}', '{"event":5}', ''].map(su.parseLine);
  check('A helper line is read only when it is a JSON object with an event name',
    same(lines, [{ event: 'check', count: 1 }, null, null, null, null, null]), lines);
  const versions = [['0.3.1', '0.3.2.0'], ['0.3.1', '0.4.0.1'], ['0.3.1', '0.3.1.0'], ['0.3.1', '0.3.0.0'], ['0.3.1', ''], ['0.3.1', 'x'], ['0.3.1', '1.0.0']]
    .map(([a, b]) => su.nextVersion(a, b));
  check('The new version: "0.3.2.0" → 0.3.2, a fourth part kept when not 0, unknown when not newer (the Store reports the installed one)',
    same(versions, ['0.3.2', '0.4.0.1', null, null, null, null, '1.0.0']), versions);

  // ---- a quiet (silent) update: checks, downloads by itself, ready
  const sent = [], logs = [];
  const make = (o = {}) => {
    const ft = fakeTimers(), fr = fakeRuns();
    let clock = 0, task = false, restarts = 0;
    const u = su.createStoreUpdater({
      run: fr.run, current: '0.3.1', send: s => sent.push(s), log: l => logs.push(l), hwnd: () => '4242',
      taskOpen: () => task, registerRestart: () => { restarts++; if (o.restartThrows) throw new Error('no'); },
      timers: ft.timers, now: () => clock
    });
    return { u, ...ft, ...fr, setClock: v => { clock = v; }, setTask: v => { task = v; }, restarts: () => restarts };
  };
  let m = make();
  m.u.start();
  check('First check 10 s after start, then every 6 hours', m.has(FIRST_CHECK_MS) && m.has(CHECK_EVERY_MS, true) && m.runs.length === 0);
  check('Nothing known at first: stage none, the version of this copy',
    same(m.u.state(), { stage: 'none', current: '0.3.1', next: null, silent: true, percent: 0, transferred: 0, total: 0, bytesPerSecond: 0, failed: false }), m.u.state());
  m.fire(FIRST_CHECK_MS);
  check('The check asks the helper "check"', m.runs.length === 1 && same(m.runs[0].args, ['check']), m.runs.map(r => r.args));
  m.runs[0].say({ event: 'check', count: 0, version: '', silent: true }); m.runs[0].end(); await tick(); await tick();
  check('No update: nothing to say (stage none, no download)', m.u.state().stage === 'none' && m.runs.length === 1, m.u.state());
  const answer = m.u.checkNow();
  m.runs[1].say({ event: 'check', count: 1, version: '0.3.2.0', silent: true }); m.runs[1].end();
  check('An update: checkNow answers "update"', same(await answer, { kind: 'update' }));
  check('…a quiet one downloads by itself, never with a Windows box (--silent-only)',
    m.u.state().stage === 'downloading' && m.u.state().next === '0.3.2' && same(m.runs[2].args, ['download', '--silent-only']), { s: m.u.state(), args: m.runs[2] && m.runs[2].args });
  const dl = m.runs[2];
  dl.say({ event: 'progress', done: 0, total: 100 * 1048576, fraction: 0 });
  m.setClock(4000); dl.say({ event: 'progress', done: 40 * 1048576, total: 100 * 1048576, fraction: 0.4 });
  const p = m.u.state();
  check('Progress: percent, bytes and speed (40 MB in 4 s = 10 MB/s)',
    p.percent === 40 && p.transferred === 40 * 1048576 && p.total === 100 * 1048576 && Math.round(p.bytesPerSecond) === 10 * 1048576, p);
  check('The page is told on every change', sent.at(-1).percent === 40 && sent.some(s => s.stage === 'downloading' && s.percent === 0), sent.length);
  m.u.checkNow();
  check('No checks while downloading', m.runs.length === 3);
  dl.say({ event: 'done', state: 'completed' }); dl.end(); await tick();
  check('Download completed → ready, 100 %', m.u.state().stage === 'ready' && m.u.state().percent === 100, m.u.state());
  m.fireEvery(CHECK_EVERY_MS); await tick();
  check('No checks once it is ready', m.runs.length === 3 && same(await m.u.checkNow(), { kind: 'update' }));

  // ---- install
  m.setTask(true);
  check('Install is refused while the convert window is open', same(await m.u.install(), { ok: false, reason: 'task' }) && m.runs.length === 3 && m.restarts() === 0);
  m.setTask(false);
  let inst = m.u.install();
  check('Install asks Windows to reopen the app first, then runs "install" over the window',
    m.restarts() === 1 && same(m.runs[3].args, ['install', '--hwnd=4242']), m.runs[3] && m.runs[3].args);
  check('…a second press while it runs is the same install', m.u.install() === inst && m.runs.length === 4);
  m.runs[3].say({ event: 'start', package: 'x' }); m.runs[3].say({ event: 'done', state: 'cancelled' }); m.runs[3].end();
  check('No in Windows\' box → cancelled, still ready', same(await inst, { ok: false, reason: 'cancelled' }) && m.u.state().stage === 'ready');
  inst = m.u.install();
  m.runs[4].say({ event: 'error', code: '0x80070005' }); m.runs[4].end();
  check('An error → failed at once', same(await inst, { ok: false, reason: 'failed' }) && logs.some(l => /install: 0x80070005/.test(l)), logs);
  inst = m.u.install();
  m.runs[5].say({ event: 'start', package: 'x' }); m.runs[5].say({ event: 'done', state: 'completed' }); m.runs[5].end();
  let settled = false; inst.then(() => { settled = true; }); await tick(); await tick();
  check('Completed: waits for Windows to close the app', !settled && m.has(su.INSTALL_GRACE_MS));
  m.fire(su.INSTALL_GRACE_MS);
  check('…still running 60 s later → failed', same(await inst, { ok: false, reason: 'failed' }) && logs.some(l => /did not close/.test(l)));
  inst = m.u.install();
  m.runs[6].say({ event: 'start', package: 'x' }); m.runs[6].end(); await tick(); await tick();
  check('A helper ended by Windows with nothing said keeps waiting (20 s), as Windows may be closing everything',
    m.has(su.INSTALL_DIED_GRACE_MS));
  m.fire(su.INSTALL_DIED_GRACE_MS);
  check('…then failed', same(await inst, { ok: false, reason: 'failed' }));
  inst = m.u.install();
  m.runs[7].end();
  check('A helper that never started → failed at once', same(await inst, { ok: false, reason: 'failed' }));
  inst = m.u.install();
  m.runs[8].say({ event: 'start', package: 'x' }); m.fire(su.INSTALL_LIMIT_MS);
  check('An install still going after 5 minutes is called off → failed', m.runs[8].killed && same(await inst, { ok: false, reason: 'failed' }));
  m = make({ restartThrows: true });
  check('Install with nothing downloaded: none', same(await m.u.install(), { ok: false, reason: 'none' }));

  // ---- the asking path (no quiet downloads allowed), a failed download, a silent helper
  m = make();
  let a = m.u.checkNow();
  m.runs[0].say({ event: 'check', count: 1, version: '0.3.1.0', silent: false }); m.runs[0].end(); await a;
  check('Not allowed quietly → available, nothing downloads by itself, version unknown',
    m.u.state().stage === 'available' && m.u.state().silent === false && m.u.state().next === null && m.runs.length === 1, m.u.state());
  check('Download asks over the window', same(await m.u.download(), { ok: true }) && same(m.runs[1].args, ['download', '--hwnd=4242']), m.runs[1] && m.runs[1].args);
  m.runs[1].say({ event: 'done', state: 'cancelled' }); m.runs[1].end(); await tick();
  check('No in Windows\' download box → back to available', m.u.state().stage === 'available' && !m.u.state().failed, m.u.state());
  m.u.download();
  m.runs[2].say({ event: 'progress', done: 5, total: 10, fraction: 0.5 }); m.runs[2].end(); await tick();
  check('A download that stops with nothing said → none, failed (the badge goes away)', m.u.state().stage === 'none' && m.u.state().failed === true, m.u.state());
  check('Download only from available', same(await m.u.download(), { ok: false }));
  a = m.u.checkNow();
  check('The next check clears "failed"', m.u.state().failed === false);
  m.runs[3].end();
  check('A check with no answer → failed', same(await a, { kind: 'failed' }));
  a = m.u.checkNow();
  check('…two checks at once are one', m.u.checkNow() === a && m.runs.length === 5);
  m.fire(su.CHECK_TIMEOUT_MS);
  check('A helper that never answers is stopped after 60 s → failed', m.runs[4].killed && same(await a, { kind: 'failed' }));
  m.u.checkNow();
  m.runs[5].say({ event: 'check', count: 1, version: '', silent: true }); m.runs[5].end(); await tick(); await tick();
  const stall = m.runs[6];
  m.fire(su.DOWNLOAD_STALL_MS); await tick();
  check('A download with no news for 30 minutes is called off', stall.killed && m.u.state().stage === 'none' && m.u.state().failed, m.u.state());

  // ---- stop: the app closes
  m = make();
  m.u.start(); m.u.checkNow();
  m.u.stop();
  check('stop: the check is stopped and no more checks are planned', m.runs[0].killed && !m.has(FIRST_CHECK_MS) && !m.has(CHECK_EVERY_MS, true));
  m = make();
  m.u.checkNow(); m.runs[0].say({ event: 'check', count: 1, silent: true }); m.runs[0].end(); await tick(); await tick();
  const before = sent.length;
  m.u.stop(); await tick();
  check('…a download too, and nobody is told', m.runs[1].killed && sent.length === before);

  // ---- makeRun with a real program: lines split across writes, broken lines, an exit code; a program that isn't there
  const prog = path.join(t.ctx.tmp, 'helper.js');
  fs.writeFileSync(prog, `process.stdout.write('{"event":"start","pa'); setTimeout(() => { process.stdout.write('ckage":"p"}\\r\\nnot json\\n{"event":"done","state":"completed"}\\n'); process.exitCode = 1; }, 50);`);
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, got = [], runLogs = [];
  const real = su.makeRun({ command: process.execPath, prefix: [prog], env, log: l => runLogs.push(l) });
  await real(['check'], e => got.push(e)).done;
  check('makeRun: whole lines only, broken ones skipped, any exit code', same(got, [{ event: 'start', package: 'p' }, { event: 'done', state: 'completed' }]), got);
  const none = su.makeRun({ command: path.join(t.ctx.tmp, 'missing.exe'), log: l => runLogs.push(l) });
  const r = await Promise.race([none(['check'], () => {}).done.then(() => 'done'), new Promise(res => setTimeout(() => res('stuck'), 5000))]);
  check('…a helper that isn\'t there ends the run (and is logged)', r === 'done' && runLogs.some(l => /helper:/.test(l)), { r, runLogs });
});
