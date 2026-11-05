// The Store copy's update badge and panel (src/update-panel.js), as in Sastra PDF, when the Store allows quiet updates:
// the first check finds one and it downloads by itself, with only the badge saying so — nothing opens. The badge opens
// the panel: This version → New version, the bar moving without the panel being rebuilt, then Update ready with Later
// focused and Install deaf for a moment; Esc and a press outside close it. Install asks about unsaved changes first,
// shows Installing… (Esc can't close it), then No in Windows' box, a failed install with Open in Store, a later X still
// asking, and the convert window blocking it. Also the badge in both themes and in a narrow window.
const { shell, ipcMain } = require('electron');
const { run } = require('./harness');
const { storeCopy, kit, same, version } = require('./store-panel-kit');

const next = version.replace(/\d+$/, n => +n + 1);   // the Store's answer: one patch up
const MB = 1048576;
const fake = storeCopy({
  firstCheckMs: 1500,
  store: { check: { count: 1, version: next + '.0', silent: true }, download: { steps: 14, total: 120 * MB, delay: 280, end: 'completed' }, install: { delay: 1200, end: 'cancelled' } }
});

run(async (t, check) => {
  const { js, waitFor, sleep } = t;
  const k = kit(t);
  await t.ready(null);

  // ---- it comes by itself: the badge only
  await waitFor(`/^↓ Update \\d+%$/.test(document.getElementById('b-update').textContent)`, 15000);
  const quiet = await fake.ranUntil(r => r.length >= 2);
  check('The first quiet check finds an update and downloads it with no box: the badge says "↓ Update N%"',
    !(await k.badge()).hidden && await k.noBox() && same(quiet.slice(0, 2), [['check'], ['download', '--silent-only']]), { badge: await k.badge(), runs: quiet });
  await t.click('#b-update');
  await k.stage('downloading');
  const d = await k.panel();
  check(`The badge opens the panel: "Update available", ${version} → ${next}, the bar, "You can keep working.", Hide`,
    d.title === 'Update available' && d.from === version && d.to === next && d.line === 'You can keep working.' && same(d.buttons, ['Hide']) && d.focus === 'Hide', d);
  await js(`window.__hide = document.querySelector('.update-panel .modal-f .btn'); 0`);
  const p0 = parseFloat(d.fill);
  await waitFor(`parseFloat(document.querySelector('.update-panel .u-bar i').style.width) > ${p0 + 10}`, 5000);
  const d2 = await k.panel();
  check('The bar moves: "Downloading · N of 120 MB", time left; the panel isn\'t rebuilt (Hide keeps the focus)',
    /^Downloading · \d+ of 120 MB$/.test(d2.said) && /left$/.test(d2.left) && await js(`document.contains(window.__hide) && document.activeElement === window.__hide`), d2);
  check('…the badge counts along', /^↓ Update \d+%$/.test((await k.badge()).text), await k.badge());

  // ---- ready, with the panel open: Install ignores a click meant for Hide
  const early = await js(`new Promise(res => { const go = () => { const b = document.querySelector('.update-panel');
    if (b && b.dataset.stage === 'ready') { b.querySelector('[data-act=install]').click(); res(true); } else setTimeout(go, 5); }; go(); })`);
  await sleep(300);
  const r = await k.panel();
  check(`Download done: "Update ready", "Bohpum will close to install ${next}…", Later focused, Install`,
    early && r.stage === 'ready' && r.title === 'Update ready' && r.fill === '100%' && r.said === 'Downloaded' && r.left === ''
      && r.line === `Bohpum will close to install ${next}. If it doesn't open again, start it from the Start menu.`
      && r.hint === 'Later: the Store installs it in its own time.' && same(r.buttons, ['Later', 'Install*']) && r.focus === 'Later', r);
  check('…a click on Install right as it appears does nothing', !fake.runs().some(a => a[0] === 'install'), fake.runs());
  check('…the badge: "Update ready", filled', same(await k.badge(), { hidden: false, text: 'Update ready', ready: true }), await k.badge());
  await t.key('Escape');
  check('Esc closes the panel; the badge stays', await k.noBox() && !(await k.badge()).hidden);
  await t.click('#b-update'); await k.stage('ready');
  await js(`document.querySelector('#modal-root .modal-back').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); 0`);
  check('A press outside closes it too', await k.noBox());

  // ---- Install: the unsaved question first
  await js(`window.__bohpumApp.cmd('page-add'); 0`); await sleep(200);
  await t.click('#b-update'); await k.stage('ready'); await sleep(600);
  await k.press('install');
  await waitFor(`[...document.querySelectorAll('#modal-root .modal-h')].some(h => h.textContent === 'Save changes first?')`);
  const q = await k.question();
  check('Install with unsaved changes asks first, over the panel: Save / Don\'t save / Cancel',
    q.text === 'Your publication has unsaved changes. Save them before installing?' && same(q.buttons, ['Save*', "Don't save", 'Cancel']) && !(await k.panel()).top, q);
  await t.key('Escape'); await sleep(200);
  check('Esc closes only the question: the panel stays on "Update ready", nothing installs',
    (await k.question()) === null && (await k.panel()).stage === 'ready' && !fake.runs().some(a => a[0] === 'install'), { p: await k.panel(), runs: fake.runs() });
  await k.press('install'); await waitFor(`!!document.querySelector('#modal-root .modal:not(.update-panel)')`); await k.answer("Don't save");
  await k.stage('installing');
  const i = await k.panel();
  check('Don\'t save: "Installing…", "Bohpum will close in a moment.", no buttons',
    i.title === 'Installing…' && i.spin && i.line === 'Bohpum will close in a moment.' && same(i.buttons, []), i);
  await t.key('Escape');
  check('…Esc can\'t close it', (await k.panel()) && (await k.panel()).stage === 'installing');
  const inst = (await fake.ranUntil(rs => rs.some(a => a[0] === 'install'))).find(a => a[0] === 'install');
  check('…the helper installs over Bohpum\'s window (--hwnd)', inst && /^--hwnd=\d+$/.test(inst[1]), inst);
  await k.stage('ready', 6000);
  check('No in Windows\' box: back to "Update ready"', (await k.panel()).stage === 'ready');
  await k.press('close');

  // a later X still asks about the unsaved changes
  t.win.close();
  await waitFor(`[...document.querySelectorAll('#modal-root .modal-h')].some(h => h.textContent === 'Save changes first?')`, 4000);
  check('After an install that didn\'t happen, closing still asks about unsaved changes', !!(await k.question()));
  await k.answer('Cancel'); await sleep(200);

  // ---- a failed install, Open in Store
  fake.scenario({ check: null, install: { delay: 200, end: 'error' } });
  const opened = [];
  shell.openExternal = async (u) => { opened.push(u); };
  await t.click('#b-update'); await k.stage('ready'); await sleep(600);
  await k.press('install'); await waitFor(`!!document.querySelector('#modal-root .modal:not(.update-panel)')`); await k.answer("Don't save");
  await k.stage('install-failed');
  const f = await k.panel();
  check('A failed install: "The update couldn\'t be installed", Open in Store · OK',
    f.title === "The update couldn't be installed" && f.line === 'Try again later, or update from the Store.' && same(f.buttons, ['Open in Store', 'OK*']), f);
  await k.press('store'); await sleep(300);
  check('Open in Store opens Bohpum\'s page in the Store; the badge still says Update ready',
    opened.length === 1 && /^ms-windows-store:/.test(opened[0]) && await k.noBox() && (await k.badge()).text === 'Update ready', { opened, badge: await k.badge() });

  // ---- the badge's look: both themes, a narrow window
  const colour = () => js(`getComputedStyle(document.getElementById('b-update')).backgroundColor`);
  await js(`window.__bohpumApp.cmd('theme-light'); 0`); await sleep(400);
  const light = await colour();
  await js(`window.__bohpumApp.cmd('theme-dark'); 0`); await sleep(400);
  const dark = await colour();
  check('The badge follows the theme (the app\'s green in light and dark)', light !== dark && /^rgb/.test(light) && /^rgb/.test(dark), { light, dark });
  await js(`window.__bohpumApp.cmd('theme-system'); 0`);
  t.win.unmaximize(); t.win.setSize(900, 640); await sleep(700);
  const fit = await js(`(() => { const bar = document.getElementById('titlebar'), b = document.getElementById('b-update').getBoundingClientRect();
    const help = [...document.querySelectorAll('.menu-btn')].at(-1).getBoundingClientRect(), right = bar.getBoundingClientRect().right - parseFloat(getComputedStyle(bar).paddingRight);
    return { w: innerWidth, badge: [b.left, b.right, b.width], help: help.right, right, over: bar.scrollWidth - bar.clientWidth }; })()`);
  check('In the narrowest window the badge fits: whole, after Help, clear of ─ □ ✕, nothing spills',
    fit.badge[2] === 112 && fit.badge[0] >= fit.help && fit.badge[1] <= fit.right + 0.5 && fit.over <= 0, fit);
  t.win.maximize(); await sleep(400);
  await js(`window.__bohpumApp.cmd('maximize'); 0`); await sleep(300);
  check('Maximize page area keeps the badge', await js(`document.body.classList.contains('maxi') && document.getElementById('b-update').getBoundingClientRect().width === 112`));
  await js(`window.__bohpumApp.cmd('maximize'); 0`);

  // ---- the convert window blocks Install (last: main's answer is replaced from here on)
  const st = await js('api.storeUpdate("state")');
  ipcMain.removeHandler('store-update');
  ipcMain.handle('store-update', (_e, a) => a === 'install' ? { ok: false, reason: 'task' } : a === 'state' ? st : null);
  await t.click('#b-update'); await k.stage('ready'); await sleep(600);
  await k.press('install'); await waitFor(`!!document.querySelector('#modal-root .modal:not(.update-panel)')`); await k.answer("Don't save");
  await waitFor(`[...document.querySelectorAll('#modal-root .modal-h')].some(h => h.textContent === "Bohpum can't install while files are being converted")`);
  const tq = await k.question();
  check('Install while files are being converted: "Bohpum can\'t install while files are being converted", OK; the panel stays ready',
    tq.text === 'Wait for the small convert window to finish, then click Install again.' && same(tq.buttons, ['OK*']) && (await k.panel()).stage === 'ready', { tq, p: await k.panel() });
  await k.answer('OK');
}, { setup: fake.setup, timeout: 120000 });
