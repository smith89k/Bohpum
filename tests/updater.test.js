// updater.js: the update rules, with no Electron inside (as in Sastra PDF) — where updates run, what Help › Check for
// Updates says, why Restart now can't install yet, the update key, the log, and createUpdater with a fake
// electron-updater and fake timers.
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

run(async (t, check) => {
  const up = require(path.join(ROOT, 'updater.js'));   // here, so a missing file is a FAIL line, not a stuck Electron
  check('Updates run only in the installed Windows app',
    up.updatesRunHere({ packaged: true, platform: 'win32' }) === true && up.updatesRunHere({ packaged: false, platform: 'win32' }) === false
      && up.updatesRunHere({ packaged: true, platform: 'darwin' }) === false);

  const answers = [
    up.checkAnswer({ downloaded: '0.3.0' }), up.checkAnswer({ error: new Error('offline') }),
    up.checkAnswer({ result: { isUpdateAvailable: true, updateInfo: { version: '0.3.0' } } }),
    up.checkAnswer({ result: { isUpdateAvailable: false }, current: '0.2.0' })
  ];
  check('Check for Updates answers: ready, failed, downloading, current',
    same(answers, [{ kind: 'ready', version: '0.3.0' }, { kind: 'failed' }, { kind: 'downloading', version: '0.3.0' }, { kind: 'current', version: '0.2.0' }]), answers);

  const blocks = [
    up.installBlock({ downloaded: null }), up.installBlock({ downloaded: '0.3.0', taskOpen: true, readerBusy: true }),
    up.installBlock({ downloaded: '0.3.0', readerBusy: true }), up.installBlock({ downloaded: '0.3.0' })
  ];
  check('Restart now is blocked by nothing downloaded, then the convert window, then the reader download',
    same(blocks, ['none', 'task', 'reader', null]), blocks);

  check('The update key is read from update-config.json text',
    same(up.parseUpdateConfig('{"clientId":"a","clientSecret":"b"}'), { clientId: 'a', clientSecret: 'b' }));
  check('A key without both parts, or not JSON, is no key',
    ['{"clientId":"a"}', '{"clientId":"","clientSecret":"b"}', 'nope'].every(s => up.parseUpdateConfig(s) === null));
  check('A missing update-config.json is no key', up.readUpdateConfig(path.join(t.ctx.tmp, 'gone', 'update-config.json')) === null);
  check('The key becomes the two Cloudflare Access headers',
    same(up.keyHeaders({ clientId: 'a', clientSecret: 'b' }), { 'CF-Access-Client-Id': 'a', 'CF-Access-Client-Secret': 'b' }));

  // ---- createUpdater with a fake electron-updater
  const fake = new EventEmitter();
  let checks = 0, installs = [];
  fake.checkForUpdates = () => { checks++; return Promise.resolve({ isUpdateAvailable: false }); };
  fake.quitAndInstall = (...a) => { installs.push(a); };
  const timers = { calls: [], setTimeout(fn, ms) { this.calls.push([fn, ms]); }, setInterval(fn, ms) { this.calls.push([fn, ms]); } };
  const sent = [], logged = [];
  const key = { clientId: 'a', clientSecret: 'b' };
  const u = up.createUpdater({ updater: fake, current: '0.2.0', send: (...a) => sent.push(a), log: m => logged.push(m), timers, key });
  check('Every update request carries the key; downloads quietly; installs on quit',
    same(fake.requestHeaders, up.keyHeaders(key)) && fake.autoDownload === true && fake.autoInstallOnAppQuit === true, fake.requestHeaders);
  check('First check after 10 s, then every 6 hours',
    same(timers.calls.map(c => c[1]), [10000, 21600000]) && up.FIRST_CHECK_MS === 10000 && up.CHECK_EVERY_MS === 21600000, timers.calls.map(c => c[1]));
  fake.emit('update-downloaded', { version: '0.3.0' });
  fake.emit('update-downloaded', { version: '0.3.0' });
  check('A downloaded version tells the page once', same(sent, [['update-ready', '0.3.0']]), sent);
  check('Check for Updates then says it is ready', same(await u.checkNow(), { kind: 'ready', version: '0.3.0' }));

  fake.quitAndInstall = (...a) => { installs.push(a); fake.quitAndInstallCalled = true; };
  check('Restart now installs silently and starts the new version', u.install() === true && same(installs.at(-1), [true, true]), installs);

  fake.quitAndInstallCalled = false;
  fake.quitAndInstall = (...a) => { installs.push(a); };
  const before = checks;
  check('If the installer did not start, the download is forgotten and fetched again',
    u.install() === false && u.downloaded() === null && checks === before + 1, { downloaded: u.downloaded(), checks, before });

  const log = path.join(t.ctx.tmp, 'x', 'update.log');
  up.logTo(log)('hello');
  const text = fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '';
  check('The log makes its folder and adds a line', text.endsWith('hello\r\n'), text);
});
