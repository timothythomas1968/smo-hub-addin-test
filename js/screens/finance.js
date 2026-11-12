// Finance (Tim, 0.9.5 feedback): the Teams Finance report, inside the Hub. Read only, worked out live from the registers (findata.js):
// TSA fees forecast for every year the programme runs, against the current plan or the original contract, the reverse services we
// provide, invoiced actuals, work orders and one-off separation costs. The governance pack's fees section drills into it by year.
import { h, fmtMoney, fmtMonth, fmtDate, ed, team } from '../util.js?v=0.11.0.20261112200344';
import { COL, columns, stackColumns, meter } from '../charts.js?v=0.11.0.20261112200344';
import { financeData } from '../findata.js?v=0.11.0.20261112200344';
import { mshort } from './health.js?v=0.11.0.20261112200344';

const ui = { cmp: 'plan', year: null };

export default {
  tables: ['tblTSA', 'tblInvoices', 'tblWO', 'tblCostLines'],
  render(ctx) {
    const { store } = ctx;
    const n = store.names, sym = n.CcySym || '';
    if (ctx.arg && !ctx.arg.used) { ctx.arg.used = true; if (ctx.arg.year) ui.year = Number(ctx.arg.year); }
    const F = financeData(store);
    const m = (v) => fmtMoney(Math.round(v), sym), s = (v) => mshort(v, sym);
    const CMP = { plan: ['Current plan', 'planned exit dates (approved changes included)'], contract: ['Original contract', 'initial end dates in the signed TSA'] };
    const cmpLabel = CMP[ui.cmp][0];
    const pct = (a, b) => (b ? `${a >= b ? '+' : '−'}${Math.abs(Math.round((a / b - 1) * 100))}%` : '');

    // one tile per year the programme runs (Tim: "if the programme runs 2, 3 or 4 years, show each year's forecast")
    const yearTile = (y) => {
      const d = y.fc - y[ui.cmp], sel = ui.year === y.key;
      return h('button.tile', { type: 'button', class: [d > y[ui.cmp] * 0.02 ? 'amber' : null, sel ? 'sel' : null].filter(Boolean).join(' ') || null, title: `Show ${y.key} by quarter`,
        onclick: () => { ui.year = sel ? null : y.key; ctx.rerender(); } },
        h('span.tile-label', `${y.key} · TSA fees forecast`), h('span.tile-value', s(y.fc)),
        h('span.tile-sub', `${cmpLabel} ${s(y[ui.cmp])}${y[ui.cmp] ? ' · ' + pct(y.fc, y[ui.cmp]) : ''}${y.rev ? ` · reverse ${s(y.rev)}` : ''}`));
    };
    const seg = h('div.seg', { role: 'group', 'aria-label': 'Compare with' }, Object.entries(CMP).map(([k, [lab]]) =>
      h('button', { type: 'button', 'aria-pressed': String(ui.cmp === k), onclick: () => { ui.cmp = k; ctx.rerender(); } }, lab)));

    const total = (k) => F.years.reduce((a, y) => a + y[k], 0);
    const quarters = ui.year ? F.quarters.filter((q) => q.key.endsWith(String(ui.year))) : F.quarters;
    const stack = stackColumns(quarters.map((q) => ({ label: q.key.replace(' 20', ' ’'), parts: [
      { v: q.fees, c: COL.navy, label: 'TSA fees (invoiced, then forecast)' }, { v: q.wo, c: COL.blue, label: 'Work orders' }, { v: q.oc, c: COL.soft, label: 'One-off separation costs' }] })),
    { width: Math.max(420, quarters.length * 64), height: 230, fmt: s, label: 'Expenses by quarter' });
    const byYear = columns(F.years.map((y) => ({ label: String(y.key), bars: [{ v: y[ui.cmp], c: COL.n, label: cmpLabel }, { v: y.fc, c: COL.navy, label: 'Forecast' }, { v: y.act, c: COL.g, label: 'Invoiced' }] })),
      { width: Math.max(300, F.years.length * 120), height: 170, fmt: s, label: 'TSA fees by year' });
    const key = (items) => h('div.small.muted', { style: { display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '6px' } },
      items.map(([c, t]) => h('span', h('span', { style: { display: 'inline-block', width: '10px', height: '10px', borderRadius: '2px', background: c, marginRight: '5px', verticalAlign: '-1px' } }), t)));

    const th = (t, right) => h('th', { style: { textAlign: right ? 'right' : 'left' } }, t);
    const td = (v, right, st) => h('td', { style: Object.assign({ textAlign: right ? 'right' : 'left' }, st || {}) }, v);
    const yearRows = F.years.map((y) => h('tr', { style: ui.year === y.key ? { background: 'var(--selected)' } : null },
      td(h('button.drill', { type: 'button', onclick: () => { ui.year = ui.year === y.key ? null : y.key; ctx.rerender(); } }, String(y.key))),
      td(m(y[ui.cmp]), true), td(m(y.fc), true), td(y.hasAct ? m(y.act) : '–', true),
      td((y.fc - y[ui.cmp] >= 0 ? '+' : '−') + m(Math.abs(y.fc - y[ui.cmp])), true, { color: y.fc > y[ui.cmp] ? 'var(--r-fg)' : 'var(--g-fg)' }),
      td(m(y.rev), true), td(y.wo ? m(y.wo) : '–', true), td(m(y.oc), true)));
    const qRows = quarters.map((q) => h('tr', td(q.key), td(m(q[ui.cmp]), true), td(m(q.fc), true), td(q.hasAct ? m(q.act) : '–', true), td(m(q.rev), true), td(q.wo ? m(q.wo) : '–', true), td(m(q.oc), true)));

    return h('div.page',
      h('div.page-head',
        h('div', h('h1', 'Finance'), h('p.lede', `TSA fees, the reverse services we provide, work orders and one-off separation costs, worked out from the registers. Read only. Today ${fmtDate(F.T)}; reporting month ${fmtMonth(F.RD)}.`)),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' } }, h('span.small', { style: { color: '#C9D6E6' } }, 'Compare the forecast with'), seg)),
      h('div.tiles', F.years.map(yearTile)),
      h('div.tiles',
        h('div.tile', h('span.tile-label', 'Monthly run-rate now'), h('span.tile-value', s(F.runRate)), h('span.tile-sub', `forward services · ${F.liveNow} running${F.revRate ? ` · reverse ${s(F.revRate)} a month` : ''}`)),
        h('div.tile', { class: F.cap && total('fc') > F.cap ? 'red' : null }, h('span.tile-label', 'All TSA fees, forecast'), h('span.tile-value', s(total('fc'))),
          F.cap ? h('span.tile-sub', `fee cap ${s(F.cap)} · ${Math.round(total('fc') / F.cap * 100)}% used`, h('br'), meter(total('fc'), F.cap, { width: 150, height: 6, label: 'Forecast against the fee cap' })) : h('span.tile-sub', 'no fee cap set')),
        h('div.tile', h('span.tile-label', 'Work orders'), h('span.tile-value', s(F.wo.reduce((a, w) => a + w.amount, 0))), h('span.tile-sub', `${F.wo.length} approved or quoted`)),
        h('div.tile', h('span.tile-label', 'One-off separation costs'), h('span.tile-value', s(F.oneoff.fac)), h('span.tile-sub', `forecast at completion · budget ${s(F.oneoff.budget)} · spent ${s(F.oneoff.actual)}`))),
      h('p.small.muted', `${cmpLabel}: ${CMP[ui.cmp][1]}. Select a year to see its quarters. Pass-through expenses get their own register in workbook v0.11 and will appear here then.`),
      h('div.row-wrap', { style: { alignItems: 'flex-start' } },
        h('section.card', { style: { flex: '2 1 460px', minWidth: 0, overflowX: 'auto' } },
          h('h2.cap', ui.year ? `Expenses by quarter · ${ui.year}` : 'Expenses by quarter'), stack,
          key([[COL.navy, 'TSA fees (invoiced, then forecast)'], [COL.blue, 'Work orders'], [COL.soft, 'One-off separation costs']])),
        h('section.card', { style: { flex: '1 1 300px', minWidth: 0, overflowX: 'auto' } },
          h('h2.cap', 'TSA fees by year'), byYear, key([[COL.n, cmpLabel], [COL.navy, 'Forecast'], [COL.g, 'Invoiced']]))),
      h('section.card', { style: { overflowX: 'auto' } }, h('h2.cap', 'By year'),
        h('table.grid', h('thead', h('tr', th('Year'), th(cmpLabel, 1), th('Forecast', 1), th('Invoiced', 1), th('Forecast less ' + cmpLabel.toLowerCase(), 1), th('Reverse (we provide)', 1), th('Work orders', 1), th('One-off costs', 1))),
          h('tbody', yearRows),
          h('tfoot', h('tr', td(h('b', 'Total')), td(m(total(ui.cmp)), true), td(m(total('fc')), true), td(m(total('act')), true), td(m(total('fc') - total(ui.cmp)), true), td(m(total('rev')), true), td(m(total('wo')), true), td(m(total('oc')), true))))),
      h('section.card', { style: { overflowX: 'auto' } }, h('h2.cap', ui.year ? `By quarter · ${ui.year}` : 'By quarter'),
        h('table.grid', h('thead', h('tr', th('Quarter'), th(cmpLabel, 1), th('Forecast', 1), th('Invoiced', 1), th('Reverse', 1), th('Work orders', 1), th('One-off costs', 1))), h('tbody', qRows))),
      h('p.small.muted', ed(`Prepared by ${team()} with TransitionSuite. Fees are monthly fees in the reporting currency for each month a service runs; extension mark-ups are left out.`)));
  }
};
