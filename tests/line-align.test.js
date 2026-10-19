// Align line (the InDesign / Illustrator name): Center on the shape's edge (the default), Inside or Outside it.
// Checked on the screen's pixels at the rectangle's right edge, plus picture borders, undo and the saved file.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const id = await t.js(`window.__bohpumApp.state.doc.pages[0].objects.find(o => o.type === 'box' && o.html).id`);
  const obj = `#workspace .kcontent > .kobj[data-id="${id}"]`;
  await t.click(obj);
  const row = () => t.js(`(() => { const r = [...document.querySelectorAll('#props .prow')].find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Align');
    return r ? { buttons: [...r.querySelectorAll('.btn')].map(b => b.querySelector('span').textContent + (b.classList.contains('on') ? '*' : '')), titles: [...r.querySelectorAll('.btn')].map(b => b.title) } : null; })()`);
  const r0 = await row();
  check('A shape with a line shows Align: Center (chosen) · Inside · Outside, named as in InDesign',
    r0 && r0.buttons.join(' ') === 'Center* Inside Outside' && r0.titles.join('|') === 'Align line to center|Align line to inside|Align line to outside', r0);

  // a thick red line, so the pixels can be read: 6 pt, Standard Colours → Red
  await t.js(`(() => { const i = [...document.querySelectorAll('#props .prow')].find(r => r.querySelector('label').textContent === 'Weight').querySelector('input'); i.value = 6; i.dispatchEvent(new Event('change')); return true; })()`);
  await t.js(`(() => { [...document.querySelectorAll('#props .prow')].find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Line').querySelector('.cbtn').id = 'linebtn'; return true; })()`);
  // the panel is taller than the window: scroll a control into view before clicking it, as a person would
  const clickSeen = async (sel) => { await t.js(`document.querySelector(${JSON.stringify(sel)}).scrollIntoView({ block: 'center' }); 0`); await t.sleep(150); await t.click(sel); };
  await clickSeen('#linebtn'); await t.click('#colorpop .cgrid.std .sw[data-c="#ff0000"]');

  // red just inside and just outside the right edge (a quarter of the line width away), with nothing selected
  const sides = async () => {
    await t.key('Escape'); await t.sleep(250);
    const g = await t.js(`(() => { const o = window.__bohpumApp.state.doc.pages[0].objects.find(o => o.id === ${JSON.stringify(id)}), r = document.querySelector(${JSON.stringify(obj)}).getBoundingClientRect();
      const half = o.strokeW * r.width / o.w / 2; return { y: Math.round(r.top + r.height * 0.3), inX: Math.round(r.right - half / 2), outX: Math.round(r.right + half / 2), half }; })()`);
    const red = async (x) => { const img = await t.wc.capturePage({ x: x - 1, y: g.y - 1, width: 3, height: 3 }), { width, height } = img.getSize(), b = img.toBitmap(), i = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
      return b[i + 2] > 200 && b[i + 1] < 80 && b[i] < 80; };
    const s = { inside: await red(g.inX), outside: await red(g.outX), half: g.half };
    await t.click(obj); await t.sleep(200);
    return s;
  };
  const center = await sides();
  check('Center: the line sits on the edge, half inside and half outside', center.inside && center.outside && center.half > 4, center);

  const pick = async (k) => { await clickSeen(`#props .align-line [data-align="${k}"]`); await t.sleep(200); };
  await pick('inside');
  const inside = await sides(), r1 = await row();
  check('Inside: the line is all inside the shape; Inside is now chosen', inside.inside && !inside.outside && r1.buttons.join(' ') === 'Center Inside* Outside', { inside, r1 });
  await pick('outside');
  const outside = await sides();
  check('Outside: the line is all outside the shape', !outside.inside && outside.outside, outside);
  const saved = await t.js(`window.__bohpumApp.state.doc.pages[0].objects.find(o => o.id === ${JSON.stringify(id)}).lineAlign`);
  check('The choice is kept in the publication', saved === 'outside', { saved });

  await t.key('z', ['control']); await t.sleep(250);
  const undone = await t.js(`window.__bohpumApp.state.doc.pages[0].objects.find(o => o.id === ${JSON.stringify(id)}).lineAlign`);
  await pick('center');
  const back = await t.js(`'lineAlign' in window.__bohpumApp.state.doc.pages[0].objects.find(o => o.id === ${JSON.stringify(id)})`);
  check('Undo goes back to Inside; Center removes the setting (the old default)', undone === 'inside' && back === false, { undone, back });

  // a picture's border uses the same choice (drawn as a rectangle inset / outset by half the line)
  const pic = await t.js(`import('./render.js').then(({ renderObject }) => ['center', 'inside', 'outside'].map(a => {
    const el = renderObject({ id: 'p' + a, type: 'image', x: 0, y: 0, w: 40, h: 30, src: '', stroke: '#000000', strokeW: 2, ...(a === 'center' ? {} : { lineAlign: a }) });
    const r = el.querySelector('svg.kshape rect'); return [r.getAttribute('x'), r.getAttribute('width')].join(','); }))`);
  check('Picture borders: Center on the edge, Inside 1 mm in, Outside 1 mm out (2 mm line)', pic.join(' | ') === '0,40 | 1,38 | -1,42', pic);

  // a shape without a line has no Align row
  await t.js(`(() => { [...document.querySelectorAll('#props .prow')].find(r => r.querySelector('label') && r.querySelector('label').textContent === 'Line').querySelector('.cbtn').id = 'linebtn2'; return true; })()`);
  await clickSeen('#linebtn2'); await t.click('#colorpop [data-c="none"]');
  check('No line, no Align row', !(await row()));
});
