// Shared by the update panel tests (store-panel.test.js, store-panel-check.test.js): main.js as the Store copy
// (BOHPUM_STORE_TEST, as store-wiring.test.js) with tests/fake-store-helper.js standing in for the helper program, and
// ways to read the badge and the panel. firstCheckMs replaces the 10 s of the first quiet check (updater.js exports it;
// store-update.js reads it when main.js loads it, after this setup).
const { Menu } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT } = require('./harness');

const PACK = { name: 'LibreOffice-25.8.2-pack1', size: 1048576, sha256: '0'.repeat(64) };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-panel-'));

function storeCopy({ firstCheckMs, store }) {
  const RES = tmp(), FAKE = path.join(tmp(), 'store.json');
  const scenario = (o) => fs.writeFileSync(FAKE, JSON.stringify(o));
  scenario(store);
  const setup = () => {
    process.env.LOCALAPPDATA = tmp(); process.env.ProgramFiles = tmp(); process.env['ProgramFiles(x86)'] = tmp();
    process.env.BOHPUM_READER_TEST = JSON.stringify({ base: 'http://127.0.0.1:9/', pack: PACK });   // no developer copy
    const prog = path.join(RES, 'libreoffice', 'program'); fs.mkdirSync(prog, { recursive: true }); fs.writeFileSync(path.join(prog, 'soffice.exe'), 'x');
    process.env.BOHPUM_STORE_TEST = JSON.stringify({ resources: RES });
    process.env.BOHPUM_STORE_HELPER = path.join(__dirname, 'fake-store-helper.js');
    process.env.BOHPUM_FAKE_STORE = FAKE;
    require(path.join(ROOT, 'updater.js')).FIRST_CHECK_MS = firstCheckMs;
  };
  // the helper's runs so far, as their arguments; ranUntil waits (a run is noted once its program has started)
  const runs = () => { try { return fs.readFileSync(FAKE + '.log', 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; } };
  const ranUntil = async (fn, ms = 5000) => { const t0 = Date.now(); while (!fn(runs()) && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 100)); return runs(); };
  return { setup, scenario, runs, ranUntil };
}

function kit(t) {
  const { js, waitFor } = t;
  const panel = () => js(`(() => { const b = document.querySelector('#modal-root .update-panel'); if (!b) return null;
    const u = s => b.querySelector(s), prog = b.querySelectorAll('.u-prog span');
    return { stage: b.dataset.stage, title: u('.modal-h').textContent, spin: !!u('.u-spin'),
      from: u('.u-old .u-v') ? u('.u-old .u-v').textContent : null, to: u('.u-new') ? (u('.u-new .u-v') ? u('.u-new .u-v').textContent : '') : null,
      line: u('.u-line') ? u('.u-line').textContent : '', hint: u('.u-hint') ? u('.u-hint').textContent : '',
      said: prog[0] ? prog[0].textContent : null, left: prog[1] ? prog[1].textContent : null, fill: u('.u-bar i') ? u('.u-bar i').style.width : null,
      buttons: [...b.querySelectorAll('.modal-f .btn')].map(x => x.textContent + (x.classList.contains('primary') ? '*' : '')),
      focus: document.activeElement && document.activeElement.closest('.update-panel') ? document.activeElement.textContent : null,
      top: document.getElementById('modal-root').lastElementChild === b.parentElement }; })()`);
  const badge = () => js(`(() => { const b = document.getElementById('b-update'); return { hidden: b.hidden, text: b.textContent, ready: b.classList.contains('ready') }; })()`);
  const stage = (s, ms = 8000) => waitFor(`document.querySelector('#modal-root .update-panel')?.dataset.stage === ${JSON.stringify(s)}`, ms);
  const press = (act) => js(`document.querySelector('#modal-root .update-panel [data-act=${act}]').click(); 0`);
  // the app's other boxes (the unsaved question, the task message): the top one's title and buttons
  const question = () => js(`(() => { const m = [...document.querySelectorAll('#modal-root .modal')].filter(b => !b.classList.contains('update-panel'));
    if (!m.length) return null; const b = m.at(-1);
    return { title: b.querySelector('.modal-h').textContent, text: b.querySelector('.modal-b').textContent,
      buttons: [...b.querySelectorAll('.modal-f .btn')].map(x => x.textContent + (x.classList.contains('primary') ? '*' : '')) }; })()`);
  const answer = (label) => js(`[...document.querySelectorAll('#modal-root .modal:not(.update-panel) .modal-f .btn')].find(b => b.textContent === ${JSON.stringify(label)}).click(); 0`);
  const helpCheck = () => Menu.getApplicationMenu().items.find(i => i.label === 'Help').submenu.items.find(i => i.label === 'Check for Updates…').click();
  const noBox = () => js(`!document.querySelector('#modal-root').children.length`);
  return { panel, badge, stage, press, question, answer, helpCheck, noBox };
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const version = require(path.join(ROOT, 'package.json')).version;

module.exports = { storeCopy, kit, same, version };
