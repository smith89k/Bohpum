// Preview: the page, the thumbnails and the bar show one person at a time (photos too) without touching the design;
// editing shows the design; a value too long for its box shrinks (to 60 % at most); Remove List keeps what was shown.
const { dialog, Menu, nativeImage, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');
const { makeXlsx } = require('./make-xlsx');

let picks = [], saves = [];
const P1 = 'សុខ ដារា', P2 = 'ចាន់ មុនី', P3 = 'កែវ សុភា';

run(async (t, check) => {
  await t.ready(null);
  const dir = t.ctx.tmp, f = (n) => path.join(dir, n), J = JSON.stringify;
  const app = (code) => t.js(`(() => { const A = window.__bohpumApp, S = A.state; return ${code}; })()`);
  const preview = () => Menu.getApplicationMenu().items.find(i => i.label === 'Mailings').submenu.items.find(i => i.label === 'Preview Results');
  const solid = (w, h) => nativeImage.createFromBitmap(Buffer.alloc(w * h * 4, 200), { width: w, height: h });
  fs.writeFileSync(f('dara.png'), solid(40, 30).toPNG());
  fs.writeFileSync(f('mony.jpg'), solid(40, 30).toJPEG(90));
  makeXlsx(f('people.xlsx'), { sheets: [{ name: 'S', rows: [['Name', 'Photo'], [P1, f('dara.png')], [P2, '"' + f('mony.jpg') + '"'], [P3, '']] }] });

  // a card: a text box with «Name», a picture filled from the Photo column
  const ids = await t.js(`(async () => { const A = window.__bohpumApp, S = A.state, { makeObject } = await import('./model.js'), { fieldHtml } = await import('./merge.js');
    const b = makeObject('box', { x: 10, y: 10, w: 90, h: 20, html: '<p>' + fieldHtml('Name') + '</p>' });
    const i = makeObject('image', { x: 10, y: 40, w: 40, h: 30, mergePhoto: 'Photo' });
    S.doc.pages[0].objects.push(b, i); A.cmd('toggle-master'); A.cmd('toggle-master'); return { box: b.id, img: i.id }; })()`);
  picks = [f('people.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)');
  saves = [f('card.bpum')];
  await t.js('window.__bohpumApp.cmd("save-as")');
  await t.waitFor('!window.__bohpumApp.state.dirty');
  const design = await app('JSON.stringify(S.doc)');

  const stageText = () => t.js(`document.querySelector('#page-holder .kobj[data-id=${J(ids.box)}] .kt').textContent`);
  const stageImg = () => t.js(`(() => { const i = document.querySelector('#page-holder .kobj[data-id=${J(ids.img)}] img'); return i ? i.src : null; })()`);
  const bar = () => t.js('document.getElementById("mailbar").textContent');

  await app('(A.cmd("mail-preview"), 1)');
  await t.waitFor(`(document.querySelector('#page-holder .kobj[data-id=${J(ids.img)}] img') || {}).src?.startsWith('data:image/')`);
  const first = { text: await stageText(), img: (await stageImg() || '').slice(0, 11), bar: await bar() };
  await t.sleep(300);
  check('Preview shows the person: name, photo, menu ticked', first.text === P1 && first.img === 'data:image/' && first.bar.includes('Recipient 1 of 3') && first.bar.includes(P1) && preview().checked, first);
  await t.click('#mailbar .mb-next');
  const second = { text: await stageText(), bar: await bar() };
  check('▶ shows the second person', second.text === P2 && second.bar.includes('Recipient 2 of 3') && second.bar.includes(P2), second);
  await t.waitFor(`document.querySelector('#page-list .pthumb .kt').textContent === ${J(P2)}`).catch(() => {});
  const thumb = await t.js(`document.querySelector('#page-list .pthumb .kt').textContent`);
  check('thumbnails follow', thumb === P2, thumb);
  check('design is untouched and the publication not dirty', await app(`JSON.stringify(S.doc)`) === design && !(await app('S.dirty')) && design.includes('data-field=\\"merge\\"'));

  // editing shows the design
  const c = await t.center(`#page-holder .kobj[data-id="${ids.box}"]`);
  t.wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  t.wc.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  t.wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 2 });
  t.wc.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y, button: 'left', clickCount: 2 });
  await t.sleep(300);
  const editing = await t.js(`(() => { const k = document.querySelector('.kobj.editing .kt'); return k && { text: k.textContent, field: !!k.querySelector('[data-field="merge"]') }; })()`);
  check('editing with Preview on shows the design', editing && editing.text === '«Name»' && editing.field, editing);
  await app('(A.finishEditing(), 1)');
  const after = { text: await stageText(), html: await app(`S.doc.pages[0].objects[0].html`) };
  check('finish editing: the person again, the design keeps its field', after.text === P2 && after.html.includes('data-field="merge"'), after);

  // no photo
  await t.click('#mailbar .mb-next');
  const third = await t.js(`(() => { const el = document.querySelector('#page-holder .kobj[data-id=${J(ids.img)}]'); return { img: !!el.querySelector('img'), text: el.textContent, empty: !!el.querySelector('.kimg-empty'), next: document.querySelector('#mailbar .mb-next').disabled, bar: document.getElementById('mailbar').textContent }; })()`);
  check('no photo → empty frame', !third.img && third.text === '' && third.empty && (await stageText()) === P3, third);
  check('▶ is off at the last person', third.next && third.bar.includes('Recipient 3 of 3'), third);

  // shrink to fit (Khmer OS Siemreap lines are tall: at 14 pt even a short name needs more than a 40 × 8 mm box)
  const LONG = 'សុខសុភាពចាន់ដារាកែវមុនីរតនាវិសាលសម្បត្តិ'.repeat(3).slice(0, 60);
  const fit = (name, html, w = 40, h = 8) => t.js(`(async () => { const { makeObject } = await import('./model.js'), M = await import('./merge.js'), { renderObject, fixLineHeights } = await import('./render.js');
    const S = window.__bohpumApp.state, o = makeObject('box', { w: ${w}, h: ${h}, size: 14, html: ${J(html)} });
    const r = M.fillPage(S.doc, { objects: [o], hideMaster: true }, { columns: ['Name'], row: [${J(name)}], photos: new Map() }), b = r.page.objects[0];
    const host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-100000px;top:0'; host.append(renderObject(b)); document.body.append(host); fixLineHeights(host);
    const kt = host.querySelector('.kt'), px = 96 / 25.4, inner = (b.h - b.pad.t - b.pad.b) * px, span = host.querySelector('.kt span[style]');
    const out = { size: b.size, span: span && span.style.fontSize, fits: kt.scrollHeight <= inner + 0.5, sh: kt.scrollHeight, inner, problems: r.problems, MIN: M.MIN_SCALE };
    host.remove(); return out; })()`);
  const fieldHtml = (c) => `<span data-field="merge" data-col="${c}" contenteditable="false">«${c}»</span>`;
  const long = await fit(LONG, `<p><span style="font-size:14pt">${fieldHtml('Name')}</span></p>`, 60, 16);
  const k = long.size / 14;
  check('long Khmer name shrinks to fit', k >= 0.6 && k < 1 && long.span === Math.round(14 * k * 100) / 100 + 'pt' && long.fits && !long.problems.length && long.MIN === 0.6, long);
  const huge = await fit(LONG, `<p>${fieldHtml('Name')}</p>`);
  check('a name that cannot fit stops at 60 % and says so', Math.abs(huge.size - 14 * 0.6) < 0.01 && !huge.fits && J(huge.problems) === J(["the text doesn't fit its box"]), huge);
  const plain = await fit('', `<p>${LONG}</p>`);
  check('boxes without fields never shrink', plain.size === 14 && !plain.fits && !plain.problems.length, plain);

  // problems in plain words
  const probs = await t.js(`(async () => { const { makeObject } = await import('./model.js'), M = await import('./merge.js'), S = window.__bohpumApp.state;
    const img = (col) => makeObject('image', { w: 20, h: 20, mergePhoto: col });
    const b = makeObject('box', { w: 80, h: 20, html: '<p><span data-field="merge" data-col="Gone" contenteditable="false">«Gone»</span></p>' });
    const photos = new Map([['a', { missing: 'C:\\\\P\\\\a.jpg' }], ['', { empty: true }], ['c', { unreadable: 'C:\\\\P\\\\c.jpg' }]]);
    const one = (row, objects) => M.fillPage(S.doc, { objects, hideMaster: true }, { columns: ['Photo'], row, photos }).problems;
    return [one(['a'], [img('Photo')]), one([''], [img('Photo')]), one(['c'], [img('Photo')]), one(['a'], [img('Pic')]), one(['a'], [b])]; })()`);
  check('problems in plain words', J(probs) === J([['photo not found: C:\\P\\a.jpg'], ['no photo'], ["photo can't be read: C:\\P\\c.jpg"], ['no column «Pic» in the list'], ['no column «Gone» in the list']]), probs);

  // master objects come first; ticked people only
  const filled = await t.js(`(async () => { const M = await import('./merge.js');
    const doc = { master: { objects: [{ id: 'm', type: 'box', html: '' }] } }, p = { objects: [{ id: 'p', type: 'box', html: '' }] };
    const a = M.fillPage(doc, p, { columns: [], row: [], photos: new Map() }).page, b = M.fillPage(doc, { ...p, hideMaster: true }, { columns: [], row: [], photos: new Map() }).page;
    return { a: a.objects.map(o => o.id), ah: a.hideMaster, b: b.objects.map(o => o.id), t: M.ticked({ rows: [['x'], ['y'], ['z']] }, [M.rowKey(['y'])]) }; })()`);
  check('the master page is filled in front; ticked people only', J(filled) === J({ a: ['m', 'p'], ah: true, b: ['p'], t: [0, 2] }), filled);

  // Remove List at person 1 with Preview on
  await t.click('#mailbar .mb-prev'); await t.click('#mailbar .mb-prev');
  await t.waitFor(`(document.querySelector('#page-holder .kobj[data-id=${J(ids.img)}] img') || {}).src?.startsWith('data:image/')`);
  const hi = await app('S.hi');
  await app('(A.cmd("mail-remove"), 1)');
  await t.sleep(300);
  const gone = await app(`(() => { const [b, i] = S.doc.pages[0].objects; return { html: b.html, photo: i.mergePhoto, src: (i.src || '').slice(0, 11), merge: S.doc.merge, mail: S.mail, hi: S.hi, bar: document.getElementById('mailbar').hidden,
    stage: document.querySelector('#page-holder .kobj[data-id=${J(ids.box)}] .kt').textContent }; })()`);
  check('Remove List: the field is plain text, the photo a plain picture, the bar hides', !gone.html.includes('data-field') && gone.html.includes('«Name»') && gone.photo === undefined && gone.src === 'data:image/' &&
    gone.merge === undefined && gone.mail === null && gone.bar && gone.stage === '«Name»' && gone.hi === hi + 1, gone);
  await t.key('z', ['control']);
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)');
  const back = await app(`(() => { const [b, i] = S.doc.pages[0].objects; return { field: b.html.includes('data-field="merge"'), photo: i.mergePhoto, src: i.src, merge: !!S.doc.merge, bar: document.getElementById('mailbar').hidden }; })()`);
  check('one Ctrl+Z brings the list, the field and the photo field back', back.field && back.photo === 'Photo' && back.src === '' && back.merge && !back.bar, back);

  // Fit height measures the design, not the person (whose text is shrunk in a box too small for it)
  const tiny = await app(`(() => { const o = { ...S.doc.pages[0].objects[0], id: 'tiny', x: 110, y: 10, w: 90, h: 5 }; S.doc.pages[0].objects.push(o); A.cmd('toggle-master'); A.cmd('toggle-master'); return o.id; })()`);
  const fitH = async () => {
    await app(`(S.sel = new Set([${J(tiny)}]), A.selectionChanged(), 1)`);
    await t.js(`[...document.querySelectorAll('#props .btn')].find(b => b.textContent === 'Fit height to text').click()`);
    await t.sleep(200);
    const h = await app(`S.doc.pages[0].objects.find(o => o.id === ${J(tiny)}).h`);
    await app(`(S.doc.pages[0].objects.find(o => o.id === ${J(tiny)}).h = 5, A.cmd('toggle-master'), A.cmd('toggle-master'), 1)`);
    return h;
  };
  const hOff = await fitH();

  // photos main can't give: asked for once, never again (a failed call, then an answer without the cell)
  let calls = 0, mode = 'throw';
  ipcMain.removeHandler('mail-photos');
  ipcMain.handle('mail-photos', async () => { calls++; if (mode === 'throw') throw new Error('no photos today'); return {}; });
  await app('(A.cmd("mail-preview"), 1)');
  await t.sleep(1200);
  const frame = () => t.js(`!!document.querySelector('#page-holder .kobj[data-id=${J(ids.img)}] img')`);
  const failed = { calls, img: await frame() };
  check('a failed photo call is made once, the frame stays empty', failed.calls === 1 && !failed.img, failed);
  const hOn = { h: await fitH(), shown: await t.js(`document.querySelector('#page-holder .kobj[data-id="tiny"] .kt').style.fontSize`) };
  check('Fit height with Preview on measures the design', hOn.h === hOff && hOff > 5 && hOn.shown !== '12pt', { hOff, hOn });
  mode = 'empty';
  await t.click('#mailbar .mb-next');
  await t.sleep(1200);
  const unanswered = { calls, img: await frame() };
  check('a cell main does not answer is asked for once', unanswered.calls === 2 && !unanswered.img, unanswered);
}, {
  setup: () => {
    dialog.showOpenDialog = async () => { const p = picks.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] }; };
    dialog.showSaveDialog = async () => { const p = saves.shift(); return p ? { canceled: false, filePath: p } : { canceled: true }; };
  }
});
