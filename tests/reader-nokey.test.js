// A copy without the key (`pnpm start`, a local build) can't download the Publisher reader: opening a .pub says so in
// the app's own box, with OK, and nothing is downloaded.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, ROOT } = require('./harness');
const { makeFakePack, startServer } = require('./reader-server');

const W = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-nokey-'));
const card = path.join(W, 'card.pub');
fs.copyFileSync(path.join(ROOT, 'samples', 'card-original.pub'), card);
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
