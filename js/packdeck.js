// The governance pack as editable PowerPoint slides (Tim, 6 Nov 2026: every pack has a PowerPoint button beside Print;
// 12 Nov 2026: polish them, since most reports reach management as slides in a wider forum pack).
// Built from the same figures as the pack on screen (pack.js records them as it draws), in direction B: a navy band, big numbers,
// white space. Every content slide leads with its message, a sentence worked out from the figures, like a consultant's action title;
// the evidence (cards, tables, a chart) sits below it. Everything stays native and editable: text, shapes, tables, charts.
import { Deck, W, H } from './pptx.js?v=0.11.2.20261112223532';
import { team, ed } from './util.js?v=0.11.2.20261112223532';
import { mshort } from './screens/health.js?v=0.11.2.20261112223532';

const NAVY = '003A70', NAVY2 = '0B4A87', INK = '212529', MUTED = '5A6573', HEAD = '3A4250', ONNAVY = 'C4D3E6', EYEBROW = '8FB8E6';
const LINE = 'D5DCE5', SOFT = 'ECEFF3', BAND = 'F7F9FC', SEL = 'E6EEF7', BLUE = '007BFF';
const RAG = { Green: ['E3F4E8', '1B5E36', '3AA265'], Amber: ['FFF1D6', '7A4A00', 'E0A030'], Red: ['FDE3E1', '8E1B1B', 'D9534F'] };
const ORDER = { Red: 0, Amber: 1, Green: 2 };
const L = 1.6, R = W - 1.6, CW = R - L;          // margins and content width (cm)
const TOP = 4.35, BOTTOM = H - 1.55;             // the content area, between the message and the footer
const PT = 0.03528;                              // cm per point

export async function packDeck(model) {
  const d = new Deck({ title: `${model.forum} pack ${model.period}`, author: model.office });
  const logoSize = await imageSize(model.logo);
  const conf = model.shared ? `Shared with ${model.theirs || 'the other party'}` : 'Internal · confidential';
  const slides = [];   // [slide, title] for the contents page
  let page = 0;

  const footer = (s) => {
    s.rect(L, H - 1.2, CW, 0.02, { fill: LINE, line: null });
    s.text(L, H - 1.1, CW - 8, 0.7, `${model.prog} · ${model.forum} · ${model.period}`, { size: 9, color: MUTED });
    s.text(R - 8, H - 1.1, 6.9, 0.7, conf, { size: 9, bold: true, color: model.shared ? NAVY2 : RAG.Red[1], align: 'r' });
    s.text(R - 1, H - 1.1, 1, 0.7, String(page), { size: 9, bold: true, color: NAVY, align: 'r' });
  };
  // A content slide: a slim navy band with the section's source and title, the message below it, the footer.
  const content = (eyebrow, title, message) => {
    const s = d.slide(); page++;
    s.rect(0, 0, W, 2.55, { fill: NAVY, line: null });
    s.rect(0, 2.55, W, 0.08, { fill: BLUE, line: null });
    s.text(L, 0.5, CW - 7, 0.6, String(eyebrow || '').toUpperCase(), { size: 9, bold: true, color: EYEBROW });
    s.text(L, 1.0, CW - 7, 1.3, title, { size: 24, bold: true, color: 'FFFFFF' });
    if (model.logo) { s.rect(R - 5.2, 0.45, 5.2, 1.65, { fill: 'FFFFFF', line: null, round: true }); s.image(R - 5.0, 0.6, 4.8, 1.35, model.logo, logoSize); }
    else s.text(R - 7, 1.0, 7, 0.8, model.ours || '', { size: 11, bold: true, color: ONNAVY, align: 'r' });
    if (message) s.text(L, 2.95, CW, 1.2, message, { size: 15, bold: true, color: NAVY });
    footer(s);
    slides.push([s, title, page]);
    return s;
  };

  // ---------- 1. Title
  {
    const s = d.slide(); page++;
    s.rect(0, 0, W, H, { fill: NAVY, line: null });
    s.rect(0, 0, 0.5, H, { fill: BLUE, line: null });
    s.text(2.4, 2.2, W - 5, 0.8, conf.toUpperCase(), { size: 12, bold: true, color: EYEBROW });
    s.text(2.4, 4.6, W - 5, 2.6, model.forum, { size: 44, bold: true, color: 'FFFFFF' });
    s.text(2.4, 7.4, W - 5, 1.2, `${model.period} pack`, { size: 24, color: 'FFFFFF' });
    s.text(2.4, 8.7, W - 5, 1.0, model.prog, { size: 16, color: ONNAVY });
    s.rect(2.4, 10.3, 6, 0.05, { fill: EYEBROW, line: null });
    s.text(2.4, 10.7, W - 5, 0.9, `Data as at ${model.asAt}`, { size: 13, color: ONNAVY });
    s.text(2.4, H - 3.4, 16, 1.6, [[[model.ours || '', { bold: true, color: 'FFFFFF', size: 15 }]], [[model.office || '', { color: ONNAVY, size: 12 }]]], {});
    if (model.logo) { s.rect(W - 8.4, H - 3.8, 6.2, 2.4, { fill: 'FFFFFF', line: null, round: true }); s.image(W - 8.0, H - 3.6, 5.4, 2, model.logo, logoSize); }
  }

  // ---------- 2. Contents (filled in at the end, once the page numbers are known)
  const contents = d.slide(); page++;

  // ---------- 3. At a glance: the tiles, the workstreams by RAG, the team's message
  {
    const st = model.sections.find((x) => x.status);
    const cnt = { Red: 0, Amber: 0, Green: 0 };
    if (st) st.status.filter((r) => !isProg(r)).forEach((r) => { if (cnt[r.rag] != null) cnt[r.rag]++; });
    const overall = (model.tiles.find(([l]) => l === 'Overall') || [])[1];
    const msg = ed(overall && RAG[overall] ? `The programme is ${overall.toLowerCase()} overall` + (st ? `. Workstreams: ${cnt.Red} red, ${cnt.Amber} amber, ${cnt.Green} green` : '') + '.' : `${model.period} at a glance.`);
    const s = content(`${model.period} at a glance`, 'Summary', msg);
    const n = model.tiles.length, gap = 0.6, tw = (CW - gap * (n - 1)) / n;
    model.tiles.forEach(([label, value], i) => {
      const x = L + i * (tw + gap), y = TOP + 0.2, rag = RAG[value];
      s.rect(x, y, tw, 3.2, { fill: rag ? rag[0] : 'FFFFFF', line: rag ? null : LINE, round: true });
      s.rect(x, y, 0.18, 3.2, { fill: rag ? rag[2] : NAVY, line: null });
      s.text(x + 0.6, y + 0.35, tw - 0.9, 0.6, label.toUpperCase(), { size: 9, bold: true, color: MUTED });
      s.text(x + 0.6, y + 1.05, tw - 0.9, 1.8, String(value), { size: String(value).length > 10 ? 24 : 30, bold: true, color: rag ? rag[1] : INK });
    });
    let y = TOP + 4.0;
    if (st && st.status.length) {   // the workstreams by RAG, as a bar you can read at a glance
      const tot = cnt.Red + cnt.Amber + cnt.Green || 1;
      s.text(L, y, 8, 0.6, 'WORKSTREAMS BY STATUS', { size: 9, bold: true, color: MUTED });
      let x = L + 8;
      ['Red', 'Amber', 'Green'].forEach((k) => {
        const w = (CW - 8) * cnt[k] / tot; if (!w) return;
        s.rect(x, y, w, 0.6, { fill: RAG[k][2], line: null });
        if (w > 1.6) s.text(x, y - 0.02, w, 0.62, `${cnt[k]} ${k.toLowerCase()}`, { size: 10, bold: true, color: 'FFFFFF', align: 'ctr', anchor: 'ctr' });
        x += w;
      });
      y += 1.2;
    }
    // the team's message on the left; the decisions this forum must take on the right (Tim, 12 Nov 2026), so they are seen first
    const decSec = model.sections.find((x) => x.title === 'Decisions needed');
    const decT = decSec && decSec.items.find((it) => it.heads);
    const decs = decT ? decT.rows : null;
    const hgt = BOTTOM - y - 0.2, dw = decs && model.commentary ? 12.4 : decs ? CW : 0, cw2 = CW - (dw ? dw + (model.commentary ? 0.6 : 0) : 0);
    if (model.commentary) {
      s.rect(L, y, cw2, hgt, { fill: SEL, line: null });
      s.rect(L, y, 0.18, hgt, { fill: NAVY, line: null });
      s.text(L + 0.6, y + 0.3, cw2 - 1.2, 0.6, `FROM ${team().toUpperCase()}`, { size: 9, bold: true, color: NAVY });
      s.text(L + 0.6, y + 0.95, cw2 - 1.2, hgt - 1.2, model.commentary, { size: model.commentary.length > (dw ? 360 : 520) ? 12 : 14, color: INK });
    }
    if (decs) {
      const x = R - dw, hd = decT.heads.map((h) => h.trim()), at = (r, nm) => (hd.indexOf(nm) >= 0 && r[hd.indexOf(nm)] ? r[hd.indexOf(nm)].t : '');
      s.rect(x, y, dw, hgt, { fill: 'FFFFFF', line: LINE });
      s.rect(x, y, dw, 0.08, { fill: RAG.Amber[2], line: null });
      s.text(x + 0.5, y + 0.3, dw - 1, 0.6, `DECISIONS NEEDED FROM THIS FORUM (${decs.length})`, { size: 9, bold: true, color: RAG.Amber[1] });
      if (!decs.length) s.text(x + 0.5, y + 1.0, dw - 1, 1.2, decT.empty || 'No decisions are waiting for this forum.', { size: 12, color: MUTED });
      const show = decs.slice(0, 4), rowH = Math.min(1.6, (hgt - 1.6) / Math.max(1, show.length));
      show.forEach((r, i) => {
        const yy = y + 1.0 + i * rowH;
        if (i) s.rect(x + 0.5, yy - 0.08, dw - 1, 0.02, { fill: SOFT, line: null });
        s.text(x + 0.5, yy, dw - 1, rowH - 0.1, [[[clip(at(r, 'Decision needed'), 90), { size: 12, bold: true, color: INK }]],
          [[[at(r, 'ID'), at(r, 'Needed by') && `needed by ${at(r, 'Needed by')}`, at(r, 'Owner')].filter(Boolean).join(' · '), { size: 10, color: MUTED }]]], { size: 12 });
      });
      if (decs.length > 4) s.text(x + 0.5, y + hgt - 0.8, dw - 1, 0.6, `and ${decs.length - 4} more: see Decisions needed`, { size: 10, color: MUTED });
    }
  }

  // ---------- 4. The sections
  for (const sec of model.sections) {
    if (sec.status) { statusSlides(sec); continue; }
    if (sec.fees) { feesSlide(sec); continue; }
    tableSlides(sec);
  }

  // Workstream status: one card per workstream, red first, the path to green under amber and red
  function statusSlides(sec) {
    const rows = [...sec.status].sort((a, b) => (ORDER[a.rag] ?? 3) - (ORDER[b.rag] ?? 3));
    const ws = rows.filter((r) => !isProg(r)), prog = rows.find(isProg);
    const cnt = { Red: 0, Amber: 0, Green: 0 }; ws.forEach((r) => { if (cnt[r.rag] != null) cnt[r.rag]++; });
    const red = ws.filter((r) => r.rag === 'Red').map((r) => r.ws);
    const noPath = ws.filter((r) => ['Red', 'Amber'].includes(r.rag) && !r.path).length;
    const msg = ed(!rows.length ? 'No workstream status for this month yet.'
      : (prog && RAG[prog.rag] ? `Programme ${prog.rag.toLowerCase()}; workstreams ` : 'Workstreams ') + `${cnt.Red} red, ${cnt.Amber} amber, ${cnt.Green} green.`
        + (red.length ? ` ${listOf(red)} ${red.length === 1 ? 'needs' : 'need'} the forum's attention.` : noPath ? ` ${noPath} amber without a path to green yet.` : cnt.Amber ? ' Every amber workstream has a path to green.' : ''));
    const PER = 8, cols = 2, gap = 0.5, cw = (CW - gap) / cols, ch = (BOTTOM - TOP - gap * 3) / 4;
    for (let i = 0; i < Math.max(1, rows.length); i += PER) {
      const part = rows.length > PER ? ` (${i / PER + 1} of ${Math.ceil(rows.length / PER)})` : '';
      const s = content(sec.src, sec.title + part, i === 0 ? msg : 'Continued.');
      rows.slice(i, i + PER).forEach((r, k) => {
        const x = L + (k % cols) * (cw + gap), y = TOP + Math.floor(k / cols) * (ch + gap), c = RAG[r.rag] || [SOFT, HEAD, 'AAB8C9'];
        s.rect(x, y, cw, ch, { fill: 'FFFFFF', line: LINE });
        s.rect(x, y, 0.22, ch, { fill: c[2], line: null });
        s.text(x + 0.5, y + 0.12, cw - 3.4, 0.75, r.ws, { size: 12, bold: true, color: INK });
        s.rect(x + cw - 2.6, y + 0.22, 2.3, 0.6, { fill: c[0], line: null, round: true });
        s.text(x + cw - 2.6, y + 0.2, 2.3, 0.64, r.rag || '–', { size: 9.5, bold: true, color: c[1], align: 'ctr', anchor: 'ctr' });
        const body = [[[clip(r.text, r.path ? 140 : 230), { size: 11, color: HEAD }]]];
        if (r.path) body.push([['Path to green: ', { size: 11, bold: true, color: RAG.Amber[1] }], [clip(r.path, 130), { size: 11, color: RAG.Amber[1] }]]);
        s.text(x + 0.5, y + 0.85, cw - 0.8, ch - 0.95, body, { size: 11 });
      });
    }
  }

  // TSA fees: the message, the years as tiles and a table, the quarters as a native chart (Edit Data in PowerPoint)
  function feesSlide(sec) {
    const f = sec.fees, m = (v) => money(v, f.sym), sh = (v) => mshort(Number(v) || 0, f.sym);
    const yrs = f.years.filter(([, a, b]) => a || b);
    const msg = yrs.length ? `Forward fees forecast ${yrs.map(([y, a]) => `${sh(a)} in ${y}`).join(' and ')}` + (yrs.some(([, , b]) => b) ? `; we receive ${sh(yrs.reduce((t, [, , b]) => t + (Number(b) || 0), 0))} for reverse services.` : '.') : 'No TSA fees recorded yet.';
    const s = content(sec.src, sec.title, msg);
    const lw = 11.6;
    yrs.slice(0, 3).forEach(([y, a], i) => {
      const yy = TOP + i * 2.15;
      s.rect(L, yy, lw, 1.85, { fill: 'FFFFFF', line: LINE, round: true });
      s.rect(L, yy, 0.18, 1.85, { fill: NAVY, line: null });
      s.text(L + 0.6, yy + 0.2, lw - 1, 0.55, `${y} · FORWARD FEES (WE PAY)`, { size: 9, bold: true, color: MUTED });
      s.text(L + 0.6, yy + 0.7, lw - 1, 1.0, m(a), { size: 22, bold: true, color: INK });
    });
    const ty = TOP + Math.min(3, yrs.length) * 2.15 + 0.2;
    if (ty + 0.9 * (f.years.length + 1) < BOTTOM)
      s.table(L, ty, [2.6, 4.5, 4.5], [['Year', 'We pay', 'We receive'], ...f.years.map(([y, a, b], i) => [y, { t: m(a), align: 'r', fill: i % 2 ? BAND : null }, { t: m(b), align: 'r', fill: i % 2 ? BAND : null }])], { size: 11, rowH: 0.8 });
    const cx = L + lw + 0.9, cwid = R - cx;
    s.text(cx, TOP - 0.1, cwid, 0.6, 'FORWARD FEES BY QUARTER', { size: 9, bold: true, color: MUTED });
    s.chart(cx, TOP + 0.5, cwid, BOTTOM - TOP - 0.6, { cats: f.quarters.map((q) => q[0]), stacked: true, numFmt: `"${f.sym}"#,##0,"k"`,
      series: [{ name: 'Invoiced or to date', values: f.quarters.map((q) => Math.round(q[1])), color: NAVY }, { name: 'Forecast', values: f.quarters.map((q) => Math.round(q[2])), color: 'AAB8C9' }] });
  }

  // Tables and notes, split across slides by the room the rows need, so nothing is squeezed or runs off the slide
  function tableSlides(sec) {
    const msg = message(sec);
    const notes = sec.items.filter((it) => it.text).map((it) => it.text).filter((t) => ed(t) !== msg);
    const tables = sec.items.filter((it) => it.heads);
    const pages = [];
    let cur = { blocks: [], y: TOP };
    const fresh = () => { if (cur.blocks.length) pages.push(cur); cur = { blocks: [], y: TOP }; };
    // the notes that explain a table (definitions, counts) go under it, small; a section of notes only gets them as its body
    tables.forEach((t) => {
      if (!t.rows.length) { cur.blocks.push({ empty: t.empty || 'Nothing to report.' }); cur.y += 1; return; }
      const widths = colWidths(t.heads, t.rows, CW);
      const heights = t.rows.map((r) => rowHeight(r, widths, 11));
      let i = 0;
      while (i < t.rows.length) {
        let room = BOTTOM - cur.y - 0.85 - 0.9, j = i, used = 0;
        while (j < t.rows.length && used + heights[j] <= room) { used += heights[j]; j++; }
        if (j === i) { if (cur.blocks.length) { fresh(); continue; } j = i + 1; used = heights[i]; }   // one very tall row: give it a slide
        cur.blocks.push({ heads: t.heads, rows: t.rows.slice(i, j), widths, hs: heights.slice(i, j) });
        cur.y += 0.85 + used + 0.5;
        i = j;
        if (i < t.rows.length) fresh();
      }
    });
    if (cur.blocks.length || !pages.length) pages.push(cur);
    pages.forEach((pg, k) => {
      const part = pages.length > 1 ? ` (${k + 1} of ${pages.length})` : '';
      const s = content(sec.src, sec.title + part, k === 0 ? msg : 'Continued.');
      let y = TOP;
      if (!tables.length && notes.length) {   // a section of notes only (Day 1 and first 100 days)
        notes.forEach((t) => { s.rect(L, y, CW, 1.6, { fill: SEL, line: null }); s.rect(L, y, 0.18, 1.6, { fill: NAVY, line: null }); s.text(L + 0.6, y + 0.3, CW - 1, 1.1, t, { size: 15, color: INK, anchor: 'ctr' }); y += 2.0; });
        return;
      }
      pg.blocks.forEach((b) => {
        if (b.empty) { s.text(L, y, CW, 0.9, b.empty, { size: 14, color: MUTED }); y += 1; return; }
        const body = b.rows.map((r, ri) => r.map((x, ci) => {
          const band = ri % 2 ? BAND : null;
          if (x.rag && RAG[x.rag]) return { t: x.t, fill: RAG[x.rag][0], color: RAG[x.rag][1], bold: true };
          return { t: x.t, fill: band, align: b.heads[ci].endsWith(' ') ? 'r' : null, bold: ci === 0, color: ci === 0 ? NAVY : INK };
        }));
        s.table(L, y, b.widths, [b.heads.map((x) => x.trim()), ...body], { size: 11, rowH: 0.85, head: NAVY, heights: [0.85, ...b.hs] });
        y += 0.85 + b.hs.reduce((a, c) => a + c, 0) + 0.5;
      });
      if (k === pages.length - 1 && notes.length && y < BOTTOM - 0.6)
        s.text(L, y, CW, BOTTOM - y, notes.map((t) => [[t, { size: 10, color: MUTED }]]), { size: 10 });
    });
  }

  // ---------- the contents page, now the page numbers are known
  {
    const s = contents;
    s.rect(0, 0, W, H, { fill: 'FFFFFF', line: null });
    s.rect(0, 0, 11.2, H, { fill: NAVY, line: null });
    s.text(1.8, 2.0, 8.4, 0.7, `${model.period} PACK`, { size: 11, bold: true, color: EYEBROW });
    s.text(1.8, 2.8, 8.4, 3, 'Contents', { size: 36, bold: true, color: 'FFFFFF' });
    s.text(1.8, H - 3.3, 8.4, 1.6, [[[model.forum, { bold: true, color: 'FFFFFF', size: 13 }]], [[model.prog, { color: ONNAVY, size: 11 }]]], {});
    const seen = new Set(), list = [];
    slides.forEach(([, t, p]) => { const base = t.replace(/ \(\d+ of \d+\)$/, ''); if (!seen.has(base)) { seen.add(base); list.push([base, p]); } });
    const per = Math.ceil(list.length / (list.length > 9 ? 2 : 1)), colW = list.length > 9 ? 10 : 18;
    list.forEach(([t, p], i) => {
      const x = 13 + Math.floor(i / per) * (colW + 0.8), y = 2.2 + (i % per) * 1.45;
      s.text(x, y, 1.4, 1.0, String(i + 1).padStart(2, '0'), { size: 16, bold: true, color: BLUE });
      s.text(x + 1.5, y, colW - 3.2, 1.0, t, { size: 15, color: INK });
      s.text(x + colW - 1.7, y, 1.5, 1.0, String(p), { size: 13, color: MUTED, align: 'r' });
      s.rect(x, y + 1.08, colW, 0.02, { fill: SOFT, line: null });
    });
    s.text(13, H - 1.1, W - 14.6, 0.7, conf, { size: 9, bold: true, color: model.shared ? NAVY2 : RAG.Red[1], align: 'r' });
  }

  return d.blob();
}

// ---------------------------------------------------------------- the message on each slide, from its figures
function message(sec) {
  const t0 = sec.items.find((it) => it.heads && it.rows.length), rows = t0 ? t0.rows : [], heads = t0 ? t0.heads.map((x) => x.trim()) : [];
  const col = (name) => heads.indexOf(name), val = (r, name) => (col(name) >= 0 && r[col(name)] ? r[col(name)].t : '');
  const n = rows.length, notes = sec.items.filter((it) => it.text).map((it) => it.text);
  const empty = (sec.items.find((it) => it.heads && !it.rows.length) || {}).empty;
  return ed(pick());
  function pick() {
  switch (sec.title) {
    case 'Closing in the next 90 days': {
      if (!n) return empty || 'No services close in the next 90 days.';
      const notReady = rows.filter((r) => ['Red', 'Amber'].includes(val(r, 'Readiness'))).length;
      return `${n} ${n === 1 ? 'service closes' : 'services close'} in the next 90 days, the first on ${val(rows[0], 'Exit')}` + (notReady ? `; ${notReady} not yet ready to exit.` : '; all are ready to exit.');
    }
    case 'Top risks and issues': {
      const risks = rows.filter((r) => /^R-/.test(r[0].t)), iss = rows.filter((r) => /^I-/.test(r[0].t)), red = risks.filter((r) => val(r, 'Rating') === 'Red').length;
      if (!n) return empty || 'No red or amber risks and no open issues.';
      return `${risks.length} ${risks.length === 1 ? 'risk' : 'risks'} to watch${red ? `, ${red} rated red` : ''}, and ${iss.length} open ${iss.length === 1 ? 'issue' : 'issues'}.`;
    }
    case 'Decisions needed':
      return n ? `${n} ${n === 1 ? 'decision is' : 'decisions are'} needed from this forum` + (val(rows[0], 'Needed by') ? `, the first by ${val(rows[0], 'Needed by')}.` : '.') : (empty || 'No decisions are waiting for this forum.');
    case 'TSA changes and extensions':
      return n ? `${n} change ${n === 1 ? 'request is' : 'requests are'} waiting for a decision.` : (empty || 'No change requests are waiting for a decision.');
    case 'Data requests': {
      const late = rows.filter((r) => /days late/.test(val(r, 'Due'))).length;
      return n ? `${n} open data ${n === 1 ? 'request' : 'requests'}${late ? `, ${late} late` : ''}.` : (empty || 'No open data requests.');
    }
    case 'Service levels':
      return n ? `${n} ${n === 1 ? 'service' : 'services'} below standard in the latest month.` : (empty || 'Every service met its service levels.');
    case 'Obligations due': {
      const over = rows.filter((r) => /overdue/.test(val(r, 'Due'))).length;
      return n ? `${n} ${n === 1 ? 'obligation' : 'obligations'} due in the next 60 days${over ? `, ${over} overdue` : ''}.` : (empty || 'No obligations due in the next 60 days.');
    }
    case 'Vendor consents': return (notes[0] || (n ? `${n} consents outstanding.` : 'Every consent needed has been obtained.'));
    case 'Regulatory approvals': {
      const done = rows.filter((r) => /^Approved/.test(val(r, 'Status'))).length;
      return n ? `${done} of ${n} regulatory approvals in place; ${n - done} still to come.` : (empty || 'No regulatory approvals are needed.');
    }
    case 'Day 1 and first 100 days': return 'Progress on the Day 1 and First 100 days plans.';
    default: return n ? `${n} ${n === 1 ? 'item' : 'items'}.` : (empty || '');
  }
  }
}

// ---------------------------------------------------------------- helpers
function isProg(r) { return r.ws === ed('Programme') || r.ws === 'Programme'; }
function listOf(xs) { return xs.length <= 1 ? (xs[0] || '') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]; }
function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
function money(v, sym) { return sym + Math.round(Number(v) || 0).toLocaleString('en-GB'); }

// Share the width by how much text each column holds; IDs and dates stay narrow, descriptions get the room.
function colWidths(heads, rows, total) {
  const len = heads.map((hd, i) => Math.min(60, Math.max(hd.trim().length, ...rows.map((r) => String((r[i] && r[i].t) || '').length))));
  const want = len.map((l) => Math.max(2.6, Math.sqrt(l) * 1.6));
  const k = total / want.reduce((a, b) => a + b, 0);
  return want.map((w) => w * k);
}
// How tall a table row needs to be: the most lines any of its cells wraps to, at this text size.
function rowHeight(r, widths, size) {
  const charW = size * PT * 0.47;   // an average character is about half the font size wide
  const lines = Math.max(1, ...r.map((c, i) => String((c && c.t) || '').split('\n').reduce((a, ln) => a + Math.max(1, Math.ceil(ln.length * charW / Math.max(0.5, widths[i] - 0.45))), 0)));
  return Math.max(0.85, lines * size * PT * 1.22 + 0.32);
}

function imageSize(src) {
  return new Promise((res) => {
    if (!src) { res(null); return; }
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res(null);
    im.src = src;
  });
}
