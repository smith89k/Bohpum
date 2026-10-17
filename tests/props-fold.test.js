// Right panel sections fold and open from their headings, as in Sastra PDF's Tools panel: icon + name on the left,
// a chevron at the right edge. Each folds on its own, per kind of section, and stays folded after a restart.
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const secs = () => t.js(`[...document.querySelectorAll('#props .psec')].map(s => { const b = s.querySelector('h4 > .psec-head'); if (!b) return { key: s.dataset.sec, button: false };
    const r = b.getBoundingClientRect(), svgs = [...b.querySelectorAll('svg')], ic = svgs[0].getBoundingClientRect(), ch = svgs[svgs.length - 1], cr = ch.getBoundingClientRect(), name = b.querySelector('span').getBoundingClientRect();
    return { key: s.dataset.sec, button: b.tagName === 'BUTTON', expanded: b.getAttribute('aria-expanded'), folded: s.classList.contains('folded'),
      shown: [...s.children].filter(c => c.tagName !== 'H4' && getComputedStyle(c).display !== 'none').length,
      iconLeft: ic.right <= name.left, chevRight: ch.classList.contains('chev') && r.right - cr.right <= 9 && cr.left > name.right, turned: getComputedStyle(ch).transform !== 'none' }; })`);
  const by = (list, k) => list.find(s => s.key === k) || {};
  const settings = () => JSON.parse(fs.readFileSync(path.join(t.ctx.userData, 'settings.json'), 'utf8'));

  await t.key('Escape'); await t.sleep(200);
  const page = await secs();
  check('Nothing selected: Page size, Margin guides, Background, each heading a button, icon left, chevron at the right edge, all open',
    page.map(s => s.key).join('|') === 'pagesize|margins|background' && page.every(s => s.button && s.iconLeft && s.chevRight && s.expanded === 'true' && !s.folded && s.shown > 0), page);

  await t.click('#props .psec[data-sec="margins"] .psec-head'); await t.sleep(300);
  const f1 = await secs(), m1 = by(f1, 'margins');
  check('Click folds only that section: its controls hide, aria-expanded false, the chevron turns', m1.folded && m1.shown === 0 && m1.expanded === 'false' && m1.turned, m1);
  check('The other sections stay open', by(f1, 'pagesize').shown > 0 && by(f1, 'background').shown > 0 && !by(f1, 'pagesize').folded, f1);
  await t.click('#props .psec[data-sec="margins"] .psec-head'); await t.sleep(300);
  const m2 = by(await secs(), 'margins');
  check('Click again opens it', !m2.folded && m2.shown > 0 && m2.expanded === 'true' && !m2.turned, m2);

  await t.js(`document.querySelector('#props .psec[data-sec="pagesize"] .psec-head').focus()`);
  await t.key('Enter');
  const e1 = by(await secs(), 'pagesize'), quiet = await t.js(`({ editing: !!window.__bohpumApp.state.editing, sel: window.__bohpumApp.state.sel.size, boxes: document.getElementById('modal-root').children.length })`);
  check('Enter on a focused heading folds it, and does nothing else', e1.folded && quiet.sel === 0 && !quiet.editing && quiet.boxes === 0, { e1, quiet });
  await t.key('Space');
  check('Space opens it again', !by(await secs(), 'pagesize').folded, null);

  // the sample's ids are made when it is opened, so look them up again after the restart
  const findIds = () => t.js(`(() => { const os = window.__bohpumApp.state.doc.pages[0].objects; const f = (p) => (os.find(p) || {}).id;
    return { rect: f(o => o.type === 'box' && o.shape === 'rect'), text: f(o => o.type === 'box' && o.shape === 'none') }; })()`);
  let ids = await findIds();
  await t.click(`#workspace .kcontent > .kobj[data-id="${ids.rect}"]`); await t.sleep(250);
  await t.click('#props .psec[data-sec="fill"] .psec-head'); await t.sleep(250);
  await t.key('Escape'); await t.click(`#workspace .kcontent > .kobj[data-id="${ids.text}"]`); await t.sleep(250);
  const tb = await secs();
  check('A folded "Fill & line" stays folded on another kind of box; the rest are open', by(tb, 'fill').folded && by(tb, 'object').shown > 0 && !by(tb, 'textbox').folded, tb);
  await t.sleep(300);
  check('The folded sections are remembered', JSON.stringify(settings().propsFolded) === '["fill"]', settings());

  t.wc.reload(); await t.sleep(500);
  await t.ready();
  ids = await findIds();
  await t.click(`#workspace .kcontent > .kobj[data-id="${ids.rect}"]`); await t.sleep(250);
  const after = await secs();
  check('After a restart "Fill & line" is still folded', by(after, 'fill').folded && by(after, 'fill').expanded === 'false' && !by(after, 'arrange').folded, after);
  await t.click('#props .psec[data-sec="fill"] .psec-head'); await t.sleep(400);
  check('Opening every section saves an empty list', JSON.stringify(settings().propsFolded) === '[]', settings());
});
