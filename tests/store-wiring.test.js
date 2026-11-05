// main.js as the Microsoft Store copy (BOHPUM_STORE_TEST stands in for process.windowsStore and the package's resources
// folder): the Publisher reader inside the package is used and nothing is downloaded; Help › Check for Updates opens the
// update panel (src/update-panel.js), and a helper that can't run ends in "Couldn't check" with Open in Store, never stuck.
// The panel's own stages: store-panel.test.js and store-panel-check.test.js.
const { shell, Menu } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, ROOT } = require('./harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-store-'));
const RES = tmp();
const PACK = { name: 'LibreOffice-25.8.2-pack1', size: 1048576, sha256: '0'.repeat(64) };

run(async (t, check) => {
  const store = require(path.join(ROOT, 'store.js'));
  await t.ready(null);   // the welcome screen and What's new closed; nothing opened (that would start LibreOffice)
  const bundled = store.bundledSoffice(RES);

  const st = await t.js('api.readerStatus()');
  check('The reader inside the package: nothing to download', st.need === null, st);
  fs.rmSync(path.join(RES, 'libreoffice'), { recursive: true, force: true });
  const gone = await t.js('api.readerStatus()');
  check('A package without its reader (never expected) can\'t download one either', gone.need === 'download' && gone.canDownload === false, gone);
  fs.mkdirSync(path.dirname(bundled), { recursive: true }); fs.writeFileSync(bundled, 'x');

  const opened = [];
  shell.openExternal = async (u) => { opened.push(u); };
  const want = store.storePageUrl(store.readStoreInfo(path.join(ROOT, 'store.json')));
  check(`The installer copy's Check for Updates isn't used here: it answers "dev" and opens nothing`,
    same(await t.js('api.checkUpdates()'), { kind: 'dev' }) && !opened.length, opened);
  const st0 = await t.js('api.storeUpdate("state")');
  check('The Store copy has an update state: nothing known yet, no badge', st0 && st0.stage === 'none' && await t.js(`document.getElementById('b-update').hidden`), st0);
  Menu.getApplicationMenu().items.find(i => i.label === 'Help').submenu.items.find(i => i.label === 'Check for Updates…').click();
  await t.waitFor(`document.querySelector('.update-panel')?.dataset.stage === 'failed'`, 15000);
  const box = await t.js(`(() => { const b = document.querySelector('.update-panel'); return { title: b.querySelector('.modal-h').textContent, text: b.querySelector('.modal-b').textContent,
    buttons: [...b.querySelectorAll('.modal-f .btn')].map(x => x.textContent + (x.classList.contains('primary') ? '*' : '')) }; })()`);
  check(`Help › Check for Updates… with no helper inside (never expected): "Couldn't check for updates", Open in Store · OK`,
    box.title === "Couldn't check for updates" && box.text === 'Check the internet connection and try again later.' && same(box.buttons, ['Open in Store', 'OK*']), box);
  await t.js(`document.querySelector('.update-panel [data-act=store]').click(); 0`); await t.sleep(300);
  check(`Open in Store opens Bohpum's page in the Store and closes the panel`,
    same(opened, [want]) && await t.js(`!document.querySelector('#modal-root').children.length`), { opened, want });
}, {
  setup: () => {
    process.env.LOCALAPPDATA = tmp(); process.env.ProgramFiles = tmp(); process.env['ProgramFiles(x86)'] = tmp();
    process.env.BOHPUM_READER_TEST = JSON.stringify({ base: 'http://127.0.0.1:9/', pack: PACK });   // no developer copy
    const prog = path.join(RES, 'libreoffice', 'program'); fs.mkdirSync(prog, { recursive: true }); fs.writeFileSync(path.join(prog, 'soffice.exe'), 'x');
    process.env.BOHPUM_STORE_TEST = JSON.stringify({ resources: RES });
  }
});
