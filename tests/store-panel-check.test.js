// The Store copy's Help › Check for Updates (src/update-panel.js), as in Sastra PDF: "Checking for updates…" (Close or Esc
// drops the answer), "You have the latest version", "Couldn't check for updates"; then the path where Windows has to ask
// first (the Store's automatic updates off): "Update available" with Download, No in Windows' box, a download that dies
// ("The download didn't finish", the badge goes away), and a download that finishes after Hide — the badge only, nothing
// opens — with its own Update ready words. No quiet check runs during this test. The non-Store copy: update-boxes.test.js.
const { run } = require('./harness');
const { storeCopy, kit, same, version } = require('./store-panel-kit');

const fake = storeCopy({ firstCheckMs: 60 * 60 * 1000, store: { check: { count: 0, delay: 1200 } } });

run(async (t, check) => {
  const { sleep, waitFor } = t;
  const k = kit(t);
  await t.ready(null);
  check('Nothing known: no badge', (await k.badge()).hidden);

  // ---- checking, current, dropped, failed
  k.helpCheck();
  await k.stage('checking');
  const c = await k.panel();
  check('Help › Check for Updates: "Checking for updates…" with a spinner and Close', c.title === 'Checking for updates…' && c.spin && same(c.buttons, ['Close']), c);
  await k.stage('current');
  const cur = await k.panel();
  check(`No update: "You have the latest version", "Bohpum ${version} is the newest version.", OK`,
    cur.title === 'You have the latest version' && cur.line === `Bohpum ${version} is the newest version.` && same(cur.buttons, ['OK*']) && cur.focus === 'OK', cur);
  await k.press('close');
  k.helpCheck(); await k.stage('checking'); await k.press('close'); await sleep(1800);
  check('Close while checking drops the answer', await k.noBox());
  k.helpCheck(); await k.stage('checking'); await t.key('Escape'); await sleep(1800);
  check('…Esc too', await k.noBox());
  fake.scenario({ check: null });
  k.helpCheck(); await k.stage('failed');
  const f = await k.panel();
  check('No answer: "Couldn\'t check for updates", Open in Store · OK',
    f.title === "Couldn't check for updates" && f.line === 'Check the internet connection and try again later.' && same(f.buttons, ['Open in Store', 'OK*']), f);
  await k.press('close');

  // ---- Windows has to ask first
  fake.scenario({ check: { count: 1, version: version + '.0', silent: false }, download: { steps: 4, delay: 250, end: 'cancelled' } });
  k.helpCheck(); await k.stage('available');
  const a = await k.panel();
  check(`An update Windows must ask about: "Update available", ${version} → "New version" with no number, Later · Download`,
    a.title === 'Update available' && a.from === version && a.to === '' && a.line === 'Windows will ask before downloading.' && same(a.buttons, ['Later', 'Download*']) && a.fill === null, a);
  check('…nothing downloads by itself; the badge says "Update available"',
    !fake.runs().some(r => r[0] === 'download') && same(await k.badge(), { hidden: false, text: 'Update available', ready: false }), { runs: fake.runs(), badge: await k.badge() });
  await k.press('download');
  await k.stage('downloading');
  const asked = (await fake.ranUntil(rs => rs.some(r => r[0] === 'download'))).find(r => r[0] === 'download');
  check('Download: the helper asks over Bohpum\'s window (--hwnd, not --silent-only)', asked && asked.length === 2 && /^--hwnd=\d+$/.test(asked[1]), asked);
  await k.stage('available');
  check('No in Windows\' box: back to "Update available", the badge kept', (await k.badge()).text === 'Update available');
  fake.scenario({ check: { count: 1, version: version + '.0', silent: false }, download: { steps: 2, delay: 150, end: null } });
  await k.press('download');
  await k.stage('download-failed');
  const df = await k.panel();
  check('A download that dies: "The download didn\'t finish", Open in Store · OK; the badge goes away',
    df.title === "The download didn't finish" && df.line === 'Try again later, or update from the Store.' && same(df.buttons, ['Open in Store', 'OK*']) && (await k.badge()).hidden, df);
  await k.press('close');

  // ---- a download that finishes with the panel closed
  fake.scenario({ check: { count: 1, version: version + '.0', silent: false }, download: { steps: 6, delay: 300, end: 'completed' } });
  k.helpCheck(); await k.stage('available');
  await k.press('download'); await k.stage('downloading');
  await k.press('close');
  await waitFor(`document.getElementById('b-update').textContent === 'Update ready'`, 10000);
  check('Hide, then the download finishes: the badge says "Update ready", nothing opens', await k.noBox() && (await k.badge()).ready);
  await t.click('#b-update'); await k.stage('ready');
  const r = await k.panel();
  check('Its panel: "Bohpum will close to install the update…" (no number), "Windows may ask first.", and Later keeps it ready',
    r.to === '' && r.line === "Bohpum will close to install the update. If it doesn't open again, start it from the Start menu. Windows may ask first."
      && r.hint === 'Later: it stays ready. Click the badge when you want to install.' && same(r.buttons, ['Later', 'Install*']), r);
  await k.press('close');
  k.helpCheck(); await k.stage('ready');
  check('Help › Check for Updates once it is ready: straight to "Update ready", no new check',
    fake.runs().filter(x => x[0] === 'check').length === 6, fake.runs());
}, { setup: fake.setup, timeout: 120000 });
