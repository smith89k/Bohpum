// Mailings menu: only Select List… is live without a list; choosing a list (and a sheet) is kept with the publication,
// read again when it is opened, and followed by undo; a missing or empty list is said in plain words.
const { dialog, Menu, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');
const { makeXlsx } = require('./make-xlsx');

let picks = [], saves = [], readDelay = 0;

run(async (t, check) => {
  await t.ready();
  ipcMain.removeHandler('read-list');
  ipcMain.handle('read-list', async (_e, p) => { // as main.js, but a test can make it slow
    if (readDelay) await new Promise(r => setTimeout(r, readDelay));
    return { ...(await require('../list.js').readList(p)), locale: 'en-GB' };
  });
  const dir = t.ctx.tmp, f = (n) => path.join(dir, n), J = JSON.stringify;
  const app = (code) => t.js(`(() => { const A = window.__bohpumApp, S = A.state; return ${code}; })()`);
  const modalText = () => t.js('document.getElementById("modal-root").textContent');
  const mailings = () => Menu.getApplicationMenu().items.find(i => i.label === 'Mailings');
  const press = (label) => t.js(`[...document.querySelectorAll('#modal-root .modal-f .btn')].find(b => b.textContent === ${J(label)}).click()`);
  const barText = () => t.js('document.getElementById("mailbar").textContent');
  const barHidden = () => t.js('document.getElementById("mailbar").hidden');
  const live = () => mailings().submenu.items.filter(i => i.enabled && i.type !== 'separator').map(i => i.label);

  makeXlsx(f('two.xlsx'), { sheets: [{ name: 'People', rows: [['Name', 'Title'], ['Dara', 'Director']] }, { name: 'Staff', rows: [['Who', 'Role', 'Photo'], ['Mony', 'Clerk', 'm.jpg'], ['Sok', 'Guard', 's.jpg']] }] });
  makeXlsx(f('a.xlsx'), { sheets: [{ name: 'S', rows: [['Name'], ['A1']] }] });
  makeXlsx(f('b.xlsx'), { sheets: [{ name: 'S', rows: [['Other'], ['B1'], ['B2']] }] });
  makeXlsx(f('empty.xlsx'), { sheets: [{ name: 'S', rows: [['Name']] }] });

  const menus = await t.js('[...document.querySelectorAll("#menus [data-menu]")].map(m => m.textContent.trim()).join(" ")');
  check('seven menus', menus === 'File Edit Insert Arrange Mailings View Help', menus);

  const all = mailings().submenu.items.filter(i => i.type !== 'separator').map(i => i.label);
  check('menu greyed out without a list', J(live()) === J(['Select List…']) && J(all) === J(['Select List…', 'Choose People…', 'Insert Field', 'Photo from List…', 'Preview', 'Remove List']), { live: live(), all });
  check('a publication without a list has no bar and no merge', await barHidden() && await app('S.doc.merge === undefined && S.mail === null'));

  // Select List with two sheets
  picks = [f('two.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('!!document.querySelector("#modal-root select")');
  const names = await t.js('[...document.querySelectorAll("#modal-root select option")].map(o => o.textContent)');
  check('Select List with two sheets asks which', J(names) === J(['People', 'Staff']), names);
  await t.js('(() => { const s = document.querySelector("#modal-root select"); s.value = "Staff"; s.dispatchEvent(new Event("change")); })()');
  await press('OK');
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)');
  const st = await app('({ merge: S.doc.merge, cols: S.mail.list.columns, dirty: S.dirty })');
  check('chosen sheet is kept', st.merge.list === f('two.xlsx') && st.merge.sheet === 'Staff' && J(st.merge.off) === '[]' && J(st.cols) === J(['Who', 'Role', 'Photo']), st);
  const bar = await t.js('document.querySelector("#mailbar .mb-list").textContent');
  check('bar shows the list and the publication is dirty', !(await barHidden()) && bar === 'Mailing list: two.xlsx · Staff' && st.dirty, { bar, st });
  check('menu is live with a list', J(live()) === J(['Select List…', 'Choose People…', 'Preview', 'Remove List']), live());

  const fieldItems = () => mailings().submenu.items.find(i => i.label === 'Insert Field').submenu.items;
  check('Insert Field lists the columns, greyed unless editing text', J(fieldItems().map(i => i.label)) === J(['Who', 'Role', 'Photo']) && fieldItems().every(i => !i.enabled), fieldItems().map(i => i.label));
  await app('(A.cmd("tool-text"), 1)');
  const box = await app('(() => { const o = S.doc.pages[0].objects.find(o => o.type === "box"); return o && o.id; })()');
  await app(`(A.startEditing(${J(box)}), 1)`);
  await t.sleep(300);
  check('Insert Field is live while editing text', mailings().submenu.items.find(i => i.label === 'Insert Field').enabled && fieldItems().every(i => i.enabled) && fieldItems().length === 3);
  await app('(A.finishEditing(), 1)');
  await t.sleep(300);
  check('Insert Field is greyed again after editing', !mailings().submenu.items.find(i => i.label === 'Insert Field').enabled && fieldItems().every(i => !i.enabled));

  // saved and reopened
  const merged = f('merged.bpum'), other = f('other.bpum');
  saves = [merged];
  await t.js('window.__bohpumApp.cmd("save-as")');
  await t.waitFor('!window.__bohpumApp.state.dirty');
  const doc = JSON.parse(fs.readFileSync(merged, 'utf8'));
  check('the file keeps the list path, sheet and nobody unticked', doc.merge && doc.merge.list === f('two.xlsx') && doc.merge.sheet === 'Staff' && J(doc.merge.off) === '[]', doc.merge);
  const plain = { ...doc }; delete plain.merge; fs.writeFileSync(other, J(plain));
  await t.js(`window.__bohpumApp.openFile(${J(other)})`);
  await t.waitFor(`window.__bohpumApp.state.path === ${J(other)}`);
  check('opening a publication without a list clears the bar', await app('S.mail === null') && await barHidden());
  await t.js(`window.__bohpumApp.openFile(${J(merged)})`);
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)');
  check('saved and reopened', await app('S.mail.list.rows.length === 2 && S.mail.list.sheet === "Staff" && !S.dirty') && !(await barHidden()));

  // list gone on open
  fs.renameSync(f('two.xlsx'), f('moved.xlsx'));
  await t.js(`window.__bohpumApp.openFile(${J(other)})`);
  await t.waitFor(`window.__bohpumApp.state.path === ${J(other)}`);
  await t.js(`window.__bohpumApp.openFile(${J(merged)})`);
  await t.waitFor('!!document.querySelector("#modal-root .modal")');
  const gone = await modalText();
  const btns = await t.js('[...document.querySelectorAll("#modal-root .modal-f .btn")].map(b => b.textContent)');
  check('list gone on open asks Find the list… / Later', gone.includes('The list was moved or deleted.') && J(btns) === J(['Find the list…', 'Later']), { gone, btns });
  await press('Later');
  await t.sleep(200);
  const late = await app('({ err: S.mail && S.mail.error, list: S.mail && S.mail.list, merge: !!S.doc.merge, pages: S.doc.pages.length, dirty: S.dirty })');
  check('Later leaves the design on screen and the problem in words', late.err && !late.list && late.merge && late.pages > 0 && !late.dirty &&
    !(await barHidden()) && (await barText()).includes('The list was moved or deleted.'), late);
  check('menu stays greyed without a readable list', J(live()) === J(['Select List…', 'Remove List']), live());

  // empty list says so
  const merge0 = await app('S.doc.merge');
  picks = [f('empty.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('!!document.querySelector("#modal-root .modal")');
  check('empty list says so', (await modalText()).includes('This list has no people in it'));
  await press('OK');
  check('empty list leaves the publication as it was', J(await app('S.doc.merge')) === J(merge0) && !(await app('S.dirty')));

  // a sheet that is gone from the file is a problem, not a quiet fallback
  makeXlsx(f('c.xlsx'), { sheets: [{ name: 'People', rows: [['Name'], ['P']] }, { name: 'Staff', rows: [['Who'], ['S']] }] });
  await t.js(`window.__bohpumApp.openFile(${J(other)})`);
  await t.waitFor(`window.__bohpumApp.state.path === ${J(other)}`);
  picks = [f('c.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('!!document.querySelector("#modal-root select")');
  await t.js('(() => { const s = document.querySelector("#modal-root select"); s.value = "Staff"; s.dispatchEvent(new Event("change")); })()');
  await press('OK');
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)');
  const sheetFile = f('sheet.bpum'); saves = [sheetFile];
  await t.js('window.__bohpumApp.cmd("save-as")');
  await t.waitFor('!window.__bohpumApp.state.dirty');
  makeXlsx(f('c.xlsx'), { sheets: [{ name: 'People', rows: [['Name'], ['P']] }] });
  await t.js(`window.__bohpumApp.openFile(${J(other)})`);
  await t.waitFor(`window.__bohpumApp.state.path === ${J(other)}`);
  await t.js(`window.__bohpumApp.openFile(${J(sheetFile)})`);
  await t.waitFor('!!document.querySelector("#modal-root .modal")');
  const noSheet = 'The sheet «Staff» is no longer in this list.';
  const gone2 = await t.js('[...document.querySelectorAll("#modal-root .modal-f .btn")].map(b => b.textContent)');
  check('a sheet gone from the list asks Find the list… / Later', (await modalText()).includes(noSheet) && J(gone2) === J(['Find the list…', 'Later']), gone2);
  await press('Later');
  await t.sleep(200);
  check('the bar says the sheet is gone', await app('S.mail.error') === noSheet && !(await app('S.mail.list')) && (await barText()) === noSheet, await barText());

  // undo while the list is still being read must not lose it
  fs.renameSync(f('moved.xlsx'), f('two.xlsx'));
  readDelay = 1200;
  await t.js(`window.__bohpumApp.openFile(${J(merged)})`);
  await t.waitFor(`window.__bohpumApp.state.path === ${J(merged)}`);
  await t.js('window.__bohpumApp.cmd("page-add")');
  await t.js('window.__bohpumApp.cmd("undo")');
  readDelay = 0;
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)');
  check('undo during the first read still ends with the list', await app('S.mail.list.rows.length === 2 && !S.mail.error'));

  await t.js('window.__bohpumApp.state.dirty = false');

  // undo Select list
  await t.js(`window.__bohpumApp.openFile(${J(other)})`);
  await t.waitFor(`window.__bohpumApp.state.path === ${J(other)}`);
  for (const p of [f('a.xlsx'), f('b.xlsx')]) {
    picks = [p];
    await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
    await t.waitFor(`!!(window.__bohpumApp.state.doc.merge && window.__bohpumApp.state.doc.merge.list === ${J(p)} && window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)`);
  }
  await t.key('Z', ['control']);
  await t.waitFor(`!!(window.__bohpumApp.state.doc.merge && window.__bohpumApp.state.doc.merge.list === ${J(f('a.xlsx'))} && window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list && window.__bohpumApp.state.mail.list.columns[0] === 'Name')`);
  check('undo Select list goes back to list A and the bar follows', (await barText()).includes('a.xlsx'));
  await t.key('Z', ['control']);
  await t.waitFor('!window.__bohpumApp.state.doc.merge');
  check('undo again: no list, bar hidden', await app('S.mail === null') && await barHidden());
}, {
  setup: () => {
    dialog.showOpenDialog = async () => { const p = picks.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] }; };
    dialog.showSaveDialog = async () => { const p = saves.shift(); return p ? { canceled: false, filePath: p } : { canceled: true }; };
  }
});
