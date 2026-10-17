// Bohpum — the small window for the File Explorer menu's "Convert to Bohpum". main.js sends one batch per menu
// click ({ task: 'convert', paths }); batches run one after another. Per click: ONE Replace / Keep both / Cancel
// question for names already there, then each .pub is read (LibreOffice, in main.js) and saved as a .bpum next to
// it — through docfile.js, exactly as the editor's Open + Save would.
import { docFromFodg, bpumText } from './docfile.js';

const api = window.api;
const $ = (s) => document.querySelector(s);
const queue = [];
let running = false, cancelled = false, saved = 0, problems = 0, notes = 0, closeTimer = null;

const dirOf = (p) => p.replace(/[\\/][^\\/]*$/, '');
const fileOf = (p) => p.split(/[\\/]/).pop();
const baseOf = (n) => n.replace(/\.[^.]+$/, '');
const join = (d, n) => d.replace(/[\\/]+$/, '') + '\\' + n;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function show(what, step, frac) { $('#what').textContent = what; $('#step').textContent = step || ''; $('#fill').style.width = Math.round((frac || 0) * 100) + '%'; }
function showWaiting() { const n = queue.length; $('#waiting').hidden = !n; $('#waiting').textContent = n ? `${n} more waiting` : ''; }
function line(text, kind) { const li = document.createElement('li'); li.className = kind; li.textContent = text; $('#lines').append(li); $('#lines').hidden = false; }
const problem = (text) => { problems++; line(text, 'problem'); };
const note = (text) => { notes++; line(text, 'note'); };

// the window is as tall as this content: report every change (problems, "N more waiting", the question)
new ResizeObserver(() => api.taskSize($('.task').getBoundingClientRect().height)).observe($('.task'));
api.onTaskBatch((b) => { clearTimeout(closeTimer); queue.push(b); showWaiting(); if (!running) run(); });
$('#bCancel').onclick = () => { cancelled = true; queue.length = 0; showWaiting(); $('#bCancel').disabled = true; $('#step').textContent = 'Stopping…'; };
$('#bClose').onclick = () => window.close();

// "Already there": asked inside this window, like Bohpum's own boxes → 'replace' | 'keep' | null
let answer = null;
const ASK = ['#bNo', '#bReplace', '#bKeep'];
function ask(message, detail) {
  return new Promise((res) => {
    $('#askMsg').textContent = message; $('#askDetail').textContent = detail; $('#ask').hidden = false;
    $('#bCancel').hidden = true; for (const id of ASK) $(id).hidden = false;
    answer = (v) => { answer = null; $('#ask').hidden = true; for (const id of ASK) $(id).hidden = true; $('#bCancel').hidden = false; res(v); };
    api.taskFocus(); $('#bKeep').focus();
  });
}
$('#bNo').onclick = () => answer?.(null); $('#bReplace').onclick = () => answer?.('replace'); $('#bKeep').onclick = () => answer?.('keep');
// no title bar, so Esc: answers Cancel, stops the job, or closes the finished window
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (answer) answer(null); else if (running) $('#bCancel').click(); else window.close();
});
api.taskReady();

async function run() {
  running = true; cancelled = false;
  $('#bCancel').hidden = false; $('#bCancel').disabled = false; $('#bClose').hidden = true;
  while (queue.length && !cancelled) { const b = queue.shift(); showWaiting(); await batch(b); }
  running = false; finish();
}
function finish() {
  document.body.dataset.done = String(+(document.body.dataset.done || 0) + 1); // finished runs (tests read it)
  $('#bCancel').hidden = true; $('#bClose').hidden = false;
  const files = `${plural(saved, 'file')} saved`;
  if (cancelled) show('Cancelled', files, 1);
  else if (problems) show('Done, with problems', `${files} · ${plural(problems, 'problem')} below`, 1);
  else if (notes) show('Done', `${files} · ${plural(notes, 'note')} below`, 1);
  else { show('Done', files, 1); closeTimer = setTimeout(() => window.close(), 2000); }
  $('#bClose').focus();
}

async function batch({ paths }) {
  const jobs = paths.map((p) => ({ path: p, name: fileOf(p), dir: dirOf(p), out: baseOf(fileOf(p)) + '.bpum' }));
  const groups = jobs.map((j) => ({ dir: j.dir, names: [j.out] }));
  const q = await api.nameClashes(groups);
  let choice = null;
  if (q.count) {
    show('Some files are already there', '', 0);
    choice = await ask(q.message, q.detail);
    if (!choice) { problem(`Cancelled: nothing saved for ${jobs.length === 1 ? jobs[0].name : plural(jobs.length, 'file')}`); return; }
  }
  const final = await api.resolveNames(groups, choice);
  for (const [k, j] of jobs.entries()) {
    if (cancelled) return;
    show(`Converting ${j.name}`, jobs.length > 1 ? `File ${k + 1} of ${jobs.length}` : '', k / jobs.length);
    await convertOne(j, join(j.dir, final[k][0]));
  }
}

async function convertOne(j, out) {
  const r = await api.readDocument(j.path);
  if (r.error) return problem(`${j.name}: ${r.error}`);
  let res;
  try { res = docFromFodg(r.text, baseOf(j.name)); }
  catch { return problem(`${j.name}: it may be damaged, or not a Publisher file`); }
  const w = await api.writeFile({ path: out, text: bpumText(res.doc, out) });
  if (w && w.error) return problem(`${fileOf(out)}: couldn't save it (${w.error})`);
  saved++;
  for (const n of res.warnings) note(`${j.name}: ${n}`);
}
