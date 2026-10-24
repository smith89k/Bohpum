// Front and back for a list: a sheet of fronts, then a sheet of the matching backs mirrored so that, printed
// two-sided, each back lands behind its own front.
const { app, dialog, shell } = require('electron');
const path = require('path');
const { run } = require('./harness');
const { makeXlsx } = require('./make-xlsx');

let picks = [];
const P = ['សុខ ដារា', 'ចាន់ មុនី', 'កែវ សុភា'];

run(async (t, check) => {
  t.wc.getPrintersAsync = async () => [{ name: 'Office HP', displayName: 'Office HP', isDefault: true, description: '', status: 0, options: {} }];
  await t.ready(null);
  const J = JSON.stringify, near = (a, b) => Math.abs(a - b) < 0.01;
  makeXlsx(path.join(t.ctx.tmp, 'people.xlsx'), { sheets: [{ name: 'S', rows: [['Name'], ...P.map(p => [p])] }] });

  // an 85.6 × 54 mm card: «Name» on the front, "back «Name»" on the back
  await t.js(`(async () => { const A = window.__bohpumApp, S = A.state, { makeObject, newPage } = await import('./model.js'), { fieldHtml } = await import('./merge.js');
    S.doc.pageW = 85.6; S.doc.pageH = 54;
    const pg = newPage(); S.doc.pages.push(pg);
    S.doc.pages[0].objects.push(makeObject('box', { x: 5, y: 5, w: 50, h: 16, html: '<p>' + fieldHtml('Name') + '</p>' }));
    pg.objects.push(makeObject('box', { x: 5, y: 5, w: 70, h: 16, html: '<p>back ' + fieldHtml('Name') + '</p>' }));
    A.cmd('toggle-master'); A.cmd('toggle-master'); return 1; })()`);
  picks = [path.join(t.ctx.tmp, 'people.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)');

  const built = () => t.waitFor('!!document.querySelector(".print-preview .slot") && !document.getElementById("pd-info").textContent.startsWith("Preparing") && !document.getElementById("pd-printer").options[0].textContent.startsWith("Finding")', 20000);
  const set = async (k, value) => { await t.js(`(() => { const el = document.querySelector('#pd-side [data-k="${k}"]${k === 'order' ? `[value="${value}"]` : ''}'); if (el.type === 'radio') el.checked = true; else el.value = ${J(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`); await built(); };
  const tick = async (k) => { await t.js(`(document.querySelector('#pd-side [data-k="${k}"]').click(), 1)`); await built(); };
  const sheet = (n) => t.js(`(() => { const nav = (d) => { const b = document.querySelector('.prev-nav [data-d="' + d + '"]'); if (b) b.click(); };
    for (let i = 0; i < 20; i++) nav(-1); for (let i = 0; i < ${n}; i++) nav(1);
    return [...document.querySelectorAll('.print-preview .slot')].map(s => ({ t: s.textContent.trim(), x: parseFloat(s.style.left), y: parseFloat(s.style.top) })); })()`);
  const info = () => t.js('document.getElementById("pd-info").textContent');
  const dup = () => t.js(`(() => { const c = document.querySelector('#pd-side [data-k="duplex"]'); return c ? c.checked : null; })()`);

  await t.js('(window.__bohpumApp.cmd("print"), 1)');
  await built();
  await set('mode', 'grid');
  await tick('center'); // not centred: 10 mm margins
  const text = await t.js('document.getElementById("pd-side").textContent');
  const flipSel = await t.js(`(() => { const s = document.querySelector('#pd-side [data-k="flip"]'); return s && { v: s.value, o: [...s.options].map(o => o.textContent) }; })()`);
  const on = await dup();
  check('two pages per person: Front and back is on, with Flip on and the printer hint',
    on === true && text.includes('Front and back') && text.includes('Flip on:') && text.includes('Turn on two-sided printing in Printer Properties.') &&
    flipSel && flipSel.v === 'long' && J(flipSel.o) === J(['Long edge', 'Short edge']), { on, flipSel });

  // fronts sheet then backs sheet (sequence is the default with a list)
  const s1 = await sheet(0), s2 = await sheet(1), n = await info();
  const first = s1[0], back1 = s2.find(s => s.t === 'back ' + P[0]);
  check('fronts sheet then backs sheet', n.startsWith('2 sheets ·') && J(s1.map(s => s.t)) === J(P) && J(s2.map(s => s.t)) === J(P.map(p => 'back ' + p)), { n, s1, s2 });
  check('long edge, portrait: left and right swap', near(first.x, 10) && back1 && near(back1.x, 210 - 10 - 85.6) && near(back1.x, 114.4) && near(back1.y, first.y), { first, back1 });

  await set('flip', 'short');
  const sh = await sheet(1), back2 = sh.find(s => s.t === 'back ' + P[0]);
  check('short edge, portrait: top and bottom swap', back2 && near(back2.y, 297 - 10 - 54) && near(back2.y, 233) && near(back2.x, first.x), { back2 });

  await set('flip', 'long'); await set('orient', 'landscape');
  const l1 = await sheet(0), l2 = await sheet(1), lf = l1[0], lb = l2.find(s => s.t === 'back ' + P[0]);
  check('landscape, long edge: top and bottom swap', lf && lb && near(lb.y, 210 - lf.y - 54) && near(lb.x, lf.x), { lf, lb });
  await set('orient', 'portrait');

  // a full sheet of each person: fronts, backs, fronts, backs …
  await set('order', 'repeat');
  const rn = await info(), r = [];
  for (let i = 0; i < 6; i++) r.push((await sheet(i)).map(s => s.t));
  const same = (a, v) => a.length === 10 && a.every(x => x === v);
  check('full sheet of each person', rn.startsWith('6 sheets ·') && P.every((p, i) => same(r[2 * i], p) && same(r[2 * i + 1], 'back ' + p)), { rn, r });

  // untick: Task 8's layout, each person's pages side by side in order
  await set('order', 'sequence');
  await tick('duplex');
  const u = await sheet(0), un = await info();
  check('untick: fronts and backs side by side in order', un.startsWith('1 sheet ·') && J(u.map(s => s.t)) === J(P.flatMap(p => [p, 'back ' + p])), { un, u: u.map(s => s.t) });

  // Flip on goes with the tick
  const flipHidden = await t.js(`!document.querySelector('#pd-side [data-k="flip"]')`);
  await tick('duplex');
  const flipShown = await t.js(`!!document.querySelector('#pd-side [data-k="flip"]')`);
  check('Flip on hides when Front and back is unticked and shows when ticked', flipHidden && flipShown, { flipHidden, flipShown });

  // 3 pages per person: the last page has no back, but its backs sheet stays (blank) so every pair stays aligned
  await t.js(`(async () => { const A = window.__bohpumApp, S = A.state, { makeObject, newPage } = await import('./model.js'), { fieldHtml } = await import('./merge.js');
    const pg = newPage(); S.doc.pages.push(pg); pg.objects.push(makeObject('box', { x: 5, y: 5, w: 70, h: 16, html: '<p>third ' + fieldHtml('Name') + '</p>' }));
    A.cmd('toggle-master'); A.cmd('toggle-master'); return 1; })()`);
  await t.key('Escape');
  await t.waitFor('!document.querySelector(".print-preview")');
  await t.js('(window.__bohpumApp.cmd("print"), 1)');
  await built();
  const texts = async (n) => { const r = []; for (let i = 0; i < n; i++) r.push((await sheet(i)).map(s => s.t).join('|')); return r; };
  await set('order', 'repeat');
  const rep = await texts(4);
  const repN = await info();
  const first4 = rep.map(x => [...new Set(x.split('|'))].join('|'));
  check('3 pages per person, full sheet each: front, back, front, blank back', repN.startsWith('11 sheets ·') && J(first4) === J([P[0], 'back ' + P[0], 'third ' + P[0], '']), { repN, first4 });
  const p2 = (await texts(8)).slice(4).map(x => [...new Set(x.split('|'))].join('|'));
  check('3 pages per person: person 2 starts on a fronts sheet again', J(p2) === J([P[1], 'back ' + P[1], 'third ' + P[1], '']), p2);

  // one slot per sheet (sequence): the blank backs sheet keeps later pairs aligned
  await set('order', 'sequence');
  await t.js(`(() => { for (const [k, v] of [['marginL', 100], ['marginT', 200]]) { const el = document.querySelector('#pd-side [data-k="' + k + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
  await t.sleep(300);
  const sq = await texts(11), sqN = await info();
  const want = P.flatMap(p => [p, 'back ' + p, 'third ' + p, '']).slice(0, 11);
  check('one slot per sheet: pairs stay aligned, trailing blank dropped', sqN.startsWith('11 sheets ·') && J(sq) === J(want), { sqN, sq });

  // one page per person: no tick
  await set('pages', 'current');
  check('off by default for one page; tick hidden', (await dup()) === null && !(await t.js('document.getElementById("pd-side").textContent')).includes('Front and back'));
}, {
  timeout: 120000,
  setup: () => {
    dialog.showOpenDialog = async () => { const p = picks.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] }; };
    shell.openPath = async () => '';
  }
});
