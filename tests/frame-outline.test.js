// A text box with no border (a frame with no line, fill or shape) shows nothing on the page: light dots appear only
// while the mouse is over it and while it is being moved.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const id = await t.js(`(() => [...document.querySelectorAll('#page-holder .kcontent > .kobj.empty-frame')].map(el => el.dataset.id).find(id => {
    const el = document.querySelector('#page-holder .kcontent > .kobj[data-id="' + id + '"]'), b = el.getBoundingClientRect();
    return b.width && el.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2));
  }))()`);
  check('The page has a text box with no border', !!id, id);
  const sel = `#page-holder .kcontent > .kobj[data-id="${id}"]`;
  const look = () => t.js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}), s = getComputedStyle(el, '::before');
    return { dots: s.content !== 'none' && s.outlineStyle === 'dotted' && s.outlineWidth !== '0px', style: s.outlineStyle, content: s.content, moving: el.classList.contains('moving') }; })()`);
  const away = async () => { const r = await t.js(`(() => { const b = document.getElementById('workspace').getBoundingClientRect(); return { x: Math.round(b.right - 30), y: Math.round(b.bottom - 30) }; })()`);
    t.wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); await t.sleep(250); };

  // a text box is moved by its edge (inside it a click puts the typing cursor, as in Publisher)
  // 2 px in from its top side, a quarter of the way along (clear of a selected box's handles), along the box's own
  // sides (it may be turned)
  const edgeOf = () => t.js(`(() => { const S = window.__bohpumApp.state, el = document.querySelector(${JSON.stringify(sel)}), o = S.doc.pages[0].objects.find(o => o.id === el.dataset.id);
    const b = el.getBoundingClientRect(), k = document.querySelector('#page-holder .kpage').getBoundingClientRect().width / S.doc.pageW, a = (o.rot || 0) * Math.PI / 180;
    const lx = -o.w / 4 * k, ly = -o.h / 2 * k + 2;
    return { x: Math.round(b.left + b.width / 2 + lx * Math.cos(a) - ly * Math.sin(a)), y: Math.round(b.top + b.height / 2 + lx * Math.sin(a) + ly * Math.cos(a)) }; })()`);

  await away();
  const idle = await look();
  const c = await t.center(sel);
  t.wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y }); await t.sleep(250);
  const hover = await look();
  check('No line around it on the page; light dots when the mouse is over it', !idle.dots && hover.dots, { idle, hover });

  // while moving: pressed on its edge and dragged, not let go yet
  const e = await edgeOf();
  t.wc.sendInputEvent({ type: 'mouseMove', x: e.x, y: e.y }); await t.sleep(100);
  t.wc.sendInputEvent({ type: 'mouseDown', x: e.x, y: e.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) { t.wc.sendInputEvent({ type: 'mouseMove', x: e.x + i * 8, y: e.y + i * 4, modifiers: ['leftButtonDown'] }); await t.sleep(25); }
  await t.sleep(150);
  const mid = await look();
  t.wc.sendInputEvent({ type: 'mouseUp', x: e.x + 64, y: e.y + 32, button: 'left', clickCount: 1 }); await t.sleep(250);
  await away();
  const after = await look();
  check('Light dots while it is moved; gone again after', mid.dots && mid.moving && !after.dots && !after.moving, { mid, after });

  // a copy made with Ctrl+drag behaves the same
  await t.key('Z', ['control']);   // back where it was, in view
  const c2 = await edgeOf();
  t.wc.sendInputEvent({ type: 'mouseMove', x: c2.x, y: c2.y });
  t.wc.sendInputEvent({ type: 'mouseDown', x: c2.x, y: c2.y, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) { t.wc.sendInputEvent({ type: 'mouseMove', x: c2.x + i * 6, y: c2.y + i * 6, modifiers: ['leftButtonDown', 'control'] }); await t.sleep(25); }
  t.wc.sendInputEvent({ type: 'mouseUp', x: c2.x + 48, y: c2.y + 48, button: 'left', clickCount: 1, modifiers: ['control'] }); await t.sleep(250);
  const copy = await t.js(`(() => { const ids = [...window.__bohpumApp.state.sel]; const el = document.querySelector('#page-holder .kcontent > .kobj[data-id="' + ids[0] + '"]');
    return { n: ids.length, isCopy: ids[0] !== ${JSON.stringify(id)}, empty: !!el && el.classList.contains('empty-frame') }; })()`);
  check('A Ctrl+drag copy is a borderless text box too (dots on mouse over)', copy.n === 1 && copy.isCopy && copy.empty, copy);
});
