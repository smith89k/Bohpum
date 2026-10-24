// Mail merge lists are turned into columns and rows in the page: sheets, Excel cell kinds, number formats, headers, csv.
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');
const { makeXlsx } = require('./make-xlsx');

run(async (t, check) => {
  await t.ready();
  const dir = t.ctx.tmp, f = (n) => path.join(dir, n);
  const J = JSON.stringify, same = (a, b) => J(a) === J(b);
  // reads the file the way the page does, parses it, and answers with the result or the error text
  const parse = (file, opts = {}) => t.js(`(async () => { const m = await import('./merge.js'); try { return m.parseList(await window.api.readList(${J(f(file))}), ${J(opts)}); } catch (e) { return { threw: e.message }; } })()`);
  const fmt = (v, code, o) => t.js(`import('./merge.js').then(m => m.formatCell(${J(v)}, ${J(code)}, ${J(o)}))`);
  const en = { date1904: false, locale: 'en-GB' };

  makeXlsx(f('two.xlsx'), { sheets: [{ name: 'People', rows: [['Name', 'Title'], ['សុខ ដារា', 'Director'], ['Chan Mony', '']] }, { name: 'Other', rows: [['A'], ['b'], ['', ''], ['c']] }] });
  const first = await parse('two.xlsx');
  check('first sheet, header, rows', same(first.columns, ['Name', 'Title']) && same(first.rows, [['សុខ ដារា', 'Director'], ['Chan Mony', '']]) && same(first.sheets, ['People', 'Other']) && first.sheet === 'People', first);
  const other = await parse('two.xlsx', { sheet: 'Other' });
  check('chosen sheet', same(other.columns, ['A']) && same(other.rows, [['b'], ['c']]) && other.sheet === 'Other', other);

  // what real Excel writes: rich-text strings, inline strings, formula results, booleans, errors, a missing header cell, empty rows
  const S = '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  makeXlsx(f('real.xlsx'), { sheets: [{ name: 'S', rows: [] }], raw: {
    'xl/sharedStrings.xml': '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>Name</t></si><si><t>Photo</t></si>' +
      '<si><r><t>សុខ</t></r><r><t xml:space="preserve"> ដារា</t></r><rPh><t>x</t></rPh></si></sst>',
    'xl/worksheets/sheet1.xml': S +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>Mony</t></is></c><c r="C2" t="str"><f>A2</f><v>X</v></c></row>' +
      '<row r="3"><c r="A3" t="b"><v>1</v></c><c r="B3" t="e"><v>#N/A</v></c></row>' +
      '<row r="5"/><row r="6"/><row r="7"><c r="A7"/></row><row r="8"/><row r="9"/></sheetData></worksheet>' } });
  const real = await parse('real.xlsx');
  check('real Excel cell kinds', same(real.columns, ['Name', 'Column B', 'Photo']) && same(real.rows, [['សុខ ដារា', 'Mony', 'X'], ['TRUE', '#N/A', '']]), real);

  check('date from the locale short date', await fmt(45597, 14, en) === '01/11/2024');
  check('date code d mmmm yyyy', await fmt(45597, 'd mmmm yyyy', en) === '1 November 2024');
  check('1904 dates', await fmt(44135, 'yyyy-mm-dd', { ...en, date1904: true }) === '2024-11-01');
  check('thousands and decimals', await fmt(1234.5, '#,##0.00', en) === '1,234.50');
  check('percent', await fmt(0.256, '0%', en) === '26%');
  check('currency text', await fmt(12, '"$"#,##0', en) === '$12');
  check('time with AM/PM', await fmt(45597.75, 'h:mm AM/PM', en) === '6:00 PM');
  check('negative section', await fmt(-5, '0;(0)', en) === '(5)');
  check('plain 0 code', await fmt(7, '0', en) === '7');
  check('weird code falls back', await fmt(3, '[Red][<10]0;0', en) === '3');
  check('rounds like Excel: 2.675', await fmt(2.675, '0.00', en) === '2.68');
  check('rounds like Excel: 19.995', await fmt(19.995, '#,##0.00', en) === '20.00');
  check('rounds like Excel: percent', await fmt(0.285, '0%', en) === '29%');
  check('negative with thousands', await fmt(-1234, '#,##0', en) === '-1,234');
  check('General keeps a phone number whole', await fmt(85512345678, 'General', en) === '85512345678');
  check('General keeps 15 digits', await fmt(1 / 3, 'General', en) === '0.333333333333333');
  check('@ on a number', await fmt(12.5, '@', en) === '12.5');
  check('General with text', await fmt(12, 'General\" kg\"', en) === '12 kg');
  check('General with a locale tag', await fmt(12, '[$-409]General', en) === '12');
  check('rounds like Excel: exponent', await fmt(2.675, '0.00E+00', en) === '2.68E+00');
  check('exponent rolls over', await fmt(9.999, '0.00E+00', en) === '1.00E+01');
  check('@ keeps the minus', await fmt(-12, '@', en) === '-12');
  check('General long number', await fmt(0.1 + 0.2, 'General', en) === '0.3');

  // through a real file: a styled date and a number, and a text cell that looks like a number
  makeXlsx(f('fmt.xlsx'), { numFmts: { 164: 'd mmmm yyyy', 165: '0.00' }, sheets: [{ name: 'S', rows: [['When', 'N', 'Code'], [{ v: 45597, s: 1 }, { v: 2.5, s: 2 }, '012345']] }] });
  const fm = await parse('fmt.xlsx');
  check('styled cells and text numbers', same(fm.rows, [['1 November 2024', '2.50', '012345']]), fm);

  makeXlsx(f('dup.xlsx'), { sheets: [{ name: 'S', rows: [['Name', '', 'Name', ' ឈ្មោះ '], ['a', 'b', 'c', 'd']] }] });
  check('header names: blank and duplicate', same((await parse('dup.xlsx')).columns, ['Name', 'Column B', 'Name (2)', 'ឈ្មោះ']));

  makeXlsx(f('head-only.xlsx'), { sheets: [{ name: 'S', rows: [['Name']] }] });
  makeXlsx(f('blank-head.xlsx'), { sheets: [{ name: 'S', rows: [['', ''], ['a', 'b']] }] });
  check('empty list', (await parse('head-only.xlsx')).threw === 'This list has no people in it');
  check('header row blank', (await parse('blank-head.xlsx')).threw === 'The first row should hold the column names.');

  fs.writeFileSync(f('semi.csv'), 'Name;Title\r\n"Sok, Dara";"He said ""hi"""\r\n');
  const csv = await parse('semi.csv');
  check('csv', same(csv.columns, ['Name', 'Title']) && same(csv.rows, [['Sok, Dara', 'He said "hi"']]) && same(csv.sheets, []), csv);
  fs.writeFileSync(f('comma.csv'), 'a,b\nx,"multi\nline"\n');
  check('csv: commas and a newline inside quotes', same((await parse('comma.csv')).rows, [['x', 'multi\nline']]));
  check('rowKey', await t.js(`import('./merge.js').then(m => m.rowKey(['a','b']))`) === '["a","b"]');
});
