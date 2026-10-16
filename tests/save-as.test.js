// Save As offers PDF; a PDF is a copy (the publication keeps its own file); Export PDF is gone.
const { dialog, shell, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

const dialogs = [], opened = [];
let answers = [];

run(async (t, check) => {
  await t.ready();
  await t.js('window.__bohpumApp.cmd("page-add")'); // 2 pages, unsaved
  const state = () => t.js('(() => { const S = window.__bohpumApp.state; return { path: S.path, dirty: S.dirty, name: S.doc.name, pages: S.doc.pages.length }; })()');
  const pdf = path.join(t.ctx.tmp, 'card.pdf'), bpum = path.join(t.ctx.tmp, 'card.bpum'), bpum2 = path.join(t.ctx.tmp, 'again.bpum');

  answers = [pdf];
  await t.js('window.__bohpumApp.cmd("save-as")');
  const st1 = await state();
  const bytes = fs.existsSync(pdf) ? fs.readFileSync(pdf) : null;
  const pdfPages = bytes ? (bytes.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length : 0;
  check('Save As offers Bohpum publication and PDF',
    dialogs[0] && dialogs[0].filters.map(f => `${f.name}:${f.extensions.join()}`).join('|') === 'Bohpum publication:bpum|PDF:pdf', dialogs[0]);
  check('PDF written, one page per publication page', bytes && bytes.slice(0, 4).toString() === '%PDF' && pdfPages === st1.pages, { exists: !!bytes, pdfPages, pages: st1.pages });
  check('PDF leaves the publication as it was', st1.path === null && st1.dirty === true && st1.name === 'test-shapes', st1);
  check('PDF is opened for viewing', opened.includes(pdf), opened);

  answers = [bpum];
  await t.js('window.__bohpumApp.cmd("save-as")');
  const st2 = await state();
  check('Save As .bpum saves the publication', st2.path === bpum && st2.dirty === false && st2.name === 'card' && fs.existsSync(bpum), st2);

  answers = [bpum2];
  await t.js('window.__bohpumApp.state.path = null');
  await t.js('window.__bohpumApp.cmd("save")');
  check('Plain Save offers only Bohpum publication', dialogs[2] && dialogs[2].filters.length === 1 && dialogs[2].filters[0].extensions.join() === 'bpum', dialogs[2]);

  const button = await t.js('!!document.querySelector(\'[data-cmd="export-pdf"]\')');
  const labels = Menu.getApplicationMenu().items[0].submenu.items.map(i => i.label);
  check('Export PDF is gone from the toolbar and the File menu', !button && !labels.some(l => /export pdf/i.test(l)), { button, labels });
}, {
  setup: () => {
    dialog.showSaveDialog = async (_win, opts) => { dialogs.push(opts); const p = answers.shift(); return p ? { canceled: false, filePath: p } : { canceled: true }; };
    shell.openPath = async (p) => { opened.push(p); return ''; };
  }
});
