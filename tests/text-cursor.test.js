// As in Publisher: over a text box the pointer is the I-beam and a click puts the typing cursor there; on the box's edge
// it is the move arrow and a drag moves the box. Shapes, locked and grouped boxes keep the move arrow; Shift+click selects.
const { run } = require('./harness');

run(async (t, check) => {
    await t.ready(null);
  const J = JSON.stringify;
  const app = (code) => t.js(`(() => { const A = window.__bohpumApp, S = A.state; return ${code}; })()`);
  // a text box with a line of text, a rectangle, a locked text box and two grouped text boxes
  const ids = await t.js(`(async () => { const A = window.__bohpumApp, S = A.state, { makeObject } = await import('./model.js');
    const box = (x, y, more) => makeObject('box', Object.assign({ x, y, w: 70, h: 30, shape: 'none', html: '<p>Hello there</p>' }, more));
    const o = { text: box(20, 20), rect: box(110, 20, { shape: 'rect', fill: '#dddddd', html: '' }), locked: box(20, 70, { locked: true }),
      g1: box(110, 70, { groupId: 'g' }), g2: box(110, 105, { groupId: 'g', h: 20 }) };
    S.doc.pages[0].objects.push(...Object.values(o)); A.cmd('toggle-master'); A.cmd('toggle-master'); A.cmd('zoom-100');
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.id])); })()`);
  await t.sleep(400);
  const rect = (id) => t.js(`(() => { const b = document.querySelector('#workspace .kcontent > .kobj[data-id=${J(id)}]').getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; })()`);
  // the pointer at a spot after the mouse moved there (read from the page: Windows' own pointer also follows the real mouse)
  const pointer = async (x, y) => {
    x = Math.round(x); y = Math.round(y);
    t.wc.sendInputEvent({ type: 'mouseMove', x: 5, y: 400 }); await t.sleep(120);
    t.wc.sendInputEvent({ type: 'mouseMove', x, y }); await t.sleep(150);
    t.wc.sendInputEvent({ type: 'mouseMove', x: x + 1, y }); await t.sleep(150);
    return t.js(`getComputedStyle(document.elementFromPoint(${x + 1}, ${y})).cursor`);
  };
  const press = async (x, y, mods = []) => {
    x = Math.round(x); y = Math.round(y);
    t.wc.sendInputEvent({ type: 'mouseMove', x, y });
    t.wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1, modifiers: mods });
    t.wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1, modifiers: mods });
    await t.sleep(300);
  };
  const T = await rect(ids.text), mid = { x: (T.l + T.r) / 2, y: (T.t + T.b) / 2 };

  // Bohpum's own I-beam (black, white outline): Windows' default one inverts, and comes out white on the white page
  const ibeam = (c) => /^url\("data:image\/svg\+xml,.*"\) 8 12, text$/.test(c);
  check('over a text box: the I-beam, Bohpum\'s own dark one', ibeam(await pointer(mid.x, mid.y)), await pointer(mid.x, mid.y));
  check('on its edge: the move arrow', (await pointer(T.l + 2, mid.y)) === 'move' && (await pointer(mid.x, T.b - 2)) === 'move');
  const R = await rect(ids.rect), L = await rect(ids.locked), G = await rect(ids.g1);
  check('a shape keeps the move arrow', (await pointer((R.l + R.r) / 2, (R.t + R.b) / 2)) === 'move');
  check('a locked text box keeps the plain arrow', (await pointer((L.l + L.r) / 2, (L.t + L.b) / 2)) === 'default');
  check('a grouped text box keeps the move arrow', (await pointer((G.l + G.r) / 2, (G.t + G.b) / 2)) === 'move');

  // one click on the words: typing there, the cursor between "Hello" and " there"
  const at = await t.js(`(() => { const n = document.querySelector('#workspace .kcontent > .kobj[data-id=${J(ids.text)}] .kt p').firstChild, r = document.createRange();
    r.setStart(n, 4); r.setEnd(n, 5); const b = r.getBoundingClientRect(); return { x: b.right - 1, y: b.top + b.height / 2 }; })()`);
  const state = () => app(`({ editing: S.editing, sel: [...S.sel], focus: !!document.activeElement && document.activeElement.classList.contains('kt'),
    caret: (() => { const s = getSelection(); return s.rangeCount && s.getRangeAt(0).collapsed ? s.getRangeAt(0).startOffset : null; })() })`);
  await press(at.x, at.y);
  const ed = await state();
  check('one click in the text starts typing there', ed.editing === ids.text && J(ed.sel) === J([ids.text]) && ed.focus && ed.caret === 5, ed);
  t.wc.insertText('X'); await t.sleep(150);
  await app('(A.finishEditing(), 1)'); await t.sleep(200);
  const typed = await app(`S.doc.pages[0].objects.find(o => o.id === ${J(ids.text)}).html.replace(/<[^>]+>/g, '')`);
  check('what is typed goes in at the click', typed === 'HelloX there', typed);

  // a click in the empty part below the words: typing at the end
  await t.key('Escape'); await t.sleep(150);
  const T1 = await rect(ids.text);
  await press((T1.l + T1.r) / 2, T1.b - 12);
  const end = await state();
  check('a click below the words starts typing at the end', end.editing === ids.text && end.focus && end.caret !== null, end);
  const typing = await t.js(`getComputedStyle(document.querySelector('#workspace .kobj.editing .kt')).cursor`);
  check('while typing: the same dark I-beam', ibeam(typing), typing);
  t.wc.insertText('!'); await t.sleep(150);
  await app('(A.finishEditing(), 1)'); await t.sleep(200);
  const typed2 = await app(`S.doc.pages[0].objects.find(o => o.id === ${J(ids.text)}).html.replace(/<[^>]+>/g, '')`);
  check('what is typed goes at the end', typed2 === 'HelloX there!', typed2);

  // a drag from the edge moves the box, no typing
  await t.key('Escape'); await t.sleep(150);
  const x0 = await app(`S.doc.pages[0].objects.find(o => o.id === ${J(ids.text)}).x`);
  const T2 = await rect(ids.text);
  t.wc.sendInputEvent({ type: 'mouseMove', x: Math.round(T2.l + 2), y: Math.round((T2.t + T2.b) / 2) });
  t.wc.sendInputEvent({ type: 'mouseDown', x: Math.round(T2.l + 2), y: Math.round((T2.t + T2.b) / 2), button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) { t.wc.sendInputEvent({ type: 'mouseMove', x: Math.round(T2.l + 2 + i * 5), y: Math.round((T2.t + T2.b) / 2), modifiers: ['leftButtonDown'] }); await t.sleep(25); }
  t.wc.sendInputEvent({ type: 'mouseUp', x: Math.round(T2.l + 42), y: Math.round((T2.t + T2.b) / 2), button: 'left', clickCount: 1 }); await t.sleep(300);
  const moved = await app(`({ x: S.doc.pages[0].objects.find(o => o.id === ${J(ids.text)}).x, editing: S.editing })`);
  check('a drag from the edge moves the box', moved.x > x0 + 5 && !moved.editing, { x0, moved });

  // Shift+click in the text adds it to the selection; a click in a grouped box selects the group
  await t.key('Escape'); await t.sleep(150);
  const R2 = await rect(ids.rect);
  await press((R2.l + R2.r) / 2, (R2.t + R2.b) / 2);
  const T3 = await rect(ids.text);
  await press((T3.l + T3.r) / 2, (T3.t + T3.b) / 2, ['shift']);
  const two = await app('({ sel: [...S.sel].sort(), editing: S.editing })');
  check('Shift+click in a text box adds it to the selection', J(two.sel) === J([ids.rect, ids.text].sort()) && !two.editing, two);
  await t.key('Escape'); await t.sleep(150);
  await press((G.l + G.r) / 2, (G.t + G.b) / 2);
  const grp = await app('({ sel: [...S.sel].sort(), editing: S.editing })');
  check('a click in a grouped box selects the group', J(grp.sel) === J([ids.g1, ids.g2].sort()) && !grp.editing, grp);

  // the hint says so
  await t.key('Escape'); await t.sleep(150);
  check('the hint says click to type', (await t.js('document.getElementById("tb-hint").textContent')) === 'Select a text box, or click in one to type', await t.js('document.getElementById("tb-hint").textContent'));
});
