// A copy without the key (`pnpm start`, a local build) can't download the Publisher reader: opening a .pub says so in
// the app's own box, with OK, and the convert window says so as its problem line, without a question. Nothing is
// downloaded.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, ROOT } = require('./harness');
const { makeFakePack, startServer } = require('./reader-server');

const W = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-nokey-'));
const card = path.join(W, 'card.pub');
fs.copyFileSync(path.join(ROOT, 'samples', 'demo-card.pub'), card);
let server;

run(async (t, check) => {
  const { js, waitFor, sleep } = t;
  const { READER_TEXT } = require(path.join(ROOT, 'reader.js'));
  await t.ready();
  await js(`window.__bohpumApp.openFile(${JSON.stringify(card)}); 0`);
  await waitFor(`[...document.querySelectorAll('#modal-root .modal-h')].some(h => h.textContent === 'Bohpum needs the Publisher reader')`);
  const q = await js(`(() => { const b = document.querySelector('#modal-root .modal-h').closest('.modal');
    return { text: b.querySelector('.modal-b').textContent, buttons: [...b.querySelectorAll('.modal-f .btn')].map(x => x.textContent) }; })()`);
  check('No key: "Bohpum needs the Publisher reader", why this copy can\'t download it, OK', q.text === READER_TEXT['no-key'] && JSON.stringify(q.buttons) === '["OK"]', q);
  await t.key('Escape'); await sleep(300);
  check('OK closes it; nothing was downloaded and the publication on screen stays',
    await js(`!document.querySelector('#modal-root').children.length`) && server.hits() === 0 && await js('window.__bohpumApp.state.doc.name') === 'test-shapes',
    { hits: server.hits() });

  // ---- the convert window
  const list = path.join(os.tmpdir(), 'Bohpum', `menu-test-${process.pid}-nokey.txt`);
  fs.mkdirSync(path.dirname(list), { recursive: true }); fs.writeFileSync(list, card, 'utf8');
  app.emit('second-instance', {}, ['Bohpum.exe', '--bohpum-task=convert', '--bohpum-list=' + list], process.cwd());
  const taskWin = () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.getURL().endsWith('task.html'));
  const t0 = Date.now(); let st = null;
  while (Date.now() - t0 < 20000) {
    try { st = taskWin() && await taskWin().webContents.executeJavaScript(`({ done: document.body.dataset.done, asking: !document.getElementById('ask').hidden,
      lines: [...document.querySelectorAll('#lines li')].map(li => li.className + ': ' + li.textContent) })`); } catch {}
    if (st && st.done === '1') break; await sleep(150);
  }
  check("The convert window: no question, the problem line says why this copy can't download the reader",
    st && st.done === '1' && !st.asking && JSON.stringify(st.lines) === JSON.stringify(['problem: ' + READER_TEXT['no-key']]) && server.hits() === 0, st);
  if (taskWin()) taskWin().destroy();
  fs.rmSync(W, { recursive: true, force: true });
}, {
  setup: async () => {
    const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-nokey-env-'));
    process.env.LOCALAPPDATA = tmp(); process.env.ProgramFiles = tmp(); process.env['ProgramFiles(x86)'] = tmp();
    const { pack, zip } = await makeFakePack(tmp());
    server = await startServer({ zip, pack, key: { clientId: 'a', clientSecret: 'b' } });
    process.env.BOHPUM_READER_TEST = JSON.stringify({ base: server.base, pack });   // no key
  }
});
