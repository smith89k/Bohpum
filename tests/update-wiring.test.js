// main.js wiring for updates and the Publisher reader, in a copy without the key (as `pnpm start`): Help › Check for
// Updates… is in the menu; the page can ask whether a reader is needed and is told in plain words why this copy can't
// download it; an installed LibreOffice needs no download. And the packaging: electron-updater, the locked update
// address, the installer name, LibreOffice no longer inside the installer, the key and pack files never committed, and
// a full uninstall removes the downloaded reader.
const { Menu } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, ROOT } = require('./harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-wiring-'));
const PACK = { name: 'LibreOffice-25.8.2-pack1', size: 1048576, sha256: '0'.repeat(64) };

run(async (t, check) => {
  const { READER_TEXT } = require(path.join(ROOT, 'reader.js'));
  await t.waitFor('!!window.__bohpumApp');

  const help = Menu.getApplicationMenu().items.find(i => i.label === 'Help').submenu.items.map(i => i.label);
  const at = help.indexOf('Check for Updates…');
  check('Help has Check for Updates… right above What\'s New', at >= 0 && help[at + 1] === "What's New", help);

  const status = await t.js('api.readerStatus()');
  check('No reader and no key: a download is needed, and the page is told why this copy can\'t',
    same(status, { need: 'download', size: 1048576, canDownload: false, why: READER_TEXT['no-key'] }), status);
  check('Asking for the reader in a copy without the key says why', same(await t.js('api.getReader()'), { error: READER_TEXT['no-key'] }));
  check('Check for Updates in a copy that doesn\'t update itself', same(await t.js('api.checkUpdates()'), { kind: 'dev' }));
  const pub = path.join(ROOT, 'samples', 'demo-card.pub');
  check('Reading a .pub without a reader asks for one first (LibreOffice isn\'t started)',
    same(await t.js(`api.readDocument(${JSON.stringify(pub)})`), { needReader: 'download' }));

  const prog = path.join(process.env.LOCALAPPDATA, 'Programs', 'LibreOffice', 'program');
  fs.mkdirSync(prog, { recursive: true }); fs.writeFileSync(path.join(prog, 'soffice.exe'), '');
  const st2 = await t.js('api.readerStatus()');
  check('A LibreOffice installed on the PC needs no download', st2.need === null, st2);

  // ---- packaging
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')), b = pkg.build;
  check('electron-updater 6.8.9 is the runtime dependency', (pkg.dependencies || {})['electron-updater'] === '6.8.9', pkg.dependencies);
  check('Updates come from the locked address', same(b.publish, { provider: 'generic', url: 'https://bohpum-update.smith89k.com/' }), b.publish);
  check('The installer is named Bohpum-Setup-<version>.exe', b.nsis.artifactName === 'Bohpum-Setup-${version}.${ext}', b.nsis.artifactName);
  check('The app carries updater.js, reader.js, the key and the pack info',
    ['updater.js', 'reader.js', 'update-config.json', 'reader-pack.json'].every(f => b.files.includes(f)), b.files);
  check('LibreOffice is no longer inside the installer', !(b.extraResources || []).some(r => /vendor[\\/]libreoffice/.test(r.from || r)), b.extraResources);
  check('pnpm run dist no longer bundles LibreOffice', !/bundle-libreoffice/.test(pkg.scripts.dist), pkg.scripts.dist);
  const ignored = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map(s => s.trim());
  check('The key, the pack info and the pack build folder are never committed',
    ['update-config.json', 'reader-pack.json', 'dist-reader/'].every(f => ignored.includes(f)), ignored);
  const nsh = fs.readFileSync(path.join(ROOT, 'build', 'installer.nsh'), 'utf8');
  const un = /!macro customUnInstall([\s\S]*?)!macroend/.exec(nsh), notUpdate = un && /\$\{else\}([\s\S]*?)\$\{endif\}/.exec(un[1]);
  check('A full uninstall (not an update) removes %LOCALAPPDATA%\\Bohpum\\reader',
    !!notUpdate && /ExpandEnvStrings\s+\$0\s+"%LOCALAPPDATA%"/.test(notUpdate[1]) && /RMDir \/r "\$0\\Bohpum\\reader"/.test(notUpdate[1]), notUpdate && notUpdate[1]);
}, {
  setup: () => {
    process.env.LOCALAPPDATA = tmp(); process.env.ProgramFiles = tmp(); process.env['ProgramFiles(x86)'] = tmp();
    process.env.BOHPUM_READER_TEST = JSON.stringify({ base: 'http://127.0.0.1:9/', pack: PACK });
  }
});
