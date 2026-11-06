// Consolidated WS Reporting (0.10 item 5): every workstream's status for a month, side by side, with a month picker.
// The reporting month comes from the workstream reports; earlier months are the stored history and are read-only.
// The sheet behind it is Consolidated WS Reporting (tblStatus).
import { h, fmtMonth, toast, ed, fromSerial, toSerial } from '../util.js?v=0.10.0.20261106213331';
import { buildForm } from '../form.js?v=0.10.0.20261106213331';

const T = 'tblStatus';
const ui = { period: null, sel: null };
const RANK = { Green: 1, Amber: 2, Red: 3 };
const mStart = (n) => { const d = fromSerial(n); return d ? toSerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))) : 0; };

export default {
  tables: [T, 'tblWorkstreams'],
  render(ctx) {
    const { store, go } = ctx;
    const n = store.names, RP = mStart(Number(n.RD) || 0);
    const wsName = Object.fromEntries(store.records('tblWorkstreams').map((r) => [r.get('Code'), r.get('Name')]));
    const all = store.records(T).filter((r) => (r.get('Scope') || 'Overall') === 'Overall');
    const periods = [...new Set(all.map((r) => mStart(Number(r.get('Period')))).filter(Boolean))].sort((a, b) => b - a);
    if (!periods.includes(RP)) periods.unshift(RP);
    if (!ui.period || !periods.includes(ui.period)) ui.period = RP;
    const cur = all.filter((r) => mStart(Number(r.get('Period'))) === ui.period);
    const prevP = periods[periods.indexOf(ui.period) + 1];
    const prev = Object.fromEntries(all.filter((r) => mStart(Number(r.get('Period'))) === prevP).map((r) => [r.get('Workstream'), r.get('RAG')]));
    const past = ui.period !== RP;
    const counts = { Red: 0, Amber: 0, Green: 0 };
    cur.forEach((r) => { if (counts[r.get('RAG')] != null) counts[r.get('RAG')]++; });
    let sel = cur.find((r) => r.i === ui.sel) || null;

    const picker = h('select.search', { 'aria-label': 'Month', style: { flex: '0 0 200px' } }, periods.map((p) => h('option', { value: String(p) }, fmtMonth(p) + (p === RP ? ' (this month)' : ''))));
    picker.value = String(ui.period);
    picker.addEventListener('change', () => { ui.period = Number(picker.value); ui.sel = null; ctx.rerender(); });

    const card = (r) => {
      const ws = r.get('Workstream'), rag = r.get('RAG'), p = prev[ws];
      const trend = !p || !RANK[rag] ? '' : RANK[rag] > RANK[p] ? '▼ worse' : RANK[rag] < RANK[p] ? '▲ better' : 'same';
      const line = (label, v) => (v ? h('div', { style: { marginTop: '6px' } }, h('div.small', { style: { fontWeight: 700, color: 'var(--heading)' } }, label), h('div.small', { style: { whiteSpace: 'pre-wrap' } }, v)) : null);
      return h('section.card', { class: sel && sel.i === r.i ? 'sel' : null, style: { borderTop: `4px solid ${rag === 'Red' ? 'var(--r-bar)' : rag === 'Amber' ? 'var(--a-bar)' : rag === 'Green' ? 'var(--g-bar)' : 'var(--line)'}`, cursor: past ? 'default' : 'pointer' },
        onclick: past ? null : () => { ui.sel = r.i; ctx.rerender(); } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
          h('b', { style: { flex: '1 1 auto', color: 'var(--navy)' } }, wsName[ws] || ws),
          trend ? h('span.small', { style: { color: trend.startsWith('▼') ? 'var(--r-fg)' : trend.startsWith('▲') ? 'var(--g-fg)' : 'var(--muted)' } }, trend) : null,
          h('span.chip', { class: rag || '' }, rag || '–')),
        line('Summary', r.get('Summary')),
        ['Amber', 'Red'].includes(rag) ? line('Path to green', r.get('Path to green')) : null,
        line('Help needed or escalations', r.get('Escalations')),
        past ? null : h('button.link-btn', { type: 'button', style: { marginTop: '8px' }, onclick: (e) => { e.stopPropagation(); go('report', { ws }); } }, 'Open the workstream report ›'));
    };

    const panel = !past && sel ? editPanel(ctx, sel) : null;
    return h('div.page',
      h('div.page-head',
        h('div', h('h1', 'Consolidated WS Reporting'), h('p.lede', ed('Every workstream\'s status for the month, in one place. It comes from the workstream reports; earlier months are kept as history and are read-only.'))),
        h('button.btn', { type: 'button', onclick: () => store.show(T, sel ? sel.i : null).catch((e) => toast(e.message, true)) }, 'Show in the worksheet')),
      h('div.filters', picker,
        h('span.chip.Red', `${counts.Red} red`), h('span.chip.Amber', `${counts.Amber} amber`), h('span.chip.Green', `${counts.Green} green`),
        past ? h('span.small.muted', `History: read-only. ${fmtMonth(RP)} is this month.`) : h('span.small.muted', prevP ? `Trend against ${fmtMonth(prevP)}` : '')),
      cur.length ? null : h('div.banner.info', past ? 'No status was stored for this month.' : 'No workstream status for this month yet: it fills in as the workstream reports come in.'),
      h('div.row-wrap', { style: { alignItems: 'flex-start' } },
        h('div', { style: { flex: '999 1 560px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', minWidth: 0 } }, cur.map(card)),
        panel));
  }
};

function editPanel(ctx, r) {
  const { store } = ctx;
  const form = buildForm(store, T, r, ['RAG', { h: 'Summary', full: true }, { h: 'Path to green', full: true }, { h: 'Escalations', full: true }, { h: 'Cost commentary', full: true }, { h: 'Shared summary', full: true }, 'Entered by']);
  const save = async () => {
    const ch = form.collect();
    if (!Object.keys(ch).length) { toast('Nothing changed'); return; }
    try { const k = await store.save(T, r.i, ch); toast(`Saved ${k} change${k === 1 ? '' : 's'} to the workbook`); ctx.rerender(); }
    catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  return h('aside.panel', { 'aria-label': 'Workstream status' },
    h('div.panel-head', h('span.panel-id', `${r.get('Workstream')} · ${fmtMonth(r.get('Period'))}`), h('h2.panel-title', 'Edit this month\'s status')),
    h('div.panel-body', form.el),
    h('div.panel-foot', h('button.btn.btn-primary', { type: 'button', onclick: save }, 'Save'),
      h('span.small.muted', { style: { flex: '1 1 100%' } }, 'Grey italic values come from the workstream report. Type over one to set the consolidated wording for the packs.')));
}
