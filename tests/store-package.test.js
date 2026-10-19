// The Microsoft Store package's build files (scripts/store-config.js, build/store.config.js, build/store-manifest.xml,
// build/appx/): the installer's own config with no update key and no pack info inside, the Publisher reader and the menu
// DLL (not its sparse package), the appx target into dist-store; the manifest's file types and right-click menu (the
// installer menu's CLSID), and the pictures it names. Nothing is built here.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pngSize = (f) => { const b = fs.readFileSync(f); return b.toString('ascii', 12, 16) === 'IHDR' ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; };

run(async (t, check) => {
  const store = require(path.join(ROOT, 'store.js'));
  const { storeBuildConfig, NOT_IN_STORE } = require(path.join(ROOT, 'scripts', 'store-config.js'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const id = { identityName: 'Test.Bohpum', publisher: 'CN=TEST', publisherDisplayName: 'Test', storeId: '9TEST0000000' };
  const c = storeBuildConfig({ base: pkg.build, id, readerDir: 'dist-reader/LibreOffice', storeJson: true });

  check('No update key and no pack info in the Store package',
    same(NOT_IN_STORE, ['update-config.json', 'reader-pack.json']) && NOT_IN_STORE.every(f => !c.files.includes(f)), c.files);
  check('…everything else the installer carries, and store.json',
    pkg.build.files.filter(f => !NOT_IN_STORE.includes(f)).every(f => c.files.includes(f)) && c.files.includes('store.json'), c.files);
  check('A sideloaded test package has no store.json',
    !storeBuildConfig({ base: pkg.build, id: store.SIDELOAD, readerDir: 'x', storeJson: false }).files.includes('store.json'));
  check('The reader goes inside as resources/libreoffice; the menu DLL without its sparse package',
    same(c.extraResources, [{ from: 'explorer-menu/out', to: 'explorer-menu', filter: ['BohpumMenu.dll'] }, { from: 'dist-reader/LibreOffice', to: 'libreoffice' }]), c.extraResources);
  check('appx target into dist-store, with the app icon and no update address',
    c.win.target === 'appx' && c.win.icon === pkg.build.win.icon && c.directories.output === 'dist-store' && c.publish === null, { win: c.win, dirs: c.directories, publish: c.publish });
  check('The identity from Partner Center, and Bohpum\'s own Store settings',
    c.appx.identityName === id.identityName && c.appx.publisher === id.publisher && c.appx.publisherDisplayName === id.publisherDisplayName
      && c.appx.applicationId === 'Bohpum' && c.appx.displayName === 'Bohpum' && c.appx.minVersion === '10.0.19041.0'
      && c.appx.maxVersionTested === '10.0.26100.0' && c.appx.customManifestPath === 'build/store-manifest.xml'
      && c.appx.artifactName === 'Bohpum-Store-${version}.msix', c.appx);   // .msix: electron-builder's ext would say .appx (the same format)
  check('The installer\'s own config is untouched', pkg.build.win.target === 'nsis' && pkg.build.files.includes('update-config.json'), pkg.build.win);

  // build/store.config.js: what electron-builder loads
  process.env.BOHPUM_STORE_SIDELOAD = '1'; process.env.BOHPUM_STORE_READER = 'vendor/libreoffice';
  const side = require(path.join(ROOT, 'build', 'store.config.js'));
  check('build/store.config.js with BOHPUM_STORE_SIDELOAD=1: the unsigned test identity and the reader folder given',
    side.appx.publisher === store.SIDELOAD.publisher && side.extraResources[1].from === 'vendor/libreoffice' && !side.files.includes('store.json'), side.appx);
  const real = path.join(ROOT, 'store.json');
  if (fs.existsSync(real)) check('store.json holds a valid Partner Center identity', !!store.readStoreInfo(real), fs.readFileSync(real, 'utf8'));

  // ---- the manifest
  const xml = fs.readFileSync(path.join(ROOT, 'build', 'store-manifest.xml'), 'utf8');
  const clsid = require(path.join(ROOT, 'explorer-menu.js')).CLSID.replace(/[{}]/g, '');
  check('The manifest has the .bpum and .pub file types, with the Bohpum file picture',
    /<uap:FileType>\.bpum<\/uap:FileType>/.test(xml) && /<uap:FileType>\.pub<\/uap:FileType>/.test(xml)
      && (xml.match(/<uap:Logo>assets\\BpumFile\.png<\/uap:Logo>/g) || []).length === 2);
  check('…the right-click menu on .pub, with the installer menu\'s CLSID (the verb and the COM class)',
    /<desktop5:ItemType Type="\.pub">/.test(xml) && (xml.toLowerCase().match(new RegExp(clsid, 'g')) || []).length === 2);
  check('…the menu DLL from inside the package (Bohpum.exe two folders above it, as menu.cpp expects)',
    /<com:Class Id="[^"]+" Path="app\\resources\\explorer-menu\\BohpumMenu\.dll" ThreadingModel="STA" \/>/.test(xml));
  const macros = [...xml.matchAll(/\$\{([a-zA-Z0-9]+)\}/g)].map(m => m[1]);
  const known = ['identityName', 'arch', 'publisher', 'version', 'displayName', 'publisherDisplayName', 'description', 'logo', 'resourceLanguages',
    'minVersion', 'maxVersionTested', 'capabilities', 'applicationId', 'executable', 'backgroundColor', 'square150x150Logo', 'square44x44Logo'];
  check('…only electron-builder\'s own macros, and not its extensions (the file types are written here)',
    macros.every(m => known.includes(m)) && !macros.includes('extensions'), macros);
  check('…every namespace prefix it uses is declared', ['uap', 'desktop4', 'desktop5', 'com', 'rescap'].every(p => new RegExp(`xmlns:${p}="`).test(xml)));

  // ---- the pictures (build/appx, made by pnpm run icons)
  const A = (f) => path.join(ROOT, 'build', 'appx', f);
  const sizes = Object.fromEntries(['StoreLogo.png', 'Square44x44Logo.png', 'Square150x150Logo.png', 'BpumFile.png'].map(f => [f, fs.existsSync(A(f)) ? pngSize(A(f)) : null]));
  check('Store pictures: StoreLogo 50, Square44x44Logo 44, Square150x150Logo 150, BpumFile 256 high',
    same(sizes['StoreLogo.png'], [50, 50]) && same(sizes['Square44x44Logo.png'], [44, 44]) && same(sizes['Square150x150Logo.png'], [150, 150])
      && !!sizes['BpumFile.png'] && sizes['BpumFile.png'][1] === 256, sizes);

  check('pnpm run dist:store builds the Store package with build/store.config.js',
    /electron-builder --win appx --publish never --config build\/store\.config\.js/.test(pkg.scripts['dist:store'] || ''), pkg.scripts);
  const ignored = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split(/\r?\n/).map(s => s.trim());
  check('dist-store/ is never committed', ignored.includes('dist-store/'), ignored);
});
