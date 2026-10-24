// Print preview: no line around the page on the sheet (it never prints, and a text box with no border would look boxed);
// a light box of dots only while the mouse is over the page and while it is dragged.
const { run } = require('./harness');

run(async (t, check) => {
  t.wc.getPrintersAsync = async () => [{ name: 'Office HP', displayName: 'Office HP', isDefault: true, description: '', status: 0, options: {} }];
  await t.ready();
  await t.js('window.__bohpumApp.cmd("print")');
  await t.waitFor('!!document.querySelector(".print-preview .slot")');
  await t.js(`(() => { const s = document.querySelector('select[data-k="mode"]'); if (s.value !== 'single') { s.value = 'single'; s.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  await t.waitFor('!!document.querySelector(".print-preview .slot.drag")');
  await t.sleep(300);

  const look = () => t.js(`(() => { const slots = [...document.querySelectorAll('.print-preview .slot')], s = getComputedStyle(slots[0]);
    const a = /rgba\\([^)]*,\\s*([\\d.]+)\\)/.exec(s.outlineColor);
    return { style: s.outlineStyle, light: !!a && +a[1] <= 0.5, moving: slots[0].classList.contains('moving'), others: slots.slice(1).map(e => getComputedStyle(e).outlineStyle) }; })()`);
  const away = async () => { t.wc.sendInputEvent({ type: 'mouseMove', x: 5, y: 300 }); await t.sleep(250); };

  await away();
  const idle = await look();
  const c = await t.center('.print-preview .slot');
  t.wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y }); await t.sleep(250);
  const hover = await look();
  check('No line around the page; a light dotted box under the mouse', idle.style === 'none' && hover.style === 'dotted' && hover.light, { idle, hover });

  t.wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) { t.wc.sendInputEvent({ type: 'mouseMove', x: c.x + i * 6, y: c.y + i * 4, modifiers: ['leftButtonDown'] }); await t.sleep(25); }
  const mid = await look();
  t.wc.sendInputEvent({ type: 'mouseUp', x: c.x + 48, y: c.y + 32, button: 'left', clickCount: 1 }); await t.sleep(200);
  await away();
  const after = await look();
  check('The light box while it is dragged; gone after', mid.style === 'dotted' && mid.light && mid.moving && after.style === 'none' && !after.moving, { mid, after });

  // many per sheet: no lines around the pages either
  await t.js(`(() => { const s = document.querySelector('select[data-k="mode"]'); s.value = 'grid'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await t.sleep(300); await away();
  const grid = await look();
  check('Many per sheet: no lines around the pages', grid.style === 'none' && grid.others.length > 0 && grid.others.every(s => s === 'none'), grid);
  await t.key('Escape');
});
