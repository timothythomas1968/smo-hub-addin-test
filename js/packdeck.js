// The governance pack as editable PowerPoint slides (Tim, 6 Nov 2026: every pack has a PowerPoint button beside Print).
// Built from the same figures as the pack on screen (pack.js records them as it draws), in direction B, as in the sample
// deck Tim approved (design/samples/Governance pack slides (sample).pptx): navy band, big numbers, white space.
import { Deck, W, H } from './pptx.js?v=0.10.2.20261111182242';
import { team } from './util.js?v=0.10.2.20261111182242';

const NAVY = '003A70', INK = '212529', MUTED = '5A6573', ONNAVY = '8FB3DA', LINE = 'D5DCE5';
const RAG = { Green: ['E3F4E8', '1B5E36'], Amber: ['FFF1D6', '7A4A00'], Red: ['FDE3E1', '8E1B1B'] };
const ROWS_PER_SLIDE = 9;

export async function packDeck(model) {
  const d = new Deck({ title: `${model.forum} pack ${model.period}`, author: model.office });
  const logoSize = await imageSize(model.logo);
  const foot = (s, page) => s.text(1.5, H - 1.1, W - 3, 0.7, `${model.prog} · ${model.forum} · ${model.period} pack · as at ${model.asAt} · prepared by ${model.office} with TransitionSuite${page ? ' · ' + page : ''}`, { size: 8, color: MUTED });
  const band = (s, eyebrow, title, h = 3.4) => {
    s.rect(0, 0, W, h, { fill: NAVY, line: null });
    s.text(1.5, 0.7, W - 3, 0.6, eyebrow.toUpperCase(), { size: 10, bold: true, color: ONNAVY });
    s.text(1.5, 1.3, W - 9, h - 1.5, title, { size: 24, bold: true, color: 'FFFFFF' });
    if (model.logo) { s.rect(W - 6.6, 0.6, 5.1, 2.2, { fill: 'FFFFFF', line: null, round: true }); s.image(W - 6.3, 0.8, 4.5, 1.8, model.logo, logoSize); }
  };
  let page = 0;
  const next = () => { page++; return d.slide(); };

  // 1. Title
  {
    const s = next();
    s.rect(0, 0, W, H, { fill: NAVY, line: null });
    s.text(2, 2, W - 4, 0.8, (model.shared ? `Shared with ${model.theirs || 'the other party'}` : 'Internal · confidential').toUpperCase(), { size: 12, bold: true, color: ONNAVY });
    s.text(2, 5.2, W - 4, 2.4, model.forum, { size: 40, bold: true, color: 'FFFFFF' });
    s.text(2, 7.8, W - 4, 1.2, `${model.prog} · ${model.period} pack`, { size: 20, color: 'C4D3E6' });
    s.text(2, 9.2, W - 4, 1, `Data as at ${model.asAt}`, { size: 14, color: 'C4D3E6' });
    s.text(2, H - 3, W - 4, 1.4, [[[model.ours || '', { bold: true, color: 'FFFFFF', size: 14 }]], [[model.office || '', { color: 'C4D3E6', size: 12 }]]], {});
    if (model.logo) { s.rect(W - 8, H - 3.6, 6, 2.4, { fill: 'FFFFFF', line: null, round: true }); s.image(W - 7.6, H - 3.4, 5.2, 2, model.logo, logoSize); }
  }

  // 2. Summary: the tiles and the team's commentary
  {
    const s = next();
    band(s, `${model.period} at a glance`, 'Summary');
    const tw = (W - 3 - 3 * 0.6) / 4;
    model.tiles.forEach(([label, value], i) => {
      const x = 1.5 + i * (tw + 0.6), y = 4.4;
      const rag = RAG[value];
      s.rect(x, y, tw, 3.4, { fill: rag ? rag[0] : 'FFFFFF', line: LINE, round: true });
      s.text(x + 0.4, y + 0.3, tw - 0.8, 0.6, label.toUpperCase(), { size: 9, bold: true, color: MUTED });
      s.text(x + 0.4, y + 1.0, tw - 0.8, 1.8, String(value), { size: 28, bold: true, color: rag ? rag[1] : INK });
    });
    if (model.commentary) {
      s.rect(1.5, 8.6, W - 3, H - 10.4, { fill: 'E6EEF7', line: null });
      s.rect(1.5, 8.6, 0.15, H - 10.4, { fill: NAVY, line: null });
      s.text(2.1, 8.9, W - 4.2, 0.6, `FROM ${team().toUpperCase()}`, { size: 9, bold: true, color: NAVY });
      s.text(2.1, 9.6, W - 4.2, H - 11.6, model.commentary, { size: 14, color: INK });
    }
    foot(s, page);
  }

  // 3. One slide (or more) per section
  for (const sec of model.sections) {
    if (sec.status) {   // workstream status: a RAG table, with the path to green under amber and red
      const rows = sec.status;
      for (let i = 0; i < Math.max(1, rows.length); i += 7) {
        const s = next();
        band(s, sec.src || '', sec.title + (rows.length > 7 ? ` (${i / 7 + 1} of ${Math.ceil(rows.length / 7)})` : ''));
        const body = rows.slice(i, i + 7).map((r) => [{ t: r.ws, bold: true }, ragCell(r.rag), r.text + (r.path ? `\nPath to green: ${r.path}` : '')]);
        if (body.length) s.table(1.5, 4.2, [7, 2.4, W - 3 - 9.4], [['Workstream', 'Status', 'Summary'], ...body], { size: 10, rowH: 1.55 });
        else s.text(1.5, 4.4, W - 3, 1, 'No workstream status for this month yet.', { size: 14, color: MUTED });
        foot(s, page);
      }
      continue;
    }
    if (sec.fees) {   // TSA fees: the years as a table and the quarters as a native chart (Edit Data in PowerPoint)
      const s = next();
      band(s, sec.src || '', sec.title);
      const f = sec.fees, m = (v) => money(v, f.sym);
      s.table(1.5, 4.2, [3, 5.2, 5.2], [['Year', 'Forward fees (we pay)', 'Reverse fees (we receive)'], ...f.years.map(([y, a, b]) => [y, { t: m(a), align: 'r' }, { t: m(b), align: 'r' }])], { size: 11, rowH: 0.9 });
      s.chart(15.6, 4.0, W - 17.1, H - 6, { cats: f.quarters.map((q) => q[0]), stacked: true, numFmt: `"${f.sym}"#,##0,"k"`,
        series: [{ name: 'Forward fees to date', values: f.quarters.map((q) => Math.round(q[1])), color: NAVY }, { name: 'Forward fees forecast', values: f.quarters.map((q) => Math.round(q[2])), color: 'AAB8C9' }] });
      foot(s, page);
      continue;
    }
    // tables and notes, split across slides so nothing is squeezed
    const chunks = [];
    let notes = [];
    for (const it of sec.items) {
      if (it.text) { notes.push(it.text); continue; }
      if (!it.rows.length) { notes.push(it.empty || 'Nothing to report.'); continue; }
      for (let i = 0; i < it.rows.length; i += ROWS_PER_SLIDE) { chunks.push({ heads: it.heads, rows: it.rows.slice(i, i + ROWS_PER_SLIDE), notes }); notes = []; }
    }
    if (notes.length) { if (chunks.length) chunks[chunks.length - 1].after = notes; else chunks.push({ notes }); }
    chunks.forEach((c, k) => {
      const s = next();
      band(s, sec.src || '', sec.title + (chunks.length > 1 ? ` (${k + 1} of ${chunks.length})` : ''));
      let y = 4.2;
      if (c.notes && c.notes.length) { s.text(1.5, y, W - 3, 0.9 * c.notes.length, c.notes.join('\n'), { size: 13, color: INK }); y += 0.9 * c.notes.length + 0.3; }
      if (c.heads) {
        const widths = colWidths(c.heads, c.rows, W - 3);
        const body = c.rows.map((r) => r.map((x, i) => (x.rag ? ragCell(x.t) : { t: x.t, align: c.heads[i].endsWith(' ') ? 'r' : null })));
        s.table(1.5, y, widths, [c.heads.map((x) => x.trim()), ...body], { size: 11, rowH: 1.0 });
        y += 1.0 * (c.rows.length + 1) + 0.4;
      }
      if (c.after) s.text(1.5, Math.min(y, H - 2.6), W - 3, 1.2, c.after.join('\n'), { size: 11, color: MUTED });
      foot(s, page);
    });
  }
  return d.blob();
}

function ragCell(v) { const r = RAG[v]; return r ? { t: v, fill: r[0], color: r[1], bold: true } : { t: v || '–' }; }
function money(v, sym) { return sym + Math.round(Number(v) || 0).toLocaleString('en-GB'); }

// Share the width by how much text each column holds; IDs and dates stay narrow, descriptions get the room.
function colWidths(heads, rows, total) {
  const len = heads.map((hd, i) => Math.min(60, Math.max(hd.length, ...rows.map((r) => String((r[i] && r[i].t) || '').length))));
  const want = len.map((l) => Math.max(2.4, Math.sqrt(l) * 1.6));
  const k = total / want.reduce((a, b) => a + b, 0);
  return want.map((w) => w * k);
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
