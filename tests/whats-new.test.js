// What's new, as in Sastra PDF: the first start of a version opens it by itself over the welcome screen, once;
// Help > What's New opens it again. Each line has its tag (New, Improved, Fixed, Removed); Close stays in view.
const { Menu, app } = require('electron');
const fs = require('fs');
const path = require('path');
const { run } = require('./harness');

run(async (t, check) => {
  const version = app.getVersion();
  t.win.focus(); t.wc.focus();
  await t.waitFor('!!document.documentElement.dataset.notes && !!document.querySelector(".welcome-modal")', 15000);
  const state = () => t.js(`(() => { const r = document.getElementById('modal-root'), m = document.querySelector('#modal-root .modal.notes'), top = r.lastElementChild;
    return { boxes: [...r.children].map(b => b.querySelector('.modal').className.replace('modal', '').trim()), topIsNotes: !!top && !!top.querySelector('.modal.notes'),
      title: m && m.querySelector('.modal-h').firstChild.textContent, date: m && (m.querySelector('.notes-date') || {}).textContent,
      tags: m ? [...m.querySelectorAll('.notes-kind')].map(s => s.textContent) : [], earlier: !!(m && m.querySelector('[data-earlier]')),
      width: m && Math.round(m.getBoundingClientRect().width), focus: document.activeElement && document.activeElement.textContent, flag: document.documentElement.dataset.notes }; })()`);
  const s1 = await state();
  check('Fresh profile: What\'s new opens by itself, on top of the welcome screen', s1.flag === 'shown' && s1.topIsNotes && s1.boxes.join('|') === 'welcome-modal|notes', s1);
  const entry = await t.js(`window.BohpumNotes.noteFor(${JSON.stringify(version)})`);
  const older = await t.js(`window.BohpumNotes.earlierNotes(${JSON.stringify(version)}).length`);
  check(`Title "What's new in ${version}", its date, 900 px wide, Close has the focus`, entry && s1.title === `What's new in ${version}` && s1.date === entry.date && s1.width === 900 && s1.focus === 'Close', s1);
  const K = ['new', 'improved', 'fixed', 'removed'], W = { new: 'New', improved: 'Improved', fixed: 'Fixed', removed: 'Removed' };
  const want = entry ? entry.notes.map((n, i) => [n.kind, i]).sort((a, b) => K.indexOf(a[0]) - K.indexOf(b[0]) || a[1] - b[1]).map(([k]) => W[k]) : [];
  check('One tag per line, in the order New, Improved, Fixed, Removed', want.length && s1.tags.join() === want.join(), { tags: s1.tags, want });
  check('"See earlier versions" only when there are earlier versions', s1.earlier === older > 0, { earlier: s1.earlier, older });

  const tag = () => t.js(`(() => { const rgb = (c) => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; };
    return { tag: getComputedStyle(document.querySelector('.notes-kind-new')).color, accent: rgb(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()) }; })()`);
  await t.js('window.__bohpumApp.cmd("theme-light")'); await t.sleep(300);
  const light = await tag();
  await t.js('window.__bohpumApp.cmd("theme-dark")'); await t.sleep(300);
  const dark = await tag();
  await t.js('window.__bohpumApp.cmd("theme-system")'); await t.sleep(200);
  check('The New tag is the app\'s green, in light and dark', light.tag === light.accent && dark.tag === dark.accent && light.tag !== dark.tag, { light, dark });

  await t.key('Escape');
  const s2 = await state();
  check('Esc closes only What\'s new: the welcome screen is still there', s2.boxes.join('|') === 'welcome-modal', s2);
  await t.sleep(300);
  const saved = JSON.parse(fs.readFileSync(path.join(t.ctx.userData, 'settings.json'), 'utf8'));
  check('The version is remembered as seen', saved.notesSeen === version, saved);

  t.wc.reload();
  await t.sleep(500);
  await t.waitFor('!!document.documentElement.dataset.notes && !!document.querySelector(".welcome-modal")', 15000);
  const s3 = await state();
  check('Next start: it does not open again', s3.flag === 'none' && s3.boxes.join('|') === 'welcome-modal', s3);

  const help = Menu.getApplicationMenu().items.find(i => i.label.replace('&', '') === 'Help').submenu.items;
  const at = help.findIndex(i => i.label === "What's New"), whatsNew = help[at];
  check('Help: What\'s New sits just above About (Check for Updates… above it)',
    at > 0 && help[at - 1].label === 'Check for Updates…' && /About/.test(help[at + 1].label), help.map(i => i.label));
  whatsNew.click(); await t.sleep(400);
  check('While another box is open it does nothing', (await state()).boxes.join('|') === 'welcome-modal', await state());
  t.win.focus(); t.wc.focus();
  await t.key('Escape'); await t.waitFor('!document.querySelector(".modal-back")');
  whatsNew.click(); await t.waitFor('!!document.querySelector(".modal.notes")');
  const s4 = await state();
  check('Help > What\'s New opens it', s4.topIsNotes && s4.title === `What's new in ${version}`, s4);

  t.win.unmaximize(); t.win.setMinimumSize(300, 300); t.win.setContentSize(800, 420); await t.sleep(600);
  const fit = await t.js(`(() => { const m = document.querySelector('.modal.notes'), b = m.querySelector('.modal-b'), c = m.querySelector('.modal-f .btn.primary').getBoundingClientRect();
    return { scrolls: b.scrollHeight > b.clientHeight, closeIn: c.top >= 0 && c.bottom <= innerHeight, h: Math.round(m.getBoundingClientRect().height), ih: innerHeight }; })()`);
  check('A short window: the list scrolls and Close stays in view', fit.scrolls && fit.closeIn && fit.h <= fit.ih, fit);
  t.win.maximize(); await t.sleep(300);
  await t.key('Enter');
  check('Enter closes it', !(await t.js('!!document.querySelector(".modal.notes")')), null);
});
