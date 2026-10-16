// T / B / L / R margin boxes (page margin guides, text box inner margins) sit on 2 rows of 2: T B, then L R.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  // the four boxes whose labels are T, B, L, R inside one section: their rows and columns
  const layout = (section) => t.js(`(() => {
    const sec = [...document.querySelectorAll('#props .psec')].find(s => s.querySelector('h4').textContent.trim().toLowerCase() === ${JSON.stringify(section)});
    if (!sec) return null;
    const boxes = [...sec.querySelectorAll('.numf')].filter(n => ['T', 'B', 'L', 'R'].includes((n.querySelector('span') || {}).textContent));
    const r = boxes.map(b => ({ k: b.querySelector('span').textContent, x: Math.round(b.getBoundingClientRect().left), y: Math.round(b.getBoundingClientRect().top) }));
    const rows = [...new Set(r.map(b => b.y))].sort((a, b) => a - b).map(y => r.filter(b => b.y === y).sort((a, b) => a.x - b.x).map(b => b.k).join(' '));
    return { rows, overflow: document.getElementById('props').scrollWidth - document.getElementById('props').clientWidth };
  })()`);

  const page = await layout('margin guides');
  check('Margin guides: 2 rows of 2 (T B / L R)', page && page.rows.join(' | ') === 'T B | L R' && page.overflow <= 0, page);

  await t.js(`(() => { const S = window.__bohpumApp.state; const box = S.doc.pages[0].objects.find(o => o.type === 'box' && o.html); window.__bohpumApp.startEditing(box.id); window.__bohpumApp.finishEditing(); })()`);
  await t.sleep(300);
  const text = await layout('text box');
  check('Text box inner margins: 2 rows of 2 (T B / L R)', text && text.rows.join(' | ') === 'T B | L R' && text.overflow <= 0, text);
});
