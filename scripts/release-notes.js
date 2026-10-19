// Prints a version's GitHub release notes (package.json's by default) from src/notes.js — the same notes as the app's
// What's new window, tags in its order. `node scripts/release-notes.js [version]`, run by .github/workflows/release.yml.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const version = process.argv[2] || require(path.join(ROOT, 'package.json')).version;
const window = {};
vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'src', 'notes.js'), 'utf8'), { window });
const N = window.BohpumNotes, e = N.noteFor(version);
if (!e) { console.error(`release-notes: src/notes.js has no notes for ${version}`); process.exit(1); }
const WORDS = { new: 'New', improved: 'Improved', fixed: 'Fixed', removed: 'Removed' };
const sorted = e.notes.map((n, i) => [n, i]).sort((a, b) => N.KINDS.indexOf(a[0].kind) - N.KINDS.indexOf(b[0].kind) || a[1] - b[1]);
console.log(`What's new in Bohpum ${version} (${e.date})\n\n` + sorted.map(([n]) => `- **${WORDS[n.kind]}:** ${n.text}`).join('\n'));
