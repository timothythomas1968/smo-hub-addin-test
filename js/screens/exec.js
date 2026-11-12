// Executive summary (Tim, 0.9.5 feedback): the one-page summary from the Teams tab, inside the Hub, worked out live:
// exits against plan, the monthly run-rate (forward and reverse), this year's TSA fees, one-off costs, workstream status,
// decisions needed and the watch list. Print or save as PDF like the packs.
import { h, fmtDate, fmtMonth, fmtMoney, ed, team, theTeam, printNode, asOf } from '../util.js?v=0.11.2.20261112223532';
import { COL, donut, columns } from '../charts.js?v=0.11.2.20261112223532';
import { financeData } from '../findata.js?v=0.11.2.20261112223532';
import { serviceCounts } from '../counts.js?v=0.11.2.20261112223532';
import { mshort } from './health.js?v=0.11.2.20261112223532';

export default {
  tables: ['tblTSA', 'tblInvoices', 'tblWO', 'tblCostLines', 'tblStatus', 'tblWorkstreams', 'tblDecisions'],
  render(ctx) {
    const { store, go } = ctx;
    const n = store.names, sym = n.CcySym || '', T = asOf(n);
    const F = financeData(store), s = (v) => mshort(v, sym);
    const cnt = serviceCounts(store.records('tblTSA'), T);
    const X = F.exits, gap = X.actual - X.plan;
    const y0 = F.years.find((y) => y.key === new Date((T - 25569) * 86400000).getUTCFullYear()) || F.years[0] || { fc: 0, plan: 0, key: '' };
    const wsName = Object.fromEntries(store.records('tblWorkstreams').map((r) => [r.get('Code'), r.get('Name')]));
    const st = store.records('tblStatus').filter((r) => (r.get('Scope') || 'Overall') === 'Overall');
    const per = Math.max(0, ...st.map((r) => Number(r.get('Period')) || 0));
    const cur = st.filter((r) => Number(r.get('Period')) === per);
    const prog = cur.find((r) => r.get('Workstream') === ed('Programme'));
    const wsCur = cur.filter((r) => r !== prog);
    const byRag = (x) => wsCur.filter((r) => r.get('RAG') === x);
    const decisions = store.records('tblDecisions').filter((r) => r.get('Status') === 'Open').sort((a, b) => (Number(a.get('Needed by')) || 9e9) - (Number(b.get('Needed by')) || 9e9)).slice(0, 4);
    const watch = F.rec.filter((x) => !/Exited|Terminated/.test(x.status) && (x.drag === 'Red' || x.xrag === 'Red')).slice(0, 4);
    const chip = (t, c) => h('span.chip', { class: c, style: { alignSelf: 'flex-start', whiteSpace: 'nowrap' } }, t);
    const kpi = (label, value, sub, extra, onclick) => h(onclick ? 'button.tile' : 'div.tile', { type: onclick ? 'button' : null, onclick }, h('span.tile-label', label), h('span.tile-value', value), extra || null, h('span.tile-sub', sub));

    // the headline is written from the figures, not typed
    const reds = byRag('Red').map((r) => wsName[r.get('Workstream')] || r.get('Workstream'));
    const headline = `${X.actual} of ${X.total} services exited${gap < 0 ? `, ${-gap} behind plan` : gap > 0 ? `, ${gap} ahead of plan` : ', on plan'}; ${cnt.soon} close in the next 90 days. `
      + (reds.length ? `${reds.join(' and ')} ${reds.length === 1 ? 'is' : 'are'} red.` : prog && prog.get('RAG') === 'Red' ? 'No workstream is red, but the programme is red overall.' : 'No workstream is red.');

    const sheet = h('div', { id: 'exec-sheet' }, h('div.pack-page.invoice-page', { style: { background: '#fff', border: '1px solid var(--line)', borderRadius: '4px', padding: '26px 30px', display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '16px', borderBottom: '3px solid var(--navy)', paddingBottom: '12px' } },
        h('div', h('div.small', { style: { fontWeight: 700, letterSpacing: '1px', color: 'var(--muted)' } }, `${(n.ProgName || '').toUpperCase()} · EXECUTIVE SUMMARY · ${fmtMonth(n.RD).toUpperCase()}`),
          h('div', { style: { fontSize: '20px', fontWeight: 700, color: 'var(--navy)', marginTop: '4px', maxWidth: '760px' } }, headline)),
        h('div', { style: { textAlign: 'right' } }, prog ? chip(`Overall: ${prog.get('RAG')}`, prog.get('RAG')) : null, h('div.small.muted', { style: { marginTop: '6px' } }, `${n.Perspective === 'Seller' ? n.SellerName : n.BuyerName} · ${team()}`))),
      h('div.tiles',
        kpi('Services exited', `${X.actual} of ${X.total}`, `forward services · ${X.plan} planned by now, ${X.contract} by the contract`, h('div', chip(gap === 0 ? 'On plan' : gap > 0 ? `${gap} ahead` : `${-gap} behind`, gap < 0 ? 'Red' : 'Green')), () => go('register', { filter: 'exited' })),
        kpi('Monthly run-rate', s(F.runRate), `forward services, ${F.liveNow} running${F.revRate ? ` · reverse ${s(F.revRate)} a month` : ''}`, null, () => go('finance')),
        kpi(`TSA fees ${y0.key}`, s(y0.fc), `forecast · current plan ${s(y0.plan)}${F.cap ? ` · fee cap ${s(F.cap)} overall` : ''}`, null, () => go('finance', { year: y0.key })),
        kpi('One-off costs', s(F.oneoff.fac), `forecast at completion · budget ${s(F.oneoff.budget)}`, null, () => go('finance'))),
      h('div.row-wrap', { style: { alignItems: 'flex-start' } },
        h('section.card', { style: { flex: '2 1 380px', minWidth: 0, overflowX: 'auto' } }, h('h2.cap', 'TSA fees by year: current plan and forecast'),
          columns(F.years.map((y) => ({ label: String(y.key), bars: [{ v: y.plan, c: COL.n, label: 'Current plan' }, { v: y.fc, c: COL.navy, label: 'Forecast' }] })), { width: Math.max(280, F.years.length * 110), height: 160, fmt: s, label: 'TSA fees by year' })),
        h('section.card', { style: { flex: '1 1 260px', minWidth: 0 } }, h('h2.cap', `Workstreams · ${fmtMonth(per)}`),
          h('div', { style: { display: 'flex', gap: '14px', alignItems: 'center' } },
            donut([{ v: byRag('Green').length, c: COL.g, label: 'Green' }, { v: byRag('Amber').length, c: COL.a, label: 'Amber' }, { v: byRag('Red').length, c: COL.r, label: 'Red' }], { size: 96, centre: String(wsCur.length), caption: 'streams', label: 'Workstreams by RAG' }),
            h('div.small', h('div', h('b', 'Red: '), reds.length ? reds.join(', ') : 'none'), h('div', { style: { marginTop: '4px' } }, h('b', 'Amber: '), byRag('Amber').map((r) => r.get('Workstream')).join(', ') || 'none'))))),
      h('div.row-wrap', { style: { alignItems: 'flex-start' } },
        h('section.card', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', 'Decisions needed'),
          decisions.length ? decisions.map((r) => h('div', { style: { display: 'flex', gap: '10px', padding: '6px 0', borderTop: '1px solid var(--line-soft)' } },
            chip(Number(r.get('Needed by')) ? fmtDate(Number(r.get('Needed by')), true) : '–', Number(r.get('Needed by')) && Number(r.get('Needed by')) < T + 14 ? 'Red' : 'Amber'),
            h('div', h('button.drill', { type: 'button', onclick: () => go('raid', { tab: 'DEC', id: r.get('Decision ID') }) }, `${r.get('Decision needed')} (${r.get('Decision ID')})`),
              h('div.small.muted', [r.get('Decided by'), r.get('Owner')].filter(Boolean).join(' · '))))) : h('p.small.muted', 'No decisions waiting.')),
        h('section.card', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', 'Watch list'),
          watch.length ? watch.map((x) => h('div', { style: { display: 'flex', gap: '10px', padding: '6px 0', borderTop: '1px solid var(--line-soft)' } }, chip('Red', 'Red'),
            h('div', h('button.drill', { type: 'button', onclick: () => go('register', { id: x.id }) }, `${x.name} (${x.id})`), h('div.small.muted', x.ptg || 'No path to green recorded yet')))) : h('p.small.muted', 'No services are red.'))),
      h('div.small.muted', { style: { borderTop: '1px solid var(--line)', paddingTop: '6px' } }, ed(`Prepared by ${theTeam()} with TransitionSuite · today ${fmtDate(T)} · reporting month ${fmtMonth(n.RD)}. Select a figure, decision or service to see the detail.`))));

    return h('div.page',
      h('div.page-head', h('div', h('h1', 'Executive summary'), h('p.lede', 'One page for the steering committee, worked out from the registers.')),
        h('button.btn.btn-primary', { type: 'button', onclick: () => printNode(document.getElementById('exec-sheet'), `Executive summary ${fmtMonth(n.RD)}`) }, 'Print or save as PDF')),
      sheet);
  }
};
