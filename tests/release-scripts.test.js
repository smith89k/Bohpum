// The release job's helper scripts: the one pinned LibreOffice (libreoffice.json), the reader pack made from it
// (trimmed as scripts/bundle-libreoffice.js trims, zipped, with its { name, size, sha256 }), which old installers the
// job removes from R2 (never latest.yml, a .blockmap or anything under reader/), and the GitHub release notes written
// from What's new.
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const asNode = (script, args) => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
};

run(async (t, check) => {
  const reader = require(path.join(ROOT, 'reader.js'));
  let lo = null; try { lo = JSON.parse(fs.readFileSync(path.join(ROOT, 'libreoffice.json'), 'utf8')); } catch {}
  check('libreoffice.json pins one LibreOffice: its version, the trim number, the archived Windows x64 MSI and its SHA-256',
    !!lo && /^\d+\.\d+\.\d+$/.test(lo.version) && Number.isInteger(lo.pack) && lo.pack > 0 && /^https:\/\/downloadarchive\.documentfoundation\.org\//.test(lo.msi)
      && /_Win_x86-64\.msi$/.test(lo.msi) && /^[0-9a-f]{64}$/.test(lo.sha256), lo);

  // ---- the pack, from a fake LibreOffice folder
  const { makePack } = require(path.join(ROOT, 'scripts', 'reader-pack.js'));
  const src = path.join(t.ctx.tmp, 'LibreOffice'), out = path.join(t.ctx.tmp, 'dist-reader');
  const put = (rel, text = 'x') => { const p = path.join(src, rel); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, text); };
  ['program/soffice.exe', 'program/version.ini', 'help/x.html', 'share/gallery/x', 'share/config/images_colibre.zip', 'share/config/images_sifr.zip', 'LICENSE.html',
    // what The Document Foundation's MSI unpacks besides (msiexec /a): menus in 123 languages, the files Windows gets
    'program/resource/km/LC_MESSAGES/sw.mo', 'share/registry/res/registry_km.xcd', 'share/registry/res/fcfg_langpack_km.xcd', 'share/registry/res/fcfg_langpack_en-US.xcd',
    'share/registry/Langpack-km.xcd', 'share/registry/Langpack-en-US.xcd', 'share/registry/ctl_km.xcd', 'share/registry/main.xcd', 'Fonts/Alef-Bold.ttf',
    'System64/msvcp140.dll', 'System/msvcp140.dll', 'lo.msi'].forEach(f => put(f));
  const p = await makePack(src, out);
  const zipBytes = fs.readFileSync(p.zip), info = JSON.parse(fs.readFileSync(path.join(out, p.name + '.json'), 'utf8'));
  check('The pack is named after libreoffice.json', p.name === reader.packName(lo) && path.basename(p.zip) === p.name + '.zip', p);
  check('Its info file holds the zip\'s real size and SHA-256',
    info.name === p.name && info.size === zipBytes.length && info.sha256 === crypto.createHash('sha256').update(zipBytes).digest('hex') && !!reader.parsePackInfo(JSON.stringify(info)), info);
  const un = path.join(t.ctx.tmp, 'unzipped'); fs.mkdirSync(un);
  await reader.tarUnzip(p.zip, un);
  const has = (rel) => fs.existsSync(path.join(un, rel));
  check('Unpacked: soffice.exe, one icon theme and the licence files are in it; help, the gallery and other icon themes are not',
    has('program/soffice.exe') && has('share/config/images_colibre.zip') && has('LICENSE.html') && !has('help') && !has('share/gallery') && !has('share/config/images_sifr.zip'),
    fs.readdirSync(un));
  check('The Visual C++ runtime is copied in', has('program/vcruntime140.dll') && has('program/msvcp140.dll'));
  check('From the MSI: no menu translations, no other languages\' settings, no Windows fonts, runtime folders or msi; English and the Khmer text settings stay',
    !has('program/resource') && !has('share/registry/res/registry_km.xcd') && !has('share/registry/res/fcfg_langpack_km.xcd') && !has('share/registry/Langpack-km.xcd')
      && !has('Fonts') && !has('System64') && !has('System') && !has('lo.msi')
      && has('share/registry/res/fcfg_langpack_en-US.xcd') && has('share/registry/Langpack-en-US.xcd') && has('share/registry/ctl_km.xcd') && has('share/registry/main.xcd'));
  const cli = asNode('reader-pack.js', [src, path.join(t.ctx.tmp, 'cli')]);
  check('node scripts/reader-pack.js <LibreOffice> <out> prints the pack info', cli.code === 0 && !!reader.parsePackInfo(cli.out.trim()), cli);

  // ---- R2 prune
  const { pruneList } = require(path.join(ROOT, 'scripts', 'r2-prune.js'));
  const keys = ['Bohpum-Setup-0.2.0.exe', 'Bohpum-Setup-0.2.1.exe\r', 'Bohpum-Setup-0.2.0.exe.blockmap', 'latest.yml', 'reader/LibreOffice-25.8.2-pack1.zip', ''];
  check('Prune removes only the older installers', JSON.stringify(pruneList(keys, 'Bohpum-Setup-0.2.1.exe')) === '["Bohpum-Setup-0.2.0.exe"]', pruneList(keys, 'Bohpum-Setup-0.2.1.exe'));
  let threw = false; try { pruneList(keys, 'Bohpum-Setup-9.9.9.exe'); } catch { threw = true; }
  check('…and removes nothing when the new installer is not in the bucket', threw);

  // ---- release notes
  const { notesMarkdown, loadNotes } = require(path.join(ROOT, 'scripts', 'release-notes.js'));
  const md = notesMarkdown({ notes: [{ kind: 'fixed', text: 'b' }, { kind: 'new', text: 'a' }] }, loadNotes().KINDS);
  check('Release notes list the kinds in What\'s new\'s order', md === '## New\n- a\n\n## Fixed\n- b\n', md);
  const none = asNode('release-notes.js', ['9.9.9']);
  check('A version without What\'s new notes stops the release', none.code === 1 && /9\.9\.9/.test(none.out), none);
});
