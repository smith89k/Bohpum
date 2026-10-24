// Fields in text: Insert Field puts «Column» at the caret as one piece that keeps the formatting around it, survives copy,
// save and reopen (odd column names too), and is marked when the list has no such column.
const { dialog, Menu } = require('electron');
const path = require('path');
const { run } = require('./harness');
const { makeXlsx } = require('./make-xlsx');

let picks = [], saves = [];
const ODD = 'ឈ្មោះ "A" & <B>';

run(async (t, check) => {
  await t.ready(null);
  const dir = t.ctx.tmp, f = (n) => path.join(dir, n), J = JSON.stringify;
  const app = (code) => t.js(`(() => { const A = window.__bohpumApp, S = A.state; return ${code}; })()`);
  const menu = () => Menu.getApplicationMenu().items.find(i => i.label === 'Mailings').submenu.items.find(i => i.label === 'Insert Merge Field');
  const type = async (s) => { t.wc.insertText(s); await t.sleep(150); };
  const html = (id) => app(`S.doc.pages[0].objects.find(o => o.id === ${J(id)}).html`);
  const info = (id) => app(`(() => { const d = document.createElement('div'); d.innerHTML = S.doc.pages[0].objects.find(o => o.id === ${J(id)}).html;
    return { text: d.textContent, fields: [...d.querySelectorAll('span[data-field="merge"]')].map(s => ({ col: s.dataset.col, edit: s.contentEditable, inBold: !!s.closest('[style*="font-weight:700"],[style*="font-weight: 700"]'), size: s.closest('[style*="font-size"]') && s.closest('[style*="font-size"]').style.fontSize })) }; })()`);
  // a new text box in the top left corner, being edited
  let n = 0;
  const newBox = async () => {
    const id = await t.js(`(async () => { const A = window.__bohpumApp, S = A.state, { makeObject } = await import('./model.js');
      const o = makeObject('box', { x: 10 + ${n++ % 2} * 90, y: 10, w: 80, h: 30, shape: 'none', html: '<p><br></p>', pad: { t: 1, r: 1, b: 1, l: 1 } });
      S.doc.pages[0].objects.push(o); A.cmd('toggle-master'); A.cmd('toggle-master'); A.startEditing(o.id); return o.id; })()`);
    await t.sleep(400);
    await t.waitFor('!!window.__bohpumApp.state.editing');
    return id;
  };
  const choose = async (file) => {
    picks = [file];
    await t.js('(window.__oldMail = window.__bohpumApp.state.mail, window.__bohpumApp.cmd("mail-select"), 1)'); // the same file again: wait for it to be read
    await t.waitFor(`!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail !== window.__oldMail && window.__bohpumApp.state.mail.list && window.__bohpumApp.state.doc.merge.list === ${J(file)})`);
  };
  makeXlsx(f('l.xlsx'), { sheets: [{ name: 'S', rows: [['Name', ODD], ['Dara', 'x']] }] });
  makeXlsx(f('o.xlsx'), { sheets: [{ name: 'S', rows: [['Other'], ['x']] }] });
  await choose(f('l.xlsx'));

  const id = await newBox();
  check('Insert Field greyed out with a picture selected, live while editing', menu().enabled && menu().submenu.items[0].enabled);
  await type('Dear ');
  await app('(A.cmd("mail-field-0"), 1)');
  await t.sleep(200);
  await type('!');
  await app('(A.finishEditing(), 1)');
  const a = await info(id);
  check('Insert Field puts «Name» at the caret', a.text === 'Dear «Name»!' && a.fields.length === 1 && a.fields[0].col === 'Name' && a.fields[0].edit === 'false', a);

  // one piece
  await app(`(A.startEditing(${J(id)}), 1)`);
  await t.sleep(200);
  await app(`(() => { const kt = document.querySelector('.kobj.editing .kt'), s = kt.querySelector('[data-field]'), r = document.createRange(); r.setStartAfter(s); r.collapse(true); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); return 1; })()`);
  await t.key('Backspace');
  const gone = await app(`document.querySelector('.kobj.editing .kt').textContent`);
  check('field is one piece: one Backspace removes it all', gone === 'Dear !', gone);
  await t.key('z', ['control']);
  const back = await app(`document.querySelector('.kobj.editing .kt').textContent`);
  check('Ctrl+Z brings the field back', back === 'Dear «Name»!', back);
  await app('(A.finishEditing(), 1)');

  // formatting at the caret
  const id2 = await newBox();
  await t.click('#tb-b');
  await t.click('#tb-size');
  await t.key('a', ['control']);
  await type('20');
  await t.key('Enter');
  await app('(A.cmd("mail-field-0"), 1)');
  await t.sleep(200);
  await app('(A.finishEditing(), 1)');
  const b = await info(id2);
  check('the field takes the formatting at the caret', b.fields.length === 1 && b.fields[0].inBold && b.fields[0].size === '20pt', { b, h: await html(id2) });

  // copy and paste
  await app(`(A.startEditing(${J(id)}), 1)`);
  await t.sleep(200);
  await t.key('a', ['control']);
  await t.key('c', ['control']);
  await app('(A.finishEditing(), 1)');
  const before = await app('S.doc.pages[0].objects.length');
  await t.key('v', ['control']);
  await t.sleep(500);
  const after = await app(`(() => { const os = S.doc.pages[0].objects; return { n: os.length, last: os[os.length - 1].html }; })()`);
  check('field survives copy and paste', after.n === before + 1 && /<span data-field="merge" data-col="Name"[^>]*>«Name»<[/]span>/.test(after.last), { before, after });

  // pasted into a box being edited
  const id4 = await newBox();
  await t.key('v', ['control']);
  await t.sleep(300);
  await app('(A.finishEditing(), 1)');
  const p = await info(id4);
  check('field survives paste into a box being edited', p.fields.length === 1 && p.fields[0].col === 'Name' && p.text.includes('Dear'), p);

  // odd column name: save and reopen
  await choose(f('l.xlsx'));
  const id3 = await newBox();
  // Windows menus take & as the next letter's underline: && shows one &
  check('Insert Field menu shows the odd column, its & doubled', menu().submenu.items[1].label === 'ឈ្មោះ "A" && <B>', menu().submenu.items.map(i => i.label));
  await app('(A.cmd("mail-field-1"), 1)');
  await t.sleep(200);
  await app('(A.finishEditing(), 1)');
  const file = f('odd.bpum'); saves = [file];
  await t.js('window.__bohpumApp.cmd("save-as")');
  await t.waitFor('!window.__bohpumApp.state.dirty');
  await t.js(`window.__bohpumApp.openFile(${J(file)})`);
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)');
  const col = await app(`(() => { const s = [...document.querySelectorAll('#page-holder .kpage [data-field="merge"]')].find(s => s.dataset.col === ${J(ODD)}); return s ? s.dataset.col : null; })()`);
  check('odd column name survives save and reopen', col === ODD, col);
  check('a field with its column is not marked', await app(`!document.querySelector('#page-holder .kpage [data-field="merge"][data-missing]')`));

  // missing column
  await choose(f('o.xlsx'));
  const miss = await app(`[...document.querySelectorAll('#page-holder .kpage [data-field="merge"]')].map(s => s.hasAttribute('data-missing'))`);
  const lbl = await app(`(() => { const s = document.querySelector('.kpage [data-field="merge"][data-missing]'); return s && getComputedStyle(s, '::after').content; })()`);
  check('missing column is marked', miss.length >= 3 && miss.every(Boolean) && lbl === '" ?"', { miss, lbl });
  check('marked field is not saved with the mark', !(await app(`JSON.stringify(S.doc).includes('data-missing')`)));
}, {
  setup: () => {
    dialog.showOpenDialog = async () => { const p = picks.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] }; };
    dialog.showSaveDialog = async () => { const p = saves.shift(); return p ? { canceled: false, filePath: p } : { canceled: true }; };
  }
});
