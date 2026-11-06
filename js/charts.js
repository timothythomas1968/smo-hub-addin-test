// Hand-drawn SVG charts for the panel. No libraries; every label is set as text.
// Colours come from the design tokens (option B): navy, blue, and the status bars.
const NS = 'http://www.w3.org/2000/svg';
export const COL = { navy: '#003A70', blue: '#007BFF', soft: '#9DBBE0', line: '#ECEFF3', g: '#3AA265', a: '#E0A030', r: '#D9534F', n: '#AAB8C9', ink: '#212529', muted: '#5A6573' };

function svg(w, h, label) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', `0 0 ${w} ${h}`); s.setAttribute('width', w); s.setAttribute('height', h);
  s.setAttribute('role', 'img'); if (label) s.setAttribute('aria-label', label);
  s.style.maxWidth = '100%'; s.style.flex = '0 0 auto';
  return s;
}
function el(parent, tag, attrs, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
  if (text != null) e.textContent = String(text);
  parent.appendChild(e);
  return e;
}

/** A ring: parts [{v, c, label}], with a big centre figure and a small caption under it. */
export function donut(parts, { size = 96, centre = '', caption = '', label = '' } = {}) {
  const s = svg(size, size, label);
  const r = size / 2 - 7, cx = size / 2, cy = size / 2, C = 2 * Math.PI * r;
  const total = parts.reduce((a, p) => a + (p.v || 0), 0);
  el(s, 'circle', { cx, cy, r, fill: 'none', stroke: COL.line, 'stroke-width': 11 });
  let off = 0;
  if (total) parts.forEach((p) => {
    if (!p.v) return;
    const len = C * p.v / total;
    const c = el(s, 'circle', { cx, cy, r, fill: 'none', stroke: p.c, 'stroke-width': 11, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -off, transform: `rotate(-90 ${cx} ${cy})` });
    el(c, 'title', {}, `${p.label}: ${p.v}`);
    off += len;
  });
  el(s, 'text', { x: cx, y: cy + (caption ? 2 : 7), 'text-anchor': 'middle', 'font-size': size > 90 ? 22 : 17, 'font-weight': 700, fill: COL.ink }, centre);
  if (caption) el(s, 'text', { x: cx, y: cy + 17, 'text-anchor': 'middle', 'font-size': 10, fill: COL.muted }, caption);
  return s;
}

/** One stacked bar: parts [{v, c, label}]. */
export function stackBar(parts, { width = 220, height = 14, label = '' } = {}) {
  const s = svg(width, height, label);
  const total = parts.reduce((a, p) => a + (p.v || 0), 0);
  el(s, 'rect', { x: 0, y: 0, width, height, rx: 4, fill: COL.line });
  let x = 0;
  if (total) parts.forEach((p) => {
    if (!p.v) return;
    const w = width * p.v / total;
    const r = el(s, 'rect', { x, y: 0, width: Math.max(w, 2), height, fill: p.c });
    el(r, 'title', {}, `${p.label}: ${p.v}`);
    x += w;
  });
  return s;
}

/** Grouped columns: groups [{label, bars: [{v, c, label}]}], values formatted with fmt. */
export function columns(groups, { width = 240, height = 120, fmt = String, label = '' } = {}) {
  const s = svg(width, height, label);
  const max = Math.max(1, ...groups.flatMap((g) => g.bars.map((b) => b.v || 0)));
  const top = 16, base = height - 18, gw = width / groups.length;
  el(s, 'line', { x1: 0, x2: width, y1: base + 0.5, y2: base + 0.5, stroke: COL.n });
  groups.forEach((g, gi) => {
    const n = g.bars.length, bw = Math.min(30, (gw - 18) / n);
    const x0 = gi * gw + (gw - bw * n - 4 * (n - 1)) / 2;
    g.bars.forEach((b, bi) => {
      const hgt = (base - top) * (b.v || 0) / max, x = x0 + bi * (bw + 4);
      const r = el(s, 'rect', { x, y: base - hgt, width: bw, height: Math.max(hgt, b.v ? 1 : 0), rx: 2, fill: b.c });
      el(r, 'title', {}, `${g.label} ${b.label}: ${fmt(b.v || 0)}`);
      if (b.v) el(s, 'text', { x: x + bw / 2, y: base - hgt - 4, 'text-anchor': 'middle', 'font-size': 10, 'font-weight': 600, fill: COL.ink }, fmt(b.v));
    });
    el(s, 'text', { x: gi * gw + gw / 2, y: height - 4, 'text-anchor': 'middle', 'font-size': 11, 'font-weight': 700, fill: COL.navy }, g.label);
  });
  return s;
}

/** A thin meter: value against a limit, with the limit marked. */
export function meter(v, limit, { width = 220, height = 10, tone = COL.blue, label = '' } = {}) {
  const s = svg(width, height, label);
  const max = Math.max(v, limit, 1);
  el(s, 'rect', { x: 0, y: 0, width, height, rx: 5, fill: COL.line });
  el(s, 'rect', { x: 0, y: 0, width: width * v / max, height, rx: 5, fill: v > limit ? COL.r : tone });
  if (limit) el(s, 'rect', { x: Math.min(width - 2, width * limit / max), y: 0, width: 2, height, fill: COL.ink });
  return s;
}
