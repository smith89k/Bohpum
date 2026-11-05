// Bohpum — the Microsoft Store copy's update badge and panel, as in Sastra PDF (and AI Hub; design:
// docs/superpowers/specs/2026-11-05-store-update-panel-design.md). main.js keeps one update state (store-update.js) and
// sends it here. The badge (#b-update, right end of the title row) paints from it; the panel opens only from the badge or
// Help › Check for Updates, never by itself. In every other copy main answers null and nothing here does anything.
// The panel is one of the app's own boxes (#modal-root, .modal-h / .modal-b / .modal-f), so the "one box at a time"
// rules (screenFree, whenFree in app.js) count it too. A classic script: window.BohpumUpdatePanel.
(() => {
'use strict';

const MB = 1048576;
const LIVE = ['available', 'downloading', 'ready'];   // what the update state itself decides; the others are the panel's own

function badgeText(s) {
  if (!s) return '';
  if (s.stage === 'downloading') return `↓ Update ${Math.round(Number(s.percent) || 0)}%`;
  if (s.stage === 'ready') return 'Update ready';
  if (s.stage === 'available') return 'Update available';
  return '';
}
function sizeText(transferred, total) { return total ? `${Math.round(transferred / MB)} of ${Math.round(total / MB)} MB` : ''; }
function timeLeftText(remaining, bytesPerSecond) {
  if (!(bytesPerSecond > 0)) return '';
  const seconds = remaining / bytesPerSecond;
  if (seconds < 60) return 'less than a minute left';
  const minutes = Math.ceil(seconds / 60);
  return `about ${minutes} minute${minutes === 1 ? '' : 's'} left`;
}

// A stage's words and buttons. Buttons: [label, primary, action]; the last has the focus, except on ready (Later).
function stageParts(view) {
  const next = view.next, later = ['Later', false, 'close'], store = ['Open in Store', false, 'store'], okBtn = ['OK', true, 'close'];
  const tryLater = 'Try again later, or update from the Store.';
  switch (view.stage) {
    case 'checking': return { title: 'Checking for updates…', spin: true, buttons: [['Close', false, 'close']] };
    case 'current': return { title: 'You have the latest version', line: `Bohpum ${view.current} is the newest version.`, buttons: [okBtn] };
    case 'available': return { title: 'Update available', line: 'Windows will ask before downloading.', versions: true, buttons: [later, ['Download', true, 'download']] };
    case 'downloading': return { title: 'Update available', line: 'You can keep working.', versions: true, bar: true, buttons: [['Hide', false, 'close']] };
    case 'ready': return {
      title: 'Update ready', versions: true, bar: true,
      line: `Bohpum will close to install ${next || 'the update'}. If it doesn't open again, start it from the Start menu.${view.silent ? '' : ' Windows may ask first.'}`,
      buttons: [later, ['Install', true, 'install']],
      hint: view.silent ? 'Later: the Store installs it in its own time.' : 'Later: it stays ready. Click the badge when you want to install.'
    };
    case 'installing': return { title: 'Installing…', spin: true, line: 'Bohpum will close in a moment.', buttons: [] };
    case 'install-failed': return { title: "The update couldn't be installed", line: tryLater, buttons: [store, okBtn] };
    case 'download-failed': return { title: "The download didn't finish", line: tryLater, buttons: [store, okBtn] };
    default: return { title: "Couldn't check for updates", line: 'Check the internet connection and try again later.', buttons: [store, okBtn] };
  }
}
function progressParts(view) {
  const ready = view.stage === 'ready', size = sizeText(view.transferred, view.total);
  return {
    percent: ready ? 100 : Math.max(0, Math.min(100, Math.round(Number(view.percent) || 0))),
    said: ready ? 'Downloaded' : `Downloading${size ? ` · ${size}` : ''}`,
    left: ready ? '' : timeLeftText(view.total - view.transferred, view.bytesPerSecond)
  };
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function panelHtml(view) {
  const p = stageParts(view);
  const versions = p.versions ? `<div class="u-versions"><div class="u-old"><div class="u-k">This version</div><div class="u-v">${esc(view.current)}</div></div><div class="u-arrow" aria-hidden="true">→</div><div class="u-new"><div class="u-k">New version</div>${view.next ? `<div class="u-v">${esc(view.next)}</div>` : ''}</div></div>` : '';
  const bar = p.bar ? '<div class="u-bar"><i></i></div><div class="u-prog"><span></span><span></span></div>' : '';
  const line = p.line ? `<p class="u-line">${esc(p.line)}</p>` : '';
  const hint = p.hint ? `<p class="u-hint">${esc(p.hint)}</p>` : '';
  return {
    title: p.title,
    head: `${p.spin ? '<span class="u-spin" aria-hidden="true"></span>' : ''}${esc(p.title)}`,
    body: versions + bar + line + hint,
    foot: p.buttons.map(([label, primary, act]) => `<button class="btn${primary ? ' primary' : ''}" data-act="${act}">${esc(label)}</button>`).join('')
  };
}

let api = null, ask = null, screenFree = () => true, badge = null;
let current = null, back = null, view = null, turn = 0, ready = Promise.resolve(), shownAt = 0;
const INSTALL_SETTLE_MS = 500;   // Install takes Hide's place when a download ends: a click meant for Hide must not install
const onTop = () => document.getElementById('modal-root').lastElementChild === back;   // a question over the panel keeps the keys

function paintProgress(box, v) {
  const fill = box.querySelector('.u-bar i');
  if (!fill) return;
  const { percent, said, left } = progressParts(v);
  fill.style.width = `${percent}%`;
  const [a, b] = box.querySelectorAll('.u-prog span');
  a.textContent = said; b.textContent = left;
}
function show(v) {
  if (!back) {
    back = document.createElement('div'); back.className = 'modal-back';
    back.innerHTML = '<div class="modal update-panel" role="dialog" aria-modal="true"><div class="modal-h"></div><div class="modal-b"></div><div class="modal-f"></div></div>';
    back.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act); });
    // as the app's other boxes: a press outside closes it (never while installing)
    back.addEventListener('mousedown', e => { if (e.target === back && view.stage !== 'installing') close(); });
    document.addEventListener('keydown', onKey, true);
    document.getElementById('modal-root').append(back);
  }
  const box = back.firstChild;
  // Progress comes often: while the same download runs only the bar and its words change, so the focus stays.
  const same = view && view.stage === 'downloading' && v.stage === 'downloading' && view.next === v.next;
  view = v; box.dataset.stage = v.stage;
  if (!same) {
    const h = panelHtml(v);
    box.setAttribute('aria-label', h.title);
    box.querySelector('.modal-h').innerHTML = h.head;
    const body = box.querySelector('.modal-b');
    body.innerHTML = h.body; body.hidden = !h.body;
    box.querySelector('.modal-f').innerHTML = h.foot;
    shownAt = performance.now();
    // Enter must never install: on ready the focus goes to Later
    if (onTop()) box.querySelector(v.stage === 'ready' ? '.modal-f .btn' : '.modal-f .btn:last-child')?.focus();
  }
  paintProgress(box, v);
}
function close() {
  if (!back) return;
  back.remove(); back = null; view = null; turn++;
  document.removeEventListener('keydown', onKey, true);
}
function onKey(e) {
  if (e.key !== 'Escape' || !onTop()) return;
  e.stopPropagation();
  if (view.stage !== 'installing') close();
}
function showState() {
  if (LIVE.includes(current?.stage)) return show(current);
  if (current?.failed) return show({ ...current, stage: 'download-failed' });
  close();
}
function paint() {
  const text = badgeText(current);
  badge.textContent = text; badge.hidden = !text;
  badge.classList.toggle('ready', current?.stage === 'ready');
}
function onState(s) {
  current = s; paint();
  if (back && LIVE.includes(view.stage)) showState();
}

async function install() {
  if (!await ask.saveFirst()) return;
  const was = current;
  show({ ...was, stage: 'installing' });
  let r; try { r = await api.storeUpdate('install'); } catch { r = { ok: false, reason: 'failed' }; }
  if (r && r.ok) return;   // Windows is closing the app
  const reason = r && r.reason;
  if (reason === 'failed') return show({ ...was, stage: 'install-failed' });
  if (reason === 'none') return close();
  show(was);   // No in Windows' box, or the question below
  if (reason === 'task') await ask.choice("Bohpum can't install while files are being converted", 'Wait for the small convert window to finish, then click Install again.', ['OK']);
}
function act(what) {
  if (what === 'close') return close();
  if (what === 'install') return performance.now() - shownAt < INSTALL_SETTLE_MS ? undefined : install();
  if (what === 'download') return void api.storeUpdate('download').catch(() => {});
  if (what === 'store') { api.storeUpdate('open-store').catch(() => {}); close(); }
}

// Help › Check for Updates: the panel, on its answer. Closing it meanwhile drops the answer.
async function check() {
  await ready;
  if (!screenFree() || !current) return;
  show({ ...current, stage: 'checking' });
  const mine = ++turn;
  let a; try { a = await api.storeUpdate('check'); } catch { a = { kind: 'failed' }; }
  if (mine !== turn) return;
  try { current = await api.storeUpdate('state') || current; paint(); } catch {}
  if (mine !== turn) return;
  if (a && a.kind === 'current') return show({ ...current, stage: 'current' });
  if (a && a.kind === 'update') return showState();
  show({ ...current, stage: 'failed' });
}

// o: { api, saveFirst() → go on?, choice(title, text, labels), screenFree() }
function init(o) {
  api = o.api; ask = { saveFirst: o.saveFirst, choice: o.choice }; screenFree = o.screenFree;
  badge = document.getElementById('b-update');
  if (!api || !api.storeUpdate) return ready;   // the page outside Electron
  ready = api.storeUpdate('state').then(s => {
    if (!s) return;
    current = s; paint();
    api.onStoreUpdate(onState);
    badge.onclick = () => { if (screenFree()) showState(); };
  }).catch(e => console.warn(e));
  return ready;
}

window.BohpumUpdatePanel = { init, check, active: async () => { await ready; return !!current; }, badgeText, sizeText, timeLeftText };
})();
