// Print dialog: the card position (and other settings) survive Esc / Close, and only real changes count as edits.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const readPos = () => t.js(`(() => { const l = document.querySelector('[data-k="left"]'), p = document.querySelector('[data-k="top"]'); return l && p ? { left: +l.value, top: +p.value } : null; })()`);
  const docState = () => t.js(`(() => { const S = window.__bohpumApp.state; return { dirty: S.dirty, hist: S.hist.length, print: S.doc.print && { left: S.doc.print.left, top: S.doc.print.top } }; })()`);
  const openPrint = async () => {
    await t.js('window.__bohpumApp.cmd("print")');
    await t.waitFor('!!document.querySelector(".print-preview .slot")');
    await t.sleep(300);
  };
  const dialogOpen = () => t.js('!!document.querySelector(".print-preview")');

  const before = await docState();
  await openPrint();
  await t.key('Escape');
  const after = await docState();
  check('Esc with no changes leaves the publication unchanged', !(await dialogOpen()) && !after.dirty && after.hist === before.hist, { before, after });

  await openPrint();
  const start = await readPos();
  await t.drag('.print-preview .slot', 70, 45);
  const moved = await readPos();
  await t.key('Escape');
  const closed = !(await dialogOpen());
  await openPrint();
  const reopened = await readPos();
  check('Drag then Esc: position kept on reopen',
    closed && (moved.left !== start.left || moved.top !== start.top) && reopened.left === moved.left && reopened.top === moved.top,
    { start, moved, reopened, closed });

  await t.js(`(() => { const i = document.querySelector('[data-k="left"]'); i.value = 12.5; i.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  await t.click('.modal-f [data-a="close"]');
  const closed3 = !(await dialogOpen());
  await openPrint();
  const reopened3 = await readPos();
  await t.key('Escape');
  check('Typed Left then Close: value kept on reopen', closed3 && reopened3.left === 12.5, { reopened3, closed3 });

  const st = await docState();
  await t.js('window.__bohpumApp.cmd("undo")');
  const undone = await docState();
  check('Position change is a normal edit (unsaved, undoable)', st.dirty && undone.print && undone.print.left !== 12.5, { st, undone });
});
