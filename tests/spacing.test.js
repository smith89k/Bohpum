// Roomier spacing everywhere (toolbar, text bar, side panel, print column, dialogs), without anything
// spilling over sideways or the toolbar wrapping onto a second row.
const { run } = require('./harness');

// every toolbar item overlaps the first item's row (the spacer has no height, so offsetTop can't be used)
const ONE_ROW = `(() => { const rs = [...document.querySelectorAll('#topbar > *')].map(e => e.getBoundingClientRect()), f = rs[0]; return rs.every(r => r.top < f.bottom && r.bottom > f.top); })()`;

run(async (t, check) => {
  t.wc.getPrintersAsync = async () => [{ name: 'Office HP LaserJet', displayName: 'Office HP LaserJet', isDefault: true, description: '', status: 0, options: {} }];
  const px = (sel, prop) => t.js(`parseFloat(getComputedStyle(document.querySelector(${JSON.stringify(sel)})).${prop})`);

  await t.waitFor('!!window.__bohpumApp && !!document.querySelector(".w-main")');
  const welcome = { mainPad: await px('.w-main', 'paddingLeft'), sidePad: await px('.w-side', 'paddingLeft') };
  check('Welcome screen: roomier padding', welcome.mainPad >= 26 && welcome.sidePad >= 20, welcome);

  await t.ready();
  await t.js(`(() => { const S = window.__bohpumApp.state; const box = S.doc.pages[0].objects.find(o => o.type === 'box' && o.html); window.__bohpumApp.startEditing(box.id); window.__bohpumApp.finishEditing(); })()`);
  await t.sleep(300);
  const bars = await t.js(`(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s));
    return { top: parseFloat(cs('#topbar').paddingLeft), group: parseFloat(cs('.tb-group').paddingLeft), text: parseFloat(cs('#textbar').paddingTop), textGap: parseFloat(cs('#textbar').columnGap), oneRow: ${ONE_ROW} };
  })()`);
  check('Toolbar and text bar: roomier padding, toolbar still one row', bars.top >= 14 && bars.group >= 10 && bars.text >= 7 && bars.textGap >= 6 && bars.oneRow, bars);

  const props = await t.js(`(() => {
    const p = document.getElementById('props'), s = getComputedStyle(p.querySelector('.psec'));
    return { pad: parseFloat(s.paddingLeft), rowGap: parseFloat(getComputedStyle(p.querySelector('.prow')).columnGap), overflow: p.scrollWidth - p.clientWidth };
  })()`);
  check('Side panel: roomier sections and rows, nothing spills sideways', props.pad >= 18 && props.rowGap >= 10 && props.overflow <= 0, props);

  t.win.unmaximize();
  t.win.setContentSize(1400, 900);
  await t.sleep(800);
  const narrow = await t.js(ONE_ROW);
  check('At 1400 px wide the toolbar still fits on one row', narrow, { narrow });

  await t.js('window.__bohpumApp.cmd("print")');
  await t.waitFor('!!document.querySelector(".print-preview .slot")');
  const pr = await t.js(`(() => {
    const side = document.querySelector('.print-side'), bigs = [...side.querySelectorAll('select.big')].map(s => s.getBoundingClientRect());
    const gaps = []; for (let i = 1; i < bigs.length; i++) if (bigs[i].top - bigs[i - 1].bottom < 40) gaps.push(Math.round(bigs[i].top - bigs[i - 1].bottom));
    return { pad: parseFloat(getComputedStyle(side).paddingLeft), box: parseFloat(getComputedStyle(side.querySelector('.pr-box')).paddingLeft), gaps, overflow: side.scrollWidth - side.clientWidth };
  })()`);
  check('Print column: roomier padding and gaps between dropdowns, nothing spills sideways',
    pr.pad >= 22 && pr.box >= 14 && pr.gaps.length && pr.gaps.every(g => g >= 10) && pr.overflow <= 0, pr);
  await t.key('Escape');

  await t.js('window.__bohpumApp.cmd("new")');
  await t.waitFor('!!document.querySelector(".modal .preset-grid")');
  const dlg = await t.js(`(() => {
    const cs = (s) => getComputedStyle(document.querySelector(s)), m = document.querySelector('.modal').getBoundingClientRect();
    return { head: parseFloat(cs('.modal-h').paddingLeft), body: parseFloat(cs('.modal-b').paddingTop), foot: parseFloat(cs('.modal-f').paddingLeft), grid: parseFloat(cs('.preset-grid').columnGap), fits: m.top >= 0 && m.bottom <= innerHeight };
  })()`);
  check('Dialogs: roomier header, body, footer and tiles; still fit the window', dlg.head >= 24 && dlg.body >= 20 && dlg.foot >= 24 && dlg.grid >= 12 && dlg.fits, dlg);
  await t.key('Escape');
});
