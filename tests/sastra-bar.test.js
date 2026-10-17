// Like Sastra PDF: New / Open / Save / Print as icon + word buttons at the start of the toolbar;
// Maximize (F) hides the side panels and status bar; Theme cycles System → Light → Dark, with no
// white surfaces left in dark except paper and colour swatches.
const { dialog, nativeTheme, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

const calls = [];

run(async (t, check) => {
  t.wc.getPrintersAsync = async () => [{ name: 'Office HP', displayName: 'Office HP', isDefault: true, description: '', status: 0, options: {} }];
  await t.ready();

  // ---- New / Open / Save / Print
  const bar = await t.js(`(() => {
    const first = [...document.querySelectorAll('#topbar > .tb-group:first-child .btn')].map(b => ({ cmd: b.dataset.cmd, label: (b.querySelector('.lbl') || {}).textContent, icon: !!b.querySelector('svg'), primary: b.classList.contains('primary') }));
    const right = [...document.querySelectorAll('#topbar > .spacer ~ .tb-group .btn')].map(b => b.id);
    return { first, right };
  })()`);
  check('Toolbar starts with New, Open, Save, Print (icon + word, none green)',
    bar.first.map(b => `${b.cmd}:${b.label}`).join(' ') === 'new:New open:Open save:Save print:Print' && bar.first.every(b => b.icon && !b.primary), bar);
  check('Right end of the toolbar: Maximize, then Theme', bar.right.join(' ') === 'b-max b-theme', bar);

  await t.click('[data-cmd="open"]');
  await t.click('[data-cmd="save"]');
  await t.click('[data-cmd="print"]');
  const printOpen = await t.js('!!document.querySelector(".print-preview")');
  await t.key('Escape');
  check('Open, Save and Print buttons do their job', calls.join(' ') === 'open save' && printOpen, { calls, printOpen });

  // ---- Maximize
  const geo = () => t.js(`(() => {
    const shown = (s) => document.querySelector(s).getClientRects().length > 0, b = document.getElementById('b-max');
    return { pages: shown('#pages'), props: shown('#props'), status: shown('#status'), ws: Math.round(document.getElementById('workspace-wrap').getBoundingClientRect().width), w: innerWidth,
      label: b.querySelector('.lbl').textContent, on: b.classList.contains('on'), zoom: window.__bohpumApp.state.zoom };
  })()`);
  const m0 = await geo();
  await t.click('#b-max');
  await t.sleep(400);
  const m1 = await geo();
  check('Maximize hides Pages, side panel and status bar; the page area fills the width and re-fits',
    !m1.pages && !m1.props && !m1.status && m1.ws === m1.w && m1.label === 'Restore' && m1.on && m1.zoom !== m0.zoom, { m0, m1 });
  await t.key('F');
  await t.sleep(400);
  const m2 = await geo();
  check('F restores the panels', m2.pages && m2.props && m2.status && m2.label === 'Maximize' && !m2.on, m2);
  const view = Menu.getApplicationMenu().items[4].submenu.items.map(i => i.label);
  check('View menu has Maximize Page Area and Theme', view.includes('Maximize Page Area') && view.includes('Theme'), view);

  // ---- Theme
  const th = () => t.js(`(() => { const cs = getComputedStyle(document.documentElement), b = document.getElementById('b-theme');
    return { chrome: cs.getPropertyValue('--chrome').trim(), title: b.title, toast: document.getElementById('toast').textContent }; })()`);
  const radio = () => ['system', 'light', 'dark'].find(k => Menu.getApplicationMenu().getMenuItemById('theme-' + k).checked);
  const t0 = await th();
  await t.click('#b-theme'); await t.sleep(500);
  const t1 = await th(), src1 = nativeTheme.themeSource, r1 = radio();
  await t.click('#b-theme'); await t.sleep(500);
  const t2 = await th(), src2 = nativeTheme.themeSource, r2 = radio();
  const saved = JSON.parse(fs.readFileSync(path.join(t.ctx.userData, 'settings.json'), 'utf8')).theme;
  check('Theme button: System → Light → Dark, View > Theme and the saved setting follow',
    /^Theme: System/.test(t0.title) && src1 === 'light' && r1 === 'light' && t1.toast === 'Theme: Light' &&
    src2 === 'dark' && r2 === 'dark' && t2.toast === 'Theme: Dark' && t2.chrome === '#1f1d1b' && saved === 'dark', { t0, t1, t2, src1, src2, r1, r2, saved });

  // ---- dark: no white surfaces except paper and colour swatches
  const PAPER = '.kpage, .kpage *, .pthumb .tw, .pthumb .tw *, .handle, .cbtn i, #colorpop .sw, .sheet, .sheet *, .preset .pv div, i.none';
  const whites = () => t.js(`[...document.querySelectorAll('body *')].filter(e => e.getClientRects().length && !e.matches(${JSON.stringify(PAPER)}) && getComputedStyle(e).backgroundColor === 'rgb(255, 255, 255)').map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).join('.') : '')).slice(0, 12)`);
  await t.js(`(() => { const S = window.__bohpumApp.state; const box = S.doc.pages[0].objects.find(o => o.type === 'box' && o.html); window.__bohpumApp.startEditing(box.id); window.__bohpumApp.finishEditing(); })()`);
  await t.sleep(300);
  const w1 = await whites();
  await t.click('#tb-color');
  const w2 = await whites();
  await t.key('Escape');
  await t.js('window.__bohpumApp.cmd("print")'); await t.waitFor('!!document.querySelector(".print-preview .slot")');
  const w3 = await whites();
  const pad = await t.js(`(() => { const p = document.getElementById('pd-pos'), b = p.querySelector('button:not(.on)'); return { pad: getComputedStyle(p).backgroundColor, cell: getComputedStyle(b).backgroundColor }; })()`);
  check('Dark: the 3×3 position squares stand out from their box', pad.pad !== pad.cell, pad);
  await t.key('Escape');
  await t.js('window.__bohpumApp.cmd("new")'); await t.waitFor('!!document.querySelector(".modal .preset-grid")');
  const w4 = await whites();
  await t.key('Escape');
  check('Dark: no white surfaces left (editor, colour list, print screen, dialogs)', !w1.length && !w2.length && !w3.length && !w4.length, { w1, w2, w3, w4 });

  await t.click('#b-theme'); await t.sleep(300);
  check('Third click goes back to System', nativeTheme.themeSource === 'system' && radio() === 'system', { src: nativeTheme.themeSource });
}, {
  setup: () => {
    dialog.showOpenDialog = async () => { calls.push('open'); return { canceled: true, filePaths: [] }; };
    dialog.showSaveDialog = async () => { calls.push('save'); return { canceled: true }; };
  }
});
