// Picture tools in the Picture section: Crop (black bars; a flipped photo crops the side that is seen), Reset crop,
// Brightness, Contrast, Recolour, Rotate 90°, Flip, Reset picture; each one Undo step. Publisher files bring their
// picture's brightness, contrast, colour mode and mirroring.
const { run } = require('./harness');
const { nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

// a 40 × 20 photo: left half red, right half blue
function photo() {
  const w = 40, h = 20, buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; buf.set(x < w / 2 ? [0, 0, 255, 255] : [255, 0, 0, 255], i); } // BGRA
  return nativeImage.createFromBitmap(buf, { width: w, height: h }).toPNG().toString('base64');
}
const fodg = (b64) => `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
 xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
 office:mimetype="application/vnd.oasis.opendocument.graphics">
 <office:automatic-styles>
  <style:style style:name="gr1" style:family="graphic"><style:graphic-properties draw:luminance="20%" draw:contrast="-10%" draw:color-mode="greyscale" style:mirror="horizontal"/></style:style>
 </office:automatic-styles>
 <office:body><office:drawing>
  <draw:page draw:name="page1">
   <draw:frame svg:width="8cm" svg:height="4cm" svg:x="2cm" svg:y="2cm"><draw:image><office:binary-data>${b64}</office:binary-data></draw:image></draw:frame>
   <draw:frame draw:style-name="gr1" svg:width="4cm" svg:height="2cm" svg:x="2cm" svg:y="10cm"><draw:image><office:binary-data>${b64}</office:binary-data></draw:image></draw:frame>
  </draw:page>
 </office:drawing></office:body>
</office:document>`;

run(async (t, check) => {
  const { js, sleep, waitFor } = t;
  const click = async (sel) => { await js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (e) e.scrollIntoView({ block: 'center' }); })()`); await sleep(100); return t.click(sel); };
  await t.ready(null);
  const file = path.join(t.ctx.tmp, 'photos.fodg');
  fs.writeFileSync(file, fodg(photo()));
  await js(`window.__bohpumApp.openFile(${JSON.stringify(file)})`);
  await waitFor(`window.__bohpumApp.state.doc.name === 'photos'`);
  const pic = (i = 0) => js(`(() => { const o = window.__bohpumApp.state.doc.pages[0].objects[${i}]; const el = document.querySelector('#workspace .kcontent > .kobj[data-id="' + o.id + '"]');
    const img = el && el.querySelector('img');
    return { id: o.id, x: o.x, y: o.y, w: o.w, h: o.h, rot: o.rot || 0, fit: o.fit, crop: o.crop || null, bright: o.bright || 0, contrast: o.contrast || 0, recolor: o.recolor || 'normal', flipH: !!o.flipH, flipV: !!o.flipV,
      filter: img ? img.style.filter : '', transform: img ? (img.parentElement.classList.contains('kimg-clip') ? img.parentElement.style.transform : img.style.transform) : '',
      clipped: !!(el && el.querySelector('.kimg-clip')), bwFilter: !!(el && el.querySelector('filter feComponentTransfer')) }; })()`);

  let b = await pic(1);
  check('A Publisher picture keeps its brightness, contrast, colour mode and mirroring', b.bright === 20 && b.contrast === -10 && b.recolor === 'gray' && b.flipH, b);
  check('…and is drawn so', /brightness\(1\.2\)/.test(b.filter) && /contrast\(0\.9\)/.test(b.filter) && /grayscale\(1\)/.test(b.filter) && /scale\(-1, 1\)/.test(b.transform), b);

  const p0 = await pic(0);
  await js(`(() => { const A = window.__bohpumApp; A.state.sel = new Set([${JSON.stringify(p0.id)}]); A.selectionChanged(); })()`);
  await sleep(200);
  const has = await js(`(() => { const s = document.querySelector('#props .psec[data-sec="picture"]'); const labels = [...s.querySelectorAll('.prow > label')].map(l => l.textContent);
    return { labels, titles: [...s.querySelectorAll('button[title]')].map(b => b.title), words: [...s.querySelectorAll('button')].map(b => b.textContent.trim()) }; })()`);
  check('The Picture section has Brightness, Contrast, Recolour and Rotate rows', ['Brightness', 'Contrast', 'Recolour', 'Rotate'].every(x => has.labels.includes(x)), has);
  check('…Crop, Reset crop and Reset picture', has.words.includes('Crop') && has.words.includes('Reset crop') && has.words.includes('Reset picture'), has);
  check('…and Rotate left / right, Flip horizontal / vertical', ['Rotate left 90°', 'Rotate right 90°', 'Flip horizontal', 'Flip vertical'].every(x => has.titles.includes(x)), has);

  const slide = (label, v) => js(`(() => { const r = [...document.querySelectorAll('#props .psec[data-sec="picture"] .prow')].find(r => r.querySelector('label').textContent === ${JSON.stringify(label)}).querySelector('input[type=range]');
    r.value = ${v}; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); return true; })()`);
  await slide('Brightness', 50); await sleep(200);
  await slide('Contrast', -40); await sleep(200);
  b = await pic();
  check('Brightness +50 and Contrast −40 are kept and drawn', b.bright === 50 && b.contrast === -40 && /brightness\(1\.5\)/.test(b.filter) && /contrast\(0\.6\)/.test(b.filter), b);
  await js(`(() => { const s = [...document.querySelectorAll('#props .psec[data-sec="picture"] .prow')].find(r => r.querySelector('label').textContent === 'Recolour').querySelector('select'); s.value = 'bw'; s.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(200);
  b = await pic();
  check('Black & white: a threshold filter on the photo', b.recolor === 'bw' && b.bwFilter && /url\("?#kbw/.test(b.filter), b);
  const pressT = (title) => click(`#props .psec[data-sec="picture"] button[title="${title}"]`);
  await pressT('Rotate right 90°'); b = await pic();
  check('Rotate right 90°', b.rot === 90, b);
  await pressT('Rotate left 90°'); await pressT('Rotate left 90°'); b = await pic();
  check('Rotate left 90° twice: −90°', b.rot === -90, b);
  await pressT('Rotate right 90°');
  await pressT('Flip vertical'); b = await pic();
  check('Flip vertical: drawn upside down', b.flipV && /scale\(1, -1\)/.test(b.transform), b);
  await t.key('z', ['control']); await sleep(250); b = await pic();
  check('Undo takes the flip back in one step', !b.flipV && b.rot === 0, b);
  const pressW = (word) => js(`(() => { const x = [...document.querySelectorAll('#props .psec[data-sec="picture"] button')].find(b => b.textContent.trim() === ${JSON.stringify(word)}); x.scrollIntoView({ block: 'center' }); x.click(); return !x.disabled; })()`);
  await pressW('Reset picture'); await sleep(250); b = await pic();
  check('Reset picture: brightness, contrast, colour and flip back to normal', !b.bright && !b.contrast && b.recolor === 'normal' && !b.filter && !b.flipH && !b.flipV, b);

  // ---- crop
  const c0 = await pic();
  await pressW('Crop'); await sleep(250);
  const mode = await js(`({ crop: window.__bohpumApp.state.crop, bars: document.querySelectorAll('#overlay .handle.crop').length, rot: !!document.querySelector('#overlay .handle.rot') })`);
  check('Crop shows black crop bars instead of the size and turn handles', mode.crop === c0.id && mode.bars >= 4 && !mode.rot, mode);
  const k = await js('document.querySelector("#workspace .kpage").getBoundingClientRect().width / window.__bohpumApp.state.doc.pageW');
  await t.drag('#overlay .handle.crop[data-h="e"]', -Math.round(c0.w * 0.25 * k), 0);
  b = await pic();
  check('Dragging the right bar in a quarter cuts a quarter off the right', Math.abs(b.crop.r - 0.25) < 0.02 && b.crop.l === 0 && Math.abs(b.w - c0.w * 0.75) < 0.6 && Math.abs(b.x - c0.x) < 0.01 && b.clipped, b);
  await t.key('Enter'); await sleep(250);
  const after = await js(`({ crop: window.__bohpumApp.state.crop, bars: document.querySelectorAll('#overlay .handle.crop').length })`);
  check('Enter ends crop mode, the crop stays', !after.crop && !after.bars && (await pic()).crop, after);
  await t.key('z', ['control']); await sleep(250); b = await pic();
  check('Undo takes the crop back', !b.crop || b.crop.r === 0, b);
  await t.key('y', ['control']); await sleep(250);
  await js(`(() => { const A = window.__bohpumApp; A.state.sel = new Set([${JSON.stringify(c0.id)}]); A.selectionChanged(); })()`); await sleep(200);
  await pressW('Reset crop'); await sleep(250); b = await pic();
  check('Reset crop: the cut part comes back, the frame as before', !b.crop && Math.abs(b.w - c0.w) < 0.02 && Math.abs(b.x - c0.x) < 0.02 && !b.clipped, b);

  // a flipped photo crops the side that is seen
  await pressT('Flip horizontal');
  await pressW('Crop'); await sleep(250);
  await t.drag('#overlay .handle.crop[data-h="e"]', -Math.round(c0.w * 0.25 * k), 0);
  b = await pic();
  check('Flipped: the right bar cuts the photo’s own left (what shows on the right)', b.crop && Math.abs(b.crop.l - 0.25) < 0.02 && b.crop.r === 0, b);
  await t.key('Escape'); await sleep(200);
  await pressW('Reset picture'); await sleep(250); b = await pic();
  check('Reset picture also takes off the crop and the flip', !b.crop && !b.flipH && Math.abs(b.w - c0.w) < 0.02, b);

  // Fit inside: crop first shrinks the frame to the picture, nothing moves
  await js(`(() => { const s = [...document.querySelectorAll('#props .psec[data-sec="picture"] .prow')].find(r => r.querySelector('label').textContent === 'Fit').querySelector('select'); s.value = 'contain'; s.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(200);
  await js(`(() => { const i = [...document.querySelectorAll('#props .numf')].find(n => n.querySelector('span') && n.querySelector('span').textContent === 'H').querySelector('input'); i.value = ${JSON.stringify(String(c0.w))}; i.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(200);
  const sq = await pic();
  await pressW('Crop'); await sleep(250); b = await pic();
  check('Fit inside, square frame: Crop shrinks the frame to the 2 : 1 picture, centred, as Stretch', b.fit === 'fill' && Math.abs(b.h - sq.w / 2) < 0.05 && Math.abs(b.y - (sq.y + sq.w / 4)) < 0.05, { b, sq });
  await t.key('Escape'); await sleep(200);
  b = await pic();
  check('Ending crop with nothing cut leaves no crop', !b.crop, b);

  // Fill & crop: the hidden parts become the crop
  await js(`(() => { const s = [...document.querySelectorAll('#props .psec[data-sec="picture"] .prow')].find(r => r.querySelector('label').textContent === 'Fit').querySelector('select'); s.value = 'cover'; s.dispatchEvent(new Event('change')); return true; })()`);
  await js(`(() => { const i = [...document.querySelectorAll('#props .numf')].find(n => n.querySelector('span') && n.querySelector('span').textContent === 'H').querySelector('input'); i.value = ${JSON.stringify(String(c0.w))}; i.dispatchEvent(new Event('change')); return true; })()`);
  await sleep(200);
  await pressW('Crop'); await sleep(250); b = await pic();
  check('Fill & crop, square frame: Crop turns the hidden sides into a crop (a quarter each side)', b.fit === 'fill' && b.crop && Math.abs(b.crop.l - 0.25) < 0.01 && Math.abs(b.crop.r - 0.25) < 0.01 && Math.abs(b.w - b.h) < 0.05, b);
});
