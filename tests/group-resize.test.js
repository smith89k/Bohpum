// A group (for example a text box and a shape) has resize handles on its outer box, like one object.
// Dragging one scales every member with the group: places and sizes keep their share of the group's box.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const ids = await t.js(`(() => { const os = window.__bohpumApp.state.doc.pages[0].objects.filter(o => o.type === 'box' && !o.locked && !o.rot);
    const text = os.find(o => o.html), shape = os.find(o => o !== text && o.shape !== 'none'); return [text.id, shape.id]; })()`);
  await t.js(`(() => { const S = window.__bohpumApp.state; S.sel = new Set(${JSON.stringify(ids)}); window.__bohpumApp.cmd('group'); return true; })()`);
  await t.key('Escape'); await t.sleep(200);
  await t.click(`#workspace .kcontent > .kobj[data-id="${ids[0]}"]`);

  const state = () => t.js(`(() => { const os = window.__bohpumApp.state.doc.pages[0].objects.filter(o => ${JSON.stringify(ids)}.includes(o.id));
    const x1 = Math.min(...os.map(o => o.x)), y1 = Math.min(...os.map(o => o.y)), x2 = Math.max(...os.map(o => o.x + o.w)), y2 = Math.max(...os.map(o => o.y + o.h));
    return { sel: [...window.__bohpumApp.state.sel].sort().join(','), bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, os: os.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, html: o.html })) }; })()`);
  const s0 = await state();
  const handles = await t.js(`[...document.querySelectorAll('#overlay .handle')].map(h => h.dataset.h).sort().join(' ')`);
  check('Clicking a member picks the whole group', s0.sel === [...ids].sort().join(','), s0.sel);
  check('The group has resize handles on its outer box', ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'].every(k => handles.split(' ').includes(k)), handles);

  await t.drag('#overlay .handle[data-h="se"]', 120, 60);
  const s1 = await state();
  check('Dragging the corner makes the group bigger', s1.bb.w > s0.bb.w + 5 && s1.bb.h > s0.bb.h + 2, { before: s0.bb, after: s1.bb });
  const share = (s) => s.os.map(o => [(o.x - s.bb.x) / s.bb.w, (o.y - s.bb.y) / s.bb.h, o.w / s.bb.w, o.h / s.bb.h]);
  const a = share(s0).flat(), b = share(s1).flat();
  check('Every member keeps its place and size inside the group', a.every((v, i) => Math.abs(v - b[i]) < 0.02), { a, b });
  check('The top-left corner stays put', Math.abs(s1.bb.x - s0.bb.x) < 0.05 && Math.abs(s1.bb.y - s0.bb.y) < 0.05, { before: s0.bb, after: s1.bb });
  check('The text is kept as it was', s1.os[0].html === s0.os[0].html, null);

  await t.drag('#overlay .handle[data-h="w"]', -50, 0);
  const s2 = await state();
  check('Dragging a side handle only widens the group, the right edge stays put',
    s2.bb.w > s1.bb.w + 2 && Math.abs(s2.bb.h - s1.bb.h) < 0.05 && Math.abs((s2.bb.x + s2.bb.w) - (s1.bb.x + s1.bb.w)) < 0.05, { s1: s1.bb, s2: s2.bb });

  await t.key('z', ['control']); await t.key('z', ['control']); await t.sleep(250);
  const s3 = await state();
  check('Undo brings the group back to its first size', Math.abs(s3.bb.w - s0.bb.w) < 0.05 && Math.abs(s3.bb.h - s0.bb.h) < 0.05, { s0: s0.bb, s3: s3.bb });
});
