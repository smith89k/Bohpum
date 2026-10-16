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
      cp.append(shapeGeometry(o, w, h)); defs.append(cp); svg.append(defs);
      svg.append(svgEl('image', { href: o.fillImage, x: 0, y: 0, width: w, height: h, preserveAspectRatio: 'xMidYMid slice', 'clip-path': `url(#${id})` }));
      target.setAttribute('fill', 'none');
    } else target.setAttribute('fill', fill);
    if (hasPaint(o.stroke) && o.strokeW > 0) {
      target.setAttribute('stroke', o.stroke);
      target.setAttribute('stroke-width', o.strokeW / sc);
      const da = dashArray(o.dash, o.strokeW / sc); if (da) target.setAttribute('stroke-dasharray', da);
      target.setAttribute('stroke-linejoin', 'round');
    } else target.setAttribute('stroke', 'none');
    svg.append(geo);
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
  } else {
    const d = document.createElement('div'); d.className = 'kimg-missing';
    d.textContent = o.note || 'Picture'; el.append(d);
  }
  if (hasPaint(o.stroke) && o.strokeW > 0) {
    const svg = svgEl('svg', { class: 'kshape', viewBox: `0 0 ${o.w} ${o.h}`, preserveAspectRatio: 'none' });
    svg.append(svgEl('rect', { x: 0, y: 0, width: o.w, height: o.h, fill: 'none', stroke: o.stroke, 'stroke-width': o.strokeW }));
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
