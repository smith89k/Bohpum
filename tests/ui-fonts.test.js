// The app's own text uses the fonts of Sastra PDF, shipped inside the app (same files, same unicode ranges):
// IBM Plex Sans (English), Noto Sans Khmer (Khmer), IBM Plex Mono (numbers, version) — never the PC's fonts.
// Chromium's own answer per element: CSS.getPlatformFontsForNode.
const { run } = require('./harness');

run(async (t, check) => {
  await t.ready();
  t.wc.send('menu', 'about'); await t.sleep(600);
  await t.js('document.fonts.ready.then(() => true)');
  const dbg = t.wc.debugger; dbg.attach('1.3');
  await dbg.sendCommand('DOM.enable'); await dbg.sendCommand('CSS.enable');
  const { root } = await dbg.sendCommand('DOM.getDocument', { depth: -1 });
  const fonts = async (sel) => {
    const { nodeId } = await dbg.sendCommand('DOM.querySelector', { nodeId: root.nodeId, selector: sel });
    if (!nodeId) return 'not found: ' + sel;
    return (await dbg.sendCommand('CSS.getPlatformFontsForNode', { nodeId })).fonts.map(f => f.familyName + (f.isCustomFont ? '' : ' (from the PC)')).join(', ');
  };
  const menu = await fonts('#menus .menu-btn'), status = await fonts('#st-page'), title = await fonts('#pages .panel-h > span');
  check('Menus, status bar and panel titles: IBM Plex Sans (shipped)', /^IBM Plex Sans/.test(menu) && /^IBM Plex Sans/.test(status) && /^IBM Plex Sans/.test(title) && ![menu, status, title].join().includes('from the PC'), { menu, status, title });
  const brand = await fonts('#titlebar .brand .km'), note = await fonts('.about .note span[lang="km"]');
  check('Khmer: Noto Sans Khmer (shipped), the app name in Medium', brand === 'Noto Sans Khmer Medium' && /^Noto Sans Khmer/.test(note) && !note.includes('from the PC'), { brand, note });
  const ver = await fonts('.about-ver'), chip = await fonts('.chips li');
  check('Numbers and the version: IBM Plex Mono (shipped)', /^IBM Plex Mono/.test(ver) && /^IBM Plex Mono/.test(chip) && ![ver, chip].join().includes('from the PC'), { ver, chip });
  dbg.detach();

  // the same rules as Sastra PDF: Khmer files only for Khmer letters, Latin files only for Latin
  const faces = await t.js(`[...document.fonts].map(f => f.family.replace(/"/g, '') + ' ' + f.weight + ' ' + f.unicodeRange).filter(s => s.startsWith('Noto Sans Khmer'))`);
  check('Noto Sans Khmer 400 / 500 / 600, its Khmer part limited to Khmer letters (U+1780-17FF …)',
    [400, 500, 600].every(w => faces.some(s => s.startsWith('Noto Sans Khmer ' + w + ' ') && /U\+1780-17FF/.test(s))), faces);

  const about = await t.js(`[...document.querySelectorAll('.about .credits li')].map(li => li.textContent)`);
  check('About credits IBM Plex Sans & Mono (IBM, SIL OFL 1.1)', about.some(c => c.includes('IBM Plex Sans & Mono') && c.includes('SIL OFL 1.1')), about);
});
