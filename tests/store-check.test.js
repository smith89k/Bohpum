// scripts/store-check.js on made-up build folders (nothing is built here): a Store package passes only with the
// Publisher reader and the menu DLL inside, and with no update key (inside app.asar or next to it), no app-update.yml
// and no sparse menu package. Also run as the release job runs it.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

// Electron reads a path ending in .asar as an archive; here app.asar is a plain file (as for Node in the release job)
process.noAsar = true;

// an app.asar with these (empty) files: the 16-byte pickle head, then the JSON header (as Electron writes it)
function fakeAsar(file, names) {
  const files = {};
  for (const n of names) { let node = files; const parts = n.split('/'); for (const p of parts.slice(0, -1)) node = (node[p] = node[p] || { files: {} }).files; node[parts.at(-1)] = { size: 0, offset: '0' }; }
  const json = Buffer.from(JSON.stringify({ files }));
  const head = Buffer.alloc(16); head.writeUInt32LE(4, 0); head.writeUInt32LE(json.length + 8, 4); head.writeUInt32LE(json.length + 4, 8); head.writeUInt32LE(json.length, 12);
  fs.writeFileSync(file, Buffer.concat([head, json]));
}

run(async (t, check) => {
  const { asarFiles, storeProblems } = require(path.join(ROOT, 'scripts', 'store-check.js'));
  let k = 0;
  const MSIX = 'Bohpum-Store-9.9.9.msix';
  const make = ({ key = false, keyBeside = false, reader = true, dll = true, sparse = false, updateYml = false, msix = true } = {}) => {
    const dist = path.join(t.ctx.tmp, 'dist' + (++k)), res = path.join(dist, 'win-unpacked', 'resources');
    fs.mkdirSync(path.join(res, 'explorer-menu'), { recursive: true });
    fakeAsar(path.join(res, 'app.asar'), ['main.js', 'store.js', 'src/app.js', ...(key ? ['update-config.json'] : [])]);
    if (keyBeside) { fs.mkdirSync(path.join(res, 'app'), { recursive: true }); fs.writeFileSync(path.join(res, 'app', 'update-config.json'), '{}'); }
    if (reader) { fs.mkdirSync(path.join(res, 'libreoffice', 'program'), { recursive: true }); fs.writeFileSync(path.join(res, 'libreoffice', 'program', 'soffice.exe'), 'x'); }
    if (dll) fs.writeFileSync(path.join(res, 'explorer-menu', 'BohpumMenu.dll'), 'x');
    if (sparse) fs.writeFileSync(path.join(res, 'explorer-menu', 'Bohpum.ExplorerMenu.msix'), 'x');
    if (updateYml) fs.writeFileSync(path.join(res, 'app-update.yml'), 'url: x');
    if (msix) fs.writeFileSync(path.join(dist, MSIX), 'x');
    return dist;
  };

  const good = make();
  check('app.asar\'s file list is read from its header', JSON.stringify(asarFiles(path.join(good, 'win-unpacked', 'resources', 'app.asar'))) === '["main.js","store.js","src/app.js"]');
  check('A good Store package: no problems', storeProblems(good, MSIX).length === 0, storeProblems(good, MSIX));
  const cases = {
    'the update key in app.asar': make({ key: true }), 'the update key next to it': make({ keyBeside: true }), 'no reader': make({ reader: false }),
    'no menu DLL': make({ dll: false }), 'the sparse menu package': make({ sparse: true }), 'app-update.yml': make({ updateYml: true }), 'no .msix': make({ msix: false })
  };
  for (const [what, dist] of Object.entries(cases)) check(`A package with ${what} is refused`, storeProblems(dist, MSIX).length === 1, storeProblems(dist, MSIX));

  const cli = (dist) => spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'store-check.js'), dist, MSIX], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ASAR: '1' } });
  const ok = cli(good), bad = cli(cases['the update key in app.asar']);
  check('As the release runs it: 0 for a good package, 1 with an ::error:: line for a bad one',
    ok.status === 0 && /^store-check: /m.test(ok.stdout) && bad.status === 1 && /::error::.*update key/.test(bad.stderr), { ok, bad });
});
