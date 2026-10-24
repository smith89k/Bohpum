// Mail merge lists are read in the main process: xlsx parts (Khmer intact), csv encodings, plain-words errors.
const { dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');
const { makeXlsx } = require('./make-xlsx');
const { readList, listError } = require('../list.js');

run(async (t, check) => {
  await t.ready();
  const dir = t.ctx.tmp, f = (n) => path.join(dir, n);
  makeXlsx(f('two.xlsx'), { sheets: [{ name: 'People', rows: [['Name', 'Age'], ['សុខ ដារា', 31]] }, { name: 'More', rows: [['A'], ['b']] }] });

  const r = await readList(f('two.xlsx'));
  const keys = r.files ? Object.keys(r.files).sort() : [];
  check('reads the xlsx parts', r.kind === 'xlsx' && JSON.stringify(keys) === JSON.stringify(['xl/_rels/workbook.xml.rels', 'xl/sharedStrings.xml', 'xl/styles.xml',
    'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']), keys);
  check('Khmer survives', r.files && r.files['xl/sharedStrings.xml'].includes('សុខ ដារា'));

  fs.writeFileSync(f('bom.csv'), Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('Name,Age\nAnn,3\n')]));
  const bom = await readList(f('bom.csv'));
  check('csv: UTF-8 with BOM', bom.kind === 'csv' && bom.text.startsWith('Name') && !bom.text.includes('﻿'), bom);
  fs.writeFileSync(f('w.csv'), Buffer.from([0x43, 0x61, 0x66, 0xE9]));
  check('csv: Windows-1252', (await readList(f('w.csv'))).text === 'Café');

  check('missing file', JSON.stringify(await readList(f('nope.xlsx'))) === JSON.stringify({ error: 'The list was moved or deleted.' }));
  check('busy file', listError({ code: 'EBUSY' }) === 'The list is open in another program, or Bohpum may not read it. Close it in Excel and try again.');
  fs.writeFileSync(f('text.xlsx'), 'just some text');
  check('not really an xlsx', (await readList(f('text.xlsx'))).error === "This file isn't an Excel list Bohpum can read.");

  // no reader (the PC may or may not have LibreOffice, so the reader's answer is injected)
  fs.writeFileSync(f('old.xls'), 'x');
  const noReader = await readList(f('old.xls'), { convertXls: () => Promise.reject(Object.assign(new Error('none'), { code: 'NO_XLS_READER' })) });
  check('xls without a reader', noReader.error === "Bohpum can't read old .xls lists on this PC. Open it in Excel and save it as .xlsx.", noReader);
  const viaXls = await readList(f('old.xls'), { convertXls: async () => fs.readFileSync(f('two.xlsx')) });
  check('xls through a converter', viaXls.kind === 'xlsx');

  const ipc = await t.js(`window.api.readList(${JSON.stringify(f('bom.csv'))})`);
  check('IPC adds the locale', ipc.kind === 'csv' && typeof ipc.locale === 'string' && ipc.locale.length > 0, ipc);
  const ipcXlsx = await t.js(`window.api.readList(${JSON.stringify(f('two.xlsx'))})`);
  check('IPC reads an xlsx', ipcXlsx.kind === 'xlsx' && ipcXlsx.files['xl/sharedStrings.xml'].includes('សុខ ដារា'));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [f('two.xlsx')] });
  check('pickList returns the chosen path', (await t.js('window.api.pickList()')) === f('two.xlsx'));
});
