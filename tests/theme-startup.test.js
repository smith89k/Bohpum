// A saved Dark theme is in place from the very start (no light flash): Windows' theme source, the
// page's colours, the theme button and View > Theme all agree before anything is clicked.
const { nativeTheme, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

let atWindow = null;

run(async (t, check) => {
  await t.ready(null);
  await t.sleep(300);
  const page = await t.js(`({ chrome: getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim(), dark: matchMedia('(prefers-color-scheme: dark)').matches, title: document.getElementById('b-theme').title })`);
  const radio = ['system', 'light', 'dark'].find(k => Menu.getApplicationMenu().getMenuItemById('theme-' + k).checked);
  check('Saved Dark theme applies from the start', atWindow === 'dark' && page.dark && page.chrome === '#1f1d1b' && /^Theme: Dark/.test(page.title) && radio === 'dark', { atWindow, page, radio });
}, {
  setup: (ctx) => {
    fs.writeFileSync(path.join(ctx.userData, 'settings.json'), JSON.stringify({ theme: 'dark' }));
    require('electron').app.on('browser-window-created', () => { if (atWindow === null) atWindow = nativeTheme.themeSource; });
  }
});
