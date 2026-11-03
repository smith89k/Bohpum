// Parse a flat ODF drawing (.fodg), as produced by LibreOffice from a .pub file, into a Bohpum document.
import { newDoc, makeObject, uid } from './model.js';

const NS = {
  draw: 'urn:oasis:names:tc:opendocument:xmlns:drawing:1.0',
  svg: 'urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0',
  fo: 'urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0',
  style: 'urn:oasis:names:tc:opendocument:xmlns:style:1.0',
  text: 'urn:oasis:names:tc:opendocument:xmlns:text:1.0',
  office: 'urn:oasis:names:tc:opendocument:xmlns:office:1.0',
  table: 'urn:oasis:names:tc:opendocument:xmlns:table:1.0',
  xlink: 'http://www.w3.org/1999/xlink'
};
const KHMER_RE = /[ក-៿᧠-᧿]/;

export function toMm(v) {
  if (v == null || v === '') return null;
  const m = String(v).trim().match(/^(-?[\d.]+(?:e-?\d+)?)\s*(cm|mm|in|inch|pt|pc|px)?$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  switch ((m[2] || 'mm').toLowerCase()) {
    case 'cm': return n * 10;
    case 'in': case 'inch': return n * 25.4;
    case 'pt': return n * 25.4 / 72;
    case 'pc': return n * 25.4 / 6;
    case 'px': return n * 25.4 / 96;
    default: return n;
  }
}
const ptOf = (v) => { const mm = toMm(v); return mm == null ? null : mm * 72 / 25.4; };
const r2 = (n) => Math.round(n * 1000) / 1000;
const kids = (el) => Array.from(el ? el.children : []);
const attr = (el, ns, name) => el.getAttributeNS(NS[ns], name) || el.getAttribute(ns + ':' + name);

function propsOf(el) {
  const o = {};
  for (const a of el.attributes) o[a.name] = a.value;
  return o;
}

class Styles {
  constructor(xml) {
    this.map = new Map();      // family|name -> {parent, g, p, t}
    this.defaults = new Map(); // family -> {g,p,t}
    this.fontFaces = new Map();
    this.gradients = new Map();
    this.fillImages = new Map();
    this.dashes = new Map();
    this.pageLayouts = new Map();
    this.masterPages = new Map();
    for (const ff of xml.getElementsByTagNameNS(NS.style, 'font-face')) {
      const fam = (attr(ff, 'svg', 'font-family') || attr(ff, 'style', 'name') || '').replace(/^['"]|['"]$/g, '');
      this.fontFaces.set(attr(ff, 'style', 'name'), fam);
    }
    for (const g of xml.getElementsByTagNameNS(NS.draw, 'gradient')) this.gradients.set(attr(g, 'draw', 'name'), propsOf(g));
    for (const d of xml.getElementsByTagNameNS(NS.draw, 'stroke-dash')) this.dashes.set(attr(d, 'draw', 'name'), propsOf(d));
    for (const fi of xml.getElementsByTagNameNS(NS.draw, 'fill-image')) {
      const bin = fi.getElementsByTagNameNS(NS.office, 'binary-data')[0];
      if (bin) this.fillImages.set(attr(fi, 'draw', 'name'), dataUrlFromBase64(bin.textContent));
    }
    for (const pl of xml.getElementsByTagNameNS(NS.style, 'page-layout')) {
      const pp = pl.getElementsByTagNameNS(NS.style, 'page-layout-properties')[0];
      if (pp) this.pageLayouts.set(attr(pl, 'style', 'name'), propsOf(pp));
    }
    for (const mp of xml.getElementsByTagNameNS(NS.style, 'master-page')) this.masterPages.set(attr(mp, 'style', 'name'), mp);
    const read = (s) => {
      const r = { parent: attr(s, 'style', 'parent-style-name'), g: {}, p: {}, t: {} };
      for (const c of kids(s)) {
        if (c.localName === 'graphic-properties') Object.assign(r.g, propsOf(c));
        else if (c.localName === 'paragraph-properties') Object.assign(r.p, propsOf(c));
        else if (c.localName === 'text-properties') Object.assign(r.t, propsOf(c));
        else if (c.localName === 'drawing-page-properties') Object.assign(r.g, propsOf(c));
      }
      return r;
    };
    for (const s of xml.getElementsByTagNameNS(NS.style, 'default-style')) this.defaults.set(attr(s, 'style', 'family'), read(s));
    for (const s of xml.getElementsByTagNameNS(NS.style, 'style')) this.map.set(attr(s, 'style', 'family') + '|' + attr(s, 'style', 'name'), read(s));
  }
  resolve(family, name) {
    const chain = [];
    let n = name, guard = 0;
    while (n && guard++ < 20) {
      const s = this.map.get(family + '|' + n);
      if (!s) break;
      chain.unshift(s); n = s.parent;
    }
    const d = this.defaults.get(family);
    if (d) chain.unshift(d);
    const out = { g: {}, p: {}, t: {} };
    for (const s of chain) { Object.assign(out.g, s.g); Object.assign(out.p, s.p); Object.assign(out.t, s.t); }
    return out;
  }
  font(name) { return name ? (this.fontFaces.get(name) || name) : null; }
}

export function dataUrlFromBase64(b64) {
  const s = b64.replace(/\s+/g, '');
  let mime = null;
  if (s.startsWith('iVBOR')) mime = 'image/png';
  else if (s.startsWith('/9j/')) mime = 'image/jpeg';
  else if (s.startsWith('R0lG')) mime = 'image/gif';
  else if (s.startsWith('Qk')) mime = 'image/bmp';
  else if (s.startsWith('UklGR')) mime = 'image/webp';
  else if (s.startsWith('PHN2') || s.startsWith('PD94')) mime = 'image/svg+xml';
  if (!mime) return null; // WMF / EMF / SVM etc. are not displayable in the browser
  return `data:${mime};base64,${s}`;
}

function colorWithOpacity(hex, opacity) {
  if (!hex || opacity == null || opacity >= 1) return hex;
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${r2(opacity)})`;
}
const pct = (v) => v && /%$/.test(v) ? parseFloat(v) / 100 : null;

// ---------- geometry ----------
function parseTransform(str) {
  const ops = [];
  const re = /(rotate|translate|scale|skewX|skewY|matrix)\s*\(([^)]*)\)/g;
  let m;
  while ((m = re.exec(str))) ops.push({ op: m[1], args: m[2].trim().split(/[\s,]+/) });
  return ops;
}
function applyOps(ops, x, y) {
  for (const { op, args } of ops) {
    if (op === 'rotate') { const a = parseFloat(args[0]); const c = Math.cos(a), s = Math.sin(a); [x, y] = [x * c + y * s, -x * s + y * c]; }
    else if (op === 'translate') { x += toMm(args[0]) || 0; y += toMm(args[1] || '0') || 0; }
    else if (op === 'scale') { x *= parseFloat(args[0]); y *= parseFloat(args[1] ?? args[0]); }
    else if (op === 'skewX') { y = y; x = x + y * Math.tan(parseFloat(args[0])); }
    else if (op === 'matrix') {
      const [a, b, c, d, e, f] = args.map((v, i) => i < 4 ? parseFloat(v) : toMm(v) || 0);
      [x, y] = [a * x + c * y + e, b * x + d * y + f];
    }
  }
  return [x, y];
}
function geometry(el) {
  let w = toMm(attr(el, 'svg', 'width')) || 0, h = toMm(attr(el, 'svg', 'height')) || 0;
  const tr = attr(el, 'draw', 'transform');
  if (tr) {
    const ops = parseTransform(tr);
    const [cx, cy] = applyOps(ops, w / 2, h / 2);
    const [ox, oy] = applyOps(ops, 0, 0);
    const [ax, ay] = applyOps(ops, 1, 0);
    let rot = Math.atan2(ay - oy, ax - ox) * 180 / Math.PI;   // clockwise on screen
    rot = ((rot + 180) % 360 + 360) % 360 - 180;
    return { x: r2(cx - w / 2), y: r2(cy - h / 2), w: r2(w), h: r2(h), rot: r2(rot) };
  }
  return { x: r2(toMm(attr(el, 'svg', 'x')) || 0), y: r2(toMm(attr(el, 'svg', 'y')) || 0), w: r2(w), h: r2(h), rot: 0 };
}

// ---------- text ----------
function textCss(t, styles, sample) {
  const isKhmer = KHMER_RE.test(sample || '');
  const css = [];
  const fontName = isKhmer ? (t['style:font-name-complex'] || t['style:font-name']) : (t['style:font-name'] || t['fo:font-family']);
  const fam = styles.font(fontName) || t['fo:font-family'];
  if (fam) css.push(`font-family:'${fam.replace(/["']/g, '')}', 'Khmer OS Siemreap', 'Khmer UI', sans-serif`);
  const sizeRaw = isKhmer ? (t['style:font-size-complex'] || t['fo:font-size']) : t['fo:font-size'];
  const size = sizeRaw && !/%$/.test(sizeRaw) ? ptOf(sizeRaw) : null;
  if (size) css.push(`font-size:${r2(size)}pt`);
  const weight = isKhmer ? (t['style:font-weight-complex'] || t['fo:font-weight']) : t['fo:font-weight'];
  if (weight && weight !== 'normal') css.push(`font-weight:${weight === 'bold' ? 700 : weight}`);
  const fstyle = isKhmer ? (t['style:font-style-complex'] || t['fo:font-style']) : t['fo:font-style'];
  if (fstyle && fstyle !== 'normal') css.push(`font-style:${fstyle}`);
  if (t['fo:color']) css.push(`color:${t['fo:color']}`);
  const deco = [];
  if (t['style:text-underline-style'] && t['style:text-underline-style'] !== 'none') deco.push('underline');
  if (t['style:text-line-through-style'] && t['style:text-line-through-style'] !== 'none') deco.push('line-through');
  if (deco.length) css.push(`text-decoration:${deco.join(' ')}`);
  if (t['fo:background-color'] && t['fo:background-color'] !== 'transparent') css.push(`background-color:${t['fo:background-color']}`);
  if (t['fo:font-variant'] === 'small-caps') css.push('font-variant:small-caps');
  if (t['fo:text-transform'] && t['fo:text-transform'] !== 'none') css.push(`text-transform:${t['fo:text-transform']}`);
  if (t['fo:letter-spacing'] && t['fo:letter-spacing'] !== 'normal') { const ls = toMm(t['fo:letter-spacing']); if (ls) css.push(`letter-spacing:${r2(ls)}mm`); }
  const pos = t['style:text-position'];
  if (pos && !/^0%?\b/.test(pos)) { const sup = /^super|^\d/.test(pos) && !/^-/.test(pos); css.push(`vertical-align:${sup ? 'super' : 'sub'};font-size:smaller`); }
  if (t['fo:text-shadow'] && t['fo:text-shadow'] !== 'none') css.push('text-shadow:0.3mm 0.3mm 0.3mm rgba(0,0,0,.5)');
  return css.join(';');
}

function paraCss(p) {
  const css = [];
  const al = p['fo:text-align'];
  if (al) css.push(`text-align:${al === 'start' ? 'left' : al === 'end' ? 'right' : al}`);
  for (const [k, c] of [['fo:margin-top', 'margin-top'], ['fo:margin-bottom', 'margin-bottom'], ['fo:margin-left', 'margin-left'], ['fo:margin-right', 'margin-right'], ['fo:text-indent', 'text-indent']]) {
    const v = toMm(p[k]); if (v) css.push(`${c}:${r2(v)}mm`);
  }
  let ls = null;
  const lh = p['fo:line-height'];
  if (lh && /%$/.test(lh)) ls = parseFloat(lh) / 100;
  let fixed = false;
  if (lh && !/%$/.test(lh) && lh !== 'normal') { const v = toMm(lh); if (v) { css.push(`line-height:${r2(v)}mm`); fixed = true; } }
  const atLeast = toMm(p['style:line-height-at-least']);
  if (atLeast) css.push(`min-height:${r2(atLeast)}mm`);
  return { css: css.join(';'), ls, fixed };
}

function inlineHtml(node, tp, styles, out) {
  // returns html string for children of a paragraph-like node
  for (const c of node.childNodes) {
    if (c.nodeType === 3) {
      const txt = c.nodeValue.replace(/[\r\n]+/g, '');
      if (!txt) continue;
      out.push(`<span style="${textCss(tp, styles, txt)}">${esc(txt)}</span>`);
    } else if (c.nodeType === 1) {
      const ln = c.localName;
      if (c.namespaceURI === NS.text && ln === 'span') {
        const st = styles.resolve('text', attr(c, 'text', 'style-name'));
        inlineHtml(c, { ...tp, ...st.t }, styles, out);
      } else if (ln === 's') {
        const n = parseInt(attr(c, 'text', 'c') || '1', 10);
        out.push(`<span style="${textCss(tp, styles, '')}">${' '.repeat(n)}</span>`);
      } else if (ln === 'tab') out.push(`<span style="${textCss(tp, styles, '')}">\t</span>`);
      else if (ln === 'line-break') out.push('<br>');
      else if (ln === 'a' || ln === 'meta' || ln === 'ruby-base') inlineHtml(c, tp, styles, out);
      else if (ln === 'page-number') out.push('<span data-field="page">#</span>');
    }
  }
}
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function paragraphsHtml(container, baseText, basePara, styles, out, bullet = null) {
  for (const c of kids(container)) {
    if (c.namespaceURI !== NS.text && c.namespaceURI !== NS.table) continue;
    const ln = c.localName;
    if (ln === 'p' || ln === 'h') {
      const st = styles.resolve('paragraph', attr(c, 'text', 'style-name'));
      const tp = { ...baseText, ...st.t };
      const pp = { ...basePara, ...st.p };
      const { css, ls, fixed } = paraCss(pp);
      const inner = [];
      if (bullet) inner.push(`<span style="${textCss(tp, styles, '')}">${bullet} </span>`);
      inlineHtml(c, tp, styles, inner);
      // an empty paragraph still needs the font size to keep its height
      let body = inner.join('');
      if (!inner.length) {
        // empty paragraph: its height comes from the (empty) span's style, as in Publisher
        const sp = c.getElementsByTagNameNS(NS.text, 'span')[0];
        const etp = sp ? { ...tp, ...styles.resolve('text', attr(sp, 'text', 'style-name')).t } : tp;
        body = `<span style="${textCss(etp, styles, 'ក')}"><br></span>`;
      }
      out.push(`<p${css ? ` style="${css}"` : ''}${ls && ls !== 1 ? ` data-ls="${r2(ls)}"` : ''}${fixed ? ' data-lhfix="1"' : ''}>${body}</p>`);
      bullet = bullet && null;
    } else if (ln === 'list') {
      for (const li of kids(c)) if (li.localName === 'list-item' || li.localName === 'list-header')
        paragraphsHtml(li, baseText, basePara, styles, out, li.localName === 'list-item' ? '•' : null);
    } else if (ln === 'table' && c.namespaceURI === NS.table) {
      out.push(tableHtml(c, baseText, basePara, styles));
    }
  }
}

function tableHtml(tbl, baseText, basePara, styles) {
  const rows = [];
  const walk = (el) => { for (const c of kids(el)) { if (c.localName === 'table-row') rows.push(c); else if (/table-(header-)?rows|table-row-group/.test(c.localName)) walk(c); } };
  walk(tbl);
  const html = ['<table>'];
  for (const r of rows) {
    html.push('<tr>');
    for (const cell of kids(r)) {
      if (cell.localName !== 'table-cell') continue;
      const cs = attr(cell, 'table', 'number-columns-spanned'), rs = attr(cell, 'table', 'number-rows-spanned');
      const inner = []; paragraphsHtml(cell, baseText, basePara, styles, inner);
      html.push(`<td${cs ? ` colspan="${cs}"` : ''}${rs ? ` rowspan="${rs}"` : ''}>${inner.join('')}</td>`);
    }
    html.push('</tr>');
  }
  html.push('</table>');
  return html.join('');
}

// ---------- shapes ----------
function applyGraphic(obj, g, styles, isFrame) {
  const fill = g['draw:fill'];
  const op = pct(g['draw:opacity']);
  if (fill === 'solid') obj.fill = colorWithOpacity(g['draw:fill-color'] || '#729fcf', op);
  else if (fill === 'gradient') {
    const gr = styles.gradients.get(g['draw:fill-gradient-name']);
    if (gr) {
      obj.fill = gr['draw:start-color'] || '#ffffff'; obj.fill2 = gr['draw:end-color'] || '#000000';
      const st = gr['draw:style'] || 'linear';
      obj.gradKind = st === 'axial' ? 'axial' : (st === 'radial' || st === 'ellipsoid' || st === 'square' || st === 'rectangular') ? 'radial' : 'linear';
      obj.gradAngle = parseAngle(gr['draw:angle']);
    } else obj.fill = g['draw:fill-color'] || 'none';
  } else if (fill === 'bitmap') {
    obj.fillImage = styles.fillImages.get(g['draw:fill-image-name']) || null;
    if (!obj.fillImage) obj.fill = g['draw:fill-color'] || 'none';
  } else if (fill === 'hatch') obj.fill = g['draw:fill-color'] || 'none';
  else obj.fill = 'none';
  if (fill == null && !isFrame && g['draw:fill-color']) obj.fill = g['draw:fill-color'];

  const stroke = g['draw:stroke'];
  if (stroke && stroke !== 'none') {
    obj.stroke = g['svg:stroke-color'] || '#000000';
    const w = toMm(g['svg:stroke-width']);
    obj.strokeW = r2(w && w > 0 ? w : 0.1);
    if (stroke === 'dash') {
      const d = styles.dashes.get(g['draw:stroke-dash']);
      obj.dash = d && d['draw:style'] === 'round' && toMm(d['draw:dots1-length']) < (obj.strokeW * 2) ? 'dot' : 'dash';
    }
  } else obj.stroke = 'none';

  const pad = { t: 'fo:padding-top', r: 'fo:padding-right', b: 'fo:padding-bottom', l: 'fo:padding-left' };
  if (obj.type === 'box') {
    obj.pad = {};
    for (const k in pad) { const v = toMm(g[pad[k]] ?? g['fo:padding']); obj.pad[k] = v != null ? r2(v) : (isFrame ? 0 : 2.5); }
    const va = g['draw:textarea-vertical-align'];
    obj.valign = va === 'middle' ? 'middle' : va === 'bottom' ? 'bottom' : (isFrame ? 'top' : (va === 'top' ? 'top' : 'middle'));
  }
}
function parseAngle(a) {
  if (!a) return 0;
  const n = parseFloat(a);
  if (/rad$/.test(a)) return n * 180 / Math.PI;
  if (/grad$/.test(a)) return n * 0.9;
  if (/deg$/.test(a)) return n;
  return n / 10; // ODF 1.2 plain number = tenths of a degree
}

function enhancedPathToSvg(ep) {
  if (!ep || /[?$]/.test(ep)) return null; // contains formulas
  const tokens = ep.match(/[A-Za-z]|-?[\d.]+(?:e-?\d+)?/g) || [];
  const out = [];
  let i = 0, cmd = null;
  const nums = (n) => { const a = []; for (let k = 0; k < n; k++) a.push(tokens[i++]); return a.join(' '); };
  while (i < tokens.length) {
    const t = tokens[i];
    if (/[A-Za-z]/.test(t)) { cmd = t; i++; if ('ZzNFS'.includes(cmd)) { if (cmd === 'Z') out.push('Z'); cmd = null; } continue; }
    if (cmd === 'M') { out.push('M ' + nums(2)); cmd = 'L'; }
    else if (cmd === 'L') out.push('L ' + nums(2));
    else if (cmd === 'C') out.push('C ' + nums(6));
    else if (cmd === 'Q') out.push('Q ' + nums(4));
    else return null; // arcs etc. not supported
  }
  return out.join(' ');
}

const CUSTOM_RECT = /^(rectangle|rect|flowchart-process|mso-spt1|frame)$/;
const CUSTOM_ROUND = /^(round-rectangle|flowchart-alternate-process|mso-spt2)$/;
const CUSTOM_ELLIPSE = /^(ellipse|circle|flowchart-connector|mso-spt3)$/;

function convertShape(el, styles, ctx, groupId) {
  const ln = el.localName;
  const out = [];
  if (el.namespaceURI !== NS.draw) return out;
  if (ln === 'g') {
    const gid = groupId || uid();
    for (const c of kids(el)) out.push(...convertShape(c, styles, ctx, gid));
    return out;
  }
  const gs = styles.resolve('graphic', attr(el, 'draw', 'style-name'));
  const ts = styles.resolve('paragraph', attr(el, 'draw', 'text-style-name'));
  const baseText = { ...gs.t, ...ts.t }, basePara = { ...gs.p, ...ts.p };
  const geo = geometry(el);
  const textOf = (container) => { const h = []; paragraphsHtml(container, baseText, basePara, styles, h); return h.join(''); };

  if (ln === 'frame') {
    const tb = kids(el).find(c => c.localName === 'text-box');
    const imgs = kids(el).filter(c => c.localName === 'image');
    const tbl = kids(el).find(c => c.localName === 'table');
    const objEl = kids(el).find(c => c.localName === 'object' || c.localName === 'object-ole');
    if (tb) {
      const o = makeObject('box', { ...geo, shape: 'none', groupId });
      applyGraphic(o, gs.g, styles, true);
      o.html = textOf(tb);
      // frames that auto-grow: make sure min height respected
      const minH = toMm(attr(tb, 'fo', 'min-height')); if (minH && minH > o.h) o.h = r2(minH);
      out.push(o);
    } else if (tbl) {
      // a Publisher table comes with a fallback picture of itself (a StarView metafile no browser shows): keep the table.
      // Its borders and colours are on its cells; the frame's style is the file's default shape look (often a solid
      // theme colour), which LibreOffice and Publisher don't paint behind a table, so the box stays clear.
      const o = makeObject('box', { ...geo, shape: 'none', groupId });
      o.pad = { t: 0, r: 0, b: 0, l: 0 };
      o.html = tableHtml(tbl, baseText, basePara, styles);
      out.push(o);
    } else if (imgs.length) {
      let src = null, note = null;
      for (const im of imgs) {
        const bin = im.getElementsByTagNameNS(NS.office, 'binary-data')[0];
        if (bin) { src = dataUrlFromBase64(bin.textContent); if (src) break; note = 'Picture (WMF/EMF – re-insert as PNG/JPG)'; }
        const href = attr(im, 'xlink', 'href'); if (!src && href && /^data:/.test(href)) { src = href; break; }
      }
      const o = makeObject('image', { ...geo, src: src || '', note, groupId });
      const st = gs.g['draw:stroke'];
      if (st && st !== 'none') { o.stroke = gs.g['svg:stroke-color'] || '#000'; o.strokeW = r2(toMm(gs.g['svg:stroke-width']) || 0.1); }
      const textInImg = kids(imgs[0]).some(c => c.localName === 'p');
      out.push(o);
      if (textInImg) { const t = makeObject('box', { ...geo, groupId }); t.html = textOf(imgs[0]); out.push(t); }
      if (!src) ctx.warnings.add('Some pictures are WMF/EMF and cannot be shown; re-insert them as PNG or JPG.');
    } else if (objEl) {
      const o = makeObject('image', { ...geo, src: '', note: 'Embedded object', groupId });
      out.push(o); ctx.warnings.add('Embedded OLE objects were replaced by placeholders.');
    }
    return out;
  }

  if (ln === 'line' || ln === 'connector') {
    const x1 = toMm(attr(el, 'svg', 'x1')) || 0, y1 = toMm(attr(el, 'svg', 'y1')) || 0;
    const x2 = toMm(attr(el, 'svg', 'x2')) || 0, y2 = toMm(attr(el, 'svg', 'y2')) || 0;
    const o = makeObject('line', { x: r2(Math.min(x1, x2)), y: r2(Math.min(y1, y2)), w: r2(Math.abs(x2 - x1)), h: r2(Math.abs(y2 - y1)),
      dir: (x2 - x1) * (y2 - y1) < 0 ? 'up' : 'down', groupId });
    const g = gs.g;
    o.stroke = g['draw:stroke'] === 'none' ? 'none' : (g['svg:stroke-color'] || '#000000');
    o.strokeW = r2(toMm(g['svg:stroke-width']) || 0.1);
    if (g['draw:stroke'] === 'dash') o.dash = 'dash';
    o.arrowEnd = !!g['draw:marker-end']; o.arrowStart = !!g['draw:marker-start'];
    out.push(o);
    return out;
  }

  let o = null;
  if (ln === 'rect') o = makeObject('box', { ...geo, shape: 'rect', radius: r2(toMm(attr(el, 'draw', 'corner-radius')) || 0), groupId });
  else if (ln === 'ellipse' || ln === 'circle') o = makeObject('box', { ...geo, shape: 'ellipse', groupId });
  else if (ln === 'path') o = makeObject('box', { ...geo, shape: 'path', path: attr(el, 'svg', 'd'), viewBox: attr(el, 'svg', 'viewBox'), groupId });
  else if (ln === 'polygon' || ln === 'polyline') {
    const pts = (attr(el, 'draw', 'points') || '').trim().split(/\s+/).map(p => p.split(','));
    const d = pts.map((p, i) => (i ? 'L ' : 'M ') + p[0] + ' ' + p[1]).join(' ') + (ln === 'polygon' ? ' Z' : '');
    o = makeObject('box', { ...geo, shape: 'path', path: d, viewBox: attr(el, 'svg', 'viewBox'), groupId });
  } else if (ln === 'custom-shape') {
    const eg = kids(el).find(c => c.localName === 'enhanced-geometry');
    const type = eg ? (attr(eg, 'draw', 'type') || '') : '';
    o = makeObject('box', { ...geo, shape: 'rect', groupId });
    if (CUSTOM_ELLIPSE.test(type)) o.shape = 'ellipse';
    else if (CUSTOM_ROUND.test(type)) o.shape = 'roundrect';
    else if (!CUSTOM_RECT.test(type) && eg) {
      const d = enhancedPathToSvg(attr(eg, 'draw', 'enhanced-path'));
      if (d) { o.shape = 'path'; o.path = d; o.viewBox = attr(eg, 'svg', 'viewBox') || '0 0 21600 21600'; }
      else ctx.warnings.add('Some special shapes (stars, arrows, banners) were simplified to rectangles.');
    }
    if (eg && attr(eg, 'draw', 'mirror-horizontal') === 'true' && o.shape === 'path') o.flipH = true;
  } else return out;

  applyGraphic(o, gs.g, styles, false);
  if (o.flipH && o.path) { /* mirrored custom shapes */ o.path = mirrorPath(o.path, o.viewBox); delete o.flipH; }
  o.html = textOf(el);
  out.push(o);
  return out;
}

function mirrorPath(d, vb) {
  const [vx, , vw] = (vb || '0 0 21600 21600').split(/\s+/).map(Number);
  let idx = 0;
  return d.replace(/-?[\d.]+(?:e-?\d+)?/g, (n) => (idx++ % 2 === 0 ? String(vx * 2 + vw - parseFloat(n)) : n));
}

function textDefaults(list) {
  for (const o of list) {
    if (o.type !== 'box' || !o.html) continue;
    const sz = o.html.match(/font-size:([\d.]+)pt/); if (sz) o.size = parseFloat(sz[1]);
    const ff = o.html.match(/font-family:'([^']+)'/); if (ff) o.font = ff[1];
  }
  return list;
}

export function importFodg(xmlText, name = 'Imported') {
  const xml = new DOMParser().parseFromString(xmlText, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) throw new Error('The converted file could not be read.');
  const styles = new Styles(xml);
  const ctx = { warnings: new Set() };
  const pagesEl = Array.from(xml.getElementsByTagNameNS(NS.draw, 'page'));
  let doc = newDoc(210, 297, name);

  const firstMaster = pagesEl[0] ? styles.masterPages.get(attr(pagesEl[0], 'draw', 'master-page-name')) : styles.masterPages.values().next().value;
  if (firstMaster) {
    const pl = styles.pageLayouts.get(attr(firstMaster, 'style', 'page-layout-name'));
    if (pl) {
      doc.pageW = r2(toMm(pl['fo:page-width']) || 210); doc.pageH = r2(toMm(pl['fo:page-height']) || 297);
      const mt = toMm(pl['fo:margin-top']), mr = toMm(pl['fo:margin-right']), mb = toMm(pl['fo:margin-bottom']), ml = toMm(pl['fo:margin-left']);
      if (mt || mr || mb || ml) doc.margins = { t: r2(mt || 0), r: r2(mr || 0), b: r2(mb || 0), l: r2(ml || 0) };
      else { const m = Math.min(doc.pageW, doc.pageH) < 120 ? 3 : 12.7; doc.margins = { t: m, r: m, b: m, l: m }; }
    }
    for (const c of kids(firstMaster)) {
      if (c.namespaceURI !== NS.draw) continue;
      if (attr(c, 'presentation', 'class')) continue;
      doc.master.objects.push(...convertShape(c, styles, ctx, null));
    }
    const mbg = styles.resolve('drawing-page', attr(firstMaster, 'draw', 'style-name')).g;
    if (mbg['draw:fill'] === 'solid' && mbg['draw:fill-color']) doc.masterBg = mbg['draw:fill-color'];
  }

  doc.pages = pagesEl.map(pe => {
    const page = { id: uid(), objects: [] };
    for (const c of kids(pe)) page.objects.push(...convertShape(c, styles, ctx, null));
    const bg = styles.resolve('drawing-page', attr(pe, 'draw', 'style-name')).g;
    if (bg['draw:fill'] === 'solid' && bg['draw:fill-color']) page.bg = bg['draw:fill-color'];
    else if (doc.masterBg) page.bg = doc.masterBg;
    return page;
  });
  if (!doc.pages.length) doc.pages = [{ id: uid(), objects: [] }];
  doc.pages.forEach(p => textDefaults(p.objects)); textDefaults(doc.master.objects);
  delete doc.masterBg;
  doc.importWarnings = Array.from(ctx.warnings);
  return doc;
}
