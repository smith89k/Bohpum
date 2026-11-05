// Run first by `pnpm run dist` / `dist:store` and the release job: every release needs its What's new, in both places
// people read it, so the build stops when one is missing (as in Sastra PDF):
//  - src/notes.js, the app's own What's new window (and the GitHub release notes): an entry for package.json's version
//    at the top, and no broken entry;
//  - docs/store-listing.md, the Store page's "What's new in this version" (pasted into Partner Center): a "### <version>"
//    section with at least one "- " line, within Partner Center's 1500 characters.
// `node scripts/check-notes.js [notes.js] [store-listing.md]` checks other copies (tests/check-notes.test.js).
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const file = path.resolve(process.argv[2] || path.join(ROOT, 'src', 'notes.js'));
const listing = path.resolve(process.argv[3] || path.join(ROOT, 'docs', 'store-listing.md'));
const version = require(path.join(ROOT, 'package.json')).version;
const STORE_LIMIT = 1500;   // Partner Center: Store listings › What's new in this version
const problems = [];
let N = null;
try { const window = {}; vm.runInNewContext(fs.readFileSync(file, 'utf8'), { window }, { filename: file }); N = window.BohpumNotes || null; }
catch (e) { problems.push(`could not run it: ${e.message}`); }
if (N) {
  const list = Array.isArray(N.NOTES) ? N.NOTES : [], kinds = Array.isArray(N.KINDS) ? N.KINDS : [];
  if (!list.length) problems.push('there are no entries');
  else if (list[0].version !== version) problems.push(`the newest entry is ${list[0].version}, but package.json says ${version}: write its notes at the top`);
  const seen = new Set();
  for (const e of list) {
    const v = e && e.version;
    if (typeof v !== 'string' || !v) { problems.push('an entry has no version'); continue; }
    if (seen.has(v)) problems.push(`${v} is listed twice`);
    seen.add(v);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) problems.push(`${v} has no date (YYYY-MM-DD)`);
    if (!Array.isArray(e.notes) || !e.notes.length) { problems.push(`${v} has no notes`); continue; }
    for (const n of e.notes) {
      if (!kinds.includes(n && n.kind)) problems.push(`${v}: unknown kind "${n && n.kind}" (use ${kinds.join(', ')})`);
      if (typeof (n && n.text) !== 'string' || !n.text.trim()) problems.push(`${v}: a note has no text`);
    }
  }
} else if (!problems.length) problems.push('it does not set window.BohpumNotes');

// The Store page's notes for this version: the lines under "### <version>" up to the next heading
const storeProblems = [];
let lines = null;
try { lines = fs.readFileSync(listing, 'utf8').split(/\r?\n/); } catch (e) { storeProblems.push(`could not read it: ${e.message}`); }
if (lines) {
  const at = lines.findIndex(l => l.trim() === `### ${version}`);
  if (at < 0) storeProblems.push(`there is no "### ${version}" under "What's new in this version": write the Store's notes for it at the top`);
  else {
    const body = [];
    for (const l of lines.slice(at + 1)) { if (/^#/.test(l)) break; body.push(l); }
    const text = body.join('\n').trim();
    if (!body.some(l => /^- \S/.test(l))) storeProblems.push(`"### ${version}" has no notes ("- " lines)`);
    else if (text.length > STORE_LIMIT) storeProblems.push(`"### ${version}" is ${text.length} characters; Partner Center takes up to ${STORE_LIMIT}`);
  }
}

if (problems.length || storeProblems.length) {
  const say = (f, list) => list.length ? [`  ${path.relative(ROOT, f)}:`, ...list.map(p => '    - ' + p)] : [];
  console.error(`What's new for ${version} is not ready:\n` + [...say(file, problems), ...say(listing, storeProblems)].join('\n'));
  process.exit(1);
}
console.log(`What's new: ${N.NOTES.length} versions, newest ${N.NOTES[0].version} = package.json; the Store listing has its notes too`);
