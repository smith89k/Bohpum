// Rich-text helpers for text frames (contentEditable). Formatting is stored as inline CSS on <span>/<p>.
import { fixLineHeights } from './render.js';

const ALLOWED = new Set(['P', 'SPAN', 'BR', 'TABLE', 'TBODY', 'TR', 'TD', 'TH', 'B', 'I', 'U', 'S', 'STRONG', 'EM', 'SUB', 'SUP']);
const STYLE_KEEP = ['font-family', 'font-size', 'font-weight', 'font-style', 'color', 'text-decoration', 'text-decoration-line', 'background-color',
  'text-align', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'text-indent', 'letter-spacing', 'vertical-align',
  'font-variant', 'text-transform', 'text-shadow', 'min-height', 'line-height'];

export function sanitizeHtml(html) {
  const tpl = document.createElement('div');
  tpl.innerHTML = html;
  const walk = (el) => {
    for (const c of Array.from(el.childNodes)) {
      if (c.nodeType === 8) { c.remove(); continue; }
      if (c.nodeType !== 1) continue;
      let tag = c.tagName;
      if (tag === 'DIV' || tag === 'H1' || tag === 'H2' || tag === 'H3' || tag === 'LI') {
        const p = document.createElement('p');
        if (c.getAttribute('style')) p.setAttribute('style', c.getAttribute('style'));
        while (c.firstChild) p.append(c.firstChild);
        c.replaceWith(p); walk(p); cleanAttrs(p); continue;
      }
      if (tag === 'FONT') {
        const s = document.createElement('span');
        if (c.getAttribute('face')) s.style.fontFamily = c.getAttribute('face');
        if (c.getAttribute('color')) s.style.color = c.getAttribute('color');
        while (c.firstChild) s.append(c.firstChild);
        c.replaceWith(s); walk(s); cleanAttrs(s); continue;
      }
      if (!ALLOWED.has(tag)) {
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|META|LINK|IMG|SVG)$/.test(tag)) { c.remove(); continue; }
        const frag = document.createDocumentFragment();
        while (c.firstChild) frag.append(c.firstChild);
        c.replaceWith(frag); continue;
      }
      cleanAttrs(c);
      walk(c);
    }
  };
  walk(tpl);
  // wrap stray inline content at the top level into paragraphs
  let cur = null;
  for (const c of Array.from(tpl.childNodes)) {
    const block = c.nodeType === 1 && (c.tagName === 'P' || c.tagName === 'TABLE');
    if (block) { cur = null; continue; }
    if (c.nodeType === 3 && !c.nodeValue.length) { c.remove(); continue; }
    if (!cur) { cur = document.createElement('p'); c.before(cur); }
    cur.append(c);
  }
  return tpl.innerHTML;
}

function cleanAttrs(el) {
  for (const a of Array.from(el.attributes)) {
    if (a.name === 'style') {
      const keep = [];
      for (const prop of STYLE_KEEP) { const v = el.style.getPropertyValue(prop); if (v) keep.push(`${prop}:${v}`); }
      if (keep.length) el.setAttribute('style', keep.join(';')); else el.removeAttribute('style');
    } else if (!['data-ls', 'data-lhfix', 'colspan', 'rowspan', 'data-field'].includes(a.name)) el.removeAttribute(a.name);
  }
}

// ---- selection helpers ----
function textNodesIn(root, range) {
  const out = [];
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = tw.nextNode())) {
    if (!n.nodeValue.length) continue;
    if (!range || range.intersectsNode(n)) out.push(n);
  }
  return out;
}

function rangeInside(root) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.commonAncestorContainer)) return null;
  return r;
}

// Apply CSS properties to the selected text (or the whole frame if wholeRoot)
export function applyInline(root, styles, { whole = false } = {}) {
  let range = whole ? null : rangeInside(root);
  if (!whole && (!range || range.collapsed)) {
    if (range && range.collapsed) return applyAtCaret(root, range, styles);
    whole = true;
  }
  let nodes;
  if (whole) nodes = textNodesIn(root, null);
  else {
    // split boundary text nodes
    let { startContainer: sc, startOffset: so, endContainer: ec, endOffset: eo } = range;
    if (ec.nodeType === 3 && eo < ec.nodeValue.length) ec.splitText(eo);
    if (sc.nodeType === 3 && so > 0) { const tail = sc.splitText(so); if (ec === sc) ec = tail; sc = tail; so = 0; }
    range = document.createRange();
    range.setStart(sc, so);
    if (ec.nodeType === 3) range.setEnd(ec, ec.nodeValue.length); else range.setEnd(ec, eo);
    nodes = textNodesIn(root, range).filter(n => {
      // skip text nodes touched only at a boundary
      if (n === ec || n === sc) return true;
      return range.intersectsNode(n);
    });
  }
  const touched = [];
  for (const n of nodes) {
    let span = n.parentNode;
    if (!(span.tagName === 'SPAN' && span.childNodes.length === 1)) {
      span = document.createElement('span');
      n.replaceWith(span); span.append(n);
    }
    for (const k in styles) {
      if (styles[k] == null || styles[k] === '') span.style.removeProperty(k);
      else span.style.setProperty(k, styles[k]);
    }
    // children styles inside nested spans would override; clear same props on descendants (none for text nodes)
    touched.push(span);
  }
  // when applying to whole frame, also clear the property on empty-paragraph spans
  if (whole) root.querySelectorAll('span').forEach(s => { if (!s.textContent) for (const k in styles) s.style.setProperty(k, styles[k]); });
  if (!whole && touched.length) {
    const sel = window.getSelection(); const r = document.createRange();
    r.setStart(touched[0].firstChild, 0);
    const last = touched[touched.length - 1].firstChild; r.setEnd(last, last.nodeValue.length);
    sel.removeAllRanges(); sel.addRange(r);
  }
  fixLineHeights(root.closest('.kobj') || root);
  return true;
}

function applyAtCaret(root, range, styles) {
  // insert an empty styled span holding a zero-width space so typing continues in the new style
  const span = document.createElement('span');
  const cur = range.startContainer.nodeType === 3 ? range.startContainer.parentNode : range.startContainer;
  if (cur && cur.tagName === 'SPAN') span.setAttribute('style', cur.getAttribute('style') || '');
  for (const k in styles) span.style.setProperty(k, styles[k]);
  span.textContent = '​';
  range.insertNode(span);
  const r = document.createRange(); r.setStart(span.firstChild, 1); r.collapse(true);
  const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
  return true;
}

export function paragraphsOf(root, whole) {
  const all = Array.from(root.querySelectorAll('p'));
  if (whole) return all;
  const range = rangeInside(root);
  if (!range) return all;
  const ps = all.filter(p => range.intersectsNode(p));
  return ps.length ? ps : all;
}

export function applyParagraph(root, styles, { whole = false, ls } = {}) {
  ensureParagraphs(root);
  for (const p of paragraphsOf(root, whole)) {
    for (const k in styles) { if (styles[k] == null || styles[k] === '') p.style.removeProperty(k); else p.style.setProperty(k, styles[k]); }
    if (ls !== undefined) p.removeAttribute('data-lhfix');
    if (ls !== undefined) { if (ls === 1 || ls == null) { p.removeAttribute('data-ls'); p.style.removeProperty('line-height'); } else p.dataset.ls = ls; }
  }
  fixLineHeights(root.closest('.kobj') || root);
}

export function ensureParagraphs(root) {
  if (!root.querySelector('p') || Array.from(root.childNodes).some(c => c.nodeType === 3 && c.nodeValue.trim() || (c.nodeType === 1 && c.tagName === 'SPAN'))) {
    root.innerHTML = sanitizeHtml(root.innerHTML || '') || '<p><br></p>';
  }
}

// Read formatting at caret / selection start, for the toolbar
export function styleAt(root) {
  const range = rangeInside(root);
  let node = range ? range.startContainer : root.querySelector('span') || root;
  if (node.nodeType === 3) node = node.parentNode;
  if (!node || !root.contains(node)) node = root.querySelector('span') || root;
  const cs = getComputedStyle(node);
  const p = node.closest ? node.closest('p') : null;
  const ps = p ? getComputedStyle(p) : cs;
  return {
    font: cs.fontFamily.split(',')[0].replace(/["']/g, '').trim(),
    size: Math.round(parseFloat(cs.fontSize) * 72 / 96 * 10) / 10,
    bold: parseInt(cs.fontWeight, 10) >= 600,
    italic: cs.fontStyle === 'italic',
    underline: /underline/.test(cs.textDecorationLine || cs.textDecoration),
    strike: /line-through/.test(cs.textDecorationLine || cs.textDecoration),
    color: rgbToHex(cs.color),
    align: ps.textAlign === 'start' ? 'left' : ps.textAlign === 'end' ? 'right' : ps.textAlign,
    ls: p && p.dataset.ls ? parseFloat(p.dataset.ls) : 1,
    spaceBefore: p ? Math.round(parseFloat(ps.marginTop) * 25.4 / 96 * 10) / 10 : 0,
    spaceAfter: p ? Math.round(parseFloat(ps.marginBottom) * 25.4 / 96 * 10) / 10 : 0
  };
}

export function rgbToHex(c) {
  const m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return c && c.startsWith('#') ? c : '#000000';
  return '#' + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, '0')).join('');
}

export function htmlFromPlainText(text, style = '') {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return text.split(/\r?\n/).map(l => `<p>${l ? `<span${style ? ` style="${style}"` : ''}>${esc(l)}</span>` : '<br>'}</p>`).join('');
}

export function stripZeroWidth(html) { return html.replace(/​/g, ''); }
