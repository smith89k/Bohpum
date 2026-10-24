// Makes every icon from the two source pictures (pnpm run icons; run it again after changing either picture):
//   build/logo.png       → build/icon.ico (16–256) + icon.png (the app: exe, installer, windows, Explorer menu item),
//                          explorer-menu/Assets/* (the Windows 11 menu package), build/appx/* (the Microsoft Store
//                          package's logos, and its app icon without a plate: UNPLATED below), src/img/logo.png (title
//                          row, welcome)
//   build/bpum-file.png  → build/bpum.ico (.bpum files in Explorer), src/img/bpum-file.png (the convert window),
//                          build/appx/BpumFile.png (the Store package's .bpum and .pub file types)
// The pictures come cut out of a green background: their body is 94–99 % opaque and the edge has faint lime specks,
// so the body is made solid and the specks removed first. Runs in Electron (canvas, good downscaling).
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path');

const ROOT = path.join(__dirname, '..');
const ICO = [16, 20, 24, 32, 40, 48, 64, 128, 256];
// The Store app's icon at the sizes "Open with", the taskbar and Start ask for. Without them Windows shrinks the 44 px
// one and puts it on a plate (a box behind the icon). lightunplated: the same, for a light taskbar. electron-builder
// sees the targetsize names and makes the package's resources.pri, so Windows finds them.
const UNPLATED = Object.fromEntries([16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 256].flatMap(s =>
  ['unplated', 'lightunplated'].map(f => [`build/appx/Square44x44Logo.targetsize-${s}_altform-${f}.png`, s])));
const JOBS = [
  { src: 'build/logo.png', ico: 'build/icon.ico', png: { 'build/icon.png': 256, 'explorer-menu/Assets/Square44x44Logo.png': 44,
    'explorer-menu/Assets/Square150x150Logo.png': 150, 'explorer-menu/Assets/StoreLogo.png': 50, 'src/img/logo.png': 128,
    'build/appx/StoreLogo.png': 50, 'build/appx/Square44x44Logo.png': 44, 'build/appx/Square150x150Logo.png': 150, ...UNPLATED } },
  { src: 'build/bpum-file.png', ico: 'build/bpum.ico', png: { 'src/img/bpum-file.png': 120, 'build/appx/BpumFile.png': 256 } }
];

// PNG-in-ICO (Windows Vista and later)
function writeIco(file, images) {
  const head = Buffer.alloc(6 + 16 * images.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4);
  let off = head.length;
  images.forEach(({ size, data }, i) => {
    const p = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, p); head.writeUInt8(size >= 256 ? 0 : size, p + 1);
    head.writeUInt16LE(1, p + 4); head.writeUInt16LE(32, p + 6); head.writeUInt32LE(data.length, p + 8); head.writeUInt32LE(off, p + 12);
    off += data.length;
  });
  fs.writeFileSync(file, Buffer.concat([head, ...images.map(x => x.data)]));
}

app.whenReady().then(async () => {
  const w = new BrowserWindow({ show: false, webPreferences: { offscreen: true } });
  await w.loadURL('data:text/html,<body></body>');
  for (const job of JOBS) {
    const src = fs.readFileSync(path.join(ROOT, job.src)).toString('base64');
    const sizes = [...new Set([...ICO, ...Object.values(job.png)])];
    // square sizes for the ICO; the PNGs keep the picture's shape at that height (the file icon is taller than wide)
    const out = await w.webContents.executeJavaScript(`(async () => {
      const img = new Image(); img.src = 'data:image/png;base64,${src}'; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, c.width, c.height), d = px.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], gr = d[i + 1], b = d[i + 2];
        if (gr > 180 && r < 120 && b < 120 && gr - Math.max(r, b) > 120) d[i + 3] = 0;   // lime speck from the cut-out
        else if (d[i + 3] >= 224) d[i + 3] = 255;                                         // the body: solid
      }
      g.putImageData(px, 0, 0);
      // halve step by step, then the last step: sharper than one big jump
      const scaled = (h, square) => {
        let cur = c, cw = c.width, ch = c.height;
        while (ch / 2 >= h) { const n = document.createElement('canvas'); n.width = Math.round(cw / 2); n.height = Math.round(ch / 2);
          const ng = n.getContext('2d'); ng.imageSmoothingQuality = 'high'; ng.drawImage(cur, 0, 0, n.width, n.height); cur = n; cw = n.width; ch = n.height; }
        const tw = Math.max(1, Math.round(cw * h / ch)), o = document.createElement('canvas');
        o.width = square ? h : tw; o.height = h;
        const og = o.getContext('2d'); og.imageSmoothingQuality = 'high'; og.drawImage(cur, square ? Math.round((h - tw) / 2) : 0, 0, tw, h);
        return o.toDataURL('image/png').split(',')[1];
      };
      const res = { ico: {}, png: {} };
      for (const s of ${JSON.stringify(ICO)}) res.ico[s] = scaled(s, true);
      for (const s of ${JSON.stringify(sizes)}) res.png[s] = scaled(s, ${JSON.stringify(job.src.includes('logo'))});
      return res;
    })()`);
    writeIco(path.join(ROOT, job.ico), ICO.map(s => ({ size: s, data: Buffer.from(out.ico[s], 'base64') })));
    for (const [file, s] of Object.entries(job.png)) {
      fs.mkdirSync(path.dirname(path.join(ROOT, file)), { recursive: true });
      fs.writeFileSync(path.join(ROOT, file), Buffer.from(out.png[s], 'base64'));
    }
    console.log(`make-icons: ${job.src} → ${job.ico}, ${Object.keys(job.png).join(', ')}`);
  }
  app.exit(0);
});
