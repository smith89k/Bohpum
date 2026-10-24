// Mail merge: the boxes and the bar above the page. app.js passes in what they need, as print.js is used.
import { ticked } from './merge.js';

// Which sheet of a workbook with several? → the name, or null (Cancel)
export function sheetBox(modal, names) {
  const body = document.createElement('div');
  const text = document.createElement('div'); text.textContent = 'This workbook has more than one sheet. Which one holds the people?';
  const sel = document.createElement('select'); sel.className = 'field'; sel.style.marginTop = '10px';
  for (const n of names) sel.add(new Option(n, n));
  body.append(text, sel);
  const m = modal('Choose a sheet', body, [['Cancel', null], ['OK', true, true]]);
  return m.done.then(v => v ? sel.value : null);
}

// Which column holds the photos? → a column name, null ("Not from the list") or undefined (Cancel)
export function photoBox(modal, columns, current, rows = []) {
  const body = document.createElement('div');
  const text = document.createElement('div'); text.textContent = 'Which column of the list holds the photo files?';
  const sel = document.createElement('select'); sel.className = 'field'; sel.style.marginTop = '10px';
  sel.add(new Option('Not from the list', ''));
  for (const c of columns) sel.add(new Option(c, c));
  const first = (i) => { const r = rows.find(r => String(r[i] ?? '').trim()); return r ? String(r[i]).trim().replace(/["']$/, '') : ''; };
  const guess = columns.find(c => PHOTO_NAME.test(c)) || columns.find((c, i) => /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(first(i)));
  sel.value = columns.includes(current) ? current : guess || '';
  body.append(text, sel);
  const m = modal('Photo from List', body, [['Cancel', false], ['OK', true, true]]);
  return m.done.then(v => v ? (sel.value || null) : undefined);
}
const PHOTO_NAME = /photo|picture|image|pic|រូប/i;

// The slim bar above the page: ◀ Person 3 of 40 ▶, that person's first value, Preview, Choose people, the list's file;
// or what is wrong with the list. Its buttons send commands (app.js cmd).
export function renderMailBar(bar, doc, mail, cmd) {
  const m = doc.merge;
  bar.hidden = !m;
  if (!m) return bar.replaceChildren();
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text });
  const name = el('span', 'mb-list', mail && mail.error ? mail.error : 'Mailing list: ' + m.list.split(/[\\/]/).pop() + (m.sheet ? ' · ' + m.sheet : ''));
  name.title = m.list;
  bar.classList.toggle('bad', !!(mail && mail.error));
  if (!mail || !mail.list) return bar.replaceChildren(name);
  const people = ticked(mail.list, m.off), at = Math.min(mail.at, people.length - 1);
  const btn = (cls, text, c, title) => { const b = el('button', 'btn ' + cls, text); b.title = title; b.onclick = () => cmd(c); return b; };
  const prev = btn('mb-prev', '◀', 'mail-prev', 'Previous person'), next = btn('mb-next', '▶', 'mail-next', 'Next person');
  prev.disabled = at <= 0; next.disabled = at >= people.length - 1;
  const who = el('span', 'mb-who', people.length ? `Person ${at + 1} of ${people.length}` : 'No one is ticked');
  const first = el('span', 'mb-name', people.length ? mail.list.rows[people[at]][0] : '');
  const sw = el('label', 'chk mb-preview', ' Preview'), box = document.createElement('input');
  box.type = 'checkbox'; box.checked = !!mail.preview; box.onchange = () => cmd('mail-preview');
  sw.prepend(box);
  bar.replaceChildren(prev, who, next, first, sw, btn('mb-people', 'Choose people', 'mail-people', 'Tick the people to print'), name);
}

// What the Mailings menu may do now (main.js mailMenu)
export function mailMenuState(mail, selected, editing) {
  const list = !!(mail && mail.list);
  return { list, error: !!(mail && mail.error), columns: list ? mail.list.columns : [], field: list && editing,
    photo: list && selected.length === 1 && selected[0].type === 'image', preview: list && mail.preview };
}
