// Pages panel: drag a page to reorder. A green drop line shows where it lands; the moved page becomes the current
// page; Ctrl+Z puts it back; Esc cancels; a plain click still opens a page; the list scrolls near its edges.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  for (let i = 0; i < 3; i++) await t.js('window.__bohpumApp.cmd("page-add")'); // 4 pages
  const ids0 = await t.js('window.__bohpumApp.state.doc.pages.map(p => p.id)');
  const order = async () => (await t.js('window.__bohpumApp.state.doc.pages.map(p => p.id)')).map(id => ids0.indexOf(id) + 1).join(',');
  const thumb = (n) => `#page-list .pthumb[data-page="${n - 1}"]`;
  const at = (sel) => t.js(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), top: b.top, bottom: b.bottom }; })()`);
  const mouse = (type, x, y, extra = {}) => t.wc.sendInputEvent({ type, x, y, button: 'left', clickCount: 1, ...extra });
  const line = () => t.js(`(() => { const l = document.querySelector('#page-list .page-drop'); if (!l || l.hidden) return null; const b = l.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; })()`);

  // drag page 1 into the gap between pages 3 and 4
  const p1 = await at(thumb(1)), p3 = await at(thumb(3)), p4 = await at(thumb(4));
  const gapY = Math.round((p3.bottom + p4.top) / 2);
  mouse('mouseMove', p1.x, p1.y); mouse('mouseDown', p1.x, p1.y);
  for (let i = 1; i <= 10; i++) { mouse('mouseMove', p1.x, Math.round(p1.y + (gapY - p1.y) * i / 10), { modifiers: ['leftButtonDown'] }); await t.sleep(30); }
  await t.sleep(150);
  const l1 = await line(), faded = await t.js(`document.querySelector(${JSON.stringify(thumb(1))}).classList.contains('dragged')`);
  check('While dragging: a drop line sits in the gap between pages 3 and 4, the dragged page is faded',
    l1 && l1.top >= p3.bottom - 2 && l1.bottom <= p4.top + 2 && faded, { l1, p3: p3.bottom, p4: p4.top, faded });
  mouse('mouseUp', p1.x, gapY); await t.sleep(300);
  const st = await t.js('(() => { const S = window.__bohpumApp.state; return { page: S.page, dirty: S.dirty, active: document.querySelector("#page-list .pthumb.active").dataset.page }; })()');
  check('Drop: page 1 moves after page 3 and becomes the current page', (await order()) === '2,3,1,4' && st.page === 2 && st.active === '2' && st.dirty, { order: await order(), st });
  check('The drop line is gone after the drop', !(await line()), null);

  await t.key('z', ['control']);
  check('Ctrl+Z puts the page back', (await order()) === '1,2,3,4', await order());

  // Esc cancels a drag
  const q4 = await at(thumb(4)), q1 = await at(thumb(1));
  mouse('mouseMove', q4.x, q4.y); mouse('mouseDown', q4.x, q4.y);
  for (let i = 1; i <= 10; i++) { mouse('mouseMove', q4.x, Math.round(q4.y + (q1.top - 4 - q4.y) * i / 10), { modifiers: ['leftButtonDown'] }); await t.sleep(30); }
  const l2 = await line();
  await t.key('Escape');
  mouse('mouseUp', q4.x, q1.top - 4); await t.sleep(300);
  check('Esc cancels the drag: nothing moves, no line', l2 && (await order()) === '1,2,3,4' && !(await line()), { l2, order: await order() });

  await t.click(thumb(4));
  check('A plain click still opens a page', (await t.js('window.__bohpumApp.state.page')) === 3, null);

  // a long list scrolls while the mouse is held near its bottom edge
  for (let i = 0; i < 16; i++) await t.js('window.__bohpumApp.cmd("page-add")');
  await t.js(`document.getElementById('page-list').scrollTop = 0`); await t.sleep(200);
  const list = await t.js(`(() => { const b = document.getElementById('page-list').getBoundingClientRect(); return { bottom: Math.round(b.bottom) }; })()`);
  const r1 = await at(thumb(1));
  mouse('mouseMove', r1.x, r1.y); mouse('mouseDown', r1.x, r1.y);
  for (let i = 1; i <= 10; i++) { mouse('mouseMove', r1.x, Math.round(r1.y + (list.bottom - 6 - r1.y) * i / 10), { modifiers: ['leftButtonDown'] }); await t.sleep(30); }
  await t.sleep(700);
  const scrolled = await t.js(`document.getElementById('page-list').scrollTop`);
  await t.key('Escape'); mouse('mouseUp', r1.x, list.bottom - 6); await t.sleep(200);
  check('Holding near the bottom edge scrolls the list', scrolled > 40, scrolled);
});
