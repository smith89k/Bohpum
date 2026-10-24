// Choose People: untick people in a box (search, Tick all / Untick all on the rows shown); the choice is kept by the
// row's content, so it survives the list being edited; one undo step; Cancel changes nothing.
const { dialog } = require('electron');
const path = require('path');
const { run } = require('./harness');
const { makeXlsx } = require('./make-xlsx');

let picks = [], saves = [];
const P1 = 'សុខ ដារា', P2 = 'Chan Mony', P3 = 'Kev Sophea';

run(async (t, check) => {
  await t.ready(null);
  const dir = t.ctx.tmp, f = (n) => path.join(dir, n), J = JSON.stringify;
  const app = (code) => t.js(`(() => { const A = window.__bohpumApp, S = A.state; return ${code}; })()`);
  const press = (label) => t.js(`[...document.querySelectorAll('#modal-root .modal .btn')].find(b => b.textContent === ${J(label)}).click()`);
  const bar = () => t.js('document.getElementById("mailbar").textContent');
  const rows = () => t.js('[...document.querySelectorAll("#modal-root tbody tr")].filter(r => !r.hidden).map(r => r.textContent)');
  const ticks = () => t.js('[...document.querySelectorAll("#modal-root tbody tr")].map(r => r.querySelector("input").checked)');
  const open = async () => { await t.js('(window.__bohpumApp.cmd("mail-people"), 1)'); await t.waitFor('!!document.querySelector("#modal-root .modal.people")'); };
  const search = (v) => t.js(`(() => { const s = document.querySelector('#modal-root input[type=search]'); s.value = ${J(v)}; s.dispatchEvent(new Event('input')); })()`);
  const tick = (i) => t.js(`document.querySelectorAll('#modal-root tbody tr')[${i}].querySelector('input').click()`);

  const write = (extra = []) => makeXlsx(f('people.xlsx'), { sheets: [{ name: 'S', rows: [['Name', 'City'], ...extra, [P1, 'Phnom Penh'], [P2, 'Siem Reap'], [P3, 'Kampot']] }] });
  write();
  picks = [f('people.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)');
  saves = [f('p.bpum')];
  await t.js('window.__bohpumApp.cmd("save-as")');
  await t.waitFor('!window.__bohpumApp.state.dirty');

  // Cancel changes nothing
  await open();
  await tick(0);
  await press('Cancel');
  check('Cancel changes nothing', !(await app('S.dirty')) && await app('S.doc.merge.off.length === 0') && (await bar()).includes('Recipient 1 of 3'), await bar());

  // untick one
  await open();
  const shown = await rows();
  check('the box lists every person with every column', shown.length === 3 && shown[0].includes(P1) && shown[0].includes('Phnom Penh'), shown);
  await tick(1);
  await press('OK');
  check('untick one: 2 people, dirty, remembered by content', (await bar()).includes('Recipient 1 of 2') && await app('S.dirty && S.doc.merge.off.length === 1 && S.doc.merge.off[0] === JSON.stringify(S.mail.list.rows[1])'), await bar());
  await t.js('window.__bohpumApp.cmd("mail-next")');
  check('the arrow skips the unticked person', (await bar()).includes('Recipient 2 of 2') && (await t.js('document.querySelector("#mailbar .mb-name").textContent')) === P3);

  // the box shows the ticks as they are; Khmer is found as typed
  await open();
  check('the box shows who is ticked', J(await ticks()) === '[true,false,true]', await ticks());
  await search('ដារា');
  check('search finds Khmer as typed', (await rows()).length === 1);
  await search('');
  await press('Cancel');

  // Enter: in the search field it does nothing; on a bulk button it presses that button; Esc still cancels
  await open();
  await t.js("document.querySelector('#modal-root input[type=search]').focus()");
  await search('chan');
  await t.key('Enter');
  await t.sleep(200);
  check('Enter in the search box keeps the box open and saves nothing', await t.js('!!document.querySelector("#modal-root .modal.people")') && J(await rows()).includes('Chan Mony') && await app('S.doc.merge.off.length === 1'));
  await t.js("[...document.querySelectorAll('#modal-root .modal .btn')].find(b => b.textContent === 'Untick all').focus()");
  await t.key('Enter');
  await t.waitFor('[...document.querySelectorAll("#modal-root tbody tr")].filter(r => !r.hidden).every(r => !r.querySelector("input").checked)');
  check('Enter on Untick all unticks the shown rows and keeps the box open', await t.js('!!document.querySelector("#modal-root .modal.people")') && J(await ticks()) === '[true,false,true]' && await app('S.doc.merge.off.length === 1'), await ticks());
  await t.key('Escape');
  await t.waitFor('!document.querySelector("#modal-root .modal.people")');
  check('Esc cancels', await app('S.doc.merge.off.length === 1'));

  // undo
  await t.key('Z', ['control']);
  await t.waitFor('window.__bohpumApp.state.doc.merge.off.length === 0');
  check('undo Choose people ticks everyone again', (await bar()).includes('of 3'), await bar());

  // search then Untick all
  await open();
  await search('chan');
  check('search is case-insensitive and filters rows', J(await rows()).includes('Chan Mony') && (await rows()).length === 1, await rows());
  await press('Untick all');
  await search('');
  check('Untick all acts on the rows shown', J(await ticks()) === '[true,false,true]', await ticks());
  await press('Tick all');
  check('Tick all ticks all of them (only those shown: all)', J(await ticks()) === '[true,true,true]');
  await search('chan');
  await press('Untick all');
  await press('OK');
  check('OK keeps the choice', await app('S.doc.merge.off.length === 1') && (await bar()).includes('of 2'), await bar());

  // remembered by content
  await t.js('window.__bohpumApp.cmd("save")');
  await t.waitFor('!window.__bohpumApp.state.dirty');
  write([['New Person', 'Pursat']]);
  await t.js(`window.__bohpumApp.openFile(${J(f('p.bpum'))})`);
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list && window.__bohpumApp.state.mail.list.rows.length === 4)');
  check('after the list gains a row on top: same person unticked, new row ticked',
    await app('(() => { const m = S.mail.list, off = S.doc.merge.off; return m.rows.map(r => off.includes(JSON.stringify(r))).join() === "false,false,true,false"; })()'),
    await app('JSON.stringify(S.doc.merge.off)'));
  check('and the bar counts three', (await bar()).includes('Recipient 1 of 3'), await bar());
}, {
  setup: () => {
    dialog.showOpenDialog = async () => { const p = picks.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] }; };
    dialog.showSaveDialog = async () => { const p = saves.shift(); return p ? { canceled: false, filePath: p } : { canceled: true }; };
  }
});
