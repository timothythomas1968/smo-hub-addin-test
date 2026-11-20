// Executive summary (Tim, 0.9.5 feedback): the one-page summary from the Teams tab, inside the Hub, worked out live:
// exits against plan, the monthly run-rate (forward and reverse), this year's TSA fees, one-off costs, workstream status,
// decisions needed and the watch list. Print or save as PDF like the packs.
// Improved for the executives (Tim, 20 Nov 2026; build waves P2): the status trend over the last six reporting periods,
// the top risks by score, cost against the fee cap and the budget, exits in the next 90 days with their readiness,
// extensions requested and their cost, milestones slipping, and decisions overdue.
import { h, fmtDate, fmtMonth, fmtMoney, ed, team, theTeam, printNode, asOf, periodStart, periodLabel, plural } from '../util.js?v=0.12.6.20261120074927';
import { COL, donut, columns, meter } from '../charts.js?v=0.12.6.20261120074927';
import { financeData } from '../findata.js?v=0.12.6.20261120074927';
import { serviceCounts } from '../counts.js?v=0.12.6.20261120074927';
import { mshort } from './health.js?v=0.12.6.20261120074927';

export default {
  tables: ['tblTSA', 'tblInvoices', 'tblWO', 'tblCostLines', 'tblStatus', 'tblWorkstreams', 'tblDecisions', 'tblRisks', 'tblChange', 'tblPlan', 'tblPassThrough', 'tblBaselines'],
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
    const openDec = store.records('tblDecisions').filter((r) => r.get('Status') === 'Open').sort((a, b) => (Number(a.get('Needed by')) || 9e9) - (Number(b.get('Needed by')) || 9e9));
    const decLate = openDec.filter((r) => Number(r.get('Needed by')) && Number(r.get('Needed by')) < T);
    const decisions = openDec.slice(0, 5);
    const has = (t) => (store.has ? store.has(t) : true);
    // status trend: the last six reporting periods, one row per workstream (the programme first)
    const periods = [...new Set(st.map((r) => Number(r.get('Period')) || 0).filter(Boolean))].sort((a, b) => a - b).slice(-6);
    const trendRows = [...new Set(st.map((r) => r.get('Workstream')))].sort((a, b) => (a === ed('Programme') ? -1 : b === ed('Programme') ? 1 : String(a).localeCompare(String(b))));
    const ragAt = (ws, p) => (st.find((r) => r.get('Workstream') === ws && Number(r.get('Period')) === p) || { get: () => '' }).get('RAG');
    // top risks by score: open or in progress
    const risks = has('tblRisks') ? store.records('tblRisks').filter((r) => /^(Open|In progress)$/.test(r.get('Status (adopt or remove)'))).sort((a, b) => (Number(b.get('Score')) || 0) - (Number(a.get('Score')) || 0)).slice(0, 5) : [];
    // cost against the fee cap and the budget
    const feeTotal = F.years.reduce((a, y) => a + y.fees, 0), feeToDate = F.burn.filter((b) => b.m <= F.RD).reduce((a, b) => a + b.fees, 0);
    // exits in the next 90 days, with their readiness
    const soon = F.rec.filter((x) => x.dir !== 'Reverse' && !/Exited|Terminated/.test(x.status) && x.fc && x.fc >= T && x.fc <= T + 90).sort((a, b) => a.fc - b.fc);
    // extensions requested, and what they cost
    const ext = has('tblChange') ? store.records('tblChange').filter((r) => r.get('Request type') === 'Extend' && !/^(Rejected|Withdrawn)/.test(r.get('Status'))) : [];
    const extPending = ext.filter((r) => !/^(Approved|Implemented)/.test(r.get('Status'))), extApproved = ext.filter((r) => /^(Approved|Implemented)/.test(r.get('Status')));
    const extCost = (rs) => rs.reduce((a, r) => a + (Number(r.get('Fee impact (calculated, reporting currency)')) || 0) + (Number(r.get('Other cost impact')) || 0), 0);
    // milestones slipping: behind their baseline and not complete; "new" when the slip was logged this reporting period
    const p0 = periodStart(n.RD);
    // days behind: against the baseline, or past its planned finish and not complete (late), whichever is more
    const slipDays = (r) => Math.max(Number(r.get('Slippage (days)')) || 0, Number(r.get('Planned finish')) && Number(r.get('Planned finish')) < T ? T - Number(r.get('Planned finish')) : 0);
    const fcLog = has('tblChange') ? store.records('tblChange').filter((r) => /Forecast change|Plan change/.test(r.get('Request type')) && Number(r.get('Raised on')) >= p0) : [];
    const slipping = has('tblPlan') && n.Use_SP !== 'N' ? store.records('tblPlan').filter((r) => /^(Milestone|TSA exit|Gate)$/.test(r.get('Type')) && r.get('Status') !== 'Complete' && slipDays(r) > 0)
      .sort((a, b) => slipDays(b) - slipDays(a)) : [];
    const slipNew = (r) => fcLog.some((c) => c.get('Item ID') === r.get('Activity ID'));
    const rowLine = (...kids) => h('div', { style: { display: 'flex', gap: '10px', padding: '6px 0', borderTop: '1px solid var(--line-soft)', alignItems: 'flex-start' } }, ...kids);
    const ragDot = (rag) => h('span', { title: rag || 'not reported', style: { display: 'inline-block', width: '18px', height: '18px', borderRadius: '4px', background: { Green: COL.g, Amber: COL.a, Red: COL.r }[rag] || COL.line } });
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
        h('section.card', { style: { flex: '2 1 380px', minWidth: 0, overflowX: 'auto' } }, h('h2.cap', `Status trend · last ${plural(periods.length, 'reporting period')}`),
          periods.length ? h('table.data', { style: { width: 'auto' } },
            h('thead', h('tr', h('th', 'Workstream'), ...periods.map((p) => h('th', { style: { textAlign: 'center' } }, periodLabel(p).replace(/^(\w{3}) \d{2}(\d{2})$/, '$1 $2'))))),
            h('tbody', ...trendRows.map((ws) => h('tr', h('td', ws === ed('Programme') ? h('b', ed('Programme overall')) : (wsName[ws] || ws)), ...periods.map((p) => h('td', { style: { textAlign: 'center' } }, ragDot(ragAt(ws, p)))))))) : h('p.small.muted', 'No status reported yet.')),
        h('section.card', { style: { flex: '1 1 260px', minWidth: 0 } }, h('h2.cap', 'Cost against the cap and the budget'),
          h('div.small', h('b', 'TSA fees, whole programme: '), `${s(feeTotal)} forecast · ${s(feeToDate)} to date`),
          F.cap ? h('div', { style: { margin: '6px 0 2px' } }, meter(feeTotal, F.cap, { width: 240, label: 'TSA fees against the fee cap' }), h('div.small.muted', feeTotal > F.cap ? `${s(feeTotal - F.cap)} over the fee cap of ${s(F.cap)}` : `${s(F.cap - feeTotal)} headroom under the fee cap of ${s(F.cap)}`)) : h('div.small.muted', 'No fee cap in the contract.'),
          F.pt.length ? h('div.small', { style: { marginTop: '8px' } }, h('b', 'Pass-through on top: '), `${s(F.years.reduce((a, y) => a + y.pt, 0))} over the programme · ${s(F.ptRate)} a month now`) : null,
          h('div.small', { style: { marginTop: '12px' } }, h('b', 'One-off separation costs: '), `${s(F.oneoff.fac)} forecast · ${s(F.oneoff.actual)} spent`),
          F.oneoff.budget ? h('div', { style: { margin: '6px 0 2px' } }, meter(F.oneoff.fac, F.oneoff.budget, { width: 240, label: 'One-off costs against the budget' }), h('div.small.muted', F.oneoff.fac > F.oneoff.budget ? `${s(F.oneoff.fac - F.oneoff.budget)} over the budget of ${s(F.oneoff.budget)}` : `${s(F.oneoff.budget - F.oneoff.fac)} under the budget of ${s(F.oneoff.budget)}`)) : h('div.small.muted', 'No budget set.'))),
      h('div.row-wrap', { style: { alignItems: 'flex-start' } },
        h('section.card', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', `Exits in the next 90 days · ${soon.length}`),
          soon.length ? soon.slice(0, 6).map((x) => rowLine(chip(fmtDate(x.fc, true), 'neutral'),
            h('div', { style: { flex: 1 } }, h('button.drill', { type: 'button', onclick: () => go('register', { id: x.id }) }, `${x.name} (${x.id})`), h('div.small.muted', x.xrag ? `Exit readiness: ${x.xrag}` : 'Exit readiness not yet assessed')),
            x.xrag ? chip(x.xrag === 'Green' ? 'Ready' : x.xrag === 'Amber' ? 'Partly ready' : 'Not ready', x.xrag) : null)).concat(soon.length > 6 ? [h('div.small.muted', `and ${soon.length - 6} more`)] : []) : h('p.small.muted', 'No exits in the next 90 days.')),
        h('section.card', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', 'Top risks'),
          risks.length ? risks.map((r) => rowLine(chip(`${r.get('Score') || '–'}`, /High|Red/.test(r.get('Rating')) ? 'Red' : /Medium|Amber/.test(r.get('Rating')) ? 'Amber' : 'Green'),
            h('div', h('button.drill', { type: 'button', onclick: () => go('raid', { tab: 'RSK', id: r.get('Risk ID') }) }, `${r.get('Risk')} (${r.get('Risk ID')})`), h('div.small.muted', [r.get('Owner'), r.get('Mitigation / response')].filter(Boolean).join(' · '))))) : h('p.small.muted', 'No open risks.'))),
      h('div.row-wrap', { style: { alignItems: 'flex-start' } },
        h('section.card', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', 'Extensions requested'),
          ext.length ? [
            h('div.small', `${plural(extPending.length, 'request')} waiting, ${s(extCost(extPending))} in extra fees · ${extApproved.length} approved, ${s(extCost(extApproved))}`),
            ...ext.slice(0, 4).map((r) => rowLine(chip(/^(Approved|Implemented)/.test(r.get('Status')) ? 'Approved' : 'Waiting', /^(Approved|Implemented)/.test(r.get('Status')) ? 'Green' : 'Amber'),
              h('div', h('button.drill', { type: 'button', onclick: () => go('changes', { id: r.get('CR ID') }) }, `${r.get('Title') || r.get('CR ID')} (${r.get('CR ID')})`), h('div.small.muted', s((Number(r.get('Fee impact (calculated, reporting currency)')) || 0) + (Number(r.get('Other cost impact')) || 0))))))] : h('p.small.muted', 'No extensions requested.')),
        h('section.card', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', `Milestones late or slipping · ${slipping.length}`),
          slipping.length ? slipping.slice(0, 5).map((r) => rowLine(chip(`${Math.round(slipDays(r))} days`, slipDays(r) > 20 ? 'Red' : 'Amber'),
            h('div', h('button.drill', { type: 'button', onclick: () => go('plan', { id: r.get('Activity ID') }) }, `${r.get('Activity')} (${r.get('Activity ID')})`), h('div.small.muted', [wsName[r.get('Workstream')] || r.get('Workstream'), `now ${fmtDate(Number(r.get('Planned finish')), true)}`, slipNew(r) ? `slipped this ${periodLabel(n.RD).startsWith('week') || periodLabel(n.RD).startsWith('fortnight') ? 'period' : 'month'}` : ''].filter(Boolean).join(' · '))))) : h('p.small.muted', n.Use_SP === 'N' ? 'The exit plan is not in use.' : 'No milestones are late or behind their baseline.'))),
      h('div.row-wrap', { style: { alignItems: 'flex-start' } },
        h('section.card', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', `Decisions needed${decLate.length ? ` · ${decLate.length} overdue` : ''}`),
          decisions.length ? decisions.map((r) => h('div', { style: { display: 'flex', gap: '10px', padding: '6px 0', borderTop: '1px solid var(--line-soft)' } },
            chip(Number(r.get('Needed by')) ? (Number(r.get('Needed by')) < T ? `Overdue · ${fmtDate(Number(r.get('Needed by')), true)}` : fmtDate(Number(r.get('Needed by')), true)) : '–', Number(r.get('Needed by')) && Number(r.get('Needed by')) < T + 14 ? 'Red' : 'Amber'),
            h('div', h('button.drill', { type: 'button', onclick: () => go('raid', { tab: 'DEC', id: r.get('Decision ID') }) }, `${r.get('Decision needed')} (${r.get('Decision ID')})`),
              h('div.small.muted', [r.get('Decided by'), r.get('Owner')].filter(Boolean).join(' · '))))) : h('p.small.muted', 'No decisions waiting.')),
        h('section.card', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', 'Watch list'),
          watch.length ? watch.map((x) => h('div', { style: { display: 'flex', gap: '10px', padding: '6px 0', borderTop: '1px solid var(--line-soft)' } }, chip('Red', 'Red'),
            h('div', h('button.drill', { type: 'button', onclick: () => go('register', { id: x.id }) }, `${x.name} (${x.id})`), h('div.small.muted', x.ptg || 'No path to green recorded yet')))) : h('p.small.muted', 'No services are red.'))),
      h('div.small.muted', { style: { borderTop: '1px solid var(--line)', paddingTop: '6px' } }, ed(`Prepared by ${theTeam()} with TransitionSuite · today ${fmtDate(T)} · reporting month ${fmtMonth(n.RD)}.${F.baseline && F.baseline.original ? ` Against baseline ${F.baseline.id}${F.baseline.dec ? ` (${F.baseline.dec}${F.baseline.on ? ', ' + fmtDate(F.baseline.on) : ''})` : ''}; the original contract is on Finance.` : ''} Select a figure, decision or service to see the detail.`))));

    return h('div.page',
      h('div.page-head', h('div', h('h1', 'Executive summary'), h('p.lede', 'One page for the steering committee, worked out from the registers.')),
        h('button.btn.btn-primary', { type: 'button', onclick: () => printNode(document.getElementById('exec-sheet'), `Executive summary ${fmtMonth(n.RD)}`) }, 'Print or save as PDF')),
      sheet);
  }
};
