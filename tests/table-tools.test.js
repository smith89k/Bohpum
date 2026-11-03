// The Table section: a table in a text box (e.g. from a Publisher file) gets rows / columns, cell colour, border,
// padding and text position, on the typing cursor's cell or on the whole table; each change is one Undo step.
const { run } = require('./harness');
const fs = require('fs');
const path = require('path');

// the voucher's right-hand table: a merged "Posted" header over DR / CR
const FODG = `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
 xmlns:loext="urn:org:documentfoundation:names:experimental:office:xmlns:loext:1.0"
 office:mimetype="application/vnd.oasis.opendocument.graphics">
 <office:automatic-styles>
  <style:style style:name="co1" style:family="table-column"><style:table-column-properties style:column-width="4cm"/></style:style>
  <style:style style:name="co2" style:family="table-column"><style:table-column-properties style:column-width="2cm"/></style:style>
  <style:style style:name="ro1" style:family="table-row"><style:table-row-properties style:row-height="1.5cm"/></style:style>
  <style:style style:name="ce1" style:family="table-cell"><loext:graphic-properties draw:fill="none" fo:padding-top="0.1cm" fo:padding-bottom="0.1cm" fo:padding-left="0.1cm" fo:padding-right="0.1cm"/></style:style>
 </office:automatic-styles>
 <office:body><office:drawing>
  <draw:page draw:name="page1">
   <draw:frame svg:width="6cm" svg:height="4.5cm" svg:x="1cm" svg:y="2cm">
    <table:table>
     <table:table-column table:style-name="co1"/><table:table-column table:style-name="co2"/>
     <table:table-row table:style-name="ro1"><table:table-cell table:style-name="ce1" table:number-columns-spanned="2"><text:p>Posted</text:p></table:table-cell><table:covered-table-cell/></table:table-row>
     <table:table-row table:style-name="ro1" table:default-cell-style-name="ce1"><table:table-cell><text:p>DR</text:p></table:table-cell><table:table-cell><text:p>CR</text:p></table:table-cell></table:table-row>
     <table:table-row table:style-name="ro1" table:default-cell-style-name="ce1"><table:table-cell><text:p>5952</text:p></table:table-cell><table:table-cell><text:p>6502</text:p></table:table-cell></table:table-row>
    </table:table>
   </draw:frame>
  </draw:page>
 </office:drawing></office:body>
</office:document>`;

run(async (t, check) => {
  const { js, sleep, waitFor } = t;
  // panel buttons low in the panel are scrolled into view first
  const click = async (sel) => { await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.scrollIntoView({ block: 'center' }); })()`); await t.sleep(100); return t.click(sel); };
  await t.ready(null);

  // ---- table.js on its own
  const unit = await js(`(async () => {
    const TB = await import('./table.js');
    const mk = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.querySelector('table'); };
    const shape = (tb) => [...tb.rows].map(r => [...r.cells].map(c => c.textContent + (c.colSpan > 1 ? '*' + c.colSpan : '') + (c.rowSpan > 1 ? '^' + c.rowSpan : '')).join(','));
    const out = {};
    let tb = mk('<table><tr><td colspan="2">P</td></tr><tr><td>A</td><td>B</td></tr></table>');
    TB.insertColumn(tb, tb.rows[1].cells[0], 'right'); out.colRight = shape(tb);
    tb = mk('<table><tr><td colspan="2">P</td></tr><tr><td>A</td><td>B</td></tr></table>');
    TB.insertColumn(tb, tb.rows[1].cells[1], 'right'); out.colEnd = shape(tb);
    tb = mk('<table><tr><td rowspan="2">M</td><td>a</td></tr><tr><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>');
    TB.insertRow(tb, tb.rows[0].cells[1], 'below'); out.rowBelow = shape(tb);
    tb = mk('<table><tr><td rowspan="2">M</td><td>a</td></tr><tr><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>');
    TB.deleteRow(tb, tb.rows[0].cells[1]); out.delStart = shape(tb);
    tb = mk('<table><tr><td rowspan="2">M</td><td>a</td></tr><tr><td>b</td></tr><tr><td>c</td><td>d</td></tr></table>');
    TB.deleteRow(tb, tb.rows[1].cells[0]); out.delMid = shape(tb);
    tb = mk('<table><tr><td colspan="2">P</td></tr><tr><td>A</td><td>B</td></tr></table>');
    TB.deleteColumn(tb, tb.rows[1].cells[0]); out.delCol = shape(tb);
    tb = mk('<table><tr><td>only</td></tr></table>');
    out.lastRow = TB.deleteRow(tb, tb.rows[0].cells[0]); out.lastCol = TB.deleteColumn(tb, tb.rows[0].cells[0]);
    tb = mk('<table><tr><td colspan="2">P</td><td>x</td></tr><tr><td>A</td><td>B</td><td>C</td></tr></table>');
    out.between = TB.cellsBetween(tb, tb.rows[1].cells[0], tb.rows[1].cells[1]).map(c => c.textContent).sort();
    out.between2 = TB.cellsBetween(tb, tb.rows[1].cells[1], tb.rows[0].cells[0]).map(c => c.textContent).sort();
    TB.setColumnWidthsMm(tb, [10, 30, 60]); out.widths = TB.columnWidthsMm(tb, 200).map(Math.round);
    return out;
  })()`);
  check('Insert column right of A: the merged header grows over it', JSON.stringify(unit.colRight) === '["P*3","A,,B"]', unit.colRight);
  check('Insert column at the end: the header ends before it, so it gets its own cell', JSON.stringify(unit.colEnd) === '["P*2,","A,B,"]', unit.colEnd);
  check('Insert row through a merged cell: the merged cell grows', JSON.stringify(unit.rowBelow) === '["M^3,a","","b","c,d"]', unit.rowBelow);
  check('Delete the row a merged cell starts in: it moves down, one row shorter', JSON.stringify(unit.delStart) === '["M,b","c,d"]', unit.delStart);
  check('Delete a row a merged cell crosses: it gets shorter', JSON.stringify(unit.delMid) === '["M,a","c,d"]', unit.delMid);
  check('Delete a column under a merged cell: it gets narrower', JSON.stringify(unit.delCol) === '["P","B"]', unit.delCol);
  check('The last row and column can’t be deleted', unit.lastRow === false && unit.lastCol === -1, unit);
  check('Cells between A and B take in the merged header above? no — only A, B', JSON.stringify(unit.between) === '["A","B"]', unit.between);
  check('Cells between B and the header: A, B and the header (the rectangle grows)', JSON.stringify(unit.between2) === '["A","B","P"]', unit.between2);
  check('Column widths are kept as shares and read back in mm', JSON.stringify(unit.widths) === '[20,60,120]', unit.widths);

  // ---- the text cleaner keeps table settings on the table, not on spans
  const clean = await js(`(async () => { const TE = await import('./textedit.js');
    return TE.sanitizeHtml('<table style="table-layout:fixed"><colgroup><col style="width:40%"></colgroup><tr style="height:5mm"><td style="padding:1mm;border-style:solid;border-width:0.5mm;border-color:#ff0000;background-color:#ffff00;vertical-align:middle"><p><span style="width:9mm;font-size:12pt">x</span></p></td></tr></table>'); })()`);
  check('The cleaner keeps column widths, row height and the cell look', /<col style="width: ?40%/.test(clean) && /height: ?5mm/.test(clean) && /padding: ?1mm/.test(clean) && /border-width: ?0.5mm/.test(clean) && /background-color/.test(clean) && /vertical-align: ?middle/.test(clean), clean);
  check('…and drops a size on a span', !/width: ?9mm/.test(clean) && /font-size/.test(clean), clean);

  // ---- opening a Publisher table keeps its sizes
  const file = path.join(t.ctx.tmp, 'voucher.fodg');
  fs.writeFileSync(file, FODG);
  await js(`window.__bohpumApp.openFile(${JSON.stringify(file)})`);
  await waitFor(`window.__bohpumApp.state.doc.name === 'voucher'`);
  const box = () => js(`(() => { const o = window.__bohpumApp.state.doc.pages[0].objects[0]; return { id: o.id, w: o.w, h: o.h, html: o.html }; })()`);
  let b = await box();
  check('The table opens with its column widths (4 : 2)', /<col style="width: ?66\.667%/.test(b.html) && /<col style="width: ?33\.333%/.test(b.html), b.html);
  check('…its row heights and cell padding', /<tr style="height: ?15mm/.test(b.html) && /padding: ?1mm/.test(b.html), b.html);

  // ---- the Table section, whole table
  await click(`#workspace .kcontent > .kobj[data-id="${b.id}"]`);
  await js('window.__bohpumApp.finishEditing()'); await sleep(200); // a click in a text box types; the panel then shows the cell
  await js(`(() => { const A = window.__bohpumApp; A.state.sel = new Set([${JSON.stringify(b.id)}]); A.selectionChanged(); })()`);
  await sleep(200);
  const panel = () => js(`(() => { const s = document.querySelector('#props .psec[data-sec="table"]'); if (!s) return null;
    return { cap: s.querySelector('.cap').textContent, buttons: [...s.querySelectorAll('button[title]')].map(x => x.title + (x.disabled ? ' (off)' : '')) }; })()`);
  let p = await panel();
  check('A selected table box shows a Table section, working on the whole table', p && /Whole table/.test(p.cap), p);
  check('…with insert / delete buttons', p && ['Insert row above', 'Insert row below', 'Insert column left', 'Insert column right', 'Delete row', 'Delete column'].every(x => p.buttons.includes(x)), p);
  const press = (title) => click(`#props .psec[data-sec="table"] button[title="${title}"]`);
  const h0 = b.h, w0 = b.w;
  await press('Insert row below');
  b = await box();
  check('Insert row below (whole table): a 4th row, the box 15 mm taller', (b.html.match(/<tr/g) || []).length === 4 && Math.abs(b.h - (h0 + 15)) < 1, { h: b.h, h0 });
  await press('Insert column right');
  b = await box();
  check('Insert column right: a 3rd column as wide as the last one (20 mm), the box wider by it', (b.html.match(/<col /g) || []).length === 3 && Math.abs(b.w - (w0 + 20)) < 0.6, { w: b.w, w0, html: b.html });
  await t.key('z', ['control']); await sleep(300);
  b = await box();
  check('Undo takes the column back in one step', (b.html.match(/<col /g) || []).length === 2 && Math.abs(b.w - w0) < 0.01, b);
  await t.key('z', ['control']); await sleep(300);
  b = await box();
  check('…and Undo again the row', (b.html.match(/<tr/g) || []).length === 3 && Math.abs(b.h - h0) < 0.01, b);

  // cell colour / border / padding / text position on the whole table
  const setSelect = (label, value) => js(`(() => { const r = [...document.querySelectorAll('#props .psec[data-sec="table"] .prow')].find(r => r.querySelector('label').textContent === ${JSON.stringify(label)});
    const s = r.querySelector('select'); s.value = ${JSON.stringify(value)}; s.dispatchEvent(new Event('change')); return true; })()`);
  await setSelect('Border', '1.5'); await sleep(300);
  b = await box();
  check('Border 1.5 pt goes on every cell', (b.html.match(/border-width: ?0\.53mm/g) || []).length === 5, b.html);
  await setSelect('Border', '0'); await sleep(300);
  b = await box();
  check('Border None: no lines', (b.html.match(/border-style: ?none/g) || []).length === 5, b.html);
  await click('#props .psec[data-sec="table"] button[title="Text in the middle"]');
  b = await box();
  check('Text in the middle on every cell', (b.html.match(/vertical-align: ?middle/g) || []).length === 5, b.html);
  const setPad = await js(`(() => { const r = [...document.querySelectorAll('#props .psec[data-sec="table"] .prow')].find(r => r.querySelector('label').textContent === 'Cell padding');
    const i = r.querySelector('input'); i.value = '2'; i.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(300);
  b = await box();
  check('Cell padding 2 mm on every cell', setPad && (b.html.match(/padding: ?2mm/g) || []).length === 5, b.html);

  // ---- typing in a cell: the section works on that cell, and the cursor stays in it
  await js(`window.__bohpumApp.startEditing(${JSON.stringify(b.id)})`); await sleep(200);
  const caretIn = (text) => js(`(() => { const kt = document.querySelector('.kobj.editing .kt'); const td = [...kt.querySelectorAll('td')].find(c => c.textContent.trim() === ${JSON.stringify(text)});
    const r = document.createRange(); r.selectNodeContents(td.querySelector('p')); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; })()`);
  await caretIn('DR'); await sleep(400);
  p = await panel();
  check('Cursor in DR: the section says "This cell"', p && p.cap === 'This cell', p);
  await press('Insert row above');
  b = await box();
  const where = await js(`(() => { const s = getSelection(); const td = s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('td'); return { editing: !!window.__bohpumApp.state.editing, cell: td && td.textContent.trim() }; })()`);
  check('Insert row above DR: a new row between Posted and DR', /Posted[\s\S]*<tr[^>]*><td[^>]*><p[^>]*><br><\/p><\/td><td[^>]*><p[^>]*><br><\/p><\/td><\/tr>[\s\S]*DR/.test(b.html), b.html);
  check('…and the cursor is still in DR, still typing', where.editing && where.cell === 'DR', where);
  await caretIn('6502'); await sleep(300);
  await click('#props .psec[data-sec="table"] button[title="Text at the bottom"]');
  b = await box();
  check('Text at the bottom only on the cursor’s cell (6502)', /vertical-align: ?bottom[^>]*><p[^>]*>(<span[^>]*>)?6502/.test(b.html) && (b.html.match(/vertical-align: ?bottom/g) || []).length === 1, b.html);
  await press('Delete row');
  b = await box();
  check('Delete row (cursor in 6502): the 5952 / 6502 row is gone', !/6502|5952/.test(b.html) && /DR/.test(b.html), b.html);
  await press('Delete column');
  b = await box();
  const cells = (b.html.match(/<td/g) || []).length;
  check('Delete column: the header narrows, one column left', (b.html.match(/<col /g) || []).length === 1 && !/colspan/.test(b.html) && cells === 3, b.html);
  p = await panel();
  check('With one column left, Delete column is greyed out', p && p.buttons.includes('Delete column (off)'), p);
});
