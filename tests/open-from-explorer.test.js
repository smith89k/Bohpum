// Double-click / "Open with" in File Explorer: Windows starts Bohpum with the file's path (Bohpum closed), or
// hands the path to the running Bohpum (second-instance). Both open the publication. The installer's file-type
// settings: .bpum belongs to Bohpum with its own icon; .pub is not taken from Microsoft Publisher.
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, ROOT } = require('./harness');

const W = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-open-'));
const bpum = (name, w, h) => {
  const p = path.join(W, name + '.bpum');
  fs.writeFileSync(p, JSON.stringify({ format: 'bpum', version: 1, name, pageW: w, pageH: h, margins: { t: 3, r: 3, b: 3, l: 3 },
    guides: { v: [], h: [] }, master: { objects: [] }, pages: [{ id: 'p1', objects: [] }], print: null }));
  return p;
};
const first = bpum('ប័ណ្ណ ទី១', 90, 50), second = bpum('Second card', 85, 55);

run(async (t, check) => {
  const doc = () => t.js(`(() => { const S = window.__bohpumApp.state; return { name: S.doc.name, w: S.doc.pageW, path: S.path }; })()`);
  await t.waitFor(`window.__bohpumApp && window.__bohpumApp.state.path === ${JSON.stringify(first)}`, 15000).catch(() => {});
  await t.sleep(300);
  const d1 = await doc(), welcome = await t.js(`!!document.querySelector('.welcome-modal')`);
  check('Started with a .bpum path (Bohpum was closed): it opens, with no welcome screen over it',
    d1.path === first && d1.name === 'ប័ណ្ណ ទី១' && d1.w === 90 && !welcome, { d1, welcome });

  app.emit('second-instance', {}, ['Bohpum.exe', second], process.cwd());
  await t.waitFor(`window.__bohpumApp.state.path === ${JSON.stringify(second)}`, 15000).catch(() => {});
  const d2 = await doc();
  check('Bohpum already open: the double-clicked file opens in it', d2.path === second && d2.w === 85, d2);

  const pkg = require(path.join(ROOT, 'package.json')).build, nsh = fs.readFileSync(path.join(ROOT, 'build', 'installer.nsh'), 'utf8');
  const fa = pkg.fileAssociations;
  check('Installer: .bpum opens with Bohpum and has its own file icon', fa.length === 1 && fa[0].ext === 'bpum' && fa[0].role === 'Editor' &&
    fa[0].icon === 'build/bpum.ico' && fs.existsSync(path.join(ROOT, 'build', 'bpum.ico')), fa);
  check('Installer: .pub only gets Bohpum in "Open with" (Publisher stays the default), removed on uninstall',
    !fa.some(f => f.ext === 'pub') && /Software\\Classes\\\.pub\\OpenWithProgids" "Bohpum\.PubFile"/.test(nsh) &&
    !/WriteRegStr SHELL_CONTEXT "Software\\Classes\\\.pub" ""/.test(nsh) && /DeleteRegValue SHELL_CONTEXT "Software\\Classes\\\.pub\\OpenWithProgids" "Bohpum\.PubFile"/.test(nsh));
  // electron-builder copies the .bpum icon to resources\bpum.ico (the .bpum file type points there)
  check('Installer: a .pub opened with Bohpum shows the Bohpum file icon (as .bpum), not the app logo',
    /WriteRegStr SHELL_CONTEXT "Software\\Classes\\Bohpum\.PubFile\\DefaultIcon" "" "\$INSTDIR\\resources\\bpum\.ico"/.test(nsh)
      && !/Bohpum\.PubFile\\DefaultIcon" "" "\$appExe,0"/.test(nsh), (/Bohpum\.PubFile\\DefaultIcon.*$/m.exec(nsh) || [])[0]);

  fs.rmSync(W, { recursive: true, force: true });
}, { setup: () => { process.argv.push(first); } });
