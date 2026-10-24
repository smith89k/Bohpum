// Photo fields: cells made by "Copy as path" are found (quotes, Khmer folders, spaces, bare names), big photos are scaled to
// 1600 px, and Photo from List marks a picture with a column (one undo step).
const { dialog, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');
const { makeXlsx } = require('./make-xlsx');

let picks = [];

run(async (t, check) => {
  await t.ready(null);
  const dir = t.ctx.tmp, f = (...n) => path.join(dir, ...n), J = JSON.stringify;
  const app = (code) => t.js(`(() => { const A = window.__bohpumApp, S = A.state; return ${code}; })()`);
  const item = () => Menu.getApplicationMenu().items.find(i => i.label === 'Mailings').submenu.items.find(i => i.label === 'Picture Field…');
  const solid = (w, h) => { const b = Buffer.alloc(w * h * 4, 200); return nativeImage.createFromBitmap(b, { width: w, height: h }); };
  const khmer = f('រូបថត'), lst = f('list');
  fs.mkdirSync(khmer); fs.mkdirSync(lst);
  const sok = path.join(khmer, 'Sok Dara.png');
  fs.writeFileSync(sok, solid(40, 30).toPNG());
  fs.writeFileSync(path.join(lst, 'mony.jpg'), solid(40, 30).toJPEG(90));
  fs.writeFileSync(f('big.jpg'), solid(4000, 3000).toJPEG(80));
  fs.writeFileSync(f('small.png'), solid(300, 300).toPNG());

  const photos = (cells) => t.js(`window.api.mailPhotos(${J(cells)}, ${J(path.join(lst, 'people.xlsx'))})`);
  const cells = ['"' + sok + '"', '  ' + sok.split(path.sep).join('/') + ' ', 'mony.jpg', 'nobody.png', ''];
  const r = await photos(cells);
  check('photo paths: quotes, Khmer, spaces, bare name', cells.slice(0, 3).every(c => r[c] && /^data:image\//.test(r[c].url)), r);
  check('a missing photo says the path tried, an empty cell is empty', r['nobody.png'].missing === path.join(lst, 'nobody.png') && r[''].empty === true, r);

  const size = (url) => t.js(`new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = ${J(url)}; })`);
  const big = (await photos([f('big.jpg'), f('small.png')]));
  check('big photo is scaled to 1600 px', J(await size(big[f('big.jpg')].url)) === '[1600,1200]' && J(await size(big[f('small.png')].url)) === '[300,300]', big && Object.keys(big));
  // a smaller frame asks for fewer pixels; each size is its own copy in main's cache
  const at = async (px) => J(await size((await t.js(`window.api.mailPhotos(${J([f('big.jpg')])}, ${J(path.join(lst, 'people.xlsx'))}, ${px})`))[f('big.jpg')].url));
  const sizes = [await at(355), await at(1600), await at(355), await at(5000)];
  check('maxPx: 355 px, 1600 px, 355 px again, never above 1600', J(sizes) === J(['[355,266]', '[1600,1200]', '[355,266]', '[1600,1200]']), sizes);

  // cells named like Object's own keys are answered like any other
  const own = await t.js(`window.api.mailPhotos(['constructor', '__proto__', 'toString'], ${J(path.join(lst, 'people.xlsx'))}).then(r => ['constructor', '__proto__', 'toString'].map(c => Object.hasOwn(r, c) && r[c].missing))`);
  check('cells called constructor, __proto__, toString', J(own) === J(['constructor', '__proto__', 'toString'].map(c => path.join(lst, c))), own);

  // only pictures are opened; device paths are refused; corrupt files are unreadable
  fs.writeFileSync(f('secret.txt'), 'top secret'); fs.writeFileSync(f('win.ini'), '[fonts]'); fs.writeFileSync(f('bad.jpg'), require('crypto').randomBytes(500));
  const BS = String.fromCharCode(92), dev1 = BS + BS + '?' + BS, dev2 = BS + BS + '.' + BS;
  const odd = await photos([f('secret.txt'), f('win.ini'), dev1 + f('big.jpg'), dev2 + f('big.jpg'), f('bad.jpg')]);
  check('a .txt or .ini that exists is missing and never returned', odd[f('secret.txt')].missing === f('secret.txt') && odd[f('win.ini')].missing === f('win.ini') && !JSON.stringify(odd).includes(Buffer.from('top secret').toString('base64')), odd);
  check('device paths are refused', odd[dev1 + f('big.jpg')].missing && odd[dev2 + f('big.jpg')].missing, odd);
  check('a corrupt .jpg is unreadable, not missing', odd[f('bad.jpg')].unreadable === f('bad.jpg') && !odd[f('bad.jpg')].missing, odd[f('bad.jpg')]);

  // a phone jpeg (EXIF orientation 6) scaled down still displays upright: 1200 wide, 1600 tall
  const jpg = fs.readFileSync(f('big.jpg'));
  const exif = Buffer.from('ffe1002245786966000049492a0008000000010012010300010000000600000000000000', 'hex');
  fs.writeFileSync(f('phone.jpg'), Buffer.concat([jpg.subarray(0, 2), exif, jpg.subarray(2)]));
  const raw = await size('data:image/jpeg;base64,' + fs.readFileSync(f('phone.jpg')).toString('base64'));
  const ph = await photos([f('phone.jpg')]);
  const upright = await size(ph[f('phone.jpg')].url);
  check('an EXIF-rotated phone photo stays upright when scaled', J(raw) === '[3000,4000]' && J(upright) === '[1200,1600]', { raw, upright });

  // Photo from List
  makeXlsx(f('l.xlsx'), { sheets: [{ name: 'S', rows: [['Name', 'Photo'], ['Dara', 'a.jpg']] }] });
  picks = [f('l.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)');
  const addImg = (n) => app(`(async () => { const { makeObject } = await import('./model.js'); const o = makeObject('image', { x: 10 + ${n} * 60, y: 10, w: 50, h: 50 });
    S.doc.pages[0].objects.push(o); A.cmd('toggle-master'); A.cmd('toggle-master'); return o.id; })()`);
  const a = await addImg(0), b = await addImg(1);
  const pick = (...ids) => app(`(S.sel = new Set(${J(ids)}), A.selectionChanged(), 1)`);
  await pick(a);
  await t.sleep(400);
  check('Photo from List is enabled with one picture selected', item().enabled);
  const before = await app('S.hi');
  await t.js('(window.__bohpumApp.cmd("mail-photo"), 1)');
  await t.waitFor('!!document.querySelector("#modal-root select")');
  const pre = await t.js('document.querySelector("#modal-root select").selectedOptions[0].textContent');
  check('Photo from List preselects the Photo column', pre === 'Photo', pre);
  await t.js(`[...document.querySelectorAll('#modal-root .modal-f .btn')].find(b => b.textContent === 'OK').click()`);
  await t.waitFor(`window.__bohpumApp.state.doc.pages[0].objects.find(o => o.id === ${J(a)}).mergePhoto === 'Photo'`);
  check('one undo step', await app('S.hi') === before + 1, await app('S.hi'));
  await t.sleep(200);
  const panel = await t.js('document.getElementById("props") ? document.getElementById("props").textContent : document.body.textContent');
  check('the Picture panel says Photo from list: Photo', panel.includes('Picture field: Photo'));

  // greyed out
  await pick(a, b);
  await t.sleep(400);
  check('greyed out with two pictures', !item().enabled);
  await app('(A.cmd("tool-text"), 1)');
  const box = await app('(() => { const o = S.doc.pages[0].objects.find(o => o.type === "box"); return o && o.id; })()');
  await pick(box);
  await t.sleep(400);
  check('greyed out with a text box', !item().enabled);
}, {
  setup: () => {
    dialog.showOpenDialog = async () => { const p = picks.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] }; };
  }
});
