// Mail merge: the boxes and the bar above the page. app.js passes in what they need, as print.js is used.

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
  const first = (i) => { const r = rows.find(r => String(r[i]).trim()); return r ? String(r[i]).trim().replace(/["']$/, '') : ''; };
  const guess = columns.find(c => PHOTO_NAME.test(c)) || columns.find((c, i) => /\.(png|jpe?g|gif|bmp|webp|svg)$/i.test(first(i)));
  sel.value = columns.includes(current) ? current : guess || '';
  body.append(text, sel);
  const m = modal('Photo from List', body, [['Cancel', false], ['OK', true, true]]);
  return m.done.then(v => v ? (sel.value || null) : undefined);
}
const PHOTO_NAME = /photo|picture|image|pic|រូប/i;

// The slim bar above the page: the list's file and sheet, or what is wrong with it. Task 6 adds the people to it.
export function renderMailBar(bar, doc, mail) {
  const m = doc.merge;
  bar.hidden = !m;
  if (!m) return bar.replaceChildren();
  const name = document.createElement('span'); name.className = 'mb-list';
  const file = m.list.split(/[\\/]/).pop();
  name.textContent = mail && mail.error ? mail.error : 'Mailing list: ' + file + (m.sheet ? ' · ' + m.sheet : '');
  name.title = m.list;
  bar.classList.toggle('bad', !!(mail && mail.error));
  bar.replaceChildren(name);
}

// What the Mailings menu may do now (main.js mailMenu)
export function mailMenuState(mail, selected, editing) {
  const list = !!(mail && mail.list);
  return { list, error: !!(mail && mail.error), columns: list ? mail.list.columns : [], field: list && editing,
    photo: list && selected.length === 1 && selected[0].type === 'image', preview: list && mail.preview };
}
