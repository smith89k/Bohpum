// Printing a list: Who (everyone ticked, the person showing, no one), people side by side or a full sheet each, the
// problems box before output, PDFs that wait for every photo, File › Save As PDF and Export PNG, 300 people.
const { app, dialog, shell, nativeImage } = require('electron');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { fileURLToPath } = require('url');
const { run } = require('./harness');
const { makeXlsx } = require('./make-xlsx');

let picks = [], saves = [], fakePdf = false;
const jobs = [], pdfs = [], pngs = [];
const P1 = 'សុខ ដារា', P2 = 'ចាន់ មុនី', P3 = 'កែវ សុភា';

run(async (t, check) => {
  t.wc.getPrintersAsync = async () => [{ name: 'Office HP', displayName: 'Office HP', isDefault: true, description: '', status: 0, options: {} }];
  await t.ready(null);
  const dir = t.ctx.tmp, f = (n) => path.join(dir, n), J = JSON.stringify;
  const app = (code) => t.js(`(() => { const A = window.__bohpumApp, S = A.state; return ${code}; })()`);
  const until = async (fn, ms) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await t.sleep(100); } };
  const noise = (w, h) => { const b = Buffer.alloc(w * h * 4); for (let i = 0; i < b.length; i++) b[i] = (i * 7919 + (i >> 5) * 104729) % 251; return nativeImage.createFromBitmap(b, { width: w, height: h }); };
  fs.writeFileSync(f('dara.jpg'), noise(1600, 1200).toJPEG(90));
  fs.writeFileSync(f('sophea.png'), noise(1200, 1600).toPNG());
  makeXlsx(f('people.xlsx'), { sheets: [{ name: 'S', rows: [['Name', 'Photo'], [P1, f('dara.jpg')], [P2, f('gone.jpg')], [P3, f('sophea.png')]] }] });

  // an 85.6 × 54 mm card: «Name» and a photo from the list
  await t.js(`(async () => { const A = window.__bohpumApp, S = A.state, { makeObject } = await import('./model.js'), { fieldHtml } = await import('./merge.js');
    S.doc.pageW = 85.6; S.doc.pageH = 54;
    S.doc.pages[0].objects.push(makeObject('box', { x: 32, y: 5, w: 50, h: 16, html: '<p>' + fieldHtml('Name') + '</p>' }), makeObject('image', { x: 3, y: 5, w: 25, h: 30, mergePhoto: 'Photo' }));
    A.cmd('toggle-master'); A.cmd('toggle-master'); return 1; })()`);
  picks = [f('people.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('!!(window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list)');
  await app('(A.cmd("mail-next"), 1)'); // the person showing: person 2

  const built = (ms = 20000) => t.waitFor('!!document.querySelector(".print-preview .slot") && !document.getElementById("pd-info").textContent.startsWith("Preparing") && !document.getElementById("pd-printer").options[0].textContent.startsWith("Finding")', ms);
  const openPrint = async () => { await t.js('(window.__bohpumApp.cmd("print"), 1)'); await built(); };
  const set = async (k, value) => { await t.js(`(() => { const el = document.querySelector('#pd-side [data-k="${k}"]${k === 'order' ? `[value="${value}"]` : ''}'); if (el.type === 'radio') el.checked = true; else el.value = ${J(value)}; el.dispatchEvent(new Event('change', { bubbles: true })); })()`); await built(); };
  const slots = () => t.js('[...document.querySelectorAll(".print-preview .slot")].map(s => (s.querySelector(".kt") || {}).textContent)');
  const info = () => t.js('document.getElementById("pd-info").textContent');
  const nextSheet = () => t.js('(document.querySelector(".prev-nav [data-d=\\"1\\"]").click(), 1)');
  const box = () => t.js('[...document.querySelectorAll("#modal-root .modal.problems li")].map(l => l.textContent)');
  const press = (label) => t.js(`[...document.querySelectorAll('#modal-root .modal.problems .btn')].find(b => b.textContent === ${J(label)}).click()`);

  await openPrint();
  const who = await t.js(`(() => { const s = [...document.querySelectorAll('#pd-side select.big')].filter(x => x.id !== 'pd-printer')[0];
    return { k: s.dataset.k, v: s.value, label: s.getAttribute('aria-label'), titles: [...s.options].map(o => o.querySelector('b').textContent) }; })()`);
  check('Who is at the top, Everyone ticked chosen', who.k === 'who' && who.v === 'all' && who.label === 'Who' &&
    J(who.titles) === J(['Everyone ticked', 'Only the person showing', 'No one (the design with blanks)']), who);

  await set('mode', 'grid');
  const tiles = await t.js('[...document.querySelectorAll(".pr-order .tile")].map(x => x.querySelector("span").textContent + (x.classList.contains("on") ? " *" : ""))');
  const side = { slots: await slots(), info: await info() };
  check('many per sheet, people side by side', J(side.slots.slice(0, 3)) === J([P1, P2, P3]) && side.slots.length === 3 && side.info.startsWith('1 sheet ·') &&
    J(tiles) === J(['A full sheet of each person', 'Different people side by side *']), { side, tiles });

  await set('order', 'repeat');
  const full = { info: await info(), s1: await slots() };
  await nextSheet(); full.s2 = await slots();
  await nextSheet(); full.s3 = await slots();
  const all = (a, v) => a.length === 10 && a.every(x => x === v);
  check('A full sheet of each person', full.info.startsWith('3 sheets ·') && all(full.s1, P1) && all(full.s2, P2) && all(full.s3, P3), full);

  await set('who', 'one');
  const one = { info: await info(), s: await slots() };
  check('Only the person showing', one.info.startsWith('1 sheet ·') && all(one.s, P2), one);

  await set('who', 'none');
  const none = { info: await info(), s: await slots() };
  check('No one', none.info.startsWith('1 sheet ·') && all(none.s, '«Name»'), none);

  // problems before printing
  await set('who', 'all'); await set('order', 'sequence');
  await t.click('.modal-f [data-a="print"]');
  await t.waitFor('!!document.querySelector("#modal-root .modal.problems")');
  const lines = await box();
  await press('Cancel');
  await t.sleep(300);
  const cancelled = { jobs: jobs.length, open: await t.js('!!document.querySelector(".print-preview")'), box: await t.js('!!document.querySelector(".modal.problems")') };
  await t.click('.modal-f [data-a="print"]');
  await t.waitFor('!!document.querySelector("#modal-root .modal.problems")');
  await press('Print anyway');
  await t.waitFor('!document.querySelector(".print-preview")', 20000);
  await t.sleep(300);
  check('problems before printing', J(lines) === J([`Row 3 · ${P2} · photo not found: ${f('gone.jpg')}`]) && cancelled.jobs === 0 && cancelled.open && !cancelled.box &&
    jobs.length === 1 && J(jobs[0].sheets) === J([[P1, P2, P3]]), { lines, cancelled, jobs: jobs.map(j => j.sheets) });

  // Save as PDF from the print screen: the hidden window waits for every photo
  await openPrint();
  saves = [f('everyone.pdf')];
  await t.js('(document.querySelector(".modal-f [data-a=\\"pdf\\"]").click(), 1)');
  await t.waitFor('!!document.querySelector("#modal-root .modal.problems")');
  await press('Print anyway');
  await until(() => pdfs.length === 1, 30000).catch(() => {});
  const p0 = pdfs[0] || {};
  check('PDF waits for every photo', p0.imgs && p0.imgs.length === 2 && p0.imgs.every(i => i.ok) && J(p0.sheets) === J([[P1, P2, P3]]), p0.imgs);

  // File › Save As → PDF: everyone ticked, every page at page size, after the same box
  saves = [f('file.pdf')];
  await t.js('(window.__bohpumApp.cmd("save-as"), 1)');
  await t.waitFor('!!document.querySelector("#modal-root .modal.problems")', 20000);
  const fileLines = await box();
  await press('Print anyway');
  await until(() => pdfs.length === 2 && fs.existsSync(f('file.pdf')), 30000).catch(() => {});
  const bytes = fs.existsSync(f('file.pdf')) ? fs.readFileSync(f('file.pdf')).toString('latin1') : '';
  const pages = (bytes.match(/\/Type\s*\/Page\b/g) || []).length;
  check('File Save As PDF prints everyone', pdfs[1] && J(pdfs[1].sheets) === J([[P1], [P2], [P3]]) && pages === 3 && J(fileLines) === J(lines), { sheets: pdfs[1] && pdfs[1].sheets, pages, fileLines });

  // Export Page as PNG: the person showing
  await app('(A.cmd("mail-preview"), 1)');
  await t.waitFor(`document.querySelector('#page-holder .kt').textContent === ${J(P2)}`);
  saves = [f('card.png')];
  await app('(A.cmd("export-png"), 1)');
  await until(() => pngs.length === 1, 20000).catch(() => {});
  check('Export Page as PNG saves the person showing', pngs[0] && J(pngs[0].sheets) === J([[P2]]), pngs[0]);
  await app('(A.cmd("mail-preview"), 1)');

  // 300 people, 2 photos between them: the window keeps ticking while they are prepared
  makeXlsx(f('many.xlsx'), { sheets: [{ name: 'S', rows: [['Name', 'Photo'], ...Array.from({ length: 300 }, (_, i) => ['Person ' + (i + 1), f(i % 2 ? 'sophea.png' : 'dara.jpg')])] }] });
  picks = [f('many.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list && window.__bohpumApp.state.mail.list.rows.length === 300');
  await t.js(`(() => { const g = window.__gap = { max: 0, last: performance.now(), t0: performance.now(), seen: new Set() }; window.__tick = setInterval(() => { const n = performance.now(); g.max = Math.max(g.max, n - g.last); g.last = n;
    const i = document.getElementById('pd-info'); if (i) g.seen.add(i.textContent); }, 50); return 1; })()`);
  await t.js('(window.__bohpumApp.cmd("print"), 1)');
  await built(60000).catch(() => {});
  const big = await t.js(`(() => { const g = window.__gap; clearInterval(window.__tick); return { ms: Math.round(performance.now() - g.t0), max: Math.round(g.max), info: document.getElementById('pd-info').textContent,
    progress: [...g.seen].filter(s => /^Preparing \\d+ of 300 people…$/.test(s)).length }; })()`);
  check('300 people stay responsive', big.ms < 60000 && big.max < 1000 && big.progress >= 2 && big.info.startsWith('30 sheets ·'), big);
  await t.key('Escape');

  // R10: a 1 MB picture in the design and a small photo each: the picture goes into the file once, and every card shows it
  for (let i = 0; i < 300; i++) fs.writeFileSync(f(`p${i}.png`), nativeImage.createFromBitmap(Buffer.alloc(40 * 30 * 4, i % 256), { width: 40, height: 30 }).toPNG());
  makeXlsx(f('cards.xlsx'), { sheets: [{ name: 'S', rows: [['Name', 'Photo'], ...Array.from({ length: 300 }, (_, i) => ['Card ' + (i + 1), f(`p${i}.png`)])] }] });
  picks = [f('cards.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list && window.__bohpumApp.state.mail.list.rows[0][0] === "Card 1"');
  const logo = 'data:image/png;base64,' + nativeImage.createFromBitmap(crypto.randomBytes(600 * 450 * 4), { width: 600, height: 450 }).toPNG().toString('base64');
  await t.js(`(async () => { const A = window.__bohpumApp, S = A.state, { makeObject } = await import('./model.js');
    S.doc.pages[0].objects.push(makeObject('image', { x: 60, y: 30, w: 20, h: 15, src: ${J(logo)} })); A.cmd('toggle-master'); A.cmd('toggle-master'); return 1; })()`);
  fakePdf = true;
  saves = [f('cards.pdf')];
  await t.js('(window.__bohpumApp.cmd("save-as"), 1)');
  await until(() => pdfs.length === 3, 120000).catch(() => {});
  const r10 = pdfs[2] ? { bytes: pdfs[2].bytes, sheets: pdfs[2].sheets.length, logos: pdfs[2].imgs.filter(i => i.len === logo.length && i.ok).length, all: pdfs[2].imgs.every(i => i.ok), logo: logo.length } : null;
  check('a picture used on every card is in the file once', r10 && r10.logo > 1e6 && r10.bytes < 5e6 && r10.sheets === 300 && r10.logos === 300 && r10.all, r10);
}, {
  timeout: 300000,
  setup: () => {
    dialog.showOpenDialog = async () => { const p = picks.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] }; };
    dialog.showSaveDialog = async () => { const p = saves.shift(); return p ? { canceled: false, filePath: p } : { canceled: true }; };
    shell.openPath = async () => '';
    let seen = 0;
    app.on('browser-window-created', (_e, w) => {
      if (seen++ === 0) return; // the editor window
      // hidden print / PDF / PNG windows: look at what they would put out
      const wc = w.webContents;
      const look = () => wc.executeJavaScript(`(() => ({
        sheets: [...document.querySelectorAll('.sheet-out')].map(s => [...s.querySelectorAll('.kt')].map(k => k.textContent)),
        imgs: [...document.images].map(i => ({ ok: i.complete && i.naturalWidth > 0, len: i.src.length })) }))()`).then(d => ({ ...d, bytes: fs.statSync(fileURLToPath(wc.getURL())).size }));
      wc.print = (opts, cb) => { look().then(d => { jobs.push({ opts, ...d }); cb(true, ''); }, (err) => cb(false, String(err))); };
      const toPdf = wc.printToPDF.bind(wc);
      wc.printToPDF = async (opts) => { pdfs.push(await look()); return fakePdf ? Buffer.from('%PDF-1.4\n%%EOF\n') : toPdf(opts); };
      wc.capturePage = async () => { pngs.push(await look()); return nativeImage.createEmpty(); };
    });
  }
});
