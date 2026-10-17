// explorer-menu.js: reading a menu click (--bohpum-task / --bohpum-list and the list file) and the classic
// registration / saved state, written under HKCU\Software\BohpumTest only (removed at the end).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { run, ROOT } = require('./harness');
const menu = require(path.join(ROOT, 'explorer-menu.js'));

const TEST_KEY = 'HKCU\\Software\\BohpumTest';
const reg = (...a) => spawnSync('reg.exe', a, { encoding: 'utf8', windowsHide: true });

run(async (t, check) => {
  // ---- arguments
  const a = menu.parseTaskArgs(['Bohpum.exe', '--bohpum-task=convert', '--bohpum-list=C:\\x\\menu-1.txt']);
  check('Task arguments are read', a && a.task === 'convert' && a.list === 'C:\\x\\menu-1.txt', a);
  check('An unknown task or a missing list is ignored',
    menu.parseTaskArgs(['--bohpum-task=delete', '--bohpum-list=x']) === null && menu.parseTaskArgs(['--bohpum-task=convert']) === null);

  // ---- the list file
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-menu-'));
  const pubs = ['10 c.pub', '01 a.pub', '02 b.pub', 'ប្រកាស.pub'].map(n => path.join(dir, n));
  for (const p of pubs) fs.writeFileSync(p, 'x');
  fs.writeFileSync(path.join(dir, 'note.txt'), 'x');
  const lines = [...pubs, pubs[1].toUpperCase(), path.join(dir, 'gone.pub'), path.join(dir, 'note.txt'), 'relative.pub', ''];
  const list = path.join(dir, 'menu-1-2-0.txt');
  fs.writeFileSync(list, '\uFEFF' + lines.join('\r\n'), 'utf8');
  const got = menu.readTaskList(list, dir).map(p => path.basename(p));
  check('The list gives the existing .pub files once each, in name order (01, 02, 10), Khmer names kept',
    got.join('|') === '01 a.pub|02 b.pub|10 c.pub|ប្រកាស.pub', got);
  check('The list file is deleted after reading', !fs.existsSync(list));

  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-other-')), outside = path.join(other, 'menu-1-2-0.txt');
  fs.writeFileSync(outside, pubs[0]);
  const wrongName = path.join(dir, 'list.txt');
  fs.writeFileSync(wrongName, pubs[0]);
  check('Only menu-*.txt files in Bohpum\'s own temp folder are read (and only those are deleted)',
    menu.readTaskList(outside, dir).length === 0 && fs.existsSync(outside) && menu.readTaskList(wrongName, dir).length === 0 && fs.existsSync(wrongName));
  check('The real list folder is %TEMP%\\Bohpum', menu.LIST_DIR() === path.join(os.tmpdir(), 'Bohpum'));

  // ---- classic registration (test key)
  const classes = TEST_KEY + '\\Classes', dll = 'C:\\Program Files\\Bohpum\\resources\\explorer-menu\\BohpumMenu.dll';
  const ok = menu.registerClassic(dll, classes);
  const verb = reg('query', classes + '\\SystemFileAssociations\\.pub\\shell\\Bohpum').stdout || '';
  const inproc = reg('query', classes + '\\CLSID\\' + menu.CLSID + '\\InprocServer32').stdout || '';
  check('Classic registration: .pub files get the menu handler, the DLL and Player multi-select',
    ok && menu.classicRegistered(classes) && verb.includes(menu.CLSID) && /MultiSelectModel\s+REG_SZ\s+Player/.test(verb) &&
    inproc.includes(dll) && /ThreadingModel\s+REG_SZ\s+Apartment/.test(inproc), { verb, inproc });
  menu.unregisterClassic(classes);
  check('Unregistering removes it', !menu.classicRegistered(classes) && reg('query', classes + '\\CLSID\\' + menu.CLSID).status !== 0);

  // ---- saved state
  const stateKey = TEST_KEY + '\\State';
  menu.writeState({ mode: 'package', location: 'C:\\Program Files\\Bohpum', version: menu.PKG_VERSION, declined: '' }, stateKey);
  const st = menu.readState(stateKey);
  menu.clearState(stateKey);
  check('The saved state reads back, and clears', st.mode === 'package' && st.location === 'C:\\Program Files\\Bohpum' &&
    st.version === '1.0.0.0' && st.declined === '' && !Object.keys(menu.readState(stateKey)).length, st);

  check('Names match the package', menu.PKG === 'Bohpum.ExplorerMenu' && menu.CLSID === '{1e11f0a8-6fc0-4a9c-9031-6924b71a4d77}');

  reg('delete', TEST_KEY, '/f');
  for (const d of [dir, other]) fs.rmSync(d, { recursive: true, force: true });
});
