// Right panel headings have an icon in front, as in Sastra PDF's Tools panel: 15 px, in the accent colour,
// 8 px before the uppercase title. Every heading, for the page and for each kind of object.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const heads = () => t.js(`(() => { const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim();
    const rgb = (c) => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; };
    return [...document.querySelectorAll('#props .psec h4')].map(h => { const b = h.querySelector('.psec-head'), s = b && b.firstElementChild, cs = s && getComputedStyle(s);
      return { title: h.textContent.trim(), icon: !!s && s.tagName === 'svg' && s.innerHTML.length > 20, size: s && s.getBoundingClientRect().width, green: !!cs && cs.color === rgb(accent), gap: b && getComputedStyle(b).columnGap,
        svg: s ? s.innerHTML : '' }; }); })()`);
  const topIcons = {};
  const ok = (hs) => hs.length && hs.every(h => h.icon && Math.round(h.size) === 15 && h.green && h.gap === '8px');

  const page = await heads();
  check('Nothing selected: Page size, Margin guides, Background each have a green 15 px icon',
    page.map(h => h.title).join('|') === 'Page size|Margin guides|Background' && ok(page), page);

  const kinds = await t.js(`(() => { const os = window.__bohpumApp.state.doc.pages[0].objects; const f = (p) => (os.find(p) || {}).id;
    return { text: f(o => o.type === 'box' && o.shape === 'none'), rect: f(o => o.type === 'box' && o.shape === 'rect'), picture: f(o => o.type === 'image') }; })()`);
  for (const [kind, id] of Object.entries(kinds)) {
    if (!id) { check(`A ${kind} in the sample`, false, kinds); continue; }
    await t.key('Escape'); await t.click(`#workspace .kcontent > .kobj[data-id="${id}"]`); await t.sleep(200);
    const hs = await heads();
    check(`${kind}: every heading has its icon (${hs.map(h => h.title).join(', ')})`, hs.length >= 2 && ok(hs), hs);
    // the kind of object is told once: by the top heading's icon, and by its own section further down — never by
    // the top title as well ("Rectangle" over "Type: Rectangle", "Picture" over the Picture section)
    const titles = hs.map(h => h.title);
    check(`${kind}: the top heading is "Position & size", and no heading appears twice`,
      titles[0] === 'Position & size' && new Set(titles).size === titles.length && !titles.includes('Rectangle'), titles);
    topIcons[kind] = hs[0] && hs[0].svg;
  }
  // a new line, drawn on the grey area beside the page (the sample's lines lie under other things)
  await t.key('Escape'); await t.js('window.__bohpumApp.cmd("tool-line")');
  await t.js(`(() => { const b = document.getElementById('workspace').getBoundingClientRect(); const d = document.createElement('div'); d.id = 'line-here';
    Object.assign(d.style, { position: 'fixed', left: b.left + 30 + 'px', top: b.top + 30 + 'px', width: '2px', height: '2px', pointerEvents: 'none' }); document.body.append(d); return true; })()`);
  await t.drag('#line-here', 90, 0); await t.sleep(200);
  const ls = await heads();
  check(`line: every heading has its icon (${ls.map(h => h.title).join(', ')})`, ls.some(h => h.title === 'Line') && ok(ls), ls);
  topIcons.line = ls[0] && ls[0].svg;
  check('line: the top heading is "Position & size"', ls[0] && ls[0].title === 'Position & size', ls.map(h => h.title));
  const icons = Object.values(topIcons);
  check('The top heading\'s icon still shows what is selected (text, rectangle, picture and line each have their own)',
    icons.length === 4 && icons.every(Boolean) && new Set(icons).size === 4, Object.keys(topIcons));

  await t.key('Escape'); await t.js('window.__bohpumApp.cmd("select-all")'); await t.sleep(200);
  const all = await heads();
  check('Several selected: the top heading still says how many', /^\d+ objects selected$/.test(all[0] && all[0].title), all.map(h => h.title));

  await t.js('window.__bohpumApp.cmd("toggle-master")'); await t.sleep(300);
  const ms = await heads();
  check('Master page heading has its icon too', ms[0] && ms[0].title === 'Master page' && ok(ms), ms);
});
