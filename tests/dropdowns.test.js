// Every dropdown uses Bohpum's own look (customizable select); mouse and keyboard still work, and
// keys pressed inside an open list don't reach the editor (no nudging the selection).
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  const apps = await t.js(`[...document.querySelectorAll('select')].map(s => (s.id || s.closest('[id]').id) + ':' + getComputedStyle(s).appearance)`);
  check('Every dropdown in the editor uses the custom look', apps.length >= 3 && apps.every(a => a.endsWith(':base-select')), apps);

  await t.click('#zoom-sel');
  const opened = await t.js('document.getElementById("zoom-sel").matches(":open")');
  await t.click('#zoom-sel option[value="100"]');
  const z = await t.js('({ zoom: window.__bohpumApp.state.zoom, open: document.getElementById("zoom-sel").matches(":open") })');
  check('Mouse: the zoom dropdown opens, picking 100% zooms to 100%', opened && !z.open && z.zoom === 1, { opened, z });

  await t.js('window.__bohpumApp.cmd("select-all")');
  const pos = () => t.js('JSON.stringify(window.__bohpumApp.state.doc.pages[0].objects.map(o => [o.x, o.y]))');
  const before = await pos();
  await t.js('document.getElementById("tb-ls").value = "1"; document.getElementById("tb-ls").focus()');
  await t.key('Down');
  const open2 = await t.js('document.getElementById("tb-ls").matches(":open")');
  await t.key('Down');
  await t.key('Enter');
  const after = await pos();
  const v = await t.js('document.getElementById("tb-ls").value');
  check('Keyboard: Down opens the list, Down + Enter picks the next value', open2 && v === '1.15', { open2, v });
  check('Arrow keys inside an open list do not move the selected objects', before === after, { before, after });
});
