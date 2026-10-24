// The mail merge toolbar: only with a list; every Mailings action as a button with an icon, greyed out when it can't be
// used; Insert Field opens the list of columns and puts the field at the caret; Preview, Print All, Remove List.
const { dialog } = require('electron');
const path = require('path');
const { run } = require('./harness');
const { makeXlsx } = require('./make-xlsx');

let picks = [];
const ODD = 'ឈ្មោះ "A" & <B>';
const LABELS = ['Select Recipients', 'Edit Recipient List', 'Insert Merge Field', 'Picture Field', 'Preview Results', 'Merge to Printer', 'Remove List'];

run(async (t, check) => {
  await t.ready(null);
  const dir = t.ctx.tmp, f = (n) => path.join(dir, n), J = JSON.stringify;
  const app = (code) => t.js(`(() => { const A = window.__bohpumApp, S = A.state; return ${code}; })()`);
  const bar = () => t.js(`(() => { const b = document.getElementById('mailbar');
    return { hidden: b.hidden, buttons: [...b.querySelectorAll('button')].map(x => ({ cls: x.className, label: (x.querySelector('.lbl') || {}).textContent || '',
      icon: !!x.querySelector('svg'), off: x.disabled, on: x.classList.contains('on'), title: x.title })), list: (b.querySelector('.mb-list') || {}).textContent }; })()`);
  const button = (b, label) => b.buttons.find(x => x.label === label) || { off: null, on: null }; // missing: neither off nor on
  const choose = async (file) => {
    picks = [file];
    await t.js('(window.__oldMail = window.__bohpumApp.state.mail, window.__bohpumApp.cmd("mail-select"), 1)');
    await t.waitFor(`!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail !== window.__oldMail && window.__bohpumApp.state.mail.list && window.__bohpumApp.state.doc.merge.list === ${J(file)})`);
  };
  makeXlsx(f('people.xlsx'), { sheets: [{ name: 'Staff', rows: [['Name', ODD], ['Dara', 'x'], ['Mony', 'y']] }] });
  makeXlsx(f('other.xlsx'), { sheets: [{ name: 'S', rows: [['Name'], ['Sok']] }] });

  check('no list: no mail merge toolbar', (await bar()).hidden);

  await choose(f('people.xlsx'));
  const a = await bar();
  const labels = a.buttons.filter(x => x.label).map(x => x.label);
  check('with a list: every action is a button, in order', !a.hidden && LABELS.every((l, i) => labels[i] === l) && labels.length === LABELS.length, labels);
  check('every button has an icon and a tooltip', a.buttons.every(x => x.icon && x.title), a.buttons.filter(x => !x.icon || !x.title));
  check('the list name stays on the right', a.list === 'Mailing list: people.xlsx · Staff', a.list);
  check('Insert Field and Photo from List greyed out with nothing selected', button(a, 'Insert Merge Field').off === true && button(a, 'Picture Field').off === true);
  check('the others work', ['Select Recipients', 'Edit Recipient List', 'Preview Results', 'Merge to Printer', 'Remove List'].every(l => button(a, l).off === false));

  // a picture selected → Photo from List
  const pic = await t.js(`(async () => { const A = window.__bohpumApp, S = A.state, { makeObject } = await import('./model.js');
    const o = makeObject('image', { x: 120, y: 10, w: 25, h: 30, src: '' }); S.doc.pages[0].objects.push(o);
    S.sel = new Set([o.id]); A.cmd('toggle-master'); A.cmd('toggle-master'); S.sel = new Set([o.id]); A.selectionChanged(); return o.id; })()`);
  check('Photo from List works with one picture selected', button(await bar(), 'Picture Field').off === false);

  // a text box being typed in → Insert Field opens the columns and puts the field at the caret
  const box = await t.js(`(async () => { const A = window.__bohpumApp, S = A.state, { makeObject } = await import('./model.js');
    const o = makeObject('box', { x: 10, y: 10, w: 80, h: 30, shape: 'none', html: '<p><br></p>', pad: { t: 1, r: 1, b: 1, l: 1 } });
    S.doc.pages[0].objects.push(o); A.cmd('toggle-master'); A.cmd('toggle-master'); A.startEditing(o.id); return o.id; })()`);
  await t.waitFor('!!window.__bohpumApp.state.editing');
  t.wc.insertText('Hi '); await t.sleep(200);
  check('Insert Field works while typing in a text box', button(await bar(), 'Insert Merge Field').off === false);
  await t.click('#mailbar .mb-field');
  await t.waitFor('getComputedStyle(document.getElementById("ctxmenu")).display !== "none"');
  const items = await t.js('[...document.querySelectorAll("#ctxmenu .mi span")].map(s => s.textContent)');
  check('Insert Field lists the columns (odd names shown as typed)', J(items) === J(['Name', ODD]), items);
  check('the text box is still being edited', await app('!!S.editing'));
  await t.click('#ctxmenu .mi:nth-child(2)');
  await t.sleep(200);
  t.wc.insertText('!'); await t.sleep(150);
  await app('(A.finishEditing(), 1)');
  const text = await app(`(() => { const d = document.createElement('div'); d.innerHTML = S.doc.pages[0].objects.find(o => o.id === ${J(box)}).html;
    return { text: d.textContent, col: (d.querySelector('[data-field="merge"]') || {}).dataset?.col }; })()`);
  check('the chosen field goes in at the caret', text.text === `Hi «${ODD}»!` && text.col === ODD, text);

  // Preview toggles, and shows as pressed
  await t.click('#mailbar .mb-preview');
  check('Preview button turns Preview on and shows pressed', (await app('S.mail.preview')) && button(await bar(), 'Preview Results').on);
  check('the recipient bar is there: Recipient 1 of 2 · Dara', await t.js('document.getElementById("mailbar").textContent.includes("Recipient 1 of 2") && document.querySelector("#mailbar .mb-name").textContent === "Dara"'));
  await t.click('#mailbar .mb-next');
  check('▶ goes to the next person', await t.js('document.querySelector("#mailbar .mb-name").textContent === "Mony"'));
  await t.click('#mailbar .mb-preview');
  check('Preview button turns it off again', !(await app('S.mail.preview')) && button(await bar(), 'Preview Results').on === false);

  // Print All opens the Print screen with everyone
  await t.click('#mailbar .mb-print');
  await t.waitFor('!!document.querySelector(".print-preview .slot")', 15000);
  check('Print All opens the Print screen', true);
  await t.key('Escape');
  await t.waitFor('!document.querySelector(".print-preview")');

  // Select List picks another list
  picks = [f('other.xlsx')];
  await t.js('(window.__oldMail = window.__bohpumApp.state.mail, 1)');
  await t.click('#mailbar .mb-select');
  await t.waitFor(`!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail !== window.__oldMail && window.__bohpumApp.state.doc.merge.list === ${J(f('other.xlsx'))})`);
  check('Select List picks another list', (await bar()).list === 'Mailing list: other.xlsx · S');

  // Remove List: the toolbar goes away
  await t.click('#mailbar .mb-remove');
  await t.waitFor('document.getElementById("mailbar").hidden');
  check('Remove List removes the list and the toolbar', !(await app('S.doc.merge')));
  check('a picture is still in the publication', await app(`!!S.doc.pages[0].objects.find(o => o.id === ${J(pic)})`));
}, {
  setup: () => {
    dialog.showOpenDialog = async () => { const p = picks.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] }; };
  }
});
