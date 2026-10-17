// The accent is jade green everywhere; nothing red-brown from the old theme is left.
const fs = require('fs');
const path = require('path');
const { run, ROOT } = require('./harness');

const OLD = ['#9a3412', '#7f2a0e', '#fbeee6', '#e7c2ad', '#f0c7b2', '#f3d2c2', '154,52,18'];

run(async (t, check) => {
  await t.ready(null);
  const c = await t.js(`(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      accent: cs.getPropertyValue('--accent').trim(), soft: cs.getPropertyValue('--accent-soft').trim(),
      toolColor: getComputedStyle(document.querySelector('[data-tool="select"].on')).color,
      brand: (() => { const b = document.querySelector('#titlebar .brand');
        return { parts: [...b.children].map(e => e.tagName === 'IMG' ? 'logo' : e.textContent), logo: b.querySelector('img').naturalWidth > 0, line: getComputedStyle(b.querySelector('.km')).borderLeftWidth }; })(),
      kmColor: getComputedStyle(document.querySelector('#titlebar .brand .km')).color
    };
  })()`);
  check('Accent colour is jade green', c.accent === '#1f7a4c' && c.soft === '#e6f2eb', c);
  check('The chosen tool is green', c.toolColor === 'rgb(31, 122, 76)', c);
  check('App name as in Sastra PDF: logo, Bohpum, then the Khmer name in grey after a thin line', c.brand.parts.join('|') === 'logo|Bohpum|បោះពុម្ព' && c.brand.logo && c.brand.line === '1px' && c.kmColor === 'rgb(139, 132, 120)', c);
  const km = await t.js(`document.fonts.ready.then(() => ({ loaded: [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Noto Sans Khmer' && f.status === 'loaded'),
    first: getComputedStyle(document.querySelector('#titlebar .brand .km')).fontFamily.split(',')[0].replace(/"/g, '').trim() }))`);
  check('The Khmer name is drawn in Noto Sans Khmer (the Khmer font of Sastra PDF, shipped with Bohpum)', km.loaded && km.first === 'Noto Sans Khmer', km);

  const files = ['src/tokens.css', 'src/app.css', 'src/app.js', 'src/print.js', 'src/index.html', 'src/task.html', 'main.js'];
  const found = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8').toLowerCase().replace(/\s+/g, '');
    for (const v of OLD) if (text.includes(v)) found.push(`${f}: ${v}`);
  }
  check('No red-brown left in the sources', !found.length, found);
});
