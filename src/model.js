// Document model. All lengths in millimetres, font sizes in points, rotation in degrees (clockwise).

export const uid = () => Math.random().toString(36).slice(2, 10);
export const clone = (o) => JSON.parse(JSON.stringify(o));
export const round2 = (n) => Math.round(n * 100) / 100;

export const DEFAULT_FONT = 'Khmer OS Siemreap';

export const PAGE_PRESETS = [
  { group: 'Cards', name: 'Card 110 × 60 mm', w: 110, h: 60 },
  { group: 'Cards', name: 'Business card 90 × 50 mm', w: 90, h: 50 },
  { group: 'Cards', name: 'Business card 85 × 55 mm', w: 85, h: 55 },
  { group: 'Cards', name: 'ID card 85.6 × 54 mm', w: 85.6, h: 54 },
  { group: 'Cards', name: 'Invitation 148 × 105 mm (A6)', w: 148, h: 105 },
  { group: 'Paper', name: 'A4 portrait', w: 210, h: 297 },
  { group: 'Paper', name: 'A4 landscape', w: 297, h: 210 },
  { group: 'Paper', name: 'A5 portrait', w: 148, h: 210 },
  { group: 'Paper', name: 'A5 landscape', w: 210, h: 148 },
  { group: 'Paper', name: 'A3 portrait', w: 297, h: 420 },
  { group: 'Paper', name: 'Letter', w: 215.9, h: 279.4 },
  { group: 'Other', name: 'Envelope DL 220 × 110 mm', w: 220, h: 110 },
  { group: 'Other', name: 'Certificate (A4 landscape)', w: 297, h: 210 },
  { group: 'Other', name: 'Poster A2', w: 420, h: 594 },
  { group: 'Other', name: 'Banner 1000 × 300 mm', w: 1000, h: 300 }
];

export const SHEETS = {
  A4: [210, 297], A3: [297, 420], A5: [148, 210], Letter: [215.9, 279.4], Legal: [215.9, 355.6]
};

export function newPage() { return { id: uid(), objects: [] }; }

export function newDoc(w = 210, h = 297, name = 'Untitled') {
  const m = Math.min(w, h) < 120 ? 3 : 12.7;
  return {
    format: 'bpum', version: 1, name,
    pageW: w, pageH: h,
    margins: { t: m, r: m, b: m, l: m },
    guides: { v: [], h: [] },
    master: { objects: [] },
    pages: [newPage()],
    print: null
  };
}

export function makeObject(type, props = {}) {
  const base = { id: uid(), type, x: 0, y: 0, w: 40, h: 20, rot: 0, opacity: 1, locked: false, groupId: null };
  if (type === 'box') {
    Object.assign(base, {
      shape: 'none',          // none | rect | roundrect | ellipse | path
      fill: 'none', fill2: null, gradAngle: 0, gradKind: null, fillImage: null,
      stroke: 'none', strokeW: 0.25, dash: 'solid',
      radius: 0, path: null, viewBox: null,
      pad: { t: 1, r: 1, b: 1, l: 1 }, valign: 'top',
      font: DEFAULT_FONT, size: 12, color: '#000000',
      html: ''
    });
  } else if (type === 'image') {
    Object.assign(base, { src: '', fit: 'fill', stroke: 'none', strokeW: 0.25, note: null });
  } else if (type === 'line') {
    Object.assign(base, { dir: 'down', stroke: '#000000', strokeW: 0.3528, dash: 'solid', arrowEnd: false, arrowStart: false });
  }
  return Object.assign(base, props);
}

export function bbox(objs) {
  if (!objs.length) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const o of objs) {
    const pts = corners(o);
    for (const [px, py] of pts) { x1 = Math.min(x1, px); y1 = Math.min(y1, py); x2 = Math.max(x2, px); y2 = Math.max(y2, py); }
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function corners(o) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const a = (o.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
  return [[-o.w / 2, -o.h / 2], [o.w / 2, -o.h / 2], [o.w / 2, o.h / 2], [-o.w / 2, o.h / 2]]
    .map(([dx, dy]) => [cx + dx * c - dy * s, cy + dx * s + dy * c]);
}
