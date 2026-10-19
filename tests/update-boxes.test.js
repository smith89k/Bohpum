// The update boxes, in the app's own look (as in Sastra PDF): Help › Check for Updates… ("Checking…", then the
// answer; Esc drops it), the ready box (waits while another box is open, once per version), Restart now asking about
// unsaved changes first and saying why it can't restart, and the right-click menu repair after an update. main's
// answers are faked by replacing its IPC handlers.
const { ipcMain, Menu } = require('electron');
const { run } = require('./harness');

run(async (t, check) => {
  const { js, waitFor, sleep } = t;
  await t.ready();
  const question = () => js(`(() => { const m = [...document.querySelectorAll('#modal-root .modal')].filter(b => b.querySelector('.modal-h'));
    if (!m.length) return null; const b = m.at(-1);
    return { title: b.querySelector('.modal-h').textContent, text: b.querySelector('.modal-b').textContent, count: m.length,
      buttons: [...b.querySelectorAll('.modal-f .btn')].map(x => x.textContent + (x.classList.contains('primary') ? '*' : '')) }; })()`);
  const waitTitle = (title, ms) => waitFor(`[...document.querySelectorAll('#modal-root .modal-h')].some(h => h.textContent === ${JSON.stringify(title)})`, ms);
  const press = (label) => js(`[...document.querySelectorAll('#modal-root .modal-f .btn')].find(b => b.textContent === ${JSON.stringify(label)}).click(); 0`);
  const noBox = () => js(`!document.querySelector('#modal-root').children.length`);
  const fake = (channel, fn) => { ipcMain.removeHandler(channel); ipcMain.handle(channel, fn); };
  const helpItem = (label) => Menu.getApplicationMenu().items.find(i => i.label === 'Help').submenu.items.find(i => i.label === label);
  const toastText = () => js(`document.getElementById('toast').classList.contains('show') ? document.getElementById('toast').textContent : ''`);

  // ---- Check for Updates
  helpItem('Check for Updates…').click();
  await waitTitle("This copy doesn't update itself");
  const a = await question();
  check('Check for Updates in a copy without updates: "This copy doesn\'t update itself", OK',
    a.text === 'Copies installed from a Bohpum release do.' && JSON.stringify(a.buttons) === '["OK*"]', a);
  await press('OK');
  fake('check-updates', () => ({ kind: 'current', version: '0.2.0' }));
  helpItem('Check for Updates…').click();
  await waitTitle('You have the latest version');
  check('…up to date: "You have the latest version"', (await question()).text === 'Bohpum 0.2.0 is the newest version.', await question());
  await press('OK');
  fake('check-updates', () => new Promise((r) => setTimeout(() => r({ kind: 'current', version: '0.2.0' }), 1500)));
  helpItem('Check for Updates…').click();
  await waitTitle('Checking for updates…');
  const c = await question();
  await t.key('Escape'); await sleep(2000);
  check('"Checking for updates…" with Cancel; Esc drops the answer', JSON.stringify(c.buttons) === '["Cancel"]' && await noBox(), { c, q: await question() });

  // ---- the ready box waits its turn, once per version
  await js(`window.__bohpumApp.cmd('about'); 0`); await waitFor(`!!document.querySelector('.modal.about')`);
  await js(`window.__bohpumApp.updateReady('9.9.9'); 0`); await sleep(600);
  check('An update ready while another box is open waits', (await question()) === null || (await question()).title !== 'Bohpum 9.9.9 is ready to install', await question());
  await t.key('Escape');
  await waitTitle('Bohpum 9.9.9 is ready to install');
  const r = await question();
  check('…then "Bohpum 9.9.9 is ready to install": Restart now (primary) / Later',
    r.text === 'Restart now to use it, or it installs the next time you close Bohpum.' && JSON.stringify(r.buttons) === '["Restart now*","Later"]' && r.count === 1, r);
  await press('Later'); await sleep(200);
  await js(`window.__bohpumApp.updateReady('9.9.9'); 0`); await sleep(600);
  check('Later: the same version isn\'t offered again', await noBox(), await question());

  // ---- Restart now with unsaved changes
  let installs = 0, answer = { ok: true };
  fake('install-update', () => { installs++; return answer; });
  await js(`window.__bohpumApp.cmd('page-add'); 0`); await sleep(200);
  const dirty = await js('!!window.__bohpumApp.state.dirty');
  let v = 10;
  const restart = async () => { const ver = `9.9.${v++}`; await js(`window.__bohpumApp.updateReady('${ver}'); 0`); await waitTitle(`Bohpum ${ver} is ready to install`); await press('Restart now'); };
  await restart(); await waitTitle('Save changes first?');
  const s = await question();
  check('Restart now with unsaved changes asks first: Save / Don\'t save / Cancel',
    dirty && s.text === 'Your publication has unsaved changes. Save them before restarting?' && JSON.stringify(s.buttons) === '["Save*","Don\'t save","Cancel"]', s);
  await press('Cancel'); await sleep(300);
  check('Cancel: nothing happens, no install', installs === 0 && await noBox(), installs);
  await restart(); await waitTitle('Save changes first?'); await press("Don't save"); await sleep(300);
  check('Don\'t save: the update installs', installs === 1, installs);
  const why = [['task', "Bohpum can't restart while files are being converted"], ['reader', "Bohpum can't restart while the Publisher reader is downloading"],
    ['failed', "The update couldn't be started"]];
  for (const [reason, title] of why) {
    answer = { ok: false, reason };
    await restart(); await waitTitle('Save changes first?'); await press("Don't save");
    await waitTitle(title);
    check(`Restart refused (${reason}): "${title}"`, JSON.stringify((await question()).buttons) === '["OK*"]', await question());
    await press('OK'); await sleep(200);
  }

  // ---- the right-click menu repair
  const repairs = [];
  fake('menu-repair', (_e, action) => { repairs.push(action); return action === 'check' ? { needed: true } : action === 'fix' ? { result: 'ok' } : {}; });
  await js(`window.__bohpumApp.menuRepairAtStart(); 0`);
  await waitTitle('The right-click menu needs to be set up again');
  const m = await question();
  check('After an update: "The right-click menu needs to be set up again", Set up / Not now',
    m.text === 'Windows will ask for permission once. Without it, Bohpum\'s items stay under "Show more options".' && JSON.stringify(m.buttons) === '["Set up*","Not now"]', m);
  await press('Set up'); await sleep(400);
  check('Set up: "The right-click menu is back"', /^The right-click menu is back/.test(await toastText()) && repairs.includes('fix'), { toast: await toastText(), repairs });
  await js(`window.__bohpumApp.menuRepairAtStart(); 0`);
  await waitTitle('The right-click menu needs to be set up again'); await press('Not now'); await sleep(300);
  check('Not now: not asked again for this version', repairs.at(-1) === 'later', repairs);
});
