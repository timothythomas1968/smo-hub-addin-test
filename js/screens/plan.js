// Exit plan: the Plan & Gantt register drawn as a Gantt chart, grouped by service, with an edit panel.
import { h, fmtDate, fromSerial, toSerial, MONTHS, toast } from '../util.js?v=0.8.0.20261030222058';
import { buildForm } from '../form.js?v=0.8.0.20261030222058';

const T = 'tblPlan';
const ui = { ws: '', q: '', open: null, sel: null, lateOnly: false, horizon: 12, exited: false };

export default {
  tables: [T, 'tblTSA', 'tblWorkstreams'],
  render(ctx) {
    const { store } = ctx;
    const RD = Number(store.names.RD) || 0;
    const tsa = Object.fromEntries(store.records('tblTSA').map((r) => [r.get('TSA ID'), r]));
    const wsName = Object.fromEntries(store.records('tblWorkstreams').map((r) => [r.get('Code'), r.get('Name')]));
    const all = store.records(T);
    const late = (r) => r.get('Status') !== 'Complete' && Number(r.get('Planned finish')) > 0 && Number(r.get('Planned finish')) < RD;
    // group by service, in plan order
    const groups = [];
    const byId = {};
    all.forEach((r) => {
      const id = r.get('TSA ID') || 'Programme';
      if (!byId[id]) { byId[id] = { id, rows: [] }; groups.push(byId[id]); }
      byId[id].rows.push(r);
    });
    const q = ui.q.toLowerCase();
    const shown = groups.filter((g) => {
      const t = tsa[g.id];
      if (ui.ws && (t ? t.get('Workstream') : g.rows[0].get('Workstream')) !== ui.ws) return false;
      if (q && !(g.id.toLowerCase().includes(q) || String(t ? t.get('Service name') : '').toLowerCase().includes(q) || g.rows.some((r) => String(r.get('Activity')).toLowerCase().includes(q) || String(r.get('Owner')).toLowerCase().includes(q)))) return false;
      if (ui.lateOnly && !g.rows.some(late)) return false;
      if (!ui.exited && t && ['Exited', 'Terminated'].includes(t.get('Status'))) return false;
      return true;
    }).sort((a, b) => (Number(tsa[a.id]?.get('Forecast exit date')) || 9e9) - (Number(tsa[b.id]?.get('Forecast exit date')) || 9e9));
    if (ui.open == null) ui.open = new Set(shown.filter((g) => g.rows.some(late) || (Number(tsa[g.id]?.get('Forecast exit date')) <= RD + 120 && Number(tsa[g.id]?.get('Forecast exit date')) >= RD)).slice(0, 6).map((g) => g.id));

    // time axis: from three months before the reporting date for `horizon` months
    const rd = fromSerial(RD);
    const m0 = new Date(Date.UTC(rd.getUTCFullYear(), rd.getUTCMonth() - 3, 1));
    const nM = ui.horizon + 3;
    const t0 = toSerial(m0), t1 = toSerial(new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + nM, 1)));
    const pct = (d) => Math.max(0, Math.min(100, (d - t0) / (t1 - t0) * 100));
    const LW = 300;   // label column

    const monthHead = h('div', { style: { display: 'flex', position: 'sticky', top: 0, zIndex: 2, background: 'var(--selected)', borderBottom: '1px solid var(--line)' } },
      h('div', { style: { width: LW + 'px', flex: `0 0 ${LW}px`, padding: '8px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--navy)' } }, 'Service and activity'),
      h('div', { style: { flex: '1 1 auto', position: 'relative', display: 'flex' } },
        [...Array(nM).keys()].map((i) => { const d = new Date(Date.UTC(m0.getUTCFullYear(), m0.getUTCMonth() + i, 1)); return h('div', { style: { flex: '1 1 0', fontSize: '11px', fontWeight: 600, color: 'var(--navy)', padding: '8px 0 8px 4px', borderLeft: '1px solid var(--line)' } }, MONTHS[d.getUTCMonth()] + (d.getUTCMonth() === 0 || i === 0 ? ' ' + String(d.getUTCFullYear()).slice(2) : '')); })));
    const todayLine = () => h('div', { style: { position: 'absolute', top: 0, bottom: 0, left: pct(RD) + '%', width: '2px', background: 'var(--blue)', opacity: 0.5 } });
    const go = (p) => { Object.assign(ui, p); ctx.rerender(); };

    const rowEls = [];
    shown.forEach((g) => {
      const t = tsa[g.id];
      const isOpen = ui.open.has(g.id);
      const exit = Number(t?.get('Forecast exit date')) || 0;
      const nLate = g.rows.filter(late).length;
      rowEls.push(h('div', { style: { display: 'flex', borderTop: '1px solid var(--line)', background: '#FAFBFD', cursor: 'pointer' }, onclick: () => { isOpen ? ui.open.delete(g.id) : ui.open.add(g.id); ctx.rerender(); } },
        h('div', { style: { width: LW + 'px', flex: `0 0 ${LW}px`, padding: '8px 12px', minWidth: 0 } },
          h('div', { style: { fontWeight: 700, fontSize: '13px', color: 'var(--navy)' } }, `${isOpen ? '▾' : '▸'} ${g.id}`),
          h('div.small', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, t ? t.get('Service name') : 'Programme-wide', nLate ? h('span', { style: { color: 'var(--r-fg)', fontWeight: 600 } }, ` · ${nLate} late`) : null)),
        h('div', { style: { flex: '1 1 auto', position: 'relative' } }, todayLine(),
          exit ? h('div', { title: `Exit ${fmtDate(exit)}`, style: { position: 'absolute', top: '50%', left: `calc(${pct(exit)}% - 7px)`, width: '12px', height: '12px', transform: 'translateY(-50%) rotate(45deg)', background: 'var(--navy)' } }) : null)));
      if (!isOpen) return;
      g.rows.forEach((r) => {
        const s = Number(r.get('Planned start')) || 0, f = Number(r.get('Planned finish')) || s;
        const type = r.get('Type'), done = r.get('Status') === 'Complete', isLate = late(r);
        const pc = Number(r.get('% complete')) || (done ? 1 : 0);
        const ms = type === 'Milestone' || type === 'Gate' || type === 'TSA exit';
        const col = done ? 'var(--g-bar)' : isLate ? 'var(--r-bar)' : 'var(--navy)';
        const sel = ui.sel === r.i;
        rowEls.push(h('div', { style: { display: 'flex', borderTop: '1px solid var(--line-soft)', background: sel ? 'var(--row-pick)' : '#fff', cursor: 'pointer', boxShadow: sel ? 'inset 3px 0 0 var(--blue)' : null }, onclick: () => go({ sel: r.i }) },
          h('div', { style: { width: LW + 'px', flex: `0 0 ${LW}px`, padding: '6px 12px 6px 26px', minWidth: 0 } },
            h('div', { style: { fontSize: '12.5px', fontWeight: type === 'TSA exit' ? 700 : 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, r.get('Activity')),
            h('div.small.muted', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, [type, r.get('Owner'), f ? (ms ? fmtDate(f, true) : `${fmtDate(s, true)} – ${fmtDate(f, true)}`) : 'no dates', isLate ? 'late' : done ? 'done' : pc ? Math.round(pc * 100) + '%' : ''].filter(Boolean).join(' · '))),
          h('div', { style: { flex: '1 1 auto', position: 'relative', minHeight: '40px' } }, todayLine(),
            !f ? null : ms
              ? h('div', { title: `${r.get('Activity')}: ${fmtDate(f)}`, style: { position: 'absolute', top: '50%', left: `calc(${pct(f)}% - 6px)`, width: '10px', height: '10px', transform: 'translateY(-50%) rotate(45deg)', background: col } })
              : h('div', { title: `${r.get('Activity')}: ${fmtDate(s)} – ${fmtDate(f)}`, style: { position: 'absolute', top: '13px', height: '14px', left: pct(s) + '%', width: Math.max(0.6, pct(f) - pct(s)) + '%', background: '#E1E7EF', borderRadius: '3px', overflow: 'hidden', border: `1px solid ${col}` } },
                h('div', { style: { height: '100%', width: Math.round(pc * 100) + '%', background: col } })))));
      });
    });

    const wsSel = h('select.search', { 'aria-label': 'Workstream', style: { flex: '0 1 220px' } }, h('option', { value: '' }, 'All workstreams'),
      [...new Set(groups.map((g) => tsa[g.id]?.get('Workstream') || g.rows[0].get('Workstream')).filter(Boolean))].map((w) => h('option', { value: w }, wsName[w] || w)));
    wsSel.value = ui.ws; wsSel.addEventListener('change', () => go({ ws: wsSel.value, open: null }));
    const search = h('input.search', { id: 'plan-q', type: 'search', placeholder: 'Search services, activities or owners', value: ui.q });
    search.addEventListener('input', () => { ui.q = search.value; ui.open = null; const pos = search.selectionStart; ctx.rerender(); setTimeout(() => { const n = document.getElementById('plan-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); });
    const nLateAll = all.filter(late).length;
    const selRec = all.find((r) => r.i === ui.sel);

    return h('div.page',
      h('div.page-head',
        h('div', h('h1', 'Exit plan'), h('p.lede', `Every service's exit plan on one timeline. The blue line is the reporting date (${fmtDate(RD)}); diamonds are milestones and exits.`)),
        h('button.btn', { type: 'button', onclick: () => store.show(T, selRec ? selRec.i : null).catch((e) => toast(e.message, true)) }, 'Show in the worksheet')),
      h('div.filters', search, wsSel,
        h('button.fchip', { type: 'button', 'aria-pressed': String(ui.lateOnly), onclick: () => go({ lateOnly: !ui.lateOnly, open: null }) }, 'Late items only', h('span.n', String(nLateAll))),
        h('button.fchip', { type: 'button', 'aria-pressed': String(ui.exited), onclick: () => go({ exited: !ui.exited, open: null }) }, 'Include exited services'),
        [6, 12, 24].map((m) => h('button.fchip', { type: 'button', 'aria-pressed': String(ui.horizon === m), onclick: () => go({ horizon: m }) }, `${m} months`)),
        h('button.link-btn', { type: 'button', onclick: () => go({ open: new Set(shown.map((g) => g.id)) }) }, 'Expand all'),
        h('button.link-btn', { type: 'button', onclick: () => go({ open: new Set() }) }, 'Collapse all')),
      h('div.row-wrap',
        h('div.tbl-wrap', { style: { flex: '999 1 640px' } }, h('div', { style: { minWidth: '820px' } }, monthHead, rowEls.length ? rowEls : h('p.muted', { style: { padding: '16px' } }, 'Nothing matches.'))),
        selRec ? editPanel(ctx, selRec) : h('aside.panel', h('div.panel-empty', 'Select an activity to update its dates or progress.'))));
  }
};

function editPanel(ctx, r) {
  const { store } = ctx;
  const form = buildForm(store, T, r, [{ h: 'Activity', full: true, area: true, rows: 2 }, 'Type', 'Owner', 'Party', 'Planned start', 'Planned finish', '% complete', 'Actual start', 'Actual finish', 'Status',
    'Baseline start', 'Baseline finish', 'Slippage (days)', 'Critical path', 'Predecessor 1', 'Predecessor 2', 'Predecessor check', 'Depends on', 'Dependency', 'Comments']);
  const save = async () => {
    const ch = form.collect();
    if ('% complete' in ch && ch['% complete'] !== '' && ch['% complete'] > 1) ch['% complete'] = ch['% complete'] / 100;   // typed as 40 rather than 0.4
    if (!Object.keys(ch).length) { toast('Nothing changed'); return; }
    try { const n = await store.save(T, r.i, ch); toast(`Saved ${n} change${n === 1 ? '' : 's'} to the workbook`); ctx.rerender(); }
    catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  return h('aside.panel', { 'aria-label': 'Activity details' },
    h('div.panel-head', h('span.panel-id', `${r.get('Activity ID')} · ${r.get('TSA ID') || 'Programme'}`), h('h2.panel-title', r.get('Activity'))),
    h('div.panel-body', form.el),
    h('div.panel-foot',
      h('button.btn.btn-primary', { type: 'button', onclick: save }, 'Save'),
      h('button.btn', { type: 'button', onclick: () => store.show(T, r.i).catch((e) => toast(e.message, true)) }, 'Show row'),
      h('span.small.muted', { style: { flex: '1 1 100%' } }, '% complete is a fraction in the workbook: type 0.4 or 40 for 40%. Status is worked out from the dates and progress.')));
}
