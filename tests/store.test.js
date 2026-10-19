// store.js: the Microsoft Store copy's rules, with no Electron inside — which copy is the Store one, its Partner Center
// identity (store.json), the unsigned test identity, the Store page Check for Updates opens, and where the reader inside
// the package is.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ID = { identityName: 'SunnguonTaing.Bohpum', publisher: 'CN=12345678-90AB-CDEF-1234-567890ABCDEF', publisherDisplayName: 'Sunnguon Taing', storeId: '9NBOHPUM0000' };

run(async (t, check) => {
  const store = require(path.join(ROOT, 'store.js'));   // here, so a missing file is a FAIL line
  check('The Store copy: Windows says so (process.windowsStore), or a test says so',
    store.isStoreCopy({ windowsStore: true }) === true && store.isStoreCopy({ windowsStore: undefined, test: true }) === true
      && store.isStoreCopy({ windowsStore: undefined }) === false && store.isStoreCopy({ windowsStore: false, test: false }) === false);
  check('store.json: the four Partner Center values', same(store.parseStoreInfo(JSON.stringify(ID)), ID));
  const bad = [{ ...ID, identityName: 'x' }, { ...ID, publisher: 'Bohpum' }, { ...ID, publisherDisplayName: ' ' }, { ...ID, storeId: '9nbohpum0000' }, { ...ID, storeId: undefined }];
  check('…one missing or wrong value, or not JSON, is no identity',
    bad.every(b => store.parseStoreInfo(JSON.stringify(b)) === null) && store.parseStoreInfo('nope') === null, bad.map(b => store.parseStoreInfo(JSON.stringify(b))));
  check('A missing store.json is no identity', store.readStoreInfo(path.join(t.ctx.tmp, 'gone', 'store.json')) === null);
  const f = path.join(t.ctx.tmp, 'store.json'); fs.writeFileSync(f, JSON.stringify(ID));
  check('store.json is read from a file', same(store.readStoreInfo(f), ID));
  check('The unsigned test identity carries the OID Windows needs for -AllowUnsigned, and no Store ID',
    store.SIDELOAD.publisher === 'CN=Bohpum, OID.2.25.311729368913984317654407730594956997722=1' && store.SIDELOAD.storeId === null && Object.isFrozen(store.SIDELOAD), store.SIDELOAD);
  check('Check for Updates opens Bohpum\'s Store page…', store.storePageUrl(ID) === 'ms-windows-store://pdp/?ProductId=9NBOHPUM0000');
  check('…or, without a Store ID, the Store\'s Downloads and updates',
    store.storePageUrl(null) === 'ms-windows-store://downloadsandupdates' && store.storePageUrl(store.SIDELOAD) === 'ms-windows-store://downloadsandupdates');
  check('The reader inside the package: resources\\libreoffice\\program\\soffice.exe',
    store.bundledSoffice('C:\\R') === path.join('C:\\R', 'libreoffice', 'program', 'soffice.exe'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  check('The app carries store.js (main.js needs it in both copies)', pkg.build.files.includes('store.js'), pkg.build.files);
});
