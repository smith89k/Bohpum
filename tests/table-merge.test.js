// Table section, part 2: Select table, Same width / Same height, Merge cells, Unmerge cells.
const { run } = require('./harness');
const fs = require('fs');
const path = require('path');

// 3 columns of 2, 4 and 6 cm; rows of 1 and 2 cm
const FODG = `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 office:mimetype="application/vnd.oasis.opendocument.graphics">
 <office:automatic-styles>
  <style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="2cm"/></style:style>
  <style:style style:name="co2" style:family="table-column"><style:table-column-properties style:column-width="4cm"/></style:style>
  <style:style style:name="co3" style:family="table-column"><style:table-column-properties style:column-width="6cm"/></style:style>
  <style:style style:name="ro1" style:family="table-row"><style:table-row-properties style:row-height="1cm"/></style:style>
  <style:style style:name="ro2" style:family="table-row"><style:table-row-properties style:row-height="2cm"/></style:style>
 </office:automatic-styles>
 <office:body><office:drawing>
  <draw:page draw:name="page1">
   <draw:frame svg:width="12cm" svg:height="3cm" svg:x="1cm" svg:y="2cm">
    <table:table>
     <table:table-column table:style-name="co1"/><table:table-column table:style-name="co2"/><table:table-column table:style-name="co3"/>
     <table:table-row table:style-name="ro1"><table:table-cell><text:p>A</text:p></table:table-cell><table:table-cell><text:p>B</text:p></table:table-cell><table:table-cell><text:p>C</text:p></table:table-cell></table:table-row>
     <table:table-row table:style-name="ro2"><table:table-cell><text:p>D</text:p></table:table-cell><table:table-cell><text:p/></table:table-cell><table:table-cell><text:p>F</text:p></table:table-cell></table:table-row>
    </table:table>
   </draw:frame>
  </draw:page>
 </office:drawing></office:body>
</office:document>`;

run(async (t, check) => {
  const { js, sleep, waitFor } = t;
  const click = async (sel) => { await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.scrollIntoView({ block: 'center' }); })()`); await sleep(100); return t.click(sel); };
  await t.ready(null);

  // ---- table.js
  const unit = await js(`(async () => {
    const TB = await import('./table.js');
    const mk = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.querySelector('table'); };
    const shape = (tb) => [...tb.rows].map(r => [...r.cells].map(c => c.textContent + (c.colSpan > 1 ? '*' + c.colSpan : '') + (c.rowSpan > 1 ? '^' + c.rowSpan : '')).join(','));
    const out = {};
    let tb = mk('<table><tr><td><p>A</p></td><td><p>B</p></td><td><p>C</p></td></tr><tr><td><p>D</p></td><td><p><br></p></td><td><p>F</p></td></tr></table>');
    TB.mergeCells(tb, [tb.rows[0].cells[0], tb.rows[1].cells[1]]); out.merge = shape(tb);
    out.mergeText = tb.rows[0].cells[0].innerHTML;
    TB.splitCell(tb, tb.rows[0].cells[0]); out.split = shape(tb);
    tb = mk('<table><tr><td><p><br></p></td><td><p>B</p></td></tr></table>');
    TB.mergeCells(tb, [...tb.rows[0].cells]); out.emptyFirst = tb.rows[0].cells[0].innerHTML;
    tb = mk('<table><tr><td><p>A</p></td></tr></table>');
    out.single = TB.mergeCells(tb, [tb.rows[0].cells[0]]);
    return out;
  })()`);
  check('Merge A to the empty middle cell: one cell over 2 × 2', JSON.stringify(unit.merge) === '["ABD*2^2,C","F"]', unit.merge);
  check('…keeping the words of A, B and D (the empty cell adds nothing)', unit.mergeText === '<p>A</p><p>B</p><p>D</p>', unit.mergeText);
  check('Unmerge: back to 2 × 2 single cells, the words in the first', JSON.stringify(unit.split) === '["ABD,,C",",,F"]', unit.split);
  check('Merging into an empty first cell keeps no blank line', unit.emptyFirst === '<p>B</p>', unit.emptyFirst);
  check('One cell can’t be merged', unit.single === null, unit);

  const file = path.join(t.ctx.tmp, 'grid.fodg');
  fs.writeFileSync(file, FODG);
  await js(`window.__bohpumApp.openFile(${JSON.stringify(file)})`);
  await waitFor(`window.__bohpumApp.state.doc.name === 'grid'`);
  const box = () => js(`(() => { const o = window.__bohpumApp.state.doc.pages[0].objects[0]; return { id: o.id, w: o.w, h: o.h, html: o.html }; })()`);
  let b = await box();
  const cols = (html) => [...html.matchAll(/<col style="width: ?([\d.]+)%/g)].map(m => Math.round(+m[1]));
  const panel = () => js(`(() => { const s = document.querySelector('#props .psec[data-sec="table"]'); if (!s) return null;
    return { cap: s.querySelector('.cap').textContent, off: [...s.querySelectorAll('button[title]')].filter(x => x.disabled).map(x => x.title) }; })()`);
  const press = (title) => click(`#props .psec[data-sec="table"] button[title="${title}"]`);
  await js(`(() => { const A = window.__bohpumApp; A.state.sel = new Set([${JSON.stringify(b.id)}]); A.selectionChanged(); })()`); await sleep(200);
  check('The table opens with columns 2 : 4 : 6', JSON.stringify(cols(b.html)) === '[17,33,50]', cols(b.html));

  // ---- whole table: same width, same height
  let p = await panel();
  check('Whole table: Same width and Same height can be pressed, Unmerge can’t (nothing merged)', p && !p.off.includes('Same width') && !p.off.includes('Same height') && p.off.includes('Unmerge cells'), p);
  await press('Same width');
  b = await box();
  check('Same width: three equal columns, the box as wide as before', JSON.stringify(cols(b.html)) === '[33,33,33]' && Math.abs(b.w - 120) < 0.01, { cols: cols(b.html), w: b.w });
  await press('Same height');
  b = await box();
  const hs = [...b.html.matchAll(/<tr style="height: ?([\d.]+)mm/g)].map(m => +m[1]);
  check('Same height: both rows the same height', hs.length === 2 && Math.abs(hs[0] - hs[1]) < 0.01, hs);
  await t.key('z', ['control']); await sleep(250); await t.key('z', ['control']); await sleep(250);
  b = await box();
  check('Undo, Undo: back to 2 : 4 : 6', JSON.stringify(cols(b.html)) === '[17,33,50]', cols(b.html));

  // ---- Select table while typing: every cell is chosen, and stays chosen after a change
  await js(`(() => { const A = window.__bohpumApp; A.state.sel = new Set([${JSON.stringify(b.id)}]); A.selectionChanged(); })()`); await sleep(200);
  await press('Select table'); await sleep(300);
  p = await panel();
  const ed = await js('!!window.__bohpumApp.state.editing');
  check('Select table: typing in the table, all 6 cells chosen', ed && p && p.cap === '6 cells', { ed, p });
  await js(`(() => { const r = [...document.querySelectorAll('#props .psec[data-sec="table"] .prow')].find(r => r.querySelector('label').textContent === 'Border'); const s = r.querySelector('select'); s.value = '1'; s.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(400);
  b = await box(); p = await panel();
  check('…a border change goes to all 6 cells', (b.html.match(/border-width: ?0\.35mm/g) || []).length === 6, b.html);
  check('…and all 6 stay chosen for the next change', p && p.cap === '6 cells', p);
  await press('Same width'); await sleep(300);
  b = await box();
  check('…Same width with all chosen: equal columns', JSON.stringify(cols(b.html)) === '[33,33,33]', cols(b.html));

  // ---- merge two cells chosen by dragging across them, then unmerge
  const choose = (from, to) => js(`(() => { const kt = document.querySelector('.kobj.editing .kt'); const td = (x) => [...kt.querySelectorAll('td')].find(c => c.textContent.trim() === x);
    const a = td(${JSON.stringify(from)}), z = td(${JSON.stringify(to)}); const r = document.createRange(); r.setStart(a.querySelector('p').firstChild || a, 0); r.setEnd(z.querySelector('p').firstChild || z, (z.querySelector('p').firstChild || z).textContent.length);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`);
  await choose('B', 'C'); await sleep(400);
  p = await panel();
  check('B and C chosen: "2 cells", Merge can be pressed', p && p.cap === '2 cells' && !p.off.includes('Merge cells'), p);
  await press('Merge cells'); await sleep(300);
  b = await box();
  check('Merge cells: B and C become one cell over 2 columns, with both words', /<td[^>]*colspan="2"[^>]*>(<p[^>]*>(<span[^>]*>)?B<\/span><\/p><p[^>]*>(<span[^>]*>)?C)/.test(b.html) && (b.html.match(/<td/g) || []).length === 5, b.html);
  const where = await js(`(() => { const s = getSelection(); const td = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('td'); return td && td.getAttribute('colspan'); })()`);
  check('…the cursor is in the merged cell', where === '2', where);
  p = await panel();
  check('…and Unmerge can now be pressed', p && !p.off.includes('Unmerge cells'), p);
  await press('Unmerge cells'); await sleep(300);
  b = await box();
  check('Unmerge cells: 6 single cells again', (b.html.match(/<td/g) || []).length === 6 && !/colspan/.test(b.html), b.html);
  await t.key('Escape'); await sleep(250); // stop typing first: Ctrl+Z while typing undoes typing
  await t.key('z', ['control']); await sleep(250);
  b = await box();
  check('Undo brings the merge back', /colspan="2"/.test(b.html), b.html);
});
