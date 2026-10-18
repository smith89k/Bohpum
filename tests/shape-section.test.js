// The right panel's Shape section: after Position & size and Arrange, with Text right after it, and a
// Type list with only choices that look different. A rectangle or ellipse offers Rectangle / Ellipse (no "Frame",
// which looked the same as a rectangle, and no "Rounded", which did what Corner does); a text box offers "Text box"
// first, so the list shows what it is. Rounded corners come only from Corner, and Corner shows how round a shape
// really is (an older "rounded" shape from a Publisher file too), so corners can always be changed.
const { run } = require('./harness');

run(async (t, check) => {
  const { js, sleep } = t;
  await t.ready();
  const ids = await js(`(() => { const os = window.__bohpumApp.state.doc.pages[0].objects; const f = (p) => (os.find(p) || {}).id;
    return { text: f(o => o.type === 'box' && o.shape === 'none'), rect: f(o => o.type === 'box' && o.shape === 'rect') }; })()`);
  check('The sample has a text box and a rectangle', ids.text && ids.rect, ids);
  const pick = async (id) => { await t.key('Escape'); await t.click(`#workspace .kcontent > .kobj[data-id="${id}"]`); await sleep(250); };
  const obj = (id) => js(`(() => { const o = window.__bohpumApp.state.doc.pages[0].objects.find(o => o.id === ${JSON.stringify(id)}); return { shape: o.shape, radius: o.radius ?? null, w: o.w, h: o.h }; })()`);
  const panel = () => js(`(() => { const sec = (k) => document.querySelector('#props .psec[data-sec="' + k + '"]');
    const rowOf = (s, label) => s && [...s.querySelectorAll('.prow')].find(r => r.querySelector('label').textContent === label);
    const s = sec('shape'), type = rowOf(s, 'Type'), corner = rowOf(s, 'Corner'), sel = type && type.querySelector('select');
    return { heads: [...document.querySelectorAll('#props .psec h4')].map(h => h.textContent.trim()),
      options: sel ? [...sel.options].map(o => o.textContent) : null, chosen: sel ? sel.selectedOptions[0].textContent : null,
      corner: corner ? +corner.querySelector('input').value : null }; })()`);
  const choose = (label) => js(`(() => { const s = [...document.querySelectorAll('#props .psec[data-sec="shape"] .prow')].find(r => r.querySelector('label').textContent === 'Type').querySelector('select');
    s.value = [...s.options].find(o => o.textContent === ${JSON.stringify(label)}).value; s.dispatchEvent(new Event('change')); return true; })()`);
  const setCorner = (v) => js(`(() => { const i = [...document.querySelectorAll('#props .psec[data-sec="shape"] .prow')].find(r => r.querySelector('label').textContent === 'Corner').querySelector('input');
    i.value = ${v}; i.dispatchEvent(new Event('change')); return true; })()`);

  // ---- a rectangle
  await pick(ids.rect);
  let p = await panel();
  check('Arrange, then Shape and Text, sit right under Position & size', p.heads.slice(0, 4).join('|') === 'Position & size|Arrange|Shape|Text', p.heads);
  check('The text section is called Text (no "Text box" heading)', !p.heads.includes('Text box'), p.heads);
  check('A rectangle\'s Type list: Rectangle, Ellipse (no Frame, no Rounded)', JSON.stringify(p.options) === '["Rectangle","Ellipse"]' && p.chosen === 'Rectangle', p);
  check('…with its Corner', p.corner !== null, p);
  await setCorner(2.5); await sleep(250);
  check('Corner rounds it: still a Rectangle, radius 2.5 mm', JSON.stringify(await obj(ids.rect)).includes('"shape":"rect","radius":2.5'), await obj(ids.rect));
  await choose('Ellipse'); await sleep(250);
  p = await panel();
  check('Ellipse: no Corner, the list still offers Rectangle back', (await obj(ids.rect)).shape === 'ellipse' && p.corner === null && JSON.stringify(p.options) === '["Rectangle","Ellipse"]', p);
  await choose('Rectangle'); await sleep(250);
  check('…and back to Rectangle keeps its corner', JSON.stringify(await obj(ids.rect)).includes('"shape":"rect","radius":2.5'), await obj(ids.rect));

  // ---- an older "rounded" shape (as Publisher files bring them): shown as a Rectangle with its real corner
  await js(`(() => { const o = window.__bohpumApp.state.doc.pages[0].objects.find(o => o.id === ${JSON.stringify(ids.rect)}); o.shape = 'roundrect'; delete o.radius; return true; })()`);
  await pick(ids.rect);
  const o = await obj(ids.rect), drawn = Math.round(Math.min(o.w, o.h) * 0.1 * 100) / 100;
  p = await panel();
  check(`A rounded shape shows as Rectangle, and Corner shows how round it is drawn (${drawn} mm, not 0)`, p.chosen === 'Rectangle' && Math.abs(p.corner - drawn) < 0.011, { p, drawn });
  await setCorner(0); await sleep(250);
  check('Corner 0 squares it (it becomes a plain rectangle)', JSON.stringify(await obj(ids.rect)).includes('"shape":"rect","radius":0'), await obj(ids.rect));

  // ---- a text box
  await pick(ids.text);
  p = await panel();
  check('A text box\'s list shows Text box first, then Rectangle, Ellipse', JSON.stringify(p.options) === '["Text box","Rectangle","Ellipse"]' && p.chosen === 'Text box', p);
  check('…the same order for a text box; "Text box" is said once (the Shape type)', p.heads.slice(0, 4).join('|') === 'Position & size|Arrange|Shape|Text', p.heads);
  await choose('Ellipse'); await sleep(250);
  p = await panel();
  check('A text box can become an ellipse; its list then no longer offers Text box', (await obj(ids.text)).shape === 'ellipse' && JSON.stringify(p.options) === '["Rectangle","Ellipse"]', p);
});
