// The print screen fills the window under the title row, follows resizing, blocks the menus,
// and Esc in an open dropdown closes only the list.
const { Menu } = require('electron');
const { run } = require('./harness');

const popups = [];

run(async (t, check) => {
  await t.ready();
  await t.js('window.__bohpumApp.cmd("print")');
  await t.waitFor('!!document.querySelector(".print-preview .slot")');
  await t.sleep(300);
  const geo = () => t.js(`(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const m = r('.modal'), tb = r('#titlebar'), sh = r('.print-preview .sheet');
    return { top: Math.round(m.top), left: Math.round(m.left), right: Math.round(m.right), bottom: Math.round(m.bottom), tb: Math.round(tb.bottom), w: innerWidth, h: innerHeight, sheetH: Math.round(sh.height) };
  })()`);
  const g1 = await geo();
  check('Print screen fills the window under the title row', g1.top === g1.tb && g1.left === 0 && g1.right === g1.w && g1.bottom === g1.h, g1);

  await t.click('#menus [data-menu="0"]');
  await t.key('F', ['alt']);
  check('Menus do nothing while the print screen is open', popups.length === 0, { popups: popups.length });

  t.win.unmaximize();
  t.win.setContentSize(1100, 760);
  await t.sleep(900);
  const g2 = await geo();
  check('After resizing it still fills the window, and the preview re-fits', g2.w === 1100 && g2.h === 760 && g2.right === g2.w && g2.bottom === g2.h && g2.sheetH > 50 && g2.sheetH < g1.sheetH, { g1, g2 });

  await t.click('select[data-k="sheet"]');
  const listOpen = await t.js('document.querySelector(\'select[data-k="sheet"]\').matches(":open")');
  await t.key('Escape');
  const st = await t.js('({ list: document.querySelector(\'select[data-k="sheet"]\').matches(":open"), screen: !!document.querySelector(".print-preview") })');
  check('Esc in an open dropdown closes the list, not the print screen', listOpen && !st.list && st.screen, { listOpen, st });
  await t.key('Escape');
}, {
  setup: () => {
    Menu.prototype.popup = function (opts = {}) { popups.push(this); if (opts.callback) setTimeout(opts.callback, 10); };
  }
});
