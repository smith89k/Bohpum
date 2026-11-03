// Moving a text box by its edge also works while typing in it. A table fills its whole box, so after one click the
// box is being typed in; its edge then still shows the move arrow, and dragging it moves the box (as in Publisher).
const { run } = require('./harness');
const fs = require('fs');
const path = require('path');

const FODG = `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 office:mimetype="application/vnd.oasis.opendocument.graphics">
 <office:body><office:drawing>
  <draw:page draw:name="page1">
   <draw:frame svg:width="8cm" svg:height="3cm" svg:x="3cm" svg:y="3cm">
    <table:table><table:table-column/><table:table-column/>
     <table:table-row><table:table-cell><text:p>DR</text:p></table:table-cell><table:table-cell><text:p>CR</text:p></table:table-cell></table:table-row>
     <table:table-row><table:table-cell><text:p>5952</text:p></table:table-cell><table:table-cell><text:p>6502</text:p></table:table-cell></table:table-row>
    </table:table>
   </draw:frame>
  </draw:page>
 </office:drawing></office:body>
</office:document>`;

run(async (t, check) => {
  const { js, sleep, waitFor, wc } = t;
  await t.ready(null);
  const file = path.join(t.ctx.tmp, 'move.fodg');
  fs.writeFileSync(file, FODG);
  await js(`window.__bohpumApp.openFile(${JSON.stringify(file)})`);
  await waitFor(`window.__bohpumApp.state.doc.name === 'move'`);
  const box = () => js(`(() => { const A = window.__bohpumApp, o = A.state.doc.pages[0].objects[0]; return { id: o.id, x: o.x, y: o.y, editing: A.state.editing }; })()`);
  const b0 = await box();
  const rect = await js(`(() => { const r = document.querySelector('#workspace .kcontent > .kobj[data-id="${b0.id}"]').getBoundingClientRect(); return { l: r.left, t: r.top, w: r.width, h: r.height }; })()`);
  const at = { x: Math.round(rect.l + rect.w * 0.3), y: Math.round(rect.t + rect.h * 0.3) }; // inside a cell
  const edge = { x: Math.round(rect.l + 2), y: Math.round(rect.t + rect.h / 2) }; // 2 px in from the left side

  // one click in a cell: typing
  wc.sendInputEvent({ type: 'mouseMove', ...at });
  wc.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 });
  await sleep(300);
  check('A click in a cell types there', (await box()).editing === b0.id, await box());

  // the edge, while typing: the move arrow
  wc.sendInputEvent({ type: 'mouseMove', ...edge }); await sleep(150);
  const cursor = await js(`getComputedStyle(document.elementFromPoint(${edge.x}, ${edge.y})).cursor`);
  check('While typing, the box’s edge shows the move arrow', cursor === 'move', cursor);

  // dragging the edge moves the box and stops typing
  wc.sendInputEvent({ type: 'mouseDown', ...edge, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) { wc.sendInputEvent({ type: 'mouseMove', x: edge.x + 6 * i, y: edge.y + 8 * i, modifiers: ['leftButtonDown'] }); await sleep(30); }
  wc.sendInputEvent({ type: 'mouseUp', x: edge.x + 60, y: edge.y + 80, button: 'left', clickCount: 1 });
  await sleep(300);
  const b1 = await box();
  const sel = await js(`[...window.__bohpumApp.state.sel]`);
  check('Dragging the edge while typing moves the box', b1.y > b0.y + 5 && b1.x > b0.x + 3, { b0, b1 });
  check('…stops typing and leaves the box selected', !b1.editing && sel.length === 1 && sel[0] === b0.id, { b1, sel });
  await t.key('z', ['control']); await sleep(250);
  const b2 = await box();
  check('Undo puts it back', Math.abs(b2.x - b0.x) < 0.01 && Math.abs(b2.y - b0.y) < 0.01, b2);

  // inside a cell (not the edge), dragging while typing still selects text, so cells can be chosen
  wc.sendInputEvent({ type: 'mouseMove', ...at });
  wc.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 });
  wc.sendInputEvent({ type: 'mouseUp', ...at, button: 'left', clickCount: 1 });
  await sleep(300);
  wc.sendInputEvent({ type: 'mouseDown', ...at, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 10; i++) { wc.sendInputEvent({ type: 'mouseMove', x: at.x + Math.round(rect.w * 0.05 * i), y: at.y, modifiers: ['leftButtonDown'] }); await sleep(30); }
  wc.sendInputEvent({ type: 'mouseUp', x: at.x + Math.round(rect.w * 0.5), y: at.y, button: 'left', clickCount: 1 });
  await sleep(300);
  const b3 = await box();
  check('Dragging inside the cells while typing doesn’t move the box', Math.abs(b3.x - b0.x) < 0.01 && Math.abs(b3.y - b0.y) < 0.01 && b3.editing === b0.id, b3);
});
