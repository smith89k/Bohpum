// Printing a list again: the order with a list is its own (mailOrder), the list and its photos are read again when Print
// or Save As PDF starts, the same list chosen again keeps who is unticked, a list that can't be read is said first, and
// a failure while the pages are put together leaves the Print screen working.
const { app, dialog, shell, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');
const { makeXlsx } = require('./make-xlsx');

let picks = [], saves = [];
const jobs = [], pdfs = [];
const P1 = 'សុខ ដារា', P2 = 'ចាន់ មុនី', P3 = 'កែវ សុភា';

run(async (t, check) => {
  t.wc.getPrintersAsync = async () => [{ name: 'Office HP', displayName: 'Office HP', isDefault: true, description: '', status: 0, options: {} }];
  await t.ready(null);
  const dir = t.ctx.tmp, f = (n) => path.join(dir, n), J = JSON.stringify;
  const app = (code) => t.js(`(() => { const A = window.__bohpumApp, S = A.state; return ${code}; })()`);
  const until = async (fn, ms) => { const t0 = Date.now(); while (!(await fn())) { if (Date.now() - t0 > ms) throw new Error('timed out'); await t.sleep(100); } };
  const jpg = () => nativeImage.createFromBitmap(Buffer.alloc(80 * 60 * 4, 150), { width: 80, height: 60 }).toJPEG(90);
  fs.writeFileSync(f('b.jpg'), jpg()); fs.writeFileSync(f('c.jpg'), jpg());
  const list = (first) => makeXlsx(f('people.xlsx'), { sheets: [{ name: 'S', rows: [['Name', 'Photo'], [first, f('a.jpg')], [P2, f('b.jpg')], [P3, f('c.jpg')]] }] });
  list(P1);

  await t.js(`(async () => { const A = window.__bohpumApp, S = A.state, { makeObject } = await import('./model.js'), { fieldHtml } = await import('./merge.js');
    S.doc.pageW = 85.6; S.doc.pageH = 54;
    S.doc.pages[0].objects.push(makeObject('box', { x: 32, y: 5, w: 50, h: 16, html: '<p>' + fieldHtml('Name') + '</p>' }), makeObject('image', { x: 3, y: 5, w: 25, h: 30, mergePhoto: 'Photo' }));
    A.cmd('toggle-master'); A.cmd('toggle-master'); return 1; })()`);

  const built = (ms = 20000) => t.waitFor('!!document.querySelector(".print-preview .slot") && !document.getElementById("pd-info").textContent.startsWith("Preparing") && !document.getElementById("pd-printer").options[0].textContent.startsWith("Finding")', ms);
  const openPrint = async () => { await t.js('(window.__bohpumApp.cmd("print"), 1)'); await built(); };
  const closePrint = async () => { await t.click('.modal-f [data-a="close"]'); await t.waitFor('!document.querySelector(".print-preview")'); };
  const set = async (k, value) => { await t.js(`(() => { const el = document.querySelector('#pd-side [data-k="${k}"]${k === 'order' ? `[value="${value}"]` : ''}'); if (el.type === 'radio') el.checked = true; else el.value = ${J(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`); await built(); };
  const tileOn = () => t.js('(document.querySelector(".pr-order .tile.on span") || {}).textContent');
  const slots = () => t.js('[...document.querySelectorAll(".print-preview .slot")].map(s => (s.querySelector(".kt") || {}).textContent)');
  const box = () => t.js('[...document.querySelectorAll("#modal-root .modal.problems li")].map(l => l.textContent)');
  const press = (label) => t.js(`[...document.querySelectorAll('#modal-root .modal .btn')].find(b => b.textContent === ${J(label)}).click()`);
  const toastText = () => t.js('document.getElementById("toast").textContent');
  const select = async () => {
    picks = [f('people.xlsx')];
    await t.js('(window.__oldMail = window.__bohpumApp.state.mail, window.__bohpumApp.cmd("mail-select"), 1)');
    await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail !== window.__oldMail && window.__bohpumApp.state.mail.list)');
  };

  // R12: a test sheet without a list saves "Fill each sheet with one page"; with a list Print still opens on people side by side
  await openPrint();
  await set('mode', 'grid'); await set('order', 'repeat');
  await closePrint();
  const noList = await app('S.doc.print.order');
  await select();
  await openPrint();
  const first = await tileOn();
  check('with a list, Print opens on Different people side by side', noList === 'repeat' && first === 'Different people side by side', { noList, first });
  await set('order', 'repeat');
  await closePrint();
  await openPrint();
  const kept = { tile: await tileOn(), print: await app('S.doc.print') };
  check('A full sheet of each person is kept for the list only', kept.tile === 'A full sheet of each person' && kept.print.mailOrder === 'repeat' && kept.print.order === 'repeat', kept);
  await set('order', 'sequence');
  await closePrint();
  const both = await app('[S.doc.print.order, S.doc.print.mailOrder]');
  check('printing with a list leaves the order without a list alone', J(both) === J(['repeat', 'sequence']), both);

  // R13: a photo put in place after the problems box is found at the next Print
  await openPrint();
  await t.click('.modal-f [data-a="print"]');
  await t.waitFor('!!document.querySelector("#modal-root .modal.problems")');
  const lines = await box();
  await press('Cancel');
  await closePrint();
  fs.writeFileSync(f('a.jpg'), jpg());
  await openPrint();
  await t.click('.modal-f [data-a="print"]');
  let asked = false;
  await until(async () => (asked = asked || await t.js('!!document.querySelector("#modal-root .modal.problems")')) || jobs.length === 1, 20000).catch(() => {});
  if (asked) await press('Cancel');
  check('a photo put in place is found when Print opens again', J(lines) === J([`Row 2 · ${P1} · photo not found: ${f('a.jpg')}`]) && !asked && jobs.length === 1 &&
    J(jobs[0].sheets) === J([[P1, P2, P3]]) && jobs[0].imgs.length === 3 && jobs[0].imgs.every(i => i.ok), { lines, asked, jobs });
  await t.waitFor('!document.querySelector(".print-preview")', 20000);

  // R13: a name edited in Excel shows at the next Print
  list('សុខ ដារា (new)');
  await openPrint();
  const renamed = await slots();
  check('a name edited in the list shows when Print opens', renamed[0] === 'សុខ ដារា (new)', renamed);
  await closePrint();

  // R13: the same list chosen again keeps who is unticked
  await t.js('(window.__bohpumApp.cmd("mail-people"), 1)');
  await t.waitFor('!!document.querySelector("#modal-root .modal.people")');
  await t.js(`document.querySelectorAll('#modal-root tbody tr')[1].querySelector('input').click()`);
  await press('OK');
  await t.waitFor('window.__bohpumApp.state.doc.merge.off.length === 1');
  await select();
  const off = await app('({ off: S.doc.merge.off, bar: document.getElementById("mailbar").textContent })');
  check('Select List with the same file keeps the unticked', off.off.length === 1 && off.off[0] === J([P2, f('b.jpg')]) && off.bar.includes('of 2'), off);

  // R14: a failure while the pages are put together: a toast, and Close / Esc work again
  await app(`(S.doc.name = { replace() { throw new Error('boom'); } }, 1)`); // buildOutputHtml's <title> throws
  await openPrint();
  await t.js('(document.querySelector(".modal-f [data-a=\\"pdf\\"]").click(), 1)');
  await t.waitFor('document.getElementById("toast").textContent.startsWith("Could not prepare")').catch(() => {});
  const stuck = { toast: await toastText(), disabled: await t.js('[...document.querySelectorAll(".modal-f .btn")].map(b => b.disabled)'), info: await t.js('document.getElementById("pd-info").textContent') };
  await app(`(S.doc.name = 'card', 1)`);
  await t.key('Escape');
  await t.waitFor('!document.querySelector(".print-preview")').catch(() => {});
  const gone = await t.js('!document.querySelector(".print-preview")');
  check('a throw while preparing the pages: toast, buttons back, Esc closes', stuck.toast === 'Could not prepare the pages: boom' && J(stuck.disabled) === J([false, false, false]) &&
    !stuck.info.startsWith('Preparing') && gone && pdfs.length === 0, { stuck, gone, pdfs: pdfs.length });

  // R13: the list gone when Print opens → the same box as at opening, and no Print screen
  fs.renameSync(f('people.xlsx'), f('moved.xlsx'));
  await t.js('(window.__bohpumApp.cmd("print"), 1)');
  await t.waitFor('[...document.querySelectorAll("#modal-root .modal .btn")].some(b => b.textContent === "Find the list…")');
  const lost = await t.js('({ title: document.querySelector("#modal-root .modal .modal-h").textContent, buttons: [...document.querySelectorAll("#modal-root .modal .btn")].map(b => b.textContent) })');
  await press('Later');
  await t.sleep(400);
  const after = await app('({ print: !!document.querySelector(".print-preview"), error: S.mail && S.mail.error })');
  check('a list gone at Print: Find the list… / Later, then no Print screen', lost.title === 'The list was moved or deleted.' && J(lost.buttons) === J(['Find the list…', 'Later']) && !after.print && after.error === 'The list was moved or deleted.', { lost, after });

  // a list that can't be read: Print says so first (and prints the design), File › Save As PDF says so and saves nothing
  await t.js('(window.__bohpumApp.cmd("print"), 1)');
  await built();
  const blanks = { toast: await toastText(), who: await t.js('!!document.querySelector(\'#pd-side [data-k="who"]\')') };
  await closePrint();
  check('Print with a list that cannot be read says so first', blanks.toast === 'The list was moved or deleted. The fields print as «blanks».' && !blanks.who, blanks);
  saves = [f('x.pdf')];
  await t.js('(window.__bohpumApp.cmd("save-as"), 1)');
  await t.waitFor('document.getElementById("toast").textContent.endsWith("The PDF was not saved.")').catch(() => {});
  await t.sleep(500);
  const noPdf = { toast: await toastText(), pdfs: pdfs.length, file: fs.existsSync(f('x.pdf')) };
  check('File Save As PDF with a list that cannot be read says so, saves nothing', noPdf.toast === 'The list was moved or deleted. The PDF was not saved.' && noPdf.pdfs === 0 && !noPdf.file, noPdf);

  // R12: after Remove List, Print uses the order without a list again
  await app('(A.cmd("mail-remove"), 1)');
  await t.waitFor('!window.__bohpumApp.state.doc.merge');
  await openPrint();
  const removed = await tileOn();
  await closePrint();
  check('after Remove List, Print opens on the order without a list', removed === 'Fill each sheet with one page', removed);
}, {
  timeout: 180000,
  setup: () => {
    dialog.showOpenDialog = async () => { const p = picks.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] }; };
    dialog.showSaveDialog = async () => { const p = saves.shift(); return p ? { canceled: false, filePath: p } : { canceled: true }; };
    shell.openPath = async () => '';
    let seen = 0;
    app.on('browser-window-created', (_e, w) => {
      if (seen++ === 0) return; // the editor window
      const wc = w.webContents;
      const look = () => wc.executeJavaScript(`(() => ({
        sheets: [...document.querySelectorAll('.sheet-out')].map(s => [...s.querySelectorAll('.kt')].map(k => k.textContent)),
        imgs: [...document.images].map(i => ({ ok: i.complete && i.naturalWidth > 0 })) }))()`);
      wc.print = (opts, cb) => { look().then(d => { jobs.push({ opts, ...d }); cb(true, ''); }, (err) => cb(false, String(err))); };
      wc.printToPDF = async () => { pdfs.push(await look()); return Buffer.from('%PDF-1.4\n%%EOF\n'); };
    });
  }
});
