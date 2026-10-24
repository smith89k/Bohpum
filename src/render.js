// Turns model objects into DOM. Used for the editor canvas, thumbnails, print and PDF.
import { DEFAULT_FONT } from './model.js';

const SVGNS = 'http://www.w3.org/2000/svg';
let gradSeq = 0;

export function fontStack(name) {
  const n = (name || DEFAULT_FONT).replace(/["']/g, '');
  const khmer = ['Khmer OS Siemreap', 'Khmer OS', 'Khmer OS System', 'Khmer UI', 'Leelawadee UI', 'Battambang', 'Siemreap'];
  const list = [n, ...khmer.filter(k => k !== n)];
  return list.map(f => `"${f}"`).join(', ') + ', sans-serif';
}

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS(SVGNS, tag);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  return e;
}

function dashArray(dash, w) {
  if (dash === 'dash') return `${w * 4} ${w * 2.5}`;
  if (dash === 'dot') return `${w} ${w * 1.5}`;
  if (dash === 'dashdot') return `${w * 4} ${w * 1.5} ${w} ${w * 1.5}`;
  return null;
}

function hasPaint(v) { return v && v !== 'none' && v !== 'transparent'; }

function buildFill(svg, o) {
  if (o.gradKind && hasPaint(o.fill) && hasPaint(o.fill2)) {
    const id = 'kg' + (++gradSeq) + '_' + o.id;
    const defs = svgEl('defs');
    let g;
    if (o.gradKind === 'radial') {
      g = svgEl('radialGradient', { id, cx: '50%', cy: '50%', r: '70%' });
      g.append(svgEl('stop', { offset: '0', 'stop-color': o.fill2 }), svgEl('stop', { offset: '1', 'stop-color': o.fill }));
    } else {
      const a = (o.gradAngle || 0) * Math.PI / 180;
      const dx = Math.sin(a), dy = Math.cos(a);
      g = svgEl('linearGradient', { id, x1: 0.5 - dx / 2, y1: 0.5 - dy / 2, x2: 0.5 + dx / 2, y2: 0.5 + dy / 2 });
      if (o.gradKind === 'axial') {
        g.append(svgEl('stop', { offset: '0', 'stop-color': o.fill }), svgEl('stop', { offset: '0.5', 'stop-color': o.fill2 }), svgEl('stop', { offset: '1', 'stop-color': o.fill }));
      } else {
        g.append(svgEl('stop', { offset: '0', 'stop-color': o.fill }), svgEl('stop', { offset: '1', 'stop-color': o.fill2 }));
      }
    }
    defs.append(g); svg.append(defs);
    return `url(#${id})`;
  }
  return hasPaint(o.fill) ? o.fill : 'none';
}

function shapeGeometry(o, w, h) {
  const shape = o.shape === 'none' ? 'rect' : o.shape;
  if (shape === 'ellipse') return svgEl('ellipse', { cx: w / 2, cy: h / 2, rx: w / 2, ry: h / 2 });
  if (shape === 'path' && o.path) {
    const [vx, vy, vw, vh] = (o.viewBox || `0 0 ${w} ${h}`).split(/[\s,]+/).map(Number);
    const sx = w / (vw || 1), sy = h / (vh || 1);
    const g = svgEl('g', { transform: `scale(${sx} ${sy}) translate(${-vx} ${-vy})` });
    const p = svgEl('path', { d: o.path });
    g.append(p); g._path = p; g._scale = (sx + sy) / 2;
    return g;
  }
  const r = shape === 'roundrect' ? Math.min(o.radius || Math.min(w, h) * 0.1, w / 2, h / 2) : (o.radius || 0);
  return svgEl('rect', { x: 0, y: 0, width: w, height: h, rx: r || null, ry: r || null });
}
// The shape as ONE element (a clipPath or mask can't hold a <g>): a custom path carries its own transform
function shapeOutline(o, w, h) {
  const g = shapeGeometry(o, w, h);
  if (!g._path) return g;
  g._path.setAttribute('transform', g.getAttribute('transform'));
  return g._path;
}

// Align line (as in InDesign / Illustrator): 'center' on the shape's edge (the default), 'inside' or 'outside' it.
// Inside / outside draw the line twice as wide and keep only the half inside (clip) or outside (mask) the shape,
// so it works for every shape, rounded corners and custom paths included.
function alignedLine(svg, o, w, h, sw, sc) {
  const id = 'kl' + (++gradSeq) + '_' + o.id, defs = svgEl('defs');
  const line = shapeGeometry(o, w, h), t = line._path || line;
  t.setAttribute('fill', 'none'); t.setAttribute('stroke', o.stroke);
  t.setAttribute('stroke-width', 2 * sw / sc); t.setAttribute('stroke-linejoin', 'round');
  const da = dashArray(o.dash, sw / sc); if (da) t.setAttribute('stroke-dasharray', da);
  const wrap = svgEl('g');
  if (o.lineAlign === 'inside') {
    const cp = svgEl('clipPath', { id }); cp.append(shapeOutline(o, w, h)); defs.append(cp);
    wrap.setAttribute('clip-path', `url(#${id})`);
  } else {
    const pad = 2 * sw + 1, m = svgEl('mask', { id, maskUnits: 'userSpaceOnUse', x: -pad, y: -pad, width: w + 2 * pad, height: h + 2 * pad });
    const hole = shapeOutline(o, w, h); hole.setAttribute('fill', '#000');
    m.append(svgEl('rect', { x: -pad, y: -pad, width: w + 2 * pad, height: h + 2 * pad, fill: '#fff' }), hole); defs.append(m);
    wrap.setAttribute('mask', `url(#${id})`);
  }
  wrap.append(line);
  svg.append(defs, wrap);
}

function renderBox(o, el) {
  const w = Math.max(o.w, 0.01), h = Math.max(o.h, 0.01);
  const needShape = o.shape !== 'none' || hasPaint(o.fill) || hasPaint(o.stroke) || o.fillImage;
  if (needShape) {
    const svg = svgEl('svg', { class: 'kshape', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });
    const fill = buildFill(svg, o);
    const geo = shapeGeometry(o, w, h);
    const target = geo._path || geo;
    const sc = geo._scale || 1;
    if (o.fillImage) {
      const id = 'kc' + (++gradSeq) + '_' + o.id;
      const defs = svgEl('defs'); const cp = svgEl('clipPath', { id });
      cp.append(shapeOutline(o, w, h)); defs.append(cp); svg.append(defs);
      svg.append(svgEl('image', { href: o.fillImage, x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${id})` }));
      target.setAttribute('fill', 'none');
    } else target.setAttribute('fill', fill);
    const aligned = o.lineAlign === 'inside' || o.lineAlign === 'outside';
    if (hasPaint(o.stroke) && o.strokeW > 0 && !aligned) {
      target.setAttribute('stroke', o.stroke);
      target.setAttribute('stroke-width', o.strokeW / sc);
      const da = dashArray(o.dash, o.strokeW / sc); if (da) target.setAttribute('stroke-dasharray', da);
      target.setAttribute('stroke-linejoin', 'round');
    } else target.setAttribute('stroke', 'none');
    svg.append(geo);
    if (hasPaint(o.stroke) && o.strokeW > 0 && aligned) alignedLine(svg, o, w, h, o.strokeW, sc);
    el.append(svg);
  }
  const t = document.createElement('div');
  t.className = 'ktext va-' + (o.valign || 'top');
  const p = o.pad || { t: 1, r: 1, b: 1, l: 1 };
  t.style.padding = `${p.t}mm ${p.r}mm ${p.b}mm ${p.l}mm`;
  const kt = document.createElement('div');
  kt.className = 'kt';
  kt.style.fontFamily = fontStack(o.font);
  kt.style.fontSize = (o.size || 12) + 'pt';
  kt.style.color = o.color || '#000';
  kt.innerHTML = o.html || '';
  t.append(kt);
  el.append(t);
}

function renderImage(o, el) {
  if (o.src) {
    const img = document.createElement('img');
    img.src = o.src; img.draggable = false;
    img.style.objectFit = o.fit === 'fill' ? 'fill' : o.fit;
    el.append(img);
  } else if (o.mergePhoto) { // a photo field with no photo: printed empty (the editor outlines it)
    const d = document.createElement('div'); d.className = 'kimg-empty'; el.append(d);
  } else {
    const d = document.createElement('div'); d.className = 'kimg-missing';
    d.textContent = o.note || 'Picture'; el.append(d);
  }
  if (hasPaint(o.stroke) && o.strokeW > 0) {
    const svg = svgEl('svg', { class: 'kshape', viewBox: `0 0 ${o.w} ${o.h}`, preserveAspectRatio: 'none' });
    // Align border: centred on the picture's edge, inside it or outside it
    const k = o.lineAlign === 'inside' ? 0.5 : o.lineAlign === 'outside' ? -0.5 : 0, d = o.strokeW * k;
    svg.append(svgEl('rect', { x: d, y: d, width: Math.max(0.01, o.w - 2 * d), height: Math.max(0.01, o.h - 2 * d), fill: 'none', stroke: o.stroke, 'stroke-width': o.strokeW }));
    el.append(svg);
  }
}

function renderLine(o, el) {
  const w = Math.max(Math.abs(o.w), 0.001), h = Math.max(Math.abs(o.h), 0.001);
  const svg = svgEl('svg', { class: 'kshape', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none' });
  const [x1, y1, x2, y2] = o.dir === 'up' ? [0, h, w, 0] : [0, 0, w, h];
  const line = svgEl('line', { x1, y1, x2, y2, stroke: o.stroke || '#000', 'stroke-width': o.strokeW || 0.35, 'stroke-linecap': 'butt' });
  const da = dashArray(o.dash, o.strokeW || 0.35); if (da) line.setAttribute('stroke-dasharray', da);
  if (o.arrowEnd || o.arrowStart) {
    const id = 'ka' + (++gradSeq) + '_' + o.id;
    const defs = svgEl('defs');
    const m = svgEl('marker', { id, viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse' });
    m.append(svgEl('path', { d: 'M0,0 L10,5 L0,10 z', fill: o.stroke || '#000' }));
    defs.append(m); svg.append(defs);
    if (o.arrowEnd) line.setAttribute('marker-end', `url(#${id})`);
    if (o.arrowStart) line.setAttribute('marker-start', `url(#${id})`);
  }
  svg.append(line);
  el.append(svg);
}

export function renderObject(o) {
  const el = document.createElement('div');
  el.className = 'kobj k' + (o.type === 'image' ? 'img' : o.type);
  el.dataset.id = o.id;
  el.style.left = o.x + 'mm';
  el.style.top = o.y + 'mm';
  el.style.width = Math.max(o.w, 0) + 'mm';
  el.style.height = Math.max(o.h, 0) + 'mm';
  if (o.rot) el.style.transform = `rotate(${o.rot}deg)`;
  if (o.opacity != null && o.opacity < 1) el.style.opacity = o.opacity;
  if (o.type === 'box') renderBox(o, el);
  else if (o.type === 'image') renderImage(o, el);
  else if (o.type === 'line') renderLine(o, el);
  return el;
}

// Build a complete page (master + page objects) as a DOM element sized in mm.
export function renderPage(doc, page, { includeMaster = true } = {}) {
  const pg = document.createElement('div');
  pg.className = 'kpage';
  pg.style.width = doc.pageW + 'mm';
  pg.style.height = doc.pageH + 'mm';
  if (page.bg) pg.style.background = page.bg;
  if (includeMaster && doc.master && !page.hideMaster) {
    const ml = document.createElement('div'); ml.className = 'klayer kmaster';
    for (const o of doc.master.objects) ml.append(renderObject(o));
    pg.append(ml);
  }
  const l = document.createElement('div'); l.className = 'klayer kcontent';
  for (const o of page.objects) l.append(renderObject(o));
  pg.append(l);
  return pg;
}

// ---- proportional line spacing (Publisher / LibreOffice "x lines") ----
const metricCache = new Map();
const ctx2d = document.createElement('canvas').getContext('2d');
export function lineFactor(family) {
  const key = family;
  if (metricCache.has(key)) return metricCache.get(key);
  ctx2d.font = `100px ${family}`;
  const m = ctx2d.measureText('ក Hg');
  let f = (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent) / 100;
  if (!isFinite(f) || f <= 0) f = 1.2;
  metricCache.set(key, f);
  return f;
}

export function fixLineHeights(root) {
  // Single spacing = font ascent + descent (like Publisher), times the paragraph's spacing (data-ls).
  // The pitch follows the largest font used in the paragraph.
  root.querySelectorAll('.kt p').forEach(p => {
    if (p.dataset.lhfix) return;
    const ls = parseFloat(p.dataset.ls) || 1;
    const spans = Array.from(p.querySelectorAll('span'));
    let max = 0, fam = null;
    const textSpans = spans.filter(s => s.textContent.replace(/\u200B/g, '').length);
    for (const s of (textSpans.length ? textSpans : spans)) {
      const cs = getComputedStyle(s);
      const fs = parseFloat(cs.fontSize);
      if (fs > max) { max = fs; fam = cs.fontFamily; }
    }
    if (!max) { const cs = getComputedStyle(p); max = parseFloat(cs.fontSize); fam = cs.fontFamily; }
    p.style.lineHeight = (Math.max(0.3, ls * lineFactor(fam)) * max).toFixed(3) + 'px';
  });
}
