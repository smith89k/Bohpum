// Print preview zoom, like Publisher: a zoom bar (− slider + % Fit sheet), Ctrl + wheel on the spot under the mouse,
// Ctrl+0 / Ctrl++ / Ctrl+−, Space + drag and the middle button move the view; the zoom stays while settings change;
// page outlines stay 1 px; the card can still be dragged when zoomed.
const { run } = require('./harness');

run(async (t, check) => {
  t.wc.getPrintersAsync = async () => [{ name: 'Office HP', displayName: 'Office HP', isDefault: true, description: '', status: 0, options: {} }];
  await t.ready();
  await t.js('window.__bohpumApp.cmd("print")');
  await t.waitFor('!!document.querySelector(".print-preview .slot")');
  await t.click('select[data-k="mode"]'); await t.click('select[data-k="mode"] option[value="grid"]');
  await t.sleep(300);

  const z = () => t.js(`(() => { const s = document.querySelector('.pv-scroll'), sh = s.querySelector('.sheet'), bar = document.querySelector('.pv-zoom'), slot = sh.querySelector('.slot');
    const zoom = parseFloat(sh.style.zoom), r = slot.getBoundingClientRect();
    return { zoom, pct: bar.querySelector('.pct').textContent, fitOn: bar.querySelector('[data-z="fit"]').classList.contains('on'), slider: +bar.querySelector('input').value,
      scrollX: s.scrollWidth > s.clientWidth + 1, scrollY: s.scrollHeight > s.clientHeight + 1, left: s.scrollLeft, top: s.scrollTop,
      outline: parseFloat(getComputedStyle(slot).outlineWidth) * zoom, slot: { x: r.left, y: r.top } }; })()`);
  const z0 = await z();
  check('The preview opens fitted to the sheet: zoom bar with Fit sheet on, no scroll bars',
    z0.fitOn && z0.pct === Math.round(z0.zoom * 100) + '%' && !z0.scrollX && !z0.scrollY, z0);

  // Ctrl + wheel a little right of and below the sheet's middle: zooms in, and that spot of the sheet stays under the mouse
  const spot = () => t.js(`(() => { const r = document.querySelector('.pv-scroll .sheet').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
  const s0 = await spot(), at = { x: Math.round(s0.l + s0.w * 0.6), y: Math.round(s0.t + s0.h * 0.55) };
  t.wc.sendInputEvent({ type: 'mouseMove', x: at.x, y: at.y });
  for (let i = 0; i < 6; i++) { t.wc.sendInputEvent({ type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: 120, wheelTicksY: 1, canScroll: true, modifiers: ['control'] }); await t.sleep(120); }
  await t.sleep(300);
  const z1 = await z();
  check('Ctrl + wheel zooms in; scroll bars appear', z1.zoom > z0.zoom * 2.5 && !z1.fitOn && z1.scrollX && z1.scrollY, { z0: z0.zoom, z1 });
  // once the sheet is bigger than the view, the spot under the mouse stays put (while it fits, it stays centred)
  const s1 = await spot();
  t.wc.sendInputEvent({ type: 'mouseWheel', x: at.x, y: at.y, deltaX: 0, deltaY: 120, wheelTicksY: 1, canScroll: true, modifiers: ['control'] }); await t.sleep(300);
  const s2 = await spot(), fx = [(at.x - s1.l) / s1.w, (at.x - s2.l) / s2.w], fy = [(at.y - s1.t) / s1.h, (at.y - s2.t) / s2.h];
  check('Ctrl + wheel zooms on the spot under the mouse (it stays put)', s2.w > s1.w * 1.1 && Math.abs(fx[0] - fx[1]) < 0.005 && Math.abs(fy[0] - fy[1]) < 0.005, { fx, fy });
  const z1b = await z();
  check('Page outlines stay 1 px when zoomed', Math.abs(z0.outline - 1) < 0.05 && Math.abs(z1b.outline - 1) < 0.05, { z0: z0.outline, z1: z1b.outline });

  await t.click('.pv-zoom [data-z="in"]');
  const z2 = await z();
  check('+ zooms in 25 %; the % and the slider follow', Math.abs(z2.zoom / z1b.zoom - 1.25) < 0.01 && z2.pct === Math.round(z2.zoom * 100) + '%' && z2.slider > z1b.slider, { z1b, z2 });

  // a new gap: the preview is redrawn, the zoom and the spot stay
  await t.js(`(() => { const i = document.querySelector('[data-k="gapX"]'); i.value = 4; i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
  await t.sleep(300);
  const z3 = await z();
  check('Changing the gap keeps the zoom and the place you were looking at', Math.abs(z3.zoom - z2.zoom) < 0.001 && Math.abs(z3.left - z2.left) < 30 && Math.abs(z3.top - z2.top) < 30, { z2, z3 });

  // Space + drag moves the view (it does not move a card)
  const c = await t.center('.pv-scroll');
  t.wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y });
  await t.sleep(100);
  t.wc.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  await t.sleep(100);
  const grab = await t.js(`document.querySelector('.pv-scroll').classList.contains('grab')`);
  t.wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 6; i++) { t.wc.sendInputEvent({ type: 'mouseMove', x: c.x - 15 * i, y: c.y - 10 * i, modifiers: ['leftButtonDown'] }); await t.sleep(30); }
  t.wc.sendInputEvent({ type: 'mouseUp', x: c.x - 90, y: c.y - 60, button: 'left', clickCount: 1 });
  t.wc.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
  await t.sleep(200);
  const z4 = await z();
  check('Space + drag moves the view', grab && Math.abs(z4.left - z3.left - 90) < 4 && Math.abs(z4.top - z3.top - 60) < 4, { grab, z3: [z3.left, z3.top], z4: [z4.left, z4.top] });

  // the middle mouse button too
  t.wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'middle', clickCount: 1 });
  for (let i = 1; i <= 6; i++) { t.wc.sendInputEvent({ type: 'mouseMove', x: c.x + 10 * i, y: c.y + 5 * i, modifiers: ['middleButtonDown'] }); await t.sleep(30); }
  t.wc.sendInputEvent({ type: 'mouseUp', x: c.x + 60, y: c.y + 30, button: 'middle', clickCount: 1 });
  await t.sleep(200);
  const z5 = await z();
  check('The middle mouse button moves the view', Math.abs(z5.left - (z4.left - 60)) < 4 && Math.abs(z5.top - (z4.top - 30)) < 4, { z4: [z4.left, z4.top], z5: [z5.left, z5.top] });

  await t.key('0', ['control']);
  const z6 = await z();
  check('Ctrl+0 fits the whole sheet again', z6.fitOn && Math.abs(z6.zoom - z0.zoom) < 0.001 && !z6.scrollX && !z6.scrollY, z6);
  await t.key('=', ['control']);
  const z7 = await z();
  await t.key('-', ['control']);
  const z8 = await z();
  check('Ctrl++ and Ctrl+− zoom in and out', Math.abs(z7.zoom / z6.zoom - 1.25) < 0.01 && Math.abs(z8.zoom - z6.zoom) < 0.001, { z6: z6.zoom, z7: z7.zoom, z8: z8.zoom });

  // One per sheet, zoomed in: dragging the card still moves it by the right amount
  await t.click('select[data-k="mode"]'); await t.click('select[data-k="mode"] option[value="single"]');
  await t.sleep(300);
  await t.click('.pv-zoom [data-z="in"]'); await t.click('.pv-zoom [data-z="in"]'); await t.click('.pv-zoom [data-z="in"]');
  const before = await t.js(`({ left: +document.querySelector('[data-k="left"]').value, zoom: parseFloat(document.querySelector('.pv-scroll .sheet').style.zoom) })`);
  await t.drag('.pv-scroll .slot', 60, 0);
  const after = await t.js(`+document.querySelector('[data-k="left"]').value`);
  const mm = 60 / (before.zoom * 3.7795);
  check('Zoomed in, dragging the card still moves it the right distance', Math.abs(after - before.left - mm) < 0.6, { before, after, mm });
  await t.key('Escape');
});
