// scripts/store-reader.js with a fake private bucket (tests/reader-server.js): the Store package's reader is the pack
// already in R2, downloaded with the update key and checked like installed copies check it, unpacked into
// <out>\LibreOffice; a refused or damaged download leaves no LibreOffice folder behind.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');
const { makeFakePack, startServer } = require('./reader-server');

const KEY = { clientId: 'store-id', clientSecret: 'store-secret' };

run(async (t, check) => {
  const { storeReader } = require(path.join(ROOT, 'scripts', 'store-reader.js'));
  const { zip, pack } = await makeFakePack(t.ctx.tmp);
  const server = await startServer({ zip, pack, key: KEY });
  try {
    const out = path.join(t.ctx.tmp, 'out1');
    const dir = await storeReader({ out, base: server.base, pack, key: KEY });
    check('The pack from R2 is unpacked into <out>\\LibreOffice', dir === path.join(out, 'LibreOffice') && fs.existsSync(path.join(dir, 'program', 'soffice.exe')), dir);
    check('…and nothing else is left in <out>', JSON.stringify(fs.readdirSync(out)) === '["LibreOffice"]', fs.readdirSync(out));

    const out2 = path.join(t.ctx.tmp, 'out2');
    let err = null; try { await storeReader({ out: out2, base: server.base, pack, key: { clientId: 'x', clientSecret: 'y' } }); } catch (e) { err = e; }
    check('A wrong key is refused, and no LibreOffice folder is made', !!err && !fs.existsSync(path.join(out2, 'LibreOffice')), String(err));

    const out3 = path.join(t.ctx.tmp, 'out3');
    err = null; try { await storeReader({ out: out3, base: server.base, pack: { ...pack, sha256: '0'.repeat(64) }, key: KEY }); } catch (e) { err = e; }
    check('A pack that doesn\'t match reader-pack.json is refused, and no LibreOffice folder is made', !!err && !fs.existsSync(path.join(out3, 'LibreOffice')), String(err));
  } finally { await server.close(); }
});
