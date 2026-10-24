// Mail merge: the boxes and the bar above the page. app.js passes in what they need, as print.js is used.
import { ticked, rowKey } from './merge.js';

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

// Who gets a copy? Every row with a tick box; the search hides rows (Tick all / Untick all act on the rows shown).
// → the new list of unticked rows' keys, or null (Cancel). The rows are built once; typing only shows and hides them.
export function peopleBox(modal, list, off) {
  const body = document.createElement('div'), skip = new Set(off);
  const find = document.createElement('input'); find.type = 'search'; find.className = 'field pp-find'; find.placeholder = 'Search'; find.dataset.enterSelf = ''; // Enter here must not press OK (modal)
  const table = document.createElement('table'), head = table.createTHead().insertRow(), tb = table.createTBody();
  head.insertCell().textContent = '';
  for (const c of list.columns) Object.assign(head.appendChild(document.createElement('th')), { textContent: c });
  const items = list.rows.map((row) => {
    const tr = tb.insertRow(), box = document.createElement('input');
    box.type = 'checkbox'; box.checked = !skip.has(rowKey(row));
    tr.insertCell().append(box);
    for (let i = 0; i < list.columns.length; i++) tr.insertCell().textContent = row[i] ?? '';
    return { tr, box, key: rowKey(row), text: row.join('\n').toLowerCase() };
  });
  find.oninput = () => { const q = find.value.trim().toLowerCase(); for (const it of items) it.tr.hidden = !!q && !it.text.includes(q); };
  const all = (on) => { for (const it of items) if (!it.tr.hidden) it.box.checked = on; };
  const bt = (label, on) => { const b = document.createElement('button'); b.className = 'btn'; b.dataset.enterSelf = ''; b.textContent = label; b.onclick = () => all(on); return b; };
  const bar = document.createElement('div'); bar.className = 'pp-bar';
  bar.append(find, bt('Tick all', true), bt('Untick all', false));
  const wrap = document.createElement('div'); wrap.className = 'pp-list'; wrap.append(table);
  body.append(bar, wrap);
  const m = modal('Choose People', body, [['Cancel', null], ['OK', true, true]], 'people');
  find.focus();
  return m.done.then(v => v ? items.filter(it => !it.box.checked).map(it => it.key) : null);
}

// Before printing or saving: the people with a missing photo, a column gone or text too long, one line each
// ("Row 5 · សុខ ដារា · photo not found: C:\Photos\dara.jpg") → true (Print anyway) or false (Cancel). None → true.
export function problemsBox(modal, problems) {
  if (!problems.length) return Promise.resolve(true);
  const body = document.createElement('div');
  const text = document.createElement('div'); text.textContent = 'These people will not print quite as designed:';
  const ul = document.createElement('ul'); ul.className = 'pb-list';
  for (const p of problems) ul.appendChild(document.createElement('li')).textContent = [`Row ${p.row}`, p.name, p.text].filter(Boolean).join(' · ');
  body.append(text, ul);
  const m = modal('Before printing', body, [['Cancel', false], ['Print anyway', true, true]], 'problems');
  return m.done.then(v => !!v);
}

// The slim bar above the page: ◀ Person 3 of 40 ▶, that person's first value, Preview, Choose people, the list's file;
// or what is wrong with the list. Its buttons send commands (app.js cmd).
// The mail merge toolbar, shown while the publication has a list: every Mailings action with its icon (greyed out
// when it can't be used now), the person showing, and the list's name. ui = { cmd, icon, state: mailMenuState(…), fieldMenu }
export function renderMailBar(bar, doc, mail, ui) {
  const m = doc.merge;
  bar.hidden = !m;
  if (!m) return bar.replaceChildren();
  const { cmd, icon, state } = ui, list = !!(mail && mail.list);
  const el = (tag, cls, text) => Object.assign(document.createElement(tag), { className: cls, textContent: text });
  const btn = (cls, ic, label, title, c, on = true) => {
    const b = el('button', 'btn ' + cls, '');
    b.innerHTML = icon(ic);
    if (label) b.append(el('span', 'lbl', label));
    b.title = title; b.disabled = !on;
    b.onclick = typeof c === 'function' ? c : () => cmd(c);
    return b;
  };
  const sep = () => el('span', 'mb-sep', '');
  // Insert Field keeps the caret in the text box: the button never takes the focus
  const field = btn('mb-field', 'field', 'Insert Field', 'Insert a field («Name») at the cursor', (e) => ui.fieldMenu(e.currentTarget), state.field);
  field.insertAdjacentHTML('beforeend', icon('chevDown'));
  field.addEventListener('mousedown', (e) => e.preventDefault());
  const preview = btn('mb-preview', 'eye', 'Preview', 'Show each person instead of the «blanks»', 'mail-preview', list);
  preview.classList.toggle('on', !!(mail && mail.preview));
  preview.setAttribute('aria-pressed', String(!!(mail && mail.preview)));
  const people = list ? ticked(mail.list, m.off) : [], at = Math.min(list ? mail.at : 0, people.length - 1);
  const prev = btn('mb-prev', 'chevLeft', '', 'Previous person', 'mail-prev', list && at > 0);
  const next = btn('mb-next', 'chevRight', '', 'Next person', 'mail-next', list && at < people.length - 1);
  const who = el('span', 'mb-who', !list ? '—' : people.length ? `Person ${at + 1} of ${people.length}` : 'No one is ticked');
  const first = el('span', 'mb-name', people.length ? mail.list.rows[people[at]][0] : '');
  const name = el('span', 'mb-list', mail && mail.error ? mail.error : 'Mailing list: ' + m.list.split(/[\\/]/).pop() + (m.sheet ? ' · ' + m.sheet : ''));
  name.title = m.list;
  bar.classList.toggle('bad', !!(mail && mail.error));
  bar.replaceChildren(
    btn('mb-select', 'mlist', 'Select List', 'Choose the Excel or CSV list', 'mail-select'),
    btn('mb-people', 'people', 'Choose People', 'Tick the people to print', 'mail-people', list),
    field,
    btn('mb-photo', 'photo', 'Photo from List', "Take the selected picture's photo from a column of the list", 'mail-photo', state.photo),
    sep(), preview, prev, who, next, first,
    sep(),
    btn('mb-print', 'print', 'Print All', 'Print everyone ticked', 'print', list),
    btn('mb-remove', 'remove', 'Remove List', 'Forget the list; the «blanks» become plain text', 'mail-remove', list || !!(mail && mail.error)),
    name);
}

// What the Mailings menu may do now (main.js mailMenu)
export function mailMenuState(mail, selected, editing) {
  const list = !!(mail && mail.list);
  return { list, error: !!(mail && mail.error), columns: list ? mail.list.columns : [], field: list && editing,
    photo: list && selected.length === 1 && selected[0].type === 'image', preview: list && mail.preview };
}
