// Colour buttons open a Publisher-2003-style colour list: No Fill, 40 colours, recent colours, More colours….
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const ui = await t.js(`({ inputs: document.querySelectorAll('#props input[type=color], #textbar input[type=color]').length, buttons: document.querySelectorAll('#props .cbtn').length, tb: !!document.querySelector('#textbar .cbtn#tb-color') })`);
  check('Colour pickers are swatch buttons (side panel and text bar)', ui.inputs === 0 && ui.buttons >= 1 && ui.tb, ui);

  // select the rectangle text box; its Fill row has a colour button
  await t.js(`(() => { const S = window.__bohpumApp.state; const box = S.doc.pages[0].objects.find(o => o.type === 'box' && o.html); window.__bohpumApp.startEditing(box.id); window.__bohpumApp.finishEditing(); window.__testBox = box.id; })()`);
  const mark = () => t.js(`(() => { const r = [...document.querySelectorAll('#props .prow')].find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Fill'); r.querySelector('.cbtn').setAttribute('data-test', 'fill'); })()`);
  const box = () => t.js(`(() => { const S = window.__bohpumApp.state, o = S.doc.pages[0].objects.find(o => o.id === window.__testBox); const b = document.querySelector('[data-test="fill"]'); return { fill: o.fill, color: o.color, x: o.x, y: o.y, sel: S.sel.size, open: !!document.getElementById('colorpop'), btn: b && { cls: b.querySelector('i').className, bg: getComputedStyle(b.querySelector('i')).backgroundColor } }; })()`);
  const pop = () => t.js(`(() => { const p = document.getElementById('colorpop'); if (!p) return null; const grids = p.querySelectorAll('.cgrid'); return { swatches: grids[0].querySelectorAll('.sw').length, none: p.querySelector('[data-c="none"]') ? p.querySelector('[data-c="none"]').textContent.trim() : null, more: !!p.querySelector('[data-more]'), on: (p.querySelector('.sw.on') || {}).dataset ? p.querySelector('.sw.on') && p.querySelector('.sw.on').dataset.c : null, recent: grids[1] ? [...grids[1].querySelectorAll('.sw')].map(s => s.dataset.c) : [], focus: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.c : null }; })()`);

  await mark();
  await t.click('[data-test="fill"]');
  const p1 = await pop();
  check('Fill opens the list: No Fill, 40 colours, More colours…', p1 && p1.swatches === 40 && p1.none === 'No Fill' && p1.more, p1);

  await t.click('#colorpop .sw[data-c="#ff0000"]');
  await mark();
  const b1 = await box();
  check('Picking red fills the box red, closes the list, shows red on the button', b1.fill === '#ff0000' && !b1.open && b1.btn.bg === 'rgb(255, 0, 0)', b1);

  await t.click('[data-test="fill"]');
  const p2 = await pop();
  check('Reopened: red is outlined and listed under Recent colours', p2 && p2.on === '#ff0000' && p2.recent[0] === '#ff0000', p2);

  await t.click('#colorpop [data-c="none"]');
  await mark();
  const b2 = await box();
  check('No Fill removes the fill; the button shows the empty swatch', b2.fill === 'none' && !b2.open && b2.btn.cls === 'none', b2);

  // keyboard: focus the button, Enter opens with the first colour focused, arrows move, Enter picks
  await t.js('document.querySelector(\'[data-test="fill"]\').focus()');
  await t.key('Enter');
  const p3 = await pop();
  await t.key('Right');
  await t.key('Down');
  await t.key('Enter');
  await mark();
  const b3 = await box();
  check('Keyboard: Enter opens, arrows move, Enter picks; the box does not move', p3 && p3.focus === '#000000' && b3.fill === '#ff6600' && b3.x === b2.x && b3.y === b2.y && !b3.open, { p3, b3 });

  await t.click('[data-test="fill"]');
  await t.key('Escape');
  const b4 = await box();
  check('Esc closes the list without changing anything; the box stays selected', !b4.open && b4.fill === '#ff6600' && b4.sel === 1, b4);

  await t.click('#tb-color');
  const p5 = await pop();
  await t.click('#colorpop .sw[data-c="#0000ff"]');
  const b5 = await box();
  check('Text colour: same list without a "No" item; picking blue colours the text', p5 && p5.swatches === 40 && p5.none === null && b5.color === '#0000ff', { p5, b5 });
});
