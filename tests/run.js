// Runs each tests/*.test.js (or the files given) in its own Electron process: pnpm test [-- file …]
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const electron = require('electron'); // from plain Node this is the path to electron.exe

const files = process.argv.length > 2
  ? process.argv.slice(2).map(f => path.resolve(f))
  : fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js')).sort().map(f => path.join(__dirname, f));
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
let failed = 0;
for (const f of files) {
  console.log('\n# ' + path.basename(f));
  const r = spawnSync(electron, [f], { stdio: 'inherit', env });
  if (r.status !== 0) { failed++; console.log(`# ${path.basename(f)} FAILED (exit ${r.status})`); }
}
console.log(failed ? `\n${failed} of ${files.length} test files failed` : `\nAll ${files.length} test files passed`);
process.exit(failed ? 1 : 0);
