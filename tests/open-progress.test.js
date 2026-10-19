// Opening a .pub in the editor: while LibreOffice reads it, a box like the Explorer menu's convert window covers the
// editor (the file, "Reading the Publisher file…", a moving bar, Cancel). It closes by itself when the publication is
// in; Cancel / Esc stop LibreOffice and leave the publication on screen as it was; a problem stays in it with Close;
// behind the convert window's files it says it is waiting. LibreOffice is a stand-in here that the test ends itself.
const { app, BrowserWindow } = require('electron');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, ROOT } = require('./harness');

// The stand-in: each soffice run waits until the test finishes it (writes a sample .fodg as LibreOffice's output) or
// fails it. taskkill, how Bohpum ends soffice.exe and the soffice.bin it starts, ends a run; no real taskkill runs here.
const runs = [];
const realExecFile = cp.execFile;
let nextPid = 900001;
cp.execFile = (file, args, opts, cb) => {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  const name = path.basename(String(file)).toLowerCase();
  if (name === 'taskkill' || name === 'taskkill.exe') {
    const r = runs.find(x => !x.done && x.pid === +args[args.indexOf('/pid') + 1]);
    if (r) { r.stoppedBy = args.join(' '); r.end(Object.assign(new Error('Command failed'), { code: 1 })); }
    setImmediate(() => cb && cb(r ? null : Object.assign(new Error('Command failed'), { code: 128 }), '', ''));
    return { pid: nextPid++, kill: () => false };
  }
  if (!/^soffice(\.exe)?$/.test(name)) return realExecFile(file, args, opts, cb);
  const r = { pid: nextPid++, input: args[args.length - 1], outdir: args[args.indexOf('--outdir') + 1], done: false, stoppedBy: null };
  r.end = (err) => { if (r.done) return; r.done = true; setImmediate(() => cb(err, '', '')); };
  r.finish = () => { fs.copyFileSync(path.join(ROOT, 'samples', 'test-shapes.fodg'), path.join(r.outdir, 'input.fodg')); r.end(null); };
  r.fail = () => r.end(Object.assign(new Error('Command failed'), { code: 1 }));
  runs.push(r);
  return { pid: r.pid, kill() { if (r.done) return false; r.stoppedBy = 'kill()'; r.end(Object.assign(new Error('Command failed'), { killed: true, signal: 'SIGTERM' })); return true; } };
};
const stoppedWhole = (r) => !!r.stoppedBy && (process.platform !== 'win32' || /\/pid \d+ \/t\b/i.test(r.stoppedBy));

const W = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-open-'));
const pub = (name, text) => { const p = path.join(W, name); if (text) fs.writeFileSync(p, text); else fs.copyFileSync(path.join(ROOT, 'samples', 'demo-card.pub'), p); return p; };
const card = pub('card.pub'), other = pub('other.pub'), broken = pub('broken.pub', 'this is not a Publisher file');
const conv = pub('conv.pub'), conv2 = pub('conv2.pub');
// a right-click "Convert to Bohpum" click, as BohpumMenu.dll hands it over (see convert-task.test.js)
const LIST_DIR = path.join(os.tmpdir(), 'Bohpum');
let n = 0;
function convertClick(paths) {
  fs.mkdirSync(LIST_DIR, { recursive: true });
  const f = path.join(LIST_DIR, `menu-test-${process.pid}-open-${++n}.txt`);
  fs.writeFileSync(f, paths.join('\r\n'), 'utf8');
  app.emit('second-instance', {}, ['Bohpum.exe', '--bohpum-task=convert', '--bohpum-list=' + f], process.cwd());
}

run(async (t, check) => {
  const { js, waitFor, sleep } = t;
  const waitRuns = async (k) => { const t0 = Date.now(); while (runs.length < k && Date.now() - t0 < 15000) await sleep(50); if (runs.length < k) throw new Error(`LibreOffice run ${k} never started`); };
  const open = (p) => js(`window.__bohpumApp.openFile(${JSON.stringify(p)}); 0`); // not awaited: the box is up meanwhile
  const box = () => js(`(() => { const b = document.querySelector('.modal.progress'); if (!b) return null;
    const q = (s) => b.querySelector(s), btn = q('.p-foot .btn');
    return { what: q('.p-what').textContent, step: q('.p-step').textContent, lines: [...b.querySelectorAll('.p-lines li')].map(li => li.textContent),
      button: btn.textContent, focused: document.activeElement === btn, overEditor: b.parentElement.matches('#modal-root > .modal-back'),
      moving: q('.p-fill').getAnimations().length > 0, boxes: document.querySelectorAll('.modal.progress').length }; })()`);
  const doc = () => js('({ name: window.__bohpumApp.state.doc.name, dirty: !!window.__bohpumApp.state.dirty })');
  const toastText = () => js(`document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : ''`);

  await t.ready();
  // ---- a Bohpum file opens at once: no box
  await js(`window.__sawBox = false; new MutationObserver(() => { if (document.querySelector('.modal.progress')) window.__sawBox = true; })
    .observe(document.getElementById('modal-root'), { childList: true, subtree: true }); 0`);
  await js(`window.__bohpumApp.openFile(${JSON.stringify(path.join(ROOT, 'samples', 'demo-card.bpum'))})`);
  check('A .bpum opens without the box', (await doc()).name === 'demo-card' && !(await js('window.__sawBox')), await doc());

  // ---- A: reading, then done
  await open(card); await waitRuns(1);
  await waitFor(`!!document.querySelector('.modal.progress')`);
  const a = await box();
  check('While LibreOffice reads card.pub, the box covers the editor: "Opening card.pub", "Reading the Publisher file…", Cancel',
    a && a.overEditor && a.what === 'Opening card.pub' && a.step === 'Reading the Publisher file…' && a.button === 'Cancel' && !a.lines.length, a);
  check('The bar moves while it reads', a && a.moving, a);
  check('The old "Reading card.pub …" note is gone', !/^Reading /.test(await toastText()), await toastText());
  runs[0].finish();
  await waitFor(`window.__bohpumApp.state.doc.name === 'card'`);
  check('When it is read the box closes by itself and the usual "Opened card …" note shows', !(await box()) && /^Opened card \(/.test(await toastText()), { box: await box(), toast: await toastText() });

  // ---- B: Cancel
  await open(other); await waitRuns(2); await waitFor(`!!document.querySelector('.modal.progress')`);
  await t.click('.modal.progress .p-foot .btn');
  await sleep(400);
  check('Cancel stops LibreOffice (soffice and the program it started)', stoppedWhole(runs[1]), runs[1].stoppedBy);
  check('Cancel closes the box; the publication on screen stays as it was', !(await box()) && (await doc()).name === 'card' && !(await doc()).dirty, { box: await box(), doc: await doc() });

  // ---- C: Esc = Cancel
  await open(other); await waitRuns(3); await waitFor(`!!document.querySelector('.modal.progress')`);
  await t.key('Escape');
  await sleep(400);
  check('Esc does the same as Cancel', stoppedWhole(runs[2]) && !(await box()) && (await doc()).name === 'card', { stopped: runs[2].stoppedBy, box: await box(), doc: await doc() });

  // ---- D: a problem stays in the box, with Close
  await open(broken); await waitRuns(4); await waitFor(`!!document.querySelector('.modal.progress')`);
  runs[3].fail();
  await waitFor(`document.querySelector('.modal.progress .p-foot .btn')?.textContent === 'Close'`);
  const d = await box();
  check('A file LibreOffice can\'t read: "Couldn\'t open broken.pub", the reason below, Close',
    d.what === 'Couldn\'t open broken.pub' && d.lines.length === 1 && d.lines[0] === 'The file may be damaged or in an unsupported version.' && d.focused && !d.moving, d);
  check('…and the publication on screen stays as it was', (await doc()).name === 'card', await doc());
  await t.click('.modal.progress .p-foot .btn');
  check('Close closes it', !(await box()), await box());

  // ---- E: another file while one is opening waits for it
  await open(other); await waitRuns(5); await waitFor(`!!document.querySelector('.modal.progress')`);
  await open(card); await sleep(400);
  const e = await box();
  check('Opening another file meanwhile says to wait; the first one carries on', runs.length === 5 && e.boxes === 1 && e.what === 'Opening other.pub' && /^Please wait/.test(await toastText()), { runs: runs.length, e, toast: await toastText() });
  runs[4].finish();
  await waitFor(`window.__bohpumApp.state.doc.name === 'other'`);

  // ---- F: behind the convert window's files
  convertClick([conv]); await waitRuns(6);
  await open(card); await waitFor(`!!document.querySelector('.modal.progress')`); await sleep(300);
  const f1 = await box();
  check('While the convert window is reading, the box says it is waiting (LibreOffice not started for it yet)',
    runs.length === 6 && f1.what === 'Opening card.pub' && f1.step === 'Waiting for the other files to finish…', { runs: runs.length, f1 });
  runs[5].finish(); await waitRuns(7);
  await waitFor(`document.querySelector('.modal.progress .p-step')?.textContent === 'Reading the Publisher file…'`).catch(() => {});
  check('…then on its turn it reads', (await box())?.step === 'Reading the Publisher file…', await box());
  runs[6].finish();
  await waitFor(`window.__bohpumApp.state.doc.name === 'card'`);
  check('…and opens', !(await box()), await box());

  // ---- G: Cancel while waiting: LibreOffice never runs for it
  convertClick([conv2]); await waitRuns(8);
  await open(other); await waitFor(`document.querySelector('.modal.progress .p-step')?.textContent === 'Waiting for the other files to finish…'`);
  await t.click('.modal.progress .p-foot .btn');
  runs[7].finish(); await sleep(1500);
  check('Cancel while waiting: the box closes and LibreOffice never reads that file', !(await box()) && runs.length === 8 && (await doc()).name === 'card', { box: await box(), runs: runs.length, doc: await doc() });

  for (const w of BrowserWindow.getAllWindows()) if (w !== t.win && !w.isDestroyed()) w.destroy();
  fs.rmSync(W, { recursive: true, force: true });
}, {
  timeout: 180000,
  // LibreOffice must look installed: an empty soffice.exe where Bohpum looks last (runs never reach it, see above)
  setup: () => {
    const la = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-lo-')), prog = path.join(la, 'Programs', 'LibreOffice', 'program');
    fs.mkdirSync(prog, { recursive: true }); fs.writeFileSync(path.join(prog, 'soffice.exe'), '');
    process.env.LOCALAPPDATA = la;
  }
});
