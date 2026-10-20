// Undo and redo after moving a frame with the mouse, and with the arrow keys: it goes back to where it was, then
// forward to where it was put (one step each).
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const pos = (id) => t.js(`(() => { const o = window.__bohpumApp.state.doc.pages[0].objects.find(o => o.id === ${JSON.stringify(id)}); return { x: o.x, y: o.y }; })()`);
  // a text frame the mouse reaches (its middle isn't under another object)
  const id = await t.js(`(() => window.__bohpumApp.state.doc.pages[0].objects.filter(o => o.type === 'box' && o.html && !o.locked).map(o => o.id).find(id => {
    const el = document.querySelector('#page-holder .kcontent > .kobj[data-id="' + id + '"]'), b = el && el.getBoundingClientRect();
    return b && b.width && el.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
  }))()`);
  check('There is a text frame to move', !!id, id);
  const sel = `#page-holder .kcontent > .kobj[data-id="${id}"]`;

  // ---- the mouse
  const p0 = await pos(id);
  await t.drag(sel, 80, 40); await t.sleep(200);
  const p1 = await pos(id);
  await t.click('#b-undo'); await t.sleep(200);
  const u1 = await pos(id), elU = await t.center(sel);
  await t.click('#b-redo'); await t.sleep(200);
  const r1 = await pos(id);
  check('Moved with the mouse: Undo puts it back, Redo moves it again',
    (p1.x !== p0.x || p1.y !== p0.y) && u1.x === p0.x && u1.y === p0.y && r1.x === p1.x && r1.y === p1.y, { p0, p1, u1, r1, elU });

  // ---- Ctrl+Z / Ctrl+Y after the mouse
  await t.drag(sel, -60, 30); await t.sleep(200);
  const p2 = await pos(id);
  await t.key('Z', ['control']); await t.sleep(200);
  const u2 = await pos(id);
  await t.key('Y', ['control']); await t.sleep(200);
  const r2 = await pos(id);
  check('Ctrl+Z / Ctrl+Y do the same', u2.x === r1.x && u2.y === r1.y && r2.x === p2.x && r2.y === p2.y, { r1, p2, u2, r2 });

  // ---- the arrow keys
  await t.click(sel);
  const k0 = await pos(id);
  await t.key('Right'); await t.key('Right'); await t.sleep(600);
  const k1 = await pos(id);
  await t.key('Z', ['control']); await t.sleep(200);
  const k2 = await pos(id);
  check('Moved with the arrow keys: one Undo puts it back', k1.x > k0.x && k2.x === k0.x && k2.y === k0.y, { k0, k1, k2 });
});
