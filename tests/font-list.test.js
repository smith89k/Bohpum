// The font and size boxes open a list with every choice (like Publisher), not only the names that match
// what is already in the box; the chosen text stays painted while the text bar has the focus; the side
// panel no longer has a "Publication" box.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const type = async (text) => {
    for (const ch of text) {
      t.wc.sendInputEvent({ type: 'keyDown', keyCode: ch });
      t.wc.sendInputEvent({ type: 'char', keyCode: ch });
      t.wc.sendInputEvent({ type: 'keyUp', keyCode: ch });
    }
    await t.sleep(400);
  };
  const box = await t.js(`window.__bohpumApp.state.doc.pages[0].objects.find(o => o.type === 'box' && o.html).id`);
  const pop = () => t.js(`(() => { const p = document.getElementById('listpop'); if (!p) return null; const on = p.querySelector('.li.on');
    return { n: p.querySelectorAll('.li').length, on: on && on.dataset.v, caps: [...p.querySelectorAll('.lcap')].map(c => c.textContent), first: p.querySelector('.li').dataset.v,
      value: document.activeElement.value, onVisible: !!on && on.getBoundingClientRect().top >= p.getBoundingClientRect().top && on.getBoundingClientRect().bottom <= p.getBoundingClientRect().bottom }; })()`);

  // ---- side panel: no Publication box
  const side = await t.js(`[...document.querySelectorAll('#props h4')].map(h => h.textContent).concat([...document.querySelectorAll('#props button')].map(b => b.textContent))`);
  check('Side panel has no Publication box or extra Print button', !side.includes('Publication') && !side.some(s => /place on A4/.test(s)), side);

  // ---- font list with the whole text box selected
  await t.click(`#workspace .kcontent > .kobj[data-id="${box}"]`);
  const font0 = await t.js(`document.getElementById('tb-font').value`);
  await t.click('#tb-font');
  await t.waitFor(`!!document.querySelector('#listpop .li')`);
  const installed = await t.js(`queryLocalFonts().then(f => new Set(f.map(x => x.family)).size)`);
  const p1 = await pop();
  check('Clicking the font box lists every installed font, Khmer fonts first, current font marked and in view',
    p1.n === installed && p1.n > 50 && p1.caps[0] === 'Khmer fonts' && p1.on === font0 && p1.onVisible, { installed, font0, p1 });

  await type('ari');
  const p2 = await pop();
  check('Typing jumps to the first match and still shows every font', p2.n === p1.n && p2.on === 'Arial' && p2.onVisible && p2.value === 'ari', p2);
  await t.key('Enter');
  const after = await t.js(`(() => ({ font: window.__bohpumApp.state.doc.pages[0].objects.find(o => o.id === ${JSON.stringify(box)}).font, open: !!document.getElementById('listpop'), box: document.getElementById('tb-font').value }))()`);
  check('Enter puts the marked font on the text box and shows its full name', after.font === 'Arial' && after.box === 'Arial' && !after.open, after);

  await t.click('#tb-font');
  await t.waitFor(`!!document.querySelector('#listpop .li')`);
  await t.key('Down'); await t.key('Down');
  const p3 = await pop();
  await t.key('Escape');
  const esc = await t.js(`({ open: !!document.getElementById('listpop'), value: document.getElementById('tb-font').value, editing: window.__bohpumApp.state.editing })`);
  check('Arrows move down the list and show the name; Esc closes it and puts the old name back',
    p3.on !== 'Arial' && p3.value === p3.on && !esc.open && esc.value === 'Arial', { p3, esc });

  // ---- size list
  await t.click('#tb-size + .combo-btn');
  await t.waitFor(`!!document.querySelector('#listpop .li')`);
  const s1 = await pop();
  check('The size button lists every size', s1.n === 23, s1);
  await t.js(`document.querySelector('#listpop .li[data-v="24"]').scrollIntoView({ block: 'nearest' })`);
  await t.click('#listpop .li[data-v="24"]');
  const size = await t.js(`window.__bohpumApp.state.doc.pages[0].objects.find(o => o.id === ${JSON.stringify(box)}).size`);
  check('Clicking a size puts it on the text box', size === 24, { size });

  // ---- editing: the chosen text stays painted while the font box has the focus
  await t.js(`(() => { window.__bohpumApp.startEditing(${JSON.stringify(box)});
    const kt = document.querySelector('#workspace .kobj[data-id=${JSON.stringify(box)}] .kt'), w = document.createTreeWalker(kt, NodeFilter.SHOW_TEXT); const n = w.nextNode();
    const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, 2); const s = getSelection(); s.removeAllRanges(); s.addRange(r); })()`);
  await t.sleep(200);
  const chosen = await t.js('getSelection().toString()');
  await t.click('#tb-font');
  await t.waitFor(`!!document.querySelector('#listpop .li')`);
  const kept = await t.js(`(() => { const h = CSS.highlights.get('kept'); return { painted: h ? [...h].map(r => r.toString()).join('') : null, focus: document.activeElement.id }; })()`);
  check('Clicking the font box keeps the chosen text painted', kept.painted === chosen && chosen.length > 0 && kept.focus === 'tb-font', { chosen, kept });

  await type('times new');
  await t.click('#listpop .li.on');
  const done = await t.js(`(() => { const kt = document.querySelector('#workspace .kobj[data-id=${JSON.stringify(box)}] .kt'), s = getSelection();
    const fam = (node) => getComputedStyle(node.nodeType === 3 ? node.parentElement : node).fontFamily;
    const w = document.createTreeWalker(kt, NodeFilter.SHOW_TEXT); let last, n; while ((n = w.nextNode())) last = n;
    return { sel: s.toString(), selFont: fam(s.getRangeAt(0).startContainer), lastFont: fam(last), painted: CSS.highlights.has('kept'), focus: document.activeElement.classList.contains('kt') }; })()`);
  check('Picking a font changes only the chosen text, which is selected again in the box',
    done.sel === chosen && /Times New Roman/.test(done.selFont) && !/Times New Roman/.test(done.lastFont) && !done.painted && done.focus, done);

  await t.key('Escape');
  const gone = await t.js(`CSS.highlights.has('kept')`);
  check('Finishing the edit leaves nothing painted', !gone, { gone });
});
