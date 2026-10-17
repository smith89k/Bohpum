// File windows start in the folder you last worked in, also after a restart: Open and Save As start in the folder
// of the last publication opened or saved; Insert picture remembers its own folder. A folder that is gone is skipped.
const { dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const asked = [];
let answer = null;

run(async (t, check) => {
  await t.ready(); // opens samples/test-shapes.fodg
  const samples = path.join(ROOT, 'samples');
  const last = () => asked[asked.length - 1];

  await t.js('window.__bohpumApp.cmd("open")'); await t.sleep(200);
  check('Open starts in the folder of the publication opened last', last().kind === 'open' && last().opts.defaultPath === samples, last());

  const out = path.join(t.ctx.tmp, 'card.bpum');
  answer = out; await t.js('window.__bohpumApp.cmd("save-as")'); await t.sleep(300);
  check('Save As starts there too, with the name filled in', last().kind === 'save' && last().opts.defaultPath === path.join(samples, 'test-shapes.bpum'), last());

  answer = null; await t.js('window.__bohpumApp.cmd("open")'); await t.sleep(200);
  check('After saving somewhere else, Open starts in that folder', last().opts.defaultPath === t.ctx.tmp, last());
  const saved = JSON.parse(fs.readFileSync(path.join(t.ctx.userData, 'settings.json'), 'utf8'));
  check('The folder is remembered for next time', saved.lastDir === t.ctx.tmp, saved);

  const pics = path.join(t.ctx.tmp, 'pictures'); fs.mkdirSync(pics);
  const png = path.join(pics, 'dot.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
  answer = [png]; await t.js('window.__bohpumApp.cmd("insert-image")'); await t.sleep(300);
  answer = null; await t.js('window.__bohpumApp.cmd("insert-image")'); await t.sleep(200);
  check('Insert picture remembers its own folder', last().kind === 'open' && last().opts.defaultPath === pics, last());
  await t.js('window.__bohpumApp.cmd("open")'); await t.sleep(200);
  check('…and Open keeps the publication folder', last().opts.defaultPath === t.ctx.tmp, last());

  fs.rmSync(t.ctx.tmp, { recursive: true, force: true });
  await t.js('window.__bohpumApp.cmd("open")'); await t.sleep(200);
  check('A folder that is gone is skipped (Windows chooses)', last().opts.defaultPath === undefined, last());
}, {
  setup: () => {
    dialog.showOpenDialog = async (_w, opts) => { asked.push({ kind: 'open', opts }); return answer ? { canceled: false, filePaths: answer } : { canceled: true, filePaths: [] }; };
    dialog.showSaveDialog = async (_w, opts) => { asked.push({ kind: 'save', opts }); return answer ? { canceled: false, filePath: answer } : { canceled: true }; };
  }
});
