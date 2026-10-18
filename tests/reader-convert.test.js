// The right-click "Convert to Bohpum" window and the Publisher reader: one question per click, inside the small window
// (Download / Not now, as the editor's); Not now or Esc lists the click's files as not converted; Download shows the
// download in the window and converts; the next click doesn't ask; Cancel during the download leaves nothing behind.
// LibreOffice is a stand-in (each run finishes at once); the private bucket is a local server that wants the key.
const { app, BrowserWindow } = require('electron');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, ROOT } = require('./harness');
const { NAME, makeFakePack, startServer } = require('./reader-server');

const realExecFile = cp.execFile;
cp.execFile = (file, args, opts, cb) => {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  if (!/^soffice(\.exe)?$/i.test(path.basename(String(file)))) return realExecFile(file, args, opts, cb);
  const outdir = args[args.indexOf('--outdir') + 1];
  setImmediate(() => { fs.copyFileSync(path.join(ROOT, 'samples', 'test-shapes.fodg'), path.join(outdir, 'input.fodg')); cb(null, '', ''); });
  return { pid: 0, kill: () => false };
};

const KEY = { clientId: 'convert-id', clientSecret: 'convert-secret' };
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-rconv-'));
const LIST_DIR = path.join(os.tmpdir(), 'Bohpum');
let n = 0, server;
const pub = (name) => { const p = path.join(W, name); fs.copyFileSync(path.join(ROOT, 'samples', 'card-original.pub'), p); return p; };
function click(paths) {   // what BohpumMenu.dll hands over for a menu click
  fs.mkdirSync(LIST_DIR, { recursive: true });
  const f = path.join(LIST_DIR, `menu-test-${process.pid}-reader-${++n}.txt`);
  fs.writeFileSync(f, paths.join('\r\n'), 'utf8');
  app.emit('second-instance', {}, ['Bohpum.exe', '--bohpum-task=convert', '--bohpum-list=' + f], process.cwd());
}

run(async (t, check) => {
  const { sleep } = t;
  const root = path.join(process.env.LOCALAPPDATA, 'Bohpum', 'reader');
  const taskWin = () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.getURL().endsWith('task.html'));
  const jsT = (code) => taskWin().webContents.executeJavaScript(code, true);
  const waitT = async (code, ms = 20000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (taskWin() && await jsT(code)) return true; } catch {} await sleep(100); } throw new Error('timed out: ' + code); };
  const clickT = async (sel) => {
    const wc = taskWin().webContents, c = await jsT(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
    wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y });
    wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await sleep(200);
  };
  const escT = async () => { const wc = taskWin().webContents; wc.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); wc.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' }); await sleep(250); };
  const state = () => jsT(`({ done: +(document.body.dataset.done || 0), what: document.getElementById('what').textContent, step: document.getElementById('step').textContent,
    lines: [...document.querySelectorAll('#lines li')].map(li => li.className + ': ' + li.textContent), asking: !document.getElementById('ask').hidden,
    msg: document.getElementById('askMsg').textContent, detail: document.getElementById('askDetail').textContent,
    buttons: ['#bNo', '#bReplace', '#bKeep', '#bLater', '#bDownload', '#bCancel', '#bClose'].map(s => document.querySelector(s)).filter(b => b && !b.hidden).map(b => b.textContent + (b.classList.contains('primary') ? '*' : '')) })`);
  const closeT = async () => {
    const t0 = Date.now(); while (taskWin() && Date.now() - t0 < 5000) { try { await jsT('window.close(); 0'); } catch {} await sleep(150); }
    if (taskWin()) throw new Error('the convert window did not close');
  };
  const leftovers = () => (fs.existsSync(root) ? fs.readdirSync(root) : []).filter(x => /\.(download|partial)$/.test(x));
  const Q = 'Bohpum needs the Publisher reader';

  await t.waitFor('!!window.__bohpumApp');
  // ---- the question, Not now
  const card = pub('card.pub');
  click([card]); await waitT(`!document.getElementById('ask').hidden`);
  const a = await state();
  check('A click with no reader: the convert window asks "Bohpum needs the Publisher reader" with Download / Not now',
    a.msg === Q && a.detail === "It's a one-time download of about 1 MB. Bohpum's own files open without it." && JSON.stringify(a.buttons) === '["Not now","Download*"]', a);
  await clickT('#bLater'); await waitT(`document.body.dataset.done === '1'`);
  const b = await state();
  check('Not now: the file is listed as not converted, nothing saved', JSON.stringify(b.lines) === `["problem: Not converted: card.pub: ${Q}"]` && !fs.existsSync(path.join(W, 'card.bpum')), b);
  await closeT();
  // ---- Esc, two files
  const two = [pub('a.pub'), pub('b.pub')];
  click(two); await waitT(`!document.getElementById('ask').hidden`);
  await escT(); await waitT(`document.body.dataset.done === '1'`);
  const c = await state();
  check('Esc = Not now, once for the whole click: "Not converted: 2 files: …"', JSON.stringify(c.lines) === `["problem: Not converted: 2 files: ${Q}"]` && server.hits() === 0, c);
  await closeT();

  // ---- Download
  server.setMode('slow');
  click([card]); await waitT(`!document.getElementById('ask').hidden`);
  await clickT('#bDownload');
  await waitT(`/^\\d+ of 1 MB$/.test(document.getElementById('step').textContent)`);
  const d = await state();
  check('Download: the window shows the download ("<got> of 1 MB") with Cancel', d.what === 'Downloading the Publisher reader' && JSON.stringify(d.buttons) === '["Cancel"]', d);
  await waitT(`document.body.dataset.done === '1'`);
  check('…then card.bpum is written', fs.existsSync(path.join(W, 'card.bpum')) && fs.existsSync(path.join(root, NAME, 'program', 'soffice.exe')), fs.readdirSync(W));
  await closeT();
  const other = pub('other.pub');
  click([other]); await waitT(`document.body.dataset.done === '1'`);   // a question would wait for an answer
  check('The next click doesn\'t ask and converts', fs.existsSync(path.join(W, 'other.bpum')) && server.hits() === 1, { hits: server.hits() });
  await closeT();

  // ---- Cancel during the download
  fs.rmSync(path.join(root, NAME), { recursive: true, force: true });
  const late = pub('late.pub');
  click([late]); await waitT(`!document.getElementById('ask').hidden`);
  await clickT('#bDownload');
  await waitT(`/ of 1 MB$/.test(document.getElementById('step').textContent)`);
  await clickT('#bCancel'); await waitT(`document.body.dataset.done === '1'`);
  const t0 = Date.now(); while (leftovers().length && Date.now() - t0 < 4000) await sleep(100);
  const e = await state();
  check('Cancel during the download: "Cancelled", nothing half-done left, nothing saved',
    e.what === 'Cancelled' && !leftovers().length && !fs.existsSync(path.join(root, NAME)) && !fs.existsSync(path.join(W, 'late.bpum')), { e, left: leftovers() });
  await closeT();
  await server.close();
  fs.rmSync(W, { recursive: true, force: true });
}, {
  timeout: 150000,
  setup: async () => {
    const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-rconv-env-'));
    process.env.LOCALAPPDATA = tmp(); process.env.ProgramFiles = tmp(); process.env['ProgramFiles(x86)'] = tmp();
    const { pack, zip } = await makeFakePack(tmp());
    server = await startServer({ zip, pack, key: KEY });
    process.env.BOHPUM_READER_TEST = JSON.stringify({ base: server.base, pack, key: KEY });
  }
});
