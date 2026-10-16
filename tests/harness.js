// Test harness: starts the real Bohpum (main.js) in Electron with a throwaway profile, then lets a
// test drive the window with real key and mouse input. Each tests/*.test.js calls run(); tests/run.js
// starts one Electron per file. Output: one "PASS name" / "FAIL name {detail}" line per check.
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function run(test, { setup, timeout = 90000 } = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-test-'));
  app.setPath('userData', userData); // never touches the user's real settings
  const ctx = { userData, tmp: fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-out-')) };
  const results = [];
  const check = (name, pass, detail) => { results.push({ name, pass: !!pass, detail }); };
  let started = false, finished = false;
  const finish = () => {
    if (finished) return; finished = true;
    for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : '  ' + JSON.stringify(r.detail)}`);
    try { fs.rmSync(ctx.tmp, { recursive: true, force: true }); } catch {}
    app.exit(results.length && results.every(r => r.pass) ? 0 : 1); // exit() skips the "save changes?" prompt
  };
  if (setup) setup(ctx);
  app.on('browser-window-created', (_e, win) => {
    if (started) return; started = true; // the editor window; later ones are hidden print windows
    win.webContents.once('did-finish-load', () => test(driver(win, ctx), check).then(finish, (err) => {
      check('test ran to the end', false, String(err && err.stack || err)); finish();
    }));
  });
  setTimeout(() => { check('test finished in time', false, `over ${timeout} ms`); finish(); }, timeout);
  require(path.join(ROOT, 'main.js'));
}

function driver(win, ctx) {
  const wc = win.webContents;
  const js = (code) => wc.executeJavaScript(code, true);
  const waitFor = async (code, ms = 8000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) { if (await js(code)) return; await sleep(100); }
    throw new Error('timed out waiting for: ' + code);
  };
  const center = (selector) => js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
  const key = async (keyCode, modifiers = []) => {
    wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers });
    // a real keyboard also sends the typed character; buttons are pressed by it (Enter, Space)
    const ch = { Enter: '\r', Space: ' ' }[keyCode];
    if (ch && !modifiers.length) wc.sendInputEvent({ type: 'char', keyCode: ch });
    wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers });
    await sleep(250);
  };
  const click = async (selector) => {
    const c = await center(selector);
    if (!c) throw new Error('nothing to click: ' + selector);
    wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y });
    wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await sleep(250);
  };
  const drag = async (selector, dx, dy) => {
    const c = await center(selector);
    if (!c) throw new Error('nothing to drag: ' + selector);
    wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y });
    wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 12; i++) {
      wc.sendInputEvent({ type: 'mouseMove', x: Math.round(c.x + dx * i / 12), y: Math.round(c.y + dy * i / 12), modifiers: ['leftButtonDown'] });
      await sleep(25);
    }
    wc.sendInputEvent({ type: 'mouseUp', x: c.x + dx, y: c.y + dy, button: 'left', clickCount: 1 });
    await sleep(250);
  };
  // Closes the welcome screen and opens samples/<sample> (or only closes it when sample is null)
  const ready = async (sample = 'test-shapes.fodg') => {
    win.focus(); wc.focus();
    await waitFor('!!window.__bohpumApp && !!document.querySelector(".modal-back")');
    await key('Escape');
    await waitFor('!document.querySelector(".modal-back")');
    if (!sample) return;
    await js(`window.__bohpumApp.openFile(${JSON.stringify(path.join(ROOT, 'samples', sample))})`);
    await waitFor(`window.__bohpumApp.state.doc.name === ${JSON.stringify(sample.replace(/\.[^.]+$/, ''))} && !window.__bohpumApp.state.dirty`);
  };
  return { win, wc, js, waitFor, key, click, drag, center, ready, sleep, ctx, ROOT };
}

module.exports = { run, sleep, ROOT };
