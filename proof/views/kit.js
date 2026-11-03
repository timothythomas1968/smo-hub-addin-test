// Shared kit for the spokes mock-ups: DOM builder, formatters, hand-drawn SVG charts and the panel shell.
// No libraries. Text is always inserted as text, as in the add-in.
(function () {
  'use strict';
  const D = window.DEMO;
  const SVGNS = 'http://www.w3.org/2000/svg';

  // ---------- DOM ----------
  function h(sel, attrs, ...kids) {
    if (attrs == null || typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs)) { kids.unshift(attrs); attrs = {}; }
    const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
    const e = document.createElement(m[1] || 'div');
    (m[2].match(/[.#][\w-]+/g) || []).forEach((p) => (p[0] === '.' ? e.classList.add(p.slice(1)) : (e.id = p.slice(1))));
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k === 'class') String(v).split(' ').filter(Boolean).forEach((c) => e.classList.add(c));
      else e.setAttribute(k, v === true ? '' : v);
    }
    add(e, kids);
    return e;
  }
  function add(e, kids) { for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : String(k)); }
  function s(tag, attrs, ...kids) {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) if (v != null) e.setAttribute(k, v);
    for (const k of kids.flat(Infinity)) if (k != null) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  }

  // ---------- formats (UK edition) ----------
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dt = (iso) => (iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00Z' : 'Z')) : null);
  const fdate = (iso) => { const d = dt(iso); return d ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ''; };
  const fshort = (iso) => { const d = dt(iso); return d ? `${d.getUTCDate()} ${MON[d.getUTCMonth()]}` : ''; };
  const fmonth = (iso) => { const d = dt(iso); return d ? `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ''; };
  const fmon = (iso) => { const d = dt(iso); return d ? MON[d.getUTCMonth()] : ''; };
  const ftime = (iso) => { const d = dt(iso); return d ? `${fshort(iso.slice(0, 10))}, ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : ''; };
  const money = (v) => '£' + Math.round(Number(v) || 0).toLocaleString('en-GB');
  const mshort = (v) => { v = Number(v) || 0; const a = Math.abs(v); return (v < 0 ? '−' : '') + '£' + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'm' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : Math.round(a)); };
  const pct = (v) => Math.round(v * 100) + '%';
  const days = (a, b) => Math.round((dt(b) - dt(a)) / 864e5);
  const ws = (code) => D.ws.find((w) => w.code === code);
  const tsa = () => D.tsa.map((r) => Object.fromEntries(D.tsaHeaders.map((hd, i) => [hd, r[i]])));
  const ragClass = (r) => ({ Green: 'g', Amber: 'a', Red: 'r' }[r] || 'n');

  // ---------- tooltip (one for the page) ----------
  let tip;
  document.addEventListener('mousemove', (ev) => {
    const t = ev.target.closest && ev.target.closest('[data-tip]');
    if (!tip) { tip = h('div.tip'); document.body.append(tip); }
    if (!t) { tip.style.opacity = 0; return; }
    tip.textContent = t.getAttribute('data-tip');
    tip.style.opacity = 1;
    const x = Math.min(ev.clientX + 14, innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + 'px'; tip.style.top = (ev.clientY + 16) + 'px';
  });

  // ---------- charts ----------
  const C = { c1: '#2C6CB0', c2: '#1B9A8B', c3: '#8A63C8', plan: '#8794A6', grid: '#E6EAF0', ink: '#3A4250', muted: '#5A6573', g: '#3AA265', a: '#E0A030', r: '#D9534F', n: '#C9D2DE', track: '#E6EBF1' };

  /** Sparkline: last point marked. */
  function spark(vals, { w = 96, h: hh = 28, color = C.c1, fill = true } = {}) {
    const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
    const pts = vals.map((v, i) => [2 + (i * (w - 6)) / (vals.length - 1), hh - 3 - ((v - mn) / r) * (hh - 7)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const last = pts[pts.length - 1];
    return s('svg', { class: 'spark', viewBox: `0 0 ${w} ${hh}`, width: w, height: hh, 'aria-hidden': 'true' },
      fill ? s('path', { d: d + `L${last[0]} ${hh}L2 ${hh}Z`, fill: color, opacity: 0.08 }) : null,
      s('path', { d, fill: 'none', stroke: color, 'stroke-width': 1.75, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
      s('circle', { cx: last[0], cy: last[1], r: 2.5, fill: color }));
  }

  /** Progress ring with the number in the middle. */
  function ring(frac, { size = 88, stroke = 9, color = C.c1, label = pct(frac), sub = '', tipText } = {}) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac));
    return s('svg', { class: 'ring', viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': `${label} ${sub}`, 'data-tip': tipText || null },
      s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: C.track, 'stroke-width': stroke }),
      f <= 0 ? null : s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': stroke, 'stroke-linecap': 'round',
        'stroke-dasharray': `${(c * f).toFixed(1)} ${c.toFixed(1)}`, transform: `rotate(-90 ${size / 2} ${size / 2})`, class: 'ring-arc' }),
      s('text', { x: size / 2, y: size / 2 + (sub ? 1 : 6), 'text-anchor': 'middle', class: 'ring-num', 'font-size': size * 0.22 }, label),
      sub ? s('text', { x: size / 2, y: size / 2 + size * 0.17, 'text-anchor': 'middle', class: 'ring-sub', 'font-size': size * 0.115 }, sub) : null);
  }

  /** Donut of a status mix. segs: [{label, value, color}] - labelled beside, not in a legend box. */
  function donut(segs, { size = 120, stroke = 18, center = '', centerSub = '' } = {}) {
    const total = segs.reduce((a, x) => a + x.value, 0) || 1, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    let off = 0;
    const gap = segs.filter((x) => x.value).length > 1 ? 2 : 0;
    const arcs = segs.filter((x) => x.value).map((x) => {
      const len = (x.value / total) * c;
      const e = s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: x.color, 'stroke-width': stroke,
        'stroke-dasharray': `${Math.max(0, len - gap).toFixed(1)} ${c.toFixed(1)}`, 'stroke-dashoffset': (-off).toFixed(1),
        transform: `rotate(-90 ${size / 2} ${size / 2})`, 'data-tip': `${x.label}: ${x.value}` });
      off += len; return e;
    });
    const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': segs.map((x) => `${x.label} ${x.value}`).join(', ') },
      s('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: C.track, 'stroke-width': stroke }), arcs,
      s('text', { x: size / 2, y: size / 2 + 3, 'text-anchor': 'middle', class: 'ring-num', 'font-size': size * 0.2 }, center),
      centerSub ? s('text', { x: size / 2, y: size / 2 + size * 0.16, 'text-anchor': 'middle', class: 'ring-sub', 'font-size': size * 0.1 }, centerSub) : null);
    return h('div.donut', svg, h('ul.donut-key', segs.map((x) => h('li', h('span.sw', { style: { background: x.color } }), h('span.k', x.label), h('b', x.value)))));
  }

  /** RAG history: one dot per month, the latest larger. */
  function ragDots(hist, months) {
    return h('span.ragdots', hist.map((r, i) => h('span.dot.' + ragClass(r), { class: i === hist.length - 1 ? 'now' : null, 'data-tip': `${fmonth(months[i])}: ${r}` })));
  }

  /** Stacked horizontal bar of a status mix. */
  function stackBar(segs, { height = 10 } = {}) {
    const total = segs.reduce((a, x) => a + x.value, 0) || 1;
    return h('div.stackbar', { style: { height: height + 'px' }, role: 'img', 'aria-label': segs.map((x) => `${x.label} ${x.value}`).join(', ') },
      segs.filter((x) => x.value).map((x) => h('span', { style: { width: (100 * x.value) / total + '%', background: x.color }, 'data-tip': `${x.label}: ${x.value}` })));
  }

  /** Burn-down: monthly run-rate, plan (dashed) against forecast (solid), today line, labels at the line ends. */
  function burndown(rows, { w = 640, h: hh = 220, today = D.meta.today, key = 'Fee', fmt = mshort, compact = false } = {}) {
    const L = 46, R = compact ? 56 : 92, T = 14, B = 24, iw = w - L - R, ih = hh - T - B;
    const pv = rows.map((r) => r['plan' + key]), fv = rows.map((r) => r['fc' + key]);
    const mx = Math.max(...pv, ...fv) * 1.08 || 1;
    const x = (i) => L + (i * iw) / (rows.length - 1), y = (v) => T + ih - (v / mx) * ih;
    const step = (vals) => vals.map((v, i) => (i ? `H${x(i).toFixed(1)}V${y(v).toFixed(1)}` : `M${x(0)} ${y(v).toFixed(1)}`)).join('');
    const ticks = 4, grid = [];
    for (let i = 0; i <= ticks; i++) {
      const v = (mx / ticks) * i;
      grid.push(s('line', { x1: L, x2: L + iw, y1: y(v), y2: y(v), stroke: C.grid, 'stroke-width': 1 }));
      grid.push(s('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'ax' }, fmt(v)));
    }
    const xl = rows.map((r, i) => (i % (compact ? 6 : 3) === 0 ? s('text', { x: x(i), y: hh - 6, 'text-anchor': 'middle', class: 'ax' }, fmon(r.m) + (fmon(r.m) === 'Jan' || i === 0 ? ' ' + r.m.slice(2, 4) : '')) : null));
    const ti = rows.findIndex((r) => r.m > today) - 1 + (dt(today).getUTCDate() - 1) / 30;
    const lastNon0 = (vals) => { let i = vals.length - 1; while (i > 0 && !vals[i]) i--; return Math.min(vals.length - 1, i + 1); };
    const fi = lastNon0(fv), pi = lastNon0(pv);
    const hits = rows.map((r, i) => s('rect', { x: x(i) - iw / rows.length / 2, y: T, width: iw / rows.length, height: ih, fill: 'transparent',
      'data-tip': `${fmonth(r.m)}: ${r['act' + key] != null ? 'actual ' + fmt(r['act' + key]) + ' · ' : ''}forecast ${fmt(r['fc' + key])} · plan ${fmt(r['plan' + key])}` }));
    return s('svg', { class: 'chart', viewBox: `0 0 ${w} ${hh}`, width: '100%', role: 'img', 'aria-label': 'TSA burn-down: monthly run-rate, plan against forecast' },
      grid, xl,
      s('path', { d: step(fv) + `V${y(0)}H${x(0)}Z`, fill: C.c1, opacity: 0.08 }),
      s('path', { d: step(pv), fill: 'none', stroke: C.plan, 'stroke-width': 2, 'stroke-dasharray': '5 4' }),
      s('path', { d: step(fv), fill: 'none', stroke: C.c1, 'stroke-width': 2.25 }),
      (() => { // actuals from the Invoices log, up to the last invoiced month
        const av = rows.map((r) => r['act' + key]); const last = av.reduce((a, v, i) => (v != null ? i : a), -1);
        if (last < 0) return null;
        const d = av.slice(0, last + 1).map((v, i) => (i ? `H${x(i).toFixed(1)}V${y(v).toFixed(1)}` : `M${x(0)} ${y(v).toFixed(1)}`)).join('') + `H${x(last + 1).toFixed(1)}`;
        return [s('path', { d, fill: 'none', stroke: C.ink, 'stroke-width': 3 }), s('circle', { cx: x(last + 1), cy: y(av[last]), r: 3.5, fill: C.ink }),
          s('text', { x: x(last + 1) - 4, y: y(av[last]) + 18, 'text-anchor': 'end', class: 'lbl act' }, 'Actual')];
      })(),
      ti > 0 ? [s('line', { x1: x(ti), x2: x(ti), y1: T - 4, y2: T + ih, stroke: C.ink, 'stroke-width': 1, 'stroke-dasharray': '2 3' }),
        s('text', { x: x(ti) + 5, y: T + 6, class: 'ax strong' }, 'Today')] : null,
      (() => { let yf = Math.min(y(fv[fi - 1] || 0) + 4, T + ih - 4), yp = Math.min(y(pv[pi - 1] || 0) + 4, T + ih - 4);
        if (Math.abs(x(fi) - x(pi)) < 60 && Math.abs(yf - yp) < 15) { if (yf >= yp) yp = yf - 15; else yf = yp - 15; }
        return [s('text', { x: x(fi) + 6, y: yf, class: 'lbl c1' }, 'Forecast'), s('text', { x: x(pi) + 6, y: yp, class: 'lbl plan' }, 'Plan')]; })(),
      hits);
  }

  /** Grouped columns: e.g. budget / plan / forecast by quarter. series: [{key,label,color}] */
  function columns(rows, series, { w = 640, h: hh = 220, cat = 'q', fmt = mshort, stacked = false } = {}) {
    const L = 46, R = 8, T = 22, B = 24, iw = w - L - R, ih = hh - T - B;
    const mx = (stacked ? Math.max(...rows.map((r) => series.reduce((a, x) => a + (r[x.key] || 0), 0))) : Math.max(...rows.flatMap((r) => series.map((x) => r[x.key])))) * 1.12 || 1;
    const y = (v) => T + ih - (v / mx) * ih, gw = iw / rows.length, bw = Math.min(16, (gw - 14) / series.length);
    const out = [];
    for (let i = 0; i <= 4; i++) { const v = (mx / 4) * i; out.push(s('line', { x1: L, x2: L + iw, y1: y(v), y2: y(v), stroke: C.grid }), s('text', { x: L - 8, y: y(v) + 4, 'text-anchor': 'end', class: 'ax' }, fmt(v))); }
    if (stacked) {
      const bw2 = Math.min(34, gw - 18);
      rows.forEach((r, i) => {
        const bx = L + i * gw + (gw - bw2) / 2; let acc = 0; const tot = series.reduce((a, x) => a + (r[x.key] || 0), 0);
        series.forEach((sr, j) => {
          const v = r[sr.key] || 0; if (v <= 0) return;
          const y0 = y(acc), y1 = y(acc + v), top = j === series.length - 1 || series.slice(j + 1).every((n) => !(r[n.key] > 0));
          out.push(s('path', { d: top ? `M${bx} ${y0}V${y1 + 3}q0 -3 3 -3h${bw2 - 6}q3 0 3 3V${y0}Z` : `M${bx} ${y0}V${y1 + 1}H${bx + bw2}V${y0}Z`, fill: sr.color, 'data-tip': `${r[cat]} ${sr.label}: ${fmt(v)}` }));
          acc += v;
        });
        if (tot > 0) out.push(s('text', { x: bx + bw2 / 2, y: y(tot) - 5, 'text-anchor': 'middle', class: 'ax strong' }, fmt(tot)));
        out.push(s('text', { x: L + i * gw + gw / 2, y: hh - 6, 'text-anchor': 'middle', class: 'ax' }, r[cat]));
      });
    } else rows.forEach((r, i) => {
      const x0 = L + i * gw + (gw - bw * series.length - 2 * (series.length - 1)) / 2;
      series.forEach((sr, j) => {
        const v = r[sr.key], top = y(v), bx = x0 + j * (bw + 2);
        if (v > 0) out.push(s('path', { d: `M${bx} ${y(0)}V${top + 3}q0 -3 3 -3h${bw - 6}q3 0 3 3V${y(0)}Z`, fill: sr.color, 'data-tip': `${r[cat]} ${sr.label}: ${fmt(v)}` }));
      });
      out.push(s('text', { x: L + i * gw + gw / 2, y: hh - 6, 'text-anchor': 'middle', class: 'ax' }, r[cat]));
    });
    let kx = L;
    const key = series.map((sr) => { const g = s('g', { transform: `translate(${kx} 4)` }, s('rect', { width: 10, height: 10, rx: 2, fill: sr.color }), s('text', { x: 14, y: 9, class: 'ax' }, sr.label)); kx += 26 + sr.label.length * 6; return g; });
    const _unused = series.map((sr, j) => s('g', { transform: `translate(${L + j * 92} 4)` }, s('rect', { width: 10, height: 10, rx: 2, fill: sr.color }), s('text', { x: 14, y: 9, class: 'ax' }, sr.label)));
    return s('svg', { class: 'chart', viewBox: `0 0 ${w} ${hh}`, width: '100%', role: 'img', 'aria-label': series.map((x) => x.label).join(', ') + ' by ' + cat }, out, key);
  }

  /** Small horizontal bar with value. */
  function meter(frac, color = C.c1) { return h('span.meter', h('span', { style: { width: Math.max(0, Math.min(1, frac)) * 100 + '%', background: color } })); }

  /** Change against last month. */
  function delta(now, before, { good = 'down', fmt = (v) => v } = {}) {
    const d = now - before; if (!d) return h('span.delta.flat', '– no change');
    const up = d > 0, ok = (good === 'down') ? !up : up;
    return h('span.delta', { class: ok ? 'ok' : 'bad' }, (up ? '▲ ' : '▼ ') + fmt(Math.abs(d)) + ' vs last month');
  }

  // ---------- panel shell ----------
  /**
   * shell({ mode: 'lead'|'smo', nav: [[key,label,badge]], cur, title, sub, render })
   * Narrow widths: nav becomes a drawer, as in the add-in.
   */
  function shell(o) {
    const nav = h('nav.nav', { 'aria-label': 'Screens' },
      o.navTitle ? h('div.nav-group', o.navTitle) : null,
      o.nav.map(([k, label, badge]) => k.startsWith('—') ? h('div.nav-group', label)
        : h('a.nav-item', { href: '#' + k, 'aria-current': o.cur === k ? 'page' : null }, h('span', label), badge ? h('span.nav-badge', badge) : null)),
      h('div.nav-foot', o.foot || ''));
    const scrim = h('div.scrim', { onclick: () => nav.classList.remove('open') });
    const top = h('header.top',
      h('button.menu-btn', { type: 'button', onclick: () => nav.classList.toggle('open'), 'aria-label': 'Menu' }, '☰'),
      h('div.brand', h('div.brand-mark', logo()), h('div.brand-text', h('div.brand-name', o.brand || 'SMO Hub'), h('div.brand-sub', o.sub || D.meta.programme))),
      h('div.top-right', o.topRight || h('span.top-period', 'Reporting ' + fmonth(D.meta.rd))));
    const main = h('main.main');
    document.body.textContent = '';
    document.body.append(h('div.app', { class: 'mode-' + o.mode }, top, h('div.body', nav, scrim, main)));
    return main;
  }
  function logo() {
    return s('svg', { viewBox: '0 0 24 24', width: 18, height: 18, 'aria-hidden': 'true' },
      s('rect', { x: 3, y: 3, width: 8, height: 8, rx: 1.5, fill: '#003A70' }), s('rect', { x: 13, y: 3, width: 8, height: 8, rx: 1.5, fill: '#007BFF' }),
      s('rect', { x: 3, y: 13, width: 8, height: 8, rx: 1.5, fill: '#007BFF' }), s('rect', { x: 13, y: 13, width: 8, height: 8, rx: 1.5, fill: '#003A70' }));
  }
  function router(routes, def) {
    const go = () => { const k = (location.hash || '#' + def).slice(1).split('?')[0]; (routes[k] || routes[def])(k); window.scrollTo(0, 0); };
    addEventListener('hashchange', go); go();
  }
  function toast(text) {
    const t = h('div.toast', { role: 'status' }, text); document.body.append(t);
    requestAnimationFrame(() => t.classList.add('show')); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, Math.max(5000, 1800 + text.length * 45));
  }
  function modal(title, body, actions) {
    const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) back.remove(); } },
      h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('h2', title), body, h('div.modal-foot', actions(() => back.remove()))));
    document.body.append(back); return back;
  }
  function chip(text, cls) { return h('span.chip', { class: cls || ragClass(text) }, text); }
  function skeleton(lines = 3) { return h('div.card.skel', Array.from({ length: lines }, (_, i) => h('div.skel-line', { style: { width: [70, 92, 55, 80][i % 4] + '%' } }))); }

  /** Send something to the SMO through whichever data source the page has (demo, Graph or the add-in). */
  async function submit(kind, payload) {
    const src = window.SOURCE;
    if (!src) return { ok: true, where: 'demo (nothing sent)' };
    return src.submit(kind, payload);
  }

  window.K = { submit, D, h, s, C, fdate, fshort, fmonth, fmon, ftime, money, mshort, pct, days, ws, tsa, ragClass, spark, ring, donut, ragDots, stackBar, burndown, columns, meter, delta, shell, router, toast, modal, chip, skeleton };
})();
