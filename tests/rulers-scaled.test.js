// On a scaled screen (Windows display 125 %), the rulers stay inside the page area: they used to grow at every
// redraw (their sharper drawing size counted as layout size) and pushed the ruler and scrollbar over the status bar.
const { app } = require('electron');
const { run } = require('./harness');
app.commandLine.appendSwitch('force-device-scale-factor', '1.25');

run(async (t, check) => {
  await t.ready();
  const box = () => t.js(`(() => { const r = (s) => document.querySelector(s).getBoundingClientRect();
    const wrap = r('#workspace-wrap'), rv = r('#ruler-v'), rh = r('#ruler-h'), ws = r('#workspace'), st = r('#status');
    return { dpr: devicePixelRatio, wrapH: wrap.height, wrapW: wrap.width, rvH: rv.height, rhW: rh.width, wsBottom: ws.bottom, wsRight: ws.right, wrapRight: wrap.right, statusTop: st.top }; })()`);
  for (let i = 0; i < 12; i++) await t.js('window.__bohpumApp.cmd("page-add")'); // each one redraws the rulers
  await t.js('window.__bohpumApp.cmd("zoom-in")'); await t.sleep(500);
  const b = await box();
  check('The screen is scaled 125 %', b.dpr === 1.25, b.dpr);
  check('The side ruler is as tall as the page area under the top ruler', Math.abs(b.rvH - (b.wrapH - 22)) < 1, b);
  check('The top ruler is as wide as the page area right of the side ruler', Math.abs(b.rhW - (b.wrapW - 22)) < 1, b);
  check('The page area and its scrollbars end above the status bar and before the right panel', b.wsBottom <= b.statusTop + 0.5 && b.wsRight <= b.wrapRight + 0.5, b);
});
