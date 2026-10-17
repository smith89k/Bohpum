// Bring to front, Send to back, Group and Ungroup left the top bar: they are in the right panel's Arrange section
// (Order, and a Group row whose buttons are greyed out when they would do nothing). Shortcuts are unchanged.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready(null);
  const top = await t.js(`['front', 'back', 'group', 'ungroup'].filter(c => document.querySelector('#topbar [data-cmd="' + c + '"]'))`);
  check('The top bar has no Front / Back / Group / Ungroup buttons', top.length === 0, top);

  const draw = async (dy) => {
    await t.js('window.__bohpumApp.cmd("tool-rect")');
    await t.js(`(() => { const b = document.getElementById('page-holder').getBoundingClientRect(); let d = document.getElementById('draw-here'); if (!d) { d = document.createElement('div'); d.id = 'draw-here'; document.body.append(d); }
      Object.assign(d.style, { position: 'fixed', left: b.left + 40 + 'px', top: b.top + ${dy} + 'px', width: '2px', height: '2px', pointerEvents: 'none' }); return true; })()`);
    await t.drag('#draw-here', 90, 50); await t.sleep(200);
  };
  await draw(40); await draw(160);
  const arr = () => t.js(`(() => { const s = document.querySelector('#props .psec[data-sec="arrange"]'); if (!s) return null;
    const rows = [...s.querySelectorAll('.prow > label')].map(l => l.textContent), g = [...s.querySelectorAll('.prow')].find(r => r.querySelector('label').textContent === 'Group');
    return { rows, group: g ? [...g.querySelectorAll('.btn')].map(x => ({ word: x.textContent, off: x.disabled, icon: !!x.querySelector('svg') })) : [],
      first: [...document.querySelectorAll('#props .psec[data-sec="object"] .btn:not(.psec-head)')].map(x => x.textContent.trim()),
      groups: window.__bohpumApp.state.doc.pages[0].objects.map(o => o.groupId || null) }; })()`);
  const one = await arr();
  check('One shape: Arrange has Order and a Group row (Group and Ungroup, with icons, both greyed out)', one && one.groups.length === 2 && one.rows[0] === 'Order' && one.rows.includes('Group')
    && one.group.map(b => b.word).join() === 'Group,Ungroup' && one.group.every(b => b.icon && b.off), one);

  await t.js('window.__bohpumApp.cmd("select-all")'); await t.sleep(200);
  const two = await arr();
  check('Two shapes: Group is on, Ungroup greyed out; the first section has Lock only', two.group[0] && !two.group[0].off && two.group[1].off && two.first.join() === 'Lock', two);
  const press = async (word) => { await t.js(`(() => { [...document.querySelectorAll('#props .psec[data-sec="arrange"] .btn')].find(b => b.textContent === ${JSON.stringify(word)}).id = 'press-me'; return true; })()`); await t.click('#press-me'); await t.sleep(250); };
  await press('Group');
  const grouped = await arr();
  check('Group joins them; then Group is greyed out and Ungroup is on', grouped.groups.length === 2 && grouped.groups[0] && grouped.groups[0] === grouped.groups[1] && grouped.group[0].off && !grouped.group[1].off, grouped);
  await press('Ungroup');
  const apart = await arr();
  check('Ungroup splits them again', apart.groups.every(g => !g) && !apart.group[0].off && apart.group[1].off, apart);
  await t.js('document.activeElement.blur()');
  await t.key('g', ['control']); await t.sleep(250);
  check('Ctrl+G still groups', (await arr()).groups.every(g => g), await arr());
});
