// Print screen, one page per sheet: Undo / Redo of the page's position — dragged, snapped with the pad, or typed in
// Top / Left — with Ctrl+Z, Ctrl+Y / Ctrl+Shift+Z and the Undo / Redo buttons by the pad. The publication's own undo
// is not touched, and Esc keeps the position you went back to.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const pos = () => t.js(`(() => { const l = document.querySelector('[data-k="left"]'), p = document.querySelector('[data-k="top"]'); return l && p ? { left: +l.value, top: +p.value } : null; })()`);
  const same = (a, b) => !!a && !!b && a.left === b.left && a.top === b.top;
  const btns = () => t.js(`(() => { const u = document.getElementById('pd-undo'), r = document.getElementById('pd-redo'); return u && r ? { undo: !u.disabled, redo: !r.disabled } : null; })()`);
  const hist0 = await t.js('window.__bohpumApp.state.hist.length');

  await t.js('window.__bohpumApp.cmd("print")');
  await t.waitFor('!!document.querySelector(".print-preview .slot")');
  await t.js(`(() => { const s = document.querySelector('select[data-k="mode"]'); if (s.value !== 'single') { s.value = 'single'; s.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  await t.waitFor('!!document.querySelector(".print-preview .slot.drag")');
  await t.sleep(300);

  const p0 = await pos(), b0 = await btns();
  check('Undo and Redo buttons by the pad, both off at first', b0 && !b0.undo && !b0.redo, b0);

  await t.drag('.print-preview .slot', 60, 40); await t.sleep(200);
  const p1 = await pos();
  await t.click('#pd-pos [data-pos="tl"]');
  const p2 = await pos(), b2 = await btns();
  check('Dragged, then snapped top left: Undo on, Redo off', !same(p0, p1) && p2.left === 10 && p2.top === 10 && b2.undo && !b2.redo, { p0, p1, p2, b2 });

  await t.key('Z', ['control']); const u1 = await pos();
  await t.key('Z', ['control']); const u2 = await pos();
  await t.key('Z', ['control']); const u3 = await pos(), bu = await btns();
  check('Ctrl+Z goes back step by step to where it started, then stops', same(u1, p1) && same(u2, p0) && same(u3, p0) && !bu.undo && bu.redo, { u1, u2, u3, bu });

  await t.key('Y', ['control']); const r1 = await pos();
  await t.key('Z', ['control', 'shift']); const r2 = await pos(), br = await btns();
  check('Ctrl+Y and Ctrl+Shift+Z go forward again', same(r1, p1) && same(r2, p2) && br.undo && !br.redo, { r1, r2, br });

  await t.click('#pd-undo'); const k1 = await pos();
  await t.click('#pd-redo'); const k2 = await pos();
  check('The Undo and Redo buttons do the same', same(k1, p1) && same(k2, p2), { k1, k2 });

  // typed in Left: one step when the box is left (Enter / Tab / click elsewhere)
  await t.js(`(() => { const l = document.querySelector('[data-k="left"]'); l.focus(); l.value = '20'; l.dispatchEvent(new Event('input', { bubbles: true })); l.dispatchEvent(new Event('change', { bubbles: true })); l.blur(); })()`);
  const p3 = await pos();
  await t.click('#pd-undo'); const k3 = await pos();
  check('Typed in Left, Undo puts it back', p3.left === 20 && same(k3, p2), { p3, k3 });

  const hist1 = await t.js('window.__bohpumApp.state.hist.length');
  check('The publication\'s own undo is not touched while printing', hist1 === hist0, { hist0, hist1 });

  await t.key('Z', ['control']); const kept = await pos();
  await t.key('Escape'); await t.sleep(300);
  const saved = await t.js('(() => { const p = window.__bohpumApp.state.doc.print; return p && { left: Math.round(p.left * 10) / 10, top: Math.round(p.top * 10) / 10 }; })()');
  check('Esc keeps the position you went back to', !(await t.js('!!document.querySelector(".print-preview")')) && same(saved, kept), { kept, saved });
});
