// The editor and the Publisher reader: the first .pub asks in the app's own box (Download / Not now), Download shows
// the download in the reading box (a real bar, "<got> of <total> MB", Cancel) and then reads the file without asking
// again; the next .pub doesn't ask. A second file meanwhile only gets "Please wait". Problems stay in the box with
// Close and leave nothing behind. A newer reader is offered, and Not now reads with the one already here.
// LibreOffice is a stand-in (each run finishes at once); the private bucket is a local server that wants the key.
const { session } = require('electron');
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, ROOT } = require('./harness');
const { NAME, makeFakePack, startServer } = require('./reader-server');

const runs = [];
const realExecFile = cp.execFile;
cp.execFile = (file, args, opts, cb) => {
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  if (!/^soffice(\.exe)?$/i.test(path.basename(String(file)))) return realExecFile(file, args, opts, cb);
  const outdir = args[args.indexOf('--outdir') + 1];
  runs.push({ file: String(file) });
  setImmediate(() => { fs.copyFileSync(path.join(ROOT, 'samples', 'test-shapes.fodg'), path.join(outdir, 'input.fodg')); cb(null, '', ''); });
  return { pid: 0, kill: () => false };
};

const KEY = { clientId: 'editor-id', clientSecret: 'editor-secret' };
const W = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-reader-'));
const pub = (name) => { const p = path.join(W, name); fs.copyFileSync(path.join(ROOT, 'samples', 'card-original.pub'), p); return p; };
const card = pub('card.pub'), other = pub('other.pub');
let server, pack;

run(async (t, check) => {
  const { js, waitFor, sleep } = t;
  const { READER_TEXT } = require(path.join(ROOT, 'reader.js'));
  const root = path.join(process.env.LOCALAPPDATA, 'Bohpum', 'reader');
  const soffice = path.join(root, NAME, 'program', 'soffice.exe');
  const sent = [];
  session.defaultSession.webRequest.onBeforeSendHeaders((d, cb) => { sent.push({ url: d.url, headers: d.requestHeaders }); cb({ requestHeaders: d.requestHeaders }); });

  const open = (p) => js(`window.__bohpumApp.openFile(${JSON.stringify(p)}); 0`);   // not awaited: boxes come meanwhile
  const question = () => js(`(() => { const m = [...document.querySelectorAll('#modal-root .modal')].filter(b => b.querySelector('.modal-h'));
    if (!m.length) return null; const b = m.at(-1);
    return { title: b.querySelector('.modal-h').textContent, text: b.querySelector('.modal-b').textContent, count: m.length,
      buttons: [...b.querySelectorAll('.modal-f .btn')].map(x => x.textContent + (x.classList.contains('primary') ? '*' : '')) }; })()`);
  const press = (label) => js(`[...document.querySelectorAll('#modal-root .modal-f .btn')].find(b => b.textContent === ${JSON.stringify(label)}).click(); 0`);
  const box = () => js(`(() => { const b = document.querySelector('.modal.progress'); if (!b) return null;
    return { what: b.querySelector('.p-what').textContent, step: b.querySelector('.p-step').textContent, button: b.querySelector('.p-foot .btn').textContent,
      lines: [...b.querySelectorAll('.p-lines li')].map(li => li.textContent), determinate: b.classList.contains('determinate'),
      frac: +getComputedStyle(b).getPropertyValue('--frac') }; })()`);
  const doc = () => js('window.__bohpumApp.state.doc.name');
  const toastText = () => js(`document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : ''`);
  const noBox = () => js(`!document.querySelector('#modal-root').children.length`);
  const leftovers = () => (fs.existsSync(root) ? fs.readdirSync(root) : []).filter(n => /\.(download|partial)$/.test(n));
  const waitQuestion = (title) => waitFor(`[...document.querySelectorAll('#modal-root .modal-h')].some(h => h.textContent === ${JSON.stringify(title)})`);

  await t.ready();
  // ---- the question, then Not now
  await open(card); await waitQuestion('Bohpum needs the Publisher reader');
  const q1 = await question();
  check('The first .pub asks first: "Bohpum needs the Publisher reader", about 1 MB, Download (primary) / Not now; no reading box yet',
    q1 && q1.text === "It's a one-time download of about 1 MB. Bohpum's own files open without it." && JSON.stringify(q1.buttons) === '["Download*","Not now"]' && !(await box()), q1);
  await press('Not now'); await sleep(300);
  check('Not now: no box, the publication on screen stays, nothing downloaded', await noBox() && await doc() === 'test-shapes' && server.hits() === 0, { doc: await doc(), hits: server.hits() });

  // ---- Review Focus 5: a second file while the question is up
  await open(card); await waitQuestion('Bohpum needs the Publisher reader');
  await open(other); await sleep(300);
  check('Another .pub while the question is up: "Please wait", no second question', /^Please wait/.test(await toastText()) && (await question()).count === 1, { toast: await toastText(), q: await question() });

  // ---- Download
  server.setMode('slow');
  await press('Download');
  await waitFor(`/^Downloading the Publisher reader… \\d+ of 1 MB$/.test(document.querySelector('.modal.progress .p-step')?.textContent || '')`);
  const b1 = await box();
  check('Download: the reading box shows "Downloading the Publisher reader… <got> of 1 MB" with a real bar and Cancel',
    b1 && b1.what === 'Opening card.pub' && b1.determinate && b1.frac >= 0 && b1.frac <= 1 && b1.button === 'Cancel', b1);
  await open(other); await sleep(200);
  check('Another .pub during the download: "Please wait", no question', /^Please wait/.test(await toastText()) && !(await question()), { toast: await toastText(), q: await question() });
  await waitFor(`window.__bohpumApp.state.doc.name === 'card'`, 15000);
  check('…then it reads the file without asking again, with the downloaded reader',
    fs.existsSync(soffice) && runs.at(-1).file === soffice && await noBox(), { runs: runs.slice(-1), there: fs.existsSync(soffice) });
  check('One download, one server hit', server.hits() === 1, server.hits());
  const req = sent.find(s => s.url === server.base + `reader/${NAME}.zip`);
  const hdr = req ? Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), v])) : {};   // header names: any case
  check('Review Focus 1: the download goes through Electron\'s network with the key headers',
    hdr['cf-access-client-id'] === KEY.clientId && hdr['cf-access-client-secret'] === KEY.clientSecret, req);

  // ---- the next .pub doesn't ask
  const r0 = runs.length;
  await open(other); await waitFor(`window.__bohpumApp.state.doc.name === 'other'`);
  check('The next .pub opens without a question', runs.length === r0 + 1 && runs.at(-1).file === soffice && server.hits() === 1, { runs: runs.length - r0, hits: server.hits() });

  // ---- Cancel during the download
  fs.rmSync(path.join(root, NAME), { recursive: true, force: true });
  await open(card); await waitQuestion('Bohpum needs the Publisher reader'); await press('Download');
  await waitFor(`/^Downloading/.test(document.querySelector('.modal.progress .p-step')?.textContent || '')`);
  await t.click('.modal.progress .p-foot .btn');
  const t0 = Date.now(); while (leftovers().length && Date.now() - t0 < 4000) await sleep(100);
  check('Cancel during the download: the box closes, nothing half-done is left, the publication stays',
    await noBox() && !leftovers().length && !fs.existsSync(path.join(root, NAME)) && await doc() === 'other', { left: leftovers(), doc: await doc() });

  // ---- refused
  server.setMode('refuse');
  await open(card); await waitQuestion('Bohpum needs the Publisher reader'); await press('Download');
  await waitFor(`document.querySelector('.modal.progress .p-foot .btn')?.textContent === 'Close'`);
  const b2 = await box();
  check('A refused download: "Couldn\'t open card.pub", the reason, Close', b2.what === "Couldn't open card.pub" && b2.lines[0] === READER_TEXT.refused, b2);
  await t.click('.modal.progress .p-foot .btn');

  // ---- a newer reader
  server.setMode('ok');
  const old = path.join(root, 'LibreOffice-7.0.0-pack1', 'program');
  fs.mkdirSync(old, { recursive: true }); fs.writeFileSync(path.join(old, 'soffice.exe'), 'x');
  await open(card); await waitQuestion('A newer Publisher reader is ready');
  const q2 = await question();
  check('Only an older reader here: "A newer Publisher reader is ready", Download / Not now',
    q2.text === "It's a download of about 1 MB. Not now opens the file with the reader you have." && JSON.stringify(q2.buttons) === '["Download*","Not now"]', q2);
  await press('Not now');
  await waitFor(`window.__bohpumApp.state.doc.name === 'card'`);
  check('Not now reads the file with the older reader', runs.at(-1).file === path.join(old, 'soffice.exe'), runs.at(-1));
  const r1 = runs.length;
  await open(other); await waitFor(`window.__bohpumApp.state.doc.name === 'other'`);
  check('…and the next .pub doesn\'t ask again', runs.length === r1 + 1 && !(await question()), runs.length - r1);

  // ---- offline (last: closes the server)
  fs.rmSync(path.join(root, 'LibreOffice-7.0.0-pack1'), { recursive: true, force: true });
  await server.close();
  await open(card); await waitQuestion('Bohpum needs the Publisher reader'); await press('Download');
  await waitFor(`document.querySelector('.modal.progress .p-foot .btn')?.textContent === 'Close'`, 15000);
  const b3 = await box();
  check('No connection: the box says so in plain words, nothing left', b3.lines[0] === READER_TEXT.offline && !leftovers().length, { b3, left: leftovers() });
  await t.click('.modal.progress .p-foot .btn');
  fs.rmSync(W, { recursive: true, force: true });
}, {
  timeout: 150000,
  setup: async () => {
    const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-reader-env-'));
    process.env.LOCALAPPDATA = tmp(); process.env.ProgramFiles = tmp(); process.env['ProgramFiles(x86)'] = tmp();
    const made = await makeFakePack(tmp()); pack = made.pack;
    server = await startServer({ zip: made.zip, pack, key: KEY });
    process.env.BOHPUM_READER_TEST = JSON.stringify({ base: server.base, pack, key: KEY });
  }
});
