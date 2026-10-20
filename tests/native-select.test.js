// Like Sastra PDF and other Windows apps: dragging over the window's words (menus, panels, status bar, dialogs) never
// paints them blue, and the pointer stays an arrow over them. Only the places you type keep normal text selection:
// text boxes, number boxes and a text frame being edited.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const style = (sel) => t.js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const s = getComputedStyle(e); return { select: s.userSelect, cursor: s.cursor }; })()`);
  const picked = () => t.js('getSelection().toString()');

  const body = await style('body'), status = await style('#status'), props = await style('#props');
  check('The window\'s words can\'t be selected, and the pointer is an arrow over them',
    body.select === 'none' && body.cursor === 'default' && status.select === 'none' && props.select === 'none', { body, status, props });

  await t.js('getSelection().removeAllRanges()');
  await t.drag('#status', 300, 0);
  const s1 = await picked();
  await t.drag('#props', 0, 120);
  const s2 = await picked();
  check('Dragging over the status bar and the side panel selects nothing', s1 === '' && s2 === '', { s1, s2 });

  const font = await style('#tb-font'), size = await style('#tb-size');
  check('The font and size boxes still select text', font.select === 'text' && size.select === 'text', { font, size });

  const kt = await t.js(`(() => { const S = window.__bohpumApp.state; const box = S.doc.pages[0].objects.find(o => o.type === 'box' && o.html);
    window.__bohpumApp.startEditing(box.id);
    const k = document.querySelector('.kt[contenteditable="true"]'); if (!k) return null;
    const r = document.createRange(); r.selectNodeContents(k); getSelection().removeAllRanges(); getSelection().addRange(r);
    const inner = k.querySelector('span, p') || k;
    return { select: getComputedStyle(k).userSelect, inner: getComputedStyle(inner).userSelect, text: getSelection().toString().trim().length };
  })()`);
  await t.js('window.__bohpumApp.finishEditing()');
  check('A text frame being edited still selects its text', kt && kt.select === 'text' && kt.inner === 'text' && kt.text > 0, kt);
});
