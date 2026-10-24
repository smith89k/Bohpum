// Printing a list: Who (everyone ticked, the person showing, no one), people side by side or a full sheet each, the
// problems box before output, PDFs that wait for every photo, File › Save As PDF and Export PNG, 300 people.
// Who is never saved with the publication.
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
  saves = [f('card.bpum')];
  await t.js('(window.__bohpumApp.cmd("save-as"), 1)');
  await t.waitFor('!window.__bohpumApp.state.dirty');

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

  // Who is for this time only
  await set('who', 'one');
  await t.key('Escape');
  await t.waitFor('!document.querySelector(".print-preview")');
  const after = await app('({ dirty: S.dirty, print: S.doc.print })');
  await openPrint();
  const again = await t.js('document.querySelector(\'#pd-side [data-k="who"]\').value');
  check('Who is not saved: Everyone ticked again, the publication unchanged', !after.dirty && !(after.print && 'who' in after.print) && again === 'all', { after, again });

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
  check('copies come out collated', jobs[0].opts.collate === true, jobs[0].opts);

  // Save as PDF from the print screen: the hidden window waits for every photo
  await openPrint();
  saves = [f('everyone.pdf')];
  await t.js('(document.querySelector(".modal-f [data-a=\\"pdf\\"]").click(), 1)');
  await t.waitFor('!!document.querySelector("#modal-root .modal.problems")');
  await press('Print anyway');
  await until(() => pdfs.length === 1, 30000).catch(() => {});
  const p0 = pdfs[0] || {};
  check('PDF waits for every photo', p0.imgs && p0.imgs.length === 2 && p0.imgs.every(i => i.ok && i.decoded) && J(p0.sheets) === J([[P1, P2, P3]]), p0.imgs);

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

  // File › Save As PDF: a failed build says so; a second one while the first is building is ignored
  const toastText = () => t.js('document.getElementById("toast").textContent');
  await t.js(`(Object.defineProperty(document.fonts, 'ready', { configurable: true, get: () => Promise.reject(new Error('no fonts today')) }), 1)`);
  saves = [f('bad.pdf')];
  await t.js('(window.__bohpumApp.cmd("save-as"), 1)');
  await t.waitFor('document.getElementById("toast").textContent.startsWith("Could not save")').catch(() => {});
  const failed = { toast: await toastText(), pdfs: pdfs.length };
  await t.js(`(Object.defineProperty(document.fonts, 'ready', { configurable: true, get: () => new Promise(r => { window.__go = r; }) }), 1)`);
  saves = [f('one.pdf'), f('two.pdf')];
  await t.js('(window.__bohpumApp.cmd("save-as"), 1)');
  await t.sleep(500);
  await t.js('(window.__bohpumApp.cmd("save-as"), 1)');
  await t.sleep(500);
  const busy = await toastText();
  await t.js('(delete document.fonts.ready, window.__go(), 1)');
  await t.waitFor('!!document.querySelector("#modal-root .modal.problems")').catch(() => {});
  await press('Print anyway').catch(() => {});
  await until(() => pdfs.length === 3 && fs.existsSync(f('one.pdf')), 30000).catch(() => {});
  await t.sleep(800);
  check('Save As PDF: a failed build says so, a second one waits its turn', failed.toast === 'Could not save the PDF: no fonts today' && failed.pdfs === 2 &&
    busy === 'A PDF is still being prepared.' && pdfs.length === 3 && fs.existsSync(f('one.pdf')) && !fs.existsSync(f('two.pdf')), { failed, busy, pdfs: pdfs.length });

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
  // Save as PDF: "Preparing the pages…" shows (a frame is drawn) before the pages are put together
  fakePdf = true;
  saves = [f('many.pdf')];
  const before = pdfs.length;
  await t.js(`(() => { const g = window.__out = { max: 0, last: performance.now() }; window.__tick = setInterval(() => { const n = performance.now(); g.max = Math.max(g.max, n - g.last); g.last = n; }, 50);
    const info = document.getElementById('pd-info');
    new MutationObserver(() => { if (info.textContent === 'Preparing the pages…' && g.shown == null) { g.shown = Math.max(g.max, performance.now() - g.last); requestAnimationFrame(() => { g.painted = performance.now(); }); } })
      .observe(info, { childList: true, characterData: true, subtree: true });
    new MutationObserver(() => { if (!document.querySelector('.print-preview') && g.closed == null) g.closed = performance.now(); }).observe(document.getElementById('modal-root'), { childList: true });
    document.querySelector('.modal-f [data-a="pdf"]').click(); return 1; })()`);
  await until(() => pdfs.length === before + 1, 60000).catch(() => {});
  const out = await t.js('(() => { const g = window.__out; clearInterval(window.__tick); return { shown: g.shown == null ? null : Math.round(g.shown), painted: g.painted != null && g.closed != null && g.painted < g.closed }; })()');
  check('300 people: Save as PDF says Preparing the pages… at once', out.shown != null && out.shown < 1000 && out.painted && pdfs.length === before + 1 && pdfs[before].sheets.length === 30, out);

  // R10: a 1 MB picture in the design and a small photo each: the picture goes into the file once, and every card shows it
  for (let i = 0; i < 300; i++) fs.writeFileSync(f(`p${i}.png`), nativeImage.createFromBitmap(Buffer.alloc(40 * 30 * 4, i % 256), { width: 40, height: 30 }).toPNG());
  makeXlsx(f('cards.xlsx'), { sheets: [{ name: 'S', rows: [['Name', 'Photo'], ...Array.from({ length: 300 }, (_, i) => ['Card ' + (i + 1), f(`p${i}.png`)])] }] });
  picks = [f('cards.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list && window.__bohpumApp.state.mail.list.rows[0][0] === "Card 1"');
  const logo = 'data:image/png;base64,' + nativeImage.createFromBitmap(crypto.randomBytes(600 * 450 * 4), { width: 600, height: 450 }).toPNG().toString('base64');
  await t.js(`(async () => { const A = window.__bohpumApp, S = A.state, { makeObject } = await import('./model.js');
    S.doc.pages[0].objects.push(makeObject('image', { x: 60, y: 30, w: 20, h: 15, src: ${J(logo)} })); A.cmd('toggle-master'); A.cmd('toggle-master'); return 1; })()`);
  saves = [f('cards.pdf')];
  const n0 = pdfs.length;
  await t.js('(window.__bohpumApp.cmd("save-as"), 1)');
  await until(() => pdfs.length === n0 + 1, 120000).catch(() => {});
  const q = pdfs[n0], r10 = q ? { bytes: q.bytes, sheets: q.sheets.length, logos: q.imgs.filter(i => i.len === logo.length && i.ok).length, all: q.imgs.every(i => i.ok && i.decoded), logo: logo.length } : null;
  check('a picture used on every card is in the file once', r10 && r10.logo > 1e6 && r10.bytes < 5e6 && r10.sheets === 300 && r10.logos === 300 && r10.all, r10);

  // R14: 300 different 800 px photos in the 25 × 30 mm frame come as 355 px (30 mm at 300 dpi), so the file stays small
  for (let i = 0; i < 300; i++) {
    const b = Buffer.alloc(800 * 600 * 4);
    for (let p = 0, k = 0; p < 800 * 600; p++, k += 4) { const x = p % 800, y = (p / 800) | 0; b[k] = (x ^ y) + i; b[k + 1] = (x * 3 + y + i * 7) & 255; b[k + 2] = (y * 2 - x) & 255; b[k + 3] = 255; }
    fs.writeFileSync(f(`face${i}.jpg`), nativeImage.createFromBitmap(b, { width: 800, height: 600 }).toJPEG(90));
  }
  makeXlsx(f('faces.xlsx'), { sheets: [{ name: 'S', rows: [['Name', 'Photo'], ...Array.from({ length: 300 }, (_, i) => ['Face ' + (i + 1), f(`face${i}.jpg`)])] }] });
  picks = [f('faces.xlsx')];
  await t.js('(window.__bohpumApp.cmd("mail-select"), 1)');
  await t.waitFor('window.__bohpumApp.state.mail && window.__bohpumApp.state.mail.list && window.__bohpumApp.state.mail.list.rows[0][0] === "Face 1"');
  saves = [f('faces.pdf')];
  const n1 = pdfs.length;
  await t.js('(window.__bohpumApp.cmd("save-as"), 1)');
  await until(() => pdfs.length === n1 + 1, 180000).catch(() => {});
  const fq = pdfs[n1], faces = fq && fq.imgs.filter(i => i.len !== logo.length);
  const sides = faces ? [...new Set(faces.map(i => Math.max(i.w, i.h)))] : null;
  const r14 = fq && { bytes: fq.bytes, sheets: fq.sheets.length, faces: faces.length, distinct: new Set(faces.map(i => i.len + ' ' + i.w)).size, sides, all: faces.every(i => i.ok && i.decoded) };
  check('300 different photos: each 355 px on its long side, the file under 40 MB', r14 && r14.sheets === 300 && r14.faces === 300 && J(r14.sides) === '[355]' && r14.bytes < 40e6 && r14.all, r14);
}, {
  timeout: 480000,
  setup: () => {
    dialog.showOpenDialog = async () => { const p = picks.shift(); return p ? { canceled: false, filePaths: [p] } : { canceled: true, filePaths: [] }; };
    dialog.showSaveDialog = async () => { const p = saves.shift(); return p ? { canceled: false, filePath: p } : { canceled: true }; };
    shell.openPath = async () => '';
    let seen = 0;
    app.on('browser-window-created', (_e, w) => {
      if (seen++ === 0) return; // the editor window
      // hidden print / PDF / PNG windows: look at what they would put out
      const wc = w.webContents;
      // every picture whose decode() has finished (main.js waits for them before printing)
      wc.on('dom-ready', () => wc.executeJavaScript(`(() => { const d = HTMLImageElement.prototype.decode, done = window.__decoded = new WeakSet();
        HTMLImageElement.prototype.decode = function () { return d.call(this).then((v) => { done.add(this); return v; }); }; })()`).catch(() => {}));
      const look = () => wc.executeJavaScript(`(() => ({
        sheets: [...document.querySelectorAll('.sheet-out')].map(s => [...s.querySelectorAll('.kt')].map(k => k.textContent)),
        imgs: [...document.images].map(i => ({ ok: i.complete && i.naturalWidth > 0, decoded: !!window.__decoded && window.__decoded.has(i), len: i.src.length, w: i.naturalWidth, h: i.naturalHeight })) }))()`).then(d => ({ ...d, bytes: fs.statSync(fileURLToPath(wc.getURL())).size }));
      wc.print = (opts, cb) => { look().then(d => { jobs.push({ opts, ...d }); cb(true, ''); }, (err) => cb(false, String(err))); };
      const toPdf = wc.printToPDF.bind(wc);
      wc.printToPDF = async (opts) => { pdfs.push(await look()); return fakePdf ? Buffer.from('%PDF-1.4\n%%EOF\n') : toPdf(opts); };
      wc.capturePage = async () => { pngs.push(await look()); return nativeImage.createEmpty(); };
    });
  }
});
