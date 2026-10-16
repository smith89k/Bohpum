// Publisher-style left column: big dropdowns with picture + title + explanation; extra boxes only when needed.
const { run } = require('./harness');

run(async (t, check) => {
  t.wc.getPrintersAsync = async () => [{ name: 'Office HP', displayName: 'Office HP', isDefault: true, description: '', status: 0, options: {} }];
  await t.ready();
  await t.js('window.__bohpumApp.cmd("print")');
  await t.waitFor('!!document.querySelector(".print-preview .slot") && !document.getElementById("pd-printer").options[0].textContent.startsWith("Finding")');
  const side = () => t.js(`(() => {
    const q = (s) => document.querySelector(s);
    const shown = (s) => { const el = q(s); return !!el && el.getClientRects().length > 0; };
    // title + explanation shown in the closed box (two lines: read them apart)
    const sc = (s) => { const el = q(s + ' selectedcontent'); return el ? el.querySelector('b').textContent + ' ' + el.querySelector('small').textContent : null; };
    return {
      heads: [...document.querySelectorAll('.print-side h4')].map(h => h.textContent),
      bigs: [...document.querySelectorAll('.print-side select.big')].map(s => s.getAttribute('aria-label')),
      copiesFirst: !!q('.print-side > .pr-copies:first-child [data-k="copies"]'),
      layoutShown: sc('select[data-k="mode"]'), printerShown: sc('#pd-printer'),
      left: shown('[data-k="left"]'), margins: shown('[data-k="marginT"]'), range: shown('[data-k="range"]'),
      paperOff: q('select[data-k="sheet"]').disabled, orientOff: q('select[data-k="orient"]').disabled,
      pad: [...document.querySelectorAll('#pd-pos [data-pos]')].filter(b => b.classList.contains('on')).map(b => b.dataset.pos),
      pos: q('[data-k="left"]') && { left: +q('[data-k="left"]').value, top: +q('[data-k="top"]').value }
    };
  })()`);

  const s1 = await side();
  check('Column: Copies, then Printer, Settings, Printer adjustment',
    s1.copiesFirst && s1.heads.join('|') === 'Printer|Settings|Printer adjustment' && s1.bigs.join('|') === 'Printer|Pages to print|Layout|Paper|Orientation', s1);
  check('Closed dropdowns show the chosen title and explanation',
    /^One per sheet, at a position Place the page anywhere/.test(s1.layoutShown) && /^Office HP Default printer/.test(s1.printerShown), s1);
  check('Position: Left / Top shown, centre of the 3×3 pad lit', s1.left && !s1.margins && s1.pad.join() === 'mc', s1);

  // The chosen layout's own settings sit together in one box (a border round them)
  const boxOf = (keys) => t.js(`(() => {
    const boxes = ${JSON.stringify(keys)}.map(s => document.querySelector(s).closest('.pr-box'));
    const b = boxes[0];
    return { same: !!b && boxes.every(x => x === b), border: b ? getComputedStyle(b).borderTopWidth : null };
  })()`);
  const b1 = await boxOf(['[data-k="left"]', '[data-k="top"]', '#pd-pos']);
  check('One per sheet: Left, Top and the 3×3 pad are boxed together', b1.same && b1.border === '1px', b1);
  const fill = await t.js(`(() => {
    const box = document.querySelector('.pr-box.pr-pos'), cs = getComputedStyle(box), r = box.getBoundingClientRect();
    const inL = r.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft), inR = r.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
    const left = document.querySelector('[data-k="left"]').closest('.pf').getBoundingClientRect(), pad = document.getElementById('pd-pos').getBoundingClientRect();
    return { startGap: Math.round(left.left - inL), endGap: Math.round(inR - pad.right) };
  })()`);
  check('One per sheet: Left, Top and the pad fill the box edge to edge', Math.abs(fill.startGap) <= 1 && Math.abs(fill.endGap) <= 1, fill);
  const cols = await t.js(`(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const top = document.querySelector('[data-k="top"]').closest('.pf').getBoundingClientRect(), left = document.querySelector('[data-k="left"]').closest('.pf').getBoundingClientRect(), pad = r('#pd-pos');
    return { topAboveLeft: top.bottom <= left.top && Math.round(top.left) === Math.round(left.left), padRight: pad.left >= Math.max(top.right, left.right),
      padTop: Math.round(pad.top - top.top), padBottom: Math.round(pad.bottom - left.bottom) };
  })()`);
  check('One per sheet: two columns, Top above Left, the pad beside them', cols.topAboveLeft && cols.padRight, cols);
  check('One per sheet: the pad is as tall as Top + Left', Math.abs(cols.padTop) <= 1 && Math.abs(cols.padBottom) <= 1, cols);

  await t.click('#pd-pos [data-pos="tl"]');
  const s2 = await side();
  check('Top-left on the pad: Left 10, Top 10, that cell lit', s2.pos.left === 10 && s2.pos.top === 10 && s2.pad.join() === 'tl', s2);

  await t.click('select[data-k="mode"]');
  await t.click('select[data-k="mode"] option[value="grid"]');
  const s3 = await side();
  check('Mouse: Multiple copies per sheet shows margins, hides Left / Top', s3.margins && !s3.left && /^Multiple copies per sheet/.test(s3.layoutShown), s3);

  const grid = () => t.js(`(() => {
    const q = (s) => document.querySelector(s);
    const before = (a, b) => !!(q(a).compareDocumentPosition(q(b)) & Node.DOCUMENT_POSITION_FOLLOWING);
    return {
      order: before('[data-k="center"]', '[data-k="marginT"]') && before('[data-k="order"]', '[data-k="marginT"]'),
      center: q('[data-k="center"]').checked,
      marginsOff: ['marginT', 'marginL', 'marginB', 'marginR'].map(k => q('[data-k="' + k + '"]').disabled),
      gapsOff: ['gapX', 'gapY'].map(k => q('[data-k="' + k + '"]').disabled)
    };
  })()`);
  const m1 = await grid();
  check('Multiple: Center and the order dropdown come before the margins', m1.order, m1);
  check('Multiple: margins and gaps stay usable with Center ticked', m1.center && !m1.marginsOff.some(Boolean) && !m1.gapsOff.some(Boolean), m1);
  const b2 = await boxOf(['[data-k="center"]', '[data-k="order"]', '[data-k="marginT"]', '[data-k="marginR"]', '[data-k="gapX"]', '[data-k="gapY"]']);
  check('Multiple: Center, order, margins and gaps are boxed together', b2.same && b2.border === '1px', b2);

  await t.click('select[data-k="mode"]');
  await t.click('select[data-k="mode"] option[value="actual"]');
  const s4 = await side();
  check('Page size = paper size turns Paper and Orientation off', s4.paperOff && s4.orientOff, s4);

  await t.click('select[data-k="pages"]');
  await t.click('select[data-k="pages"] option[value="range"]');
  const s5 = await side();
  check('Custom Print shows the Pages box', s5.range, s5);
  await t.key('Escape');
});
