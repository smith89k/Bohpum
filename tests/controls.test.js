// Tick boxes (and round options) use Bohpum's own look, matching the dropdowns; clicking still works.
const { run } = require('./harness');

const GREEN = 'rgb(31, 122, 76)', WHITE = 'rgb(255, 255, 255)';

run(async (t, check) => {
  t.wc.getPrintersAsync = async () => [{ name: 'Office HP', displayName: 'Office HP', isDefault: true, description: '', status: 0, options: {} }];
  await t.ready();
  // every visible tick box / round option: its look
  const look = () => t.js(`[...document.querySelectorAll('input[type=checkbox], input[type=radio]')].filter(i => i.getClientRects().length).map(i => {
    const cs = getComputedStyle(i), r = i.getBoundingClientRect();
    return { label: (i.closest('label') || i).textContent.trim().slice(0, 28), app: cs.appearance, w: Math.round(r.width), h: Math.round(r.height), radius: cs.borderTopLeftRadius, checked: i.checked, bg: cs.backgroundColor, img: cs.backgroundImage !== 'none' };
  })`);
  const custom = (b) => b.app === 'none' && b.w === 16 && b.h === 16 && b.radius === '4px' && (b.checked ? b.bg === GREEN && b.img : b.bg === WHITE && !b.img);

  const l1 = await look();
  check('Side panel tick boxes: custom look (16 × 16, rounded; ticked = green with a tick)', l1.length >= 2 && l1.every(custom), l1);

  await t.js(`[...document.querySelectorAll('#props label.chk')].find(l => l.textContent.includes('Show guides')).querySelector('input').setAttribute('data-test', 'guides')`);
  await t.click('[data-test="guides"]');
  const g = await t.js(`({ on: window.__bohpumApp.state.showGuides, box: (() => { const i = [...document.querySelectorAll('#props label.chk')].find(l => l.textContent.includes('Show guides')).querySelector('input'); return { checked: i.checked, bg: getComputedStyle(i).backgroundColor }; })() })`);
  check('A real click still ticks / unticks (Show guides off, box white)', g.on === false && g.box.checked === false && g.box.bg === WHITE, g);

  await t.js('window.__bohpumApp.cmd("print")');
  await t.waitFor('!!document.querySelector(".print-preview .slot")');
  const crop = () => t.js(`(() => { const i = document.querySelector('[data-k="crop"]'), cs = getComputedStyle(i); return { checked: i.checked, app: cs.appearance, w: Math.round(i.getBoundingClientRect().width), bg: cs.backgroundColor }; })()`);
  const c1 = await crop();
  await t.click('[data-k="crop"]');
  const c2 = await crop();
  check('Print screen: Crop marks uses the custom look and ticks green on click',
    c1.app === 'none' && c1.w === 16 && !c1.checked && c1.bg === WHITE && c2.checked && c2.bg === GREEN, { c1, c2 });
  await t.key('Escape');
});
