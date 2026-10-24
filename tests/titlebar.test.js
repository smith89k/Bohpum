// Own title row: logo, menu words, publication name, Windows' buttons over the right end; menus
// open from the words, Alt+letter and F10; File shortcuts are handled by the page.
const { Menu } = require('electron');
const { run } = require('./harness');

const popups = [];

run(async (t, check) => {
  await t.ready();
  const b = t.win.getBounds(), c = t.win.getContentBounds();
  const bar = await t.js(`(() => {
    const tb = document.getElementById('titlebar'); if (!tb) return null;
    const cs = getComputedStyle(tb), wco = navigator.windowControlsOverlay, r = wco && wco.getTitlebarAreaRect();
    return {
      region: cs.getPropertyValue('-webkit-app-region'),
      menuRegion: getComputedStyle(document.querySelector('#menus [data-menu="0"]')).getPropertyValue('-webkit-app-region'),
      menus: [...document.querySelectorAll('#menus [data-menu]')].map(m => m.textContent.trim()),
      title: document.getElementById('doc-title').textContent,
      overlay: !!(wco && wco.visible), padRight: parseFloat(cs.paddingRight), reserved: r ? innerWidth - r.x - r.width : 0,
      brandInTitle: !!tb.querySelector('.brand'), brandInToolbar: !!document.querySelector('#topbar .brand')
    };
  })()`);
  check('Windows title bar and menu row are gone', bar && bar.overlay && c.y - b.y <= 10, { b, c, overlay: bar && bar.overlay });
  check('Title row has the logo, seven menus and the publication name',
    bar && bar.brandInTitle && !bar.brandInToolbar && bar.menus.join(' ') === 'File Edit Insert Arrange Mailings View Help' && bar.title === 'test-shapes', bar);
  check('Title row is a drag area, its menu words are not', bar && bar.region === 'drag' && bar.menuRegion === 'no-drag', bar);
  check('Nothing sits under the window buttons', bar && bar.reserved > 100 && bar.padRight >= bar.reserved, bar);

  await t.js('window.__bohpumApp.cmd("page-add")');
  const dirtyTitle = await t.js('document.getElementById("doc-title").textContent');
  check('Publication name shows the unsaved dot', dirtyTitle === 'test-shapes •', { dirtyTitle });

  const menu = Menu.getApplicationMenu();
  await t.click('#menus [data-menu="0"]');
  check('Clicking File opens the File menu under the word', popups[0] && popups[0].menu === menu.items[0].submenu && popups[0].y >= 28 && popups[0].y <= 40,
    popups[0] && { x: popups[0].x, y: popups[0].y });
  await t.key('E', ['alt']);
  check('Alt+E opens the Edit menu', popups[1] && popups[1].menu === menu.items[1].submenu, { count: popups.length });
  await t.key('F10');
  check('F10 opens the File menu', popups[2] && popups[2].menu === menu.items[0].submenu, { count: popups.length });

  await t.key('P', ['control']);
  const printOpen = await t.js('!!document.querySelector(".print-preview")');
  check('Ctrl+P opens Print', printOpen, { printOpen });
  await t.key('Escape');

  const left = menu.items[0].submenu.items.filter(i => i.accelerator && !i.role && i.registerAccelerator !== false).map(i => i.label);
  check('No File shortcut is left to the hidden Windows menu', left.length === 0, left);
}, {
  setup: () => {
    // Record native menu pop-ups instead of showing them
    Menu.prototype.popup = function (opts = {}) {
      popups.push({ menu: this, x: opts.x, y: opts.y });
      if (opts.callback) setTimeout(opts.callback, 10);
    };
  }
});
