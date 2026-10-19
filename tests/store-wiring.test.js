// main.js as the Microsoft Store copy (BOHPUM_STORE_TEST stands in for process.windowsStore and the package's resources
// folder): the Publisher reader inside the package is used and nothing is downloaded; Help › Check for Updates opens
// Bohpum's page in the Store (store.js storePageUrl) and leaves no box — the Store updates this copy.
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
  check('Check for Updates: the Store copy answers "store" and opens Bohpum in the Store',
    same(await t.js('api.checkUpdates()'), { kind: 'store' }) && same(opened, [want]), { opened, want });
  opened.length = 0;
  Menu.getApplicationMenu().items.find(i => i.label === 'Help').submenu.items.find(i => i.label === 'Check for Updates…').click();
  await t.sleep(800);
  check('Help › Check for Updates… opens the Store and leaves no box',
    same(opened, [want]) && await t.js(`!document.querySelector('#modal-root').children.length`), { opened, want });
}, {
  setup: () => {
    process.env.LOCALAPPDATA = tmp(); process.env.ProgramFiles = tmp(); process.env['ProgramFiles(x86)'] = tmp();
    process.env.BOHPUM_READER_TEST = JSON.stringify({ base: 'http://127.0.0.1:9/', pack: PACK });   // no developer copy
    const prog = path.join(RES, 'libreoffice', 'program'); fs.mkdirSync(prog, { recursive: true }); fs.writeFileSync(path.join(prog, 'soffice.exe'), 'x');
    process.env.BOHPUM_STORE_TEST = JSON.stringify({ resources: RES });
  }
});
