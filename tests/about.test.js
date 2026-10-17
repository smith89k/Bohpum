// Help > About shows the app's own About page, as in Sastra PDF: logo and names, version, what it does,
// the author with links, and the open-source credits. Links open in the normal browser, never in the app.
const { app, dialog, shell, Menu } = require('electron');
const { run } = require('./harness');

const native = [], opened = [];

run(async (t, check) => {
  await t.ready();
  const item = Menu.getApplicationMenu().items.find(i => i.label.replace('&', '') === 'Help').submenu.items.find(i => /About/.test(i.label));
  item.click(); await t.sleep(400);
  const about = await t.js(`(() => { const m = document.querySelector('#modal-root .modal.about'); if (!m) return null;
    const q = (s) => m.querySelector(s);
    return { name: q('.about-name').firstChild.textContent, km: q('.about-name .km').textContent, ver: q('.about-ver').textContent,
      logo: !!q('.about-head img[src$="logo.png"]'), author: q('.author b').firstChild.textContent, photo: !!q('.author img[src$="author.jpg"]'),
      links: [...m.querySelectorAll('.links a')].map(a => a.href), credits: [...m.querySelectorAll('.credits li')].map(li => li.textContent),
      heads: [...m.querySelectorAll('h3')].map(h => h.textContent), foot: q('.modal-f').textContent }; })()`);
  check('Help > About opens the app\'s own About page, not a Windows box', !!about && native.length === 0, { about, native });
  check('Logo, Bohpum and បោះពុម្ព, and the version', about && about.logo && about.name === 'Bohpum' && about.km === 'បោះពុម្ព' && about.ver === 'Version ' + app.getVersion(), about);
  check('Made by: the author, photo and three links', about && about.author === 'Sunnguon Taing' && about.photo
    && about.links.join(' ') === 'https://smith89k.com/ https://www.linkedin.com/in/sunnguon/ https://github.com/smith89k', about);
  check('Built with open source: Electron (its real version), LibreOffice, Noto Sans Khmer', about
    && about.heads.join('|') === 'Made by|Built with open source'
    && about.credits.some(c => c.includes('Electron') && c.includes(process.versions.electron) && c.includes('MIT'))
    && about.credits.some(c => c.includes('LibreOffice') && c.includes('MPL-2.0'))
    && about.credits.some(c => c.includes('Noto Sans Khmer') && c.includes('SIL OFL 1.1')), about);
  check('Footer: © 2026 smith89k and Close', about && /© 2026 smith89k/.test(about.foot) && /Close/.test(about.foot), about);

  const windows = () => require('electron').BrowserWindow.getAllWindows().length;
  const before = windows();
  await t.js(`(() => { document.querySelector('.about .links a[href*="github"]').id = 'gh'; return true; })()`);
  await t.click('#gh'); await t.sleep(300);
  check('A link opens in the normal browser, not inside the app', opened.join() === 'https://github.com/smith89k' && windows() === before, { opened, windows: windows() });

  await t.key('Escape');
  check('Esc closes it', !(await t.js(`!!document.querySelector('#modal-root .modal.about')`)), null);
}, {
  setup: () => {
    dialog.showMessageBox = async (...a) => { native.push(a[a.length - 1].message); return { response: 0 }; };
    shell.openExternal = async (u) => { opened.push(u); };
  }
});
