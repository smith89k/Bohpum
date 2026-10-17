// The Pages panel resizes by dragging its right edge (140–400 px); thumbnails grow with it; the width is
// remembered for next time; double-clicking the edge goes back to the normal width (180 px).
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const st = () => t.js(`(() => { const p = document.getElementById('pages').getBoundingClientRect(), h = document.getElementById('pages-resizer');
    return { w: Math.round(p.width), thumb: Math.round(document.querySelector('#page-list .tw').getBoundingClientRect().width),
      wrapLeft: Math.round(document.getElementById('workspace-wrap').getBoundingClientRect().left), cursor: h && getComputedStyle(h).cursor }; })()`);
  const saved = () => JSON.parse(fs.readFileSync(path.join(t.ctx.userData, 'settings.json'), 'utf8')).pagesW;

  const s0 = await st();
  check('Starts at the remembered width (250)', s0.w === 250 && s0.wrapLeft === 250, s0);
  check('The right edge is a resize handle', s0.cursor === 'col-resize', s0);

  await t.js(`(() => { const h = document.getElementById('pages-resizer'); h.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return true; })()`);
  await t.sleep(400);
  const s1 = await st();
  check('Double-click: back to the normal width, thumbnails as before (130 px for this card)', s1.w === 180 && s1.thumb === 130 && saved() == null, { s1, saved: saved() });

  await t.drag('#pages-resizer', 100, 0); await t.sleep(400);
  const s2 = await st();
  check('Dragging the edge 100 px right makes the panel 280 px wide; the page area starts after it', s2.w === 280 && s2.wrapLeft === 280, s2);
  check('Thumbnails grow with the panel', s2.thumb > 200, s2);
  check('The width is remembered', saved() === 280, saved());

  await t.drag('#pages-resizer', -400, 0); await t.sleep(300);
  const s3 = await st();
  await t.drag('#pages-resizer', 600, 0); await t.sleep(300);
  const s4 = await st();
  check('It stays between 140 and 400 px', s3.w === 140 && s4.w === 400, { narrow: s3.w, wide: s4.w });
}, {
  setup: (ctx) => fs.writeFileSync(path.join(ctx.userData, 'settings.json'), JSON.stringify({ pagesW: 250 }))
});
