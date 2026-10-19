// Explorer menu "Convert to Bohpum": Bohpum started with --bohpum-task=convert --bohpum-list=<file> opens only the
// small convert window, saves <name>.bpum next to each .pub (the same file the editor's Open + Save makes), asks
// once when a name is already there (Keep both / Replace / Cancel), lists problems and notes, and queues clicks.
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { run, ROOT } = require('./harness');

const W = fs.mkdtempSync(path.join(os.tmpdir(), 'bohpum-convert-'));
const LIST_DIR = path.join(os.tmpdir(), 'Bohpum');
let n = 0;
// what BohpumMenu.dll writes for a click: %TEMP%\Bohpum\menu-*.txt, one path per line
function listFile(paths) {
  fs.mkdirSync(LIST_DIR, { recursive: true });
  const f = path.join(LIST_DIR, `menu-test-${process.pid}-${++n}.txt`);
  fs.writeFileSync(f, paths.join('\r\n'), 'utf8');
  return f;
}
const args = (paths) => ['--bohpum-task=convert', '--bohpum-list=' + listFile(paths)];
const pub = (name) => { const p = path.join(W, name); fs.copyFileSync(path.join(ROOT, 'samples', 'demo-card.pub'), p); return p; };
const card = pub('card.pub');
// object ids are random: number them in order of appearance; the name follows the file name
const norm = (text) => {
  const ids = new Map();
  const d = JSON.parse(text.replace(/"(id|groupId)":"([^"]+)"/g, (_m, k, v) => { if (!ids.has(v)) ids.set(v, 'id' + ids.size); return `"${k}":"${ids.get(v)}"`; }));
  d.name = '-'; return JSON.stringify(d);
};

run(async (t, check) => {
  const sleep = t.sleep;
  const keep = new BrowserWindow({ show: false }); // keeps the test app alive when a convert window closes
  const taskWin = () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.getURL().endsWith('task.html'));
  const jsT = (code) => taskWin().webContents.executeJavaScript(code, true);
  const waitT = async (code, ms = 60000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (taskWin() && await jsT(code)) return true; } catch {} await sleep(150); } throw new Error('timed out: ' + code); };
  const clickT = async (sel) => {
    const wc = taskWin().webContents, c = await jsT(`(() => { const b = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }; })()`);
    wc.sendInputEvent({ type: 'mouseMove', x: c.x, y: c.y });
    wc.sendInputEvent({ type: 'mouseDown', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await sleep(200);
  };
  const state = () => jsT(`({ done: +(document.body.dataset.done || 0), what: document.getElementById('what').textContent, step: document.getElementById('step').textContent,
    lines: [...document.querySelectorAll('#lines li')].map(li => li.className + ': ' + li.textContent), close: !document.getElementById('bClose').hidden,
    asking: !document.getElementById('ask').hidden, waiting: document.getElementById('waiting').textContent })`);
  const click = (paths) => app.emit('second-instance', {}, ['Bohpum.exe', ...args(paths)], process.cwd());
  const files = () => fs.readdirSync(W).sort();

  // ---- A: started by the menu
  const first = t.win.webContents.getURL();
  await waitT('document.body.dataset.done === "1"');
  const a = await state();
  const onlyTask = BrowserWindow.getAllWindows().filter(w => w !== keep).length === 1;
  check('Started by the menu: only the convert window opens (no editor)', first.endsWith('task.html') && onlyTask, { first, onlyTask });
  check('card.pub → card.bpum next to it; "Done · 1 file saved"', fs.existsSync(path.join(W, 'card.bpum')) && a.what === 'Done' && /^1 file saved/.test(a.step), { a, files: files() });
  const saved = JSON.parse(fs.readFileSync(path.join(W, 'card.bpum'), 'utf8'));
  check('The .bpum is a Bohpum file named after the file', saved.format === 'bpum' && saved.name === 'card' && saved.pages.length >= 1 && !!saved.master && !!saved.guides, { format: saved.format, name: saved.name });
  if (a.lines.length) { check('Notes keep the window open with Close', a.close && a.lines.every(l => l.startsWith('note: card.pub: ')), a); await clickT('#bClose'); }
  else {
    const closedAt = Date.now(); while (taskWin() && Date.now() - closedAt < 4000) await sleep(100);
    check('No problems and no notes: the window closes by itself after 2 s', !taskWin(), a);
  }
  await sleep(300);

  // ---- B: the editor's Open + Save makes the same file
  dialog.showSaveDialog = async () => ({ canceled: false, filePath: path.join(W, 'by-editor.bpum') });
  app.emit('second-instance', {}, ['Bohpum.exe', card], process.cwd());
  const ed = () => BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w.webContents.getURL().endsWith('index.html'));
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { try { if (ed() && await ed().webContents.executeJavaScript('window.__bohpumApp?.state.doc.name === "card"', true)) break; } catch {} await sleep(200); }
  await ed().webContents.executeJavaScript('window.__bohpumApp.cmd("save")', true);
  const t1 = Date.now(); while (!fs.existsSync(path.join(W, 'by-editor.bpum')) && Date.now() - t1 < 10000) await sleep(100);
  const same = norm(fs.readFileSync(path.join(W, 'by-editor.bpum'), 'utf8')) === norm(fs.readFileSync(path.join(W, 'card.bpum'), 'utf8'));
  check('A .pub opened from Explorer while only the convert window was open opens the editor', !!ed());
  check('The converted file is the same as the editor\'s Open + Save (apart from random ids)', same);
  fs.unlinkSync(path.join(W, 'by-editor.bpum'));

  // ---- C/D/E: the name is already there
  click([card]);
  await waitT('!document.getElementById("ask").hidden');
  const q = await jsT(`({ msg: document.getElementById('askMsg').textContent, focus: document.activeElement.id, editorUntouched: true })`);
  check('Name already there: one question, Keep both is the default', q.msg === '"card.bpum" is already in this folder.' && q.focus === 'bKeep', q);
  await clickT('#bKeep');
  await waitT('document.body.dataset.done === "1"');
  check('Keep both → card (2).bpum', files().includes('card (2).bpum'), files());
  await sleep(2500);

  const before = fs.statSync(path.join(W, 'card.bpum')).mtimeMs;
  click([card]);
  await waitT('!document.getElementById("ask").hidden');
  await clickT('#bReplace');
  await waitT('document.body.dataset.done === "1"');
  check('Replace → card.bpum is written again, no new name', fs.statSync(path.join(W, 'card.bpum')).mtimeMs > before && !files().includes('card (3).bpum'), files());
  await sleep(2500);

  const count = files().length;
  click([card]);
  await waitT('!document.getElementById("ask").hidden');
  taskWin().webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); taskWin().webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitT('document.body.dataset.done === "1"');
  const e = await state();
  check('Esc on the question = Cancel: nothing saved, said so', files().length === count && e.lines.some(l => l === 'problem: Cancelled: nothing saved for card.pub'), e);
  await clickT('#bClose');
  await sleep(300);

  // ---- F: a damaged .pub next to a good one
  const broken = path.join(W, 'broken.pub'); fs.writeFileSync(broken, 'this is not a Publisher file');
  const good = pub('good.pub');
  click([good, broken]);
  await waitT('document.body.dataset.done === "1"', 120000);
  const f = await state();
  check('A damaged file is listed as a problem; the other one is still saved; the window stays open',
    files().includes('good.bpum') && !files().includes('broken.bpum') && f.lines.some(l => l.startsWith('problem: broken.pub: ')) && f.what === 'Done, with problems' && f.close, f);

  // ---- G: clicks while it works are queued
  const q1 = pub('q1.pub'), q2 = pub('q2.pub');
  click([q1]); await sleep(150); click([q2]);
  await waitT('document.getElementById("waiting").textContent === "1 more waiting"', 10000).catch(() => {});
  const g1 = await state();
  await waitT('document.body.dataset.done === "2"', 120000);
  check('A second click while converting waits its turn ("1 more waiting"), then both are saved',
    g1.waiting === '1 more waiting' && files().includes('q1.bpum') && files().includes('q2.bpum'), { g1, files: files() });

  keep.destroy();
  fs.rmSync(W, { recursive: true, force: true });
}, {
  timeout: 300000,
  setup: () => { process.argv.push(...args([card])); }
});
