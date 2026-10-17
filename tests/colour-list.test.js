// Colour buttons open a Publisher-2010-style colour list: No Fill, Theme Colours (10 + five shades each), Standard
// Colours, Recent Colours, More Colours… and Sample Colour (pick from the screen).
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const ui = await t.js(`({ inputs: document.querySelectorAll('#props input[type=color], #textbar input[type=color]').length, buttons: document.querySelectorAll('#props .cbtn').length, tb: !!document.querySelector('#textbar .cbtn#tb-color') })`);
  check('Colour pickers are swatch buttons (side panel and text bar)', ui.inputs === 0 && ui.buttons >= 1 && ui.tb, ui);

  // select the rectangle text box; its Fill row has a colour button
  await t.js(`(() => { const S = window.__bohpumApp.state; const box = S.doc.pages[0].objects.find(o => o.type === 'box' && o.html); window.__bohpumApp.startEditing(box.id); window.__bohpumApp.finishEditing(); window.__testBox = box.id; })()`);
  const mark = () => t.js(`(() => { const r = [...document.querySelectorAll('#props .prow')].find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Fill'); r.querySelector('.cbtn').setAttribute('data-test', 'fill'); })()`);
  const box = () => t.js(`(() => { const S = window.__bohpumApp.state, o = S.doc.pages[0].objects.find(o => o.id === window.__testBox); const b = document.querySelector('[data-test="fill"]'); return { fill: o.fill, color: o.color, x: o.x, y: o.y, sel: S.sel.size, open: !!document.getElementById('colorpop'), btn: b && { cls: b.querySelector('i').className, bg: getComputedStyle(b.querySelector('i')).backgroundColor } }; })()`);
  const pop = () => t.js(`(() => { const p = document.getElementById('colorpop'); if (!p) return null; const g = (k) => p.querySelector('.cgrid.' + k); return { swatches: g('theme').querySelectorAll('.sw').length, std: g('std').querySelectorAll('.sw').length, caps: [...p.querySelectorAll('.ccap')].map(c => c.textContent), sample: !!p.querySelector('[data-sample]'), third: [...p.querySelectorAll('.sw')][11].dataset.c, none: p.querySelector('[data-c="none"]') ? p.querySelector('[data-c="none"]').textContent.trim() : null, more: !!p.querySelector('[data-more]'), on: (p.querySelector('.sw.on') || {}).dataset ? p.querySelector('.sw.on') && p.querySelector('.sw.on').dataset.c : null, recent: g('recent') ? [...g('recent').querySelectorAll('.sw')].map(s => s.dataset.c) : [], focus: document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.c : null }; })()`);

  await mark();
  await t.click('[data-test="fill"]');
  const p1 = await pop();
  check('Fill opens the list: No Fill, Theme Colours (60), Standard Colours (10), More Colours…, Sample Colour',
    p1 && p1.swatches === 60 && p1.std === 10 && p1.caps.join('|') === 'Theme Colours|Standard Colours' && p1.none === 'No Fill' && p1.more && p1.sample, p1);
  const shades = await t.js(`(() => { const sw = (name) => document.querySelector('#colorpop .sw[title="' + name + '"]'); const c = (name) => sw(name) && sw(name).dataset.c;
    const cols = [...document.querySelectorAll('#colorpop .cgrid.theme .sw')].map(s => s.getBoundingClientRect());
    return { b80: c('Blue, Accent 1, Lighter 80%'), b50: c('Blue, Accent 1, Darker 50%'), k50: c('Black, Text 1, Lighter 50%'), w5: c('White, Background 1, Darker 5%'), o80: c('Orange, Accent 2, Lighter 80%'), o25: c('Orange, Accent 2, Darker 25%'),
      strip: Math.abs(cols[10].bottom - cols[20].top) < 0.5 && Math.abs(cols[40].bottom - cols[50].top) < 0.5, gap: cols[10].top - cols[0].bottom }; })()`);
  const near = (a, b) => !!a && [1, 3, 5].every(i => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3);
  check('Shades match Office (e.g. Blue, Accent 1, Lighter 80% = #d9e2f3) and carry the Office names',
    near(shades.b80, '#d9e2f3') && near(shades.b50, '#203864') && near(shades.k50, '#7f7f7f') && near(shades.w5, '#f2f2f2') && near(shades.o80, '#fbe5d6') && near(shades.o25, '#c55a11'), shades);
  check('Each colour stands apart; its five shades are joined into one strip', shades.strip && shades.gap >= 4, shades);

  await t.click('#colorpop .sw[data-c="#ff0000"]');
  await mark();
  const b1 = await box();
  check('Picking red fills the box red, closes the list, shows red on the button', b1.fill === '#ff0000' && !b1.open && b1.btn.bg === 'rgb(255, 0, 0)', b1);

  await t.click('[data-test="fill"]');
  const p2 = await pop();
  check('Reopened: red is outlined and listed under Recent Colours', p2 && p2.on === '#ff0000' && p2.recent[0] === '#ff0000' && p2.caps.includes('Recent Colours'), p2);

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
  check('Keyboard: Enter opens on the first colour, arrows move (Down = the shade under it), Enter picks; the box does not move',
    p3 && p3.focus === '#ffffff' && b3.fill === p3.third && b3.x === b2.x && b3.y === b2.y && !b3.open, { p3, b3 });

  await t.click('[data-test="fill"]');
  await t.key('Escape');
  const b4 = await box();
  check('Esc closes the list without changing anything; the box stays selected', !b4.open && b4.fill === b3.fill && b4.sel === 1, b4);

  await t.click('#tb-color');
  const p5 = await pop();
  await t.click('#colorpop .cgrid.std .sw[data-c="#0070c0"]');
  const b5 = await box();
  check('Text colour: same list without a "No" item; picking blue colours the text', p5 && p5.swatches === 60 && p5.none === null && b5.color === '#0070c0', { p5, b5 });

  // Sample Colour: the list closes and the colour picked on the screen is used (Windows' picker stubbed here)
  await t.js(`window.__RealEye = window.EyeDropper; window.EyeDropper = class { open() { return Promise.resolve({ sRGBHex: '#123456' }); } }; true`);
  await mark();
  await t.click('[data-test="fill"]');
  await t.click('#colorpop [data-sample]');
  await t.sleep(200);
  await mark();
  const b6 = await box();
  check('Sample Colour: the list closes and the picked colour fills the box', b6.fill === '#123456' && !b6.open, b6);

  // the real screen picker opens and waits for a click (Esc / the click go to Windows' picker itself, which a test
  // can't send); the fill stays as it was until a colour is picked. Last: the open picker ends with the test.
  await t.js(`window.EyeDropper = class extends window.__RealEye { open(o) { const p = super.open(o); window.__eye = 'open'; p.then(() => { window.__eye = 'picked'; }, (e) => { window.__eye = 'closed ' + e.name; }); return p; } }; true`);
  await mark();
  await t.click('[data-test="fill"]');
  await t.click('#colorpop [data-sample]');
  await t.sleep(800);
  const e1 = await t.js('window.__eye');
  const b7 = await box();
  // Windows' picker only stays open while Bohpum is the front window: without the focus this check can't run
  if (await t.js('document.hasFocus()') || e1 === 'open') check('The real screen picker opens and waits; the list is closed and nothing changed yet', e1 === 'open' && !b7.open && b7.fill === '#123456', { e1, b7 });
  else console.log('SKIP  The real screen picker (Bohpum was not the front window)');
});
