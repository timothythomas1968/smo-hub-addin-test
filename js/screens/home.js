// Home: the month at a glance, built live from the workbook.
import { h, fmtDate, fmtMonth, plural, ed, asOf, team, toast } from '../util.js?v=0.9.5.20261106193911';
import { serviceCounts, countTests, COUNT_RULES } from '../counts.js?v=0.9.5.20261106193911';
import { readinessOf } from '../readiness.js?v=0.9.5.20261106193911';
import { healthCheck, HEALTH_TABLES } from './health.js?v=0.9.5.20261106193911';

const EXITED = new Set(['Exited', 'Terminated']);
const closedLike = new Set(['Closed', 'Remove', 'Removed', 'Made', 'Withdrawn', 'Cancelled', 'Canceled', 'Complete', 'Not required']);

export default {
  tables: [...new Set(['tblTSA', 'tblStatus', 'tblWorkstreams', 'tblRisks', 'tblIssues', 'tblDecisions', 'tblAssumpDep', 'tblActions', 'tblOBL', 'tblPlan', 'tblDay1', 'tblFirst100', ...HEALTH_TABLES])],
  render(ctx) {
    const { store, go } = ctx;
    const n = store.names;
    const RD = Number(n.RD) || 0, close = Number(n.CloseDate) || 0;
    const T = asOf(n);   // live alerts run from today; the month's reporting runs from RD
    const tsa = store.records('tblTSA');
    const live = tsa.filter((r) => !EXITED.has(r.get('Status')));
    const exited = tsa.length - live.length;
    const ragOf = (r) => [r.get('Service delivery RAG'), r.get('Exit readiness RAG')];
    const reds = live.filter((r) => ragOf(r).includes('Red')).length;
    const ambers = live.filter((r) => !ragOf(r).includes('Red') && ragOf(r).includes('Amber')).length;
    const future = live.map((r) => Number(r.get('Forecast exit date')) || 0).filter((d) => d >= T).sort((a, b) => a - b);
    const nextExit = future[0];
    const nextCount = future.filter((d) => d === nextExit).length;

    const decisions = store.records('tblDecisions').filter((r) => r.get('Status') === 'Open');
    const nextDec = decisions.map((r) => Number(r.get('Needed by')) || 0).filter(Boolean).sort((a, b) => a - b)[0];
    const actions = store.records('tblActions');
    const overdue = actions.filter((r) => r.get('Overdue') === 'Overdue').length;
    const openActions = actions.filter((r) => r.get('Status') === 'Open').length;
    const suggested = ['tblRisks', 'tblAssumpDep'].reduce((a, t) => a + store.records(t).filter((r) => r.get('Status (adopt or remove)') === 'Suggested').length, 0);
    const dqE = Number(n.DQ_Errors) || 0, dqW = Number(n.DQ_Warnings) || 0;

    const cnt = serviceCounts(tsa, T);
    const fromReports = store.records('tblRisks').filter((r) => r.get('Status (adopt or remove)') === 'New').length
      + ['tblIssues', 'tblDecisions'].reduce((k, t) => k + store.records(t).filter((r) => r.get('Status') === 'New').length, 0);
    const tile = (label, value, sub, tone, onclick, rule) => h(onclick ? 'button.tile' : 'div.tile', { type: onclick ? 'button' : null, class: tone, onclick, title: rule || null },
      h('span.tile-label', label), h('span.tile-value', value), h('span.tile-sub', sub, onclick ? ' ›' : ''));
    const tiles = h('div.tiles',
      tile('Open services', String(cnt.open), `${cnt.closed} closed`, null, () => go('register', { filter: 'open' }), COUNT_RULES.open + ' ' + COUNT_RULES.closed),
      tile('Closing in 90 days', String(cnt.soon), cnt.overdue ? `${cnt.overdue} exit overdue` : 'none overdue', cnt.overdue ? 'amber' : null, () => go('register', { filter: cnt.overdue ? 'overdue' : 'soon' }), COUNT_RULES.soon + ' ' + COUNT_RULES.overdue),
      tile('Red or amber', String(reds + ambers), `${reds} red · ${ambers} amber`, reds ? 'red' : ambers ? 'amber' : 'green', () => go('register', { filter: 'ra' })),
      tile('Next exits', nextExit ? fmtDate(nextExit, true) : '–', nextExit ? plural(nextCount, 'service') : 'none planned', null, () => go('register', { filter: 'next' })),
      fromReports ? tile('New from reports', String(fromReports), 'risks, issues and decisions to accept', 'amber', () => go('raid', { newOnly: true })) : null,
      tile('Decisions needed', String(decisions.length), nextDec ? `next by ${fmtDate(nextDec, true)}` : 'none open', null, () => go('raid', { tab: 'DEC' })),
      tile('Actions overdue', String(overdue), `${openActions} open`, overdue ? 'red' : null, () => go('raid', { tab: 'AC' })),
      tile('Data quality', String(dqE), `errors · ${dqW} warnings`, dqE ? 'amber' : 'green', () => store.showRange('Data Quality', 'A1').catch((e) => toast(e.message, true)), 'Open the Data Quality sheet: each check, with the row it is about'));

    // ---- this month checklist: some items tick themselves from the data; the rest are ticked by hand
    const key = 'month-' + RD;
    const manual = store.src.getSetting(key) || {};
    const daysSinceRD = T - RD;   // the workbook's Today, minus RD
    const waive = store.src.getSetting('ri-waive') || {}, xr = Object.fromEntries(store.records('tblReadiness').map((r) => [r.get('TSA ID'), r]));
    const interviewsDue = live.filter((r) => { const ro = readinessOf(store, r, xr[r.get('TSA ID')], waive, T); return ro.overdue || (ro.next && ro.next <= T + 14); }).length;
    // Start this month's reporting: one email to every workstream lead (evaluation F and J)
    const startReporting = () => {
      const side = n.Perspective === 'Seller' ? 'Seller lead' : 'Buyer lead';
      const mail = Object.fromEntries(store.records('tblPeople').map((r) => [r.get('Name'), r.get('Email')]));
      const leads = store.records('tblWorkstreams').filter((r) => r.get('Active (Y/N)') === 'Y').map((r) => r.get(side)).filter(Boolean);
      const to = [...new Set(leads.map((l) => mail[l]).filter(Boolean))];
      if (!to.length) { toast('No email addresses for the workstream leads yet: add them on the People sheet or in the set-up wizard', true); return; }
      const subj = `Workstream reports for ${fmtMonth(RD)}`;
      const body = `Hello all,\n\nPlease send your ${fmtMonth(RD)} workstream report by the usual date: open the Hub workbook, then TransitionSuite > Workstream report and pick your workstream${n.Use_WR === 'N' ? '' : ', or fill in your report file and send it back'}.\n\nThank you.`;
      window.open(`mailto:?bcc=${encodeURIComponent(to.join(';'))}&subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`, '_blank');
      manual.start = true; store.src.setSetting(key, manual).then(() => ctx.rerender());
    };
    // The 15 steps in four phases, the same as the worksheet Home's workflow (evaluation K: the two Homes stay consistent).
    // Steps tick themselves from the data where they can; the rest are ticked by hand. Steps for parts of the Hub not in use are left out.
    const use = (k) => n[k] !== 'N';
    const M0 = (() => { const d = new Date((RD - 25569) * 86400000); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 86400000) + 25569; })();
    const wsActive = store.records('tblWorkstreams').filter((r) => r.get('Active (Y/N)') !== 'N').map((r) => r.get('Code'));
    const wsIn = new Set(store.records('tblStatus').filter((r) => (r.get('Scope') || 'Overall') === 'Overall' && Number(r.get('Period')) >= M0 && r.get('RAG')).map((r) => r.get('Workstream')));
    const repIn = wsActive.filter((c) => wsIn.has(c)).length;
    const raidWaiting = suggested + fromReports;
    const has = (t) => store.has ? store.has(t) : true;
    const crWaiting = has('tblChange') && use('Mod_CR') ? store.records('tblChange').filter((r) => r.get('Request type') !== 'Forecast change' && /^(New|Submitted|Pending|Under review|Raised|Draft)/i.test(r.get('Status'))).length : null;
    const tpcOut = has('tblTPC') && use('Use_TPC') ? store.records('tblTPC').filter((r) => r.get('Consent alert') === 'Outstanding' || (r.get('Status') && !/^(Agreed|Not needed|Not required|Complete|Closed|Remove)/i.test(r.get('Status')))).length : null;
    const drOn = has('tblDataReq') && use('Use_DR'), woOn = has('tblWO') && use('Use_WO');
    const drLate = (drOn ? store.records('tblDataReq').filter((r) => !/^(Delivered|Cancelled|Canceled|Withdrawn|Closed)/i.test(r.get('Status')) && Number(r.get('Due date')) && Number(r.get('Due date')) < T).length : 0)
      + (woOn ? store.records('tblWO').filter((r) => !/^(Complete|Cancelled|Canceled|Rejected|Closed)/i.test(r.get('Status')) && Number(r.get('Target completion')) && Number(r.get('Target completion')) < T).length : 0);
    const planLate = store.records('tblPlan').filter((r) => r.get('Status') === 'Late').length;
    const sheet = (name) => () => store.showRange(name, 'A1').catch((e) => toast(e.message, true));
    const phases = [
      ['Start the month', [
        ['rd', `Roll the reporting month forward (now ${fmtMonth(RD)})`, ed('Ticks itself when the reporting date is within the last month'), daysSinceRD <= 35, () => ctx.changeRD(), 'Change'],
        ['cal', 'Check the calendar for the coming weeks', ed('Contract dates, notice deadlines, forums, actions and decisions. Tick it yourself'), null, () => go('dates'), 'Key dates'],
        ['start', 'Ask the workstream leads for their reports', ed('One email to every workstream lead. Ticks itself when you send it'), null, startReporting, 'Email the leads']]],
      ['Collect and update', [
        ['rep', wsActive.length ? `Bring the reports in and check them (${repIn} of ${wsActive.length} in)` : 'Bring the reports in and check them', ed('Ticks itself when every active workstream has reported'), wsActive.length ? repIn >= wsActive.length : null, () => go('report')],
        ['raid', raidWaiting || overdue ? `Review new risks, issues and overdue actions (${raidWaiting} waiting, ${overdue} overdue)` : 'Review new risks, issues and overdue actions: nothing waiting', ed('Ticks itself when nothing is waiting and no actions are overdue'), raidWaiting === 0 && overdue === 0, () => go('raid', fromReports ? { newOnly: true } : { suggested: true })],
        ['int', `Update plan progress and readiness interviews${planLate || interviewsDue ? ` (${plural(planLate, 'late item')}, ${plural(interviewsDue, 'interview')} due)` : ''}`, ed('Ticks itself when nothing in the plan is late and no interviews are due'), planLate === 0 && interviewsDue === 0, () => go(interviewsDue && !planLate ? 'interview' : 'plan')],
        crWaiting == null ? null : ['cr', crWaiting ? `Process date changes and change requests (${crWaiting} waiting)` : 'Process date changes and change requests: none waiting', ed('Ticks itself when no change requests are waiting'), crWaiting === 0, () => go('changes')],
        tpcOut == null ? null : ['tpc', tpcOut ? `Chase vendor consents (${tpcOut} outstanding)` : 'Vendor consents: none outstanding', ed('Ticks itself when no consents are outstanding'), tpcOut === 0, () => go('thirdparties')],
        drOn || woOn ? ['drwo', drLate ? `Follow up data requests and work orders (${drLate} overdue)` : 'Follow up data requests and work orders: none overdue', ed('Ticks itself when none are overdue'), drLate === 0, () => go(drOn ? 'datareq' : 'workorders')] : null]],
      ['Check the money', [
        ['cost', 'Check the TSA cost tracker is up to date', ed('This month\'s fees, changes and credits. Tick it yourself'), null, sheet('TSA Cost Tracker'), 'Open sheet'],
        use('Use_INV') ? ['inv', 'Check the invoices received against the TSA fees', ed('Lines outside the threshold are flagged. Tick it yourself'), null, () => go('invoices')] : null,
        ['ourinv', 'Send our invoice for the reverse services', ed('Tick it yourself'), null, () => go('invoice')]]],
      ['Report', [
        ['dq', dqE ? `Clear the data quality errors (${dqE})` : 'Data quality: no errors', ed('Ticks itself when there are no errors'), dqE === 0, sheet('Data Quality'), 'Open sheet'],
        ['cons', 'Review the consolidated report and save the month', ed(`Add the ${team()} commentary. Tick it yourself`), null, () => go('consolidated')],
        ['pack', 'Prepare the governance packs', ed('Tick it yourself'), null, () => go('pack')]]]
    ].map(([p, ss]) => [p, ss.filter(Boolean)]);
    const items = phases.flatMap(([, ss]) => ss);
    const isDone = (it) => (manual[it[0]] != null ? manual[it[0]] : !!it[3]);
    const doneCount = items.filter(isDone).length;
    let k = 0;
    const month = h('section.card', { style: { flex: '1 1 340px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' } },
        h('h2.cap', `This month · ${fmtMonth(RD)}`), h('div.bar', h('div', { style: { width: Math.round(doneCount / items.length * 100) + '%' } })),
        h('span.small', { style: { fontWeight: 600, color: 'var(--navy)' } }, `${doneCount} of ${items.length}`)),
      phases.map(([pname, ss]) => [
        h('div.small', { style: { fontWeight: 700, letterSpacing: '0.06em', color: 'var(--muted)', margin: '10px 0 2px', textTransform: 'uppercase', fontSize: '11px' } }, pname),
        ss.map((it) => {
          k++;
          const done = isDone(it), id = 'm-' + it[0];
          const cb = h('input', { type: 'checkbox', id, checked: done, 'aria-label': `Step ${k}`, style: { width: '18px', height: '18px', accentColor: 'var(--navy)', flex: '0 0 auto' } });
          cb.addEventListener('change', async () => { manual[it[0]] = cb.checked; await store.src.setSetting(key, manual); ctx.rerender(); });
          return h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderTop: '1px solid var(--line-soft)' } },
            h('span', { style: { flex: '0 0 18px', textAlign: 'center', fontWeight: 700, color: 'var(--navy)', fontSize: '13px' } }, String(k)),
            cb, h('label', { for: id, style: { flex: '1 1 auto', fontSize: '13px', color: done ? 'var(--muted)' : 'var(--ink)' } }, it[1], h('br'), h('span.small.muted', it[2])),
            it[4] ? h('button.btn.btn-sm', { type: 'button', onclick: it[4], style: { whiteSpace: 'nowrap', flex: '0 0 auto' } }, it[5] || 'Open') : null);
        })]));

    // ---- workstream status from Consolidated WS Reporting (latest period, with trend against the one before)
    const wsName = Object.fromEntries(store.records('tblWorkstreams').map((r) => [r.get('Code'), r.get('Name')]));
    const st = store.records('tblStatus').filter((r) => (r.get('Scope') || 'Overall') === 'Overall');
    const periods = [...new Set(st.map((r) => Number(r.get('Period'))))].sort((a, b) => b - a);
    const cur = st.filter((r) => Number(r.get('Period')) === periods[0]);
    const prev = Object.fromEntries(st.filter((r) => Number(r.get('Period')) === periods[1]).map((r) => [r.get('Workstream'), r.get('RAG')]));
    const RANK = { Green: 1, Amber: 2, Red: 3 };
    const newRI = (ws) => ['tblRisks', 'tblIssues'].reduce((a, t) => a + store.records(t).filter((r) => r.get('Workstream') === ws && Number(r.get('Date raised')) >= periods[0]).length, 0);
    const wsList = h('section.card', { style: { flex: '1 1 320px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '8px' } }, h('h2.cap', { style: { flex: '1 1 auto' } }, `Workstream status · ${fmtMonth(periods[0])}`)),
      cur.length ? cur.map((r) => {
        const ws = r.get('Workstream'), rag = r.get('RAG'), p = prev[ws];
        const trend = !p || !RANK[rag] ? '' : RANK[rag] > RANK[p] ? 'worse' : RANK[rag] < RANK[p] ? 'better' : 'same';
        const nNew = newRI(ws);
        return h('button.ws-row', { type: 'button', onclick: () => (ws === ed('Programme') ? go('raid', { ws }) : go('report', { ws })), title: 'Open the workstream report' },
          h('span.ws-name', wsName[ws] || ws),
          nNew ? h('span.chip.info', `${nNew} new`) : null,
          h('span.ws-trend', trend),
          h('span.ws-rag', h('span.chip', { class: rag }, rag || '–')));
      }) : h('p.muted.small', 'No workstream status yet for this month.'),
      h('p.small.muted', { style: { margin: '8px 0 0' } }, 'Blue badges: risks and issues raised this month. Select a workstream to open its report.'));

    // ---- coming up in the next 30 days
    const soonDates = [];
    const add = (d, title, sub, k, arg) => { d = Number(d); if (d && d >= T && d <= T + 30) soonDates.push({ d, title, sub, k, arg }); };
    live.forEach((r) => {
      const id = r.get('TSA ID'), nm = r.get('Service name');
      add(r.get('Exit notice deadline'), `Exit notice due: ${id}`, nm, 'register', { id });
      add(r.get('Extension notice deadline'), `Extension notice deadline: ${id}`, nm, 'register', { id });
      add(r.get('Forecast exit date'), `Exit: ${id}`, nm, 'register', { id });
      add(readinessOf(store, r, xr[id], waive, T).next, `Readiness interview: ${id}`, nm, 'interview', { id });
    });
    store.records('tblOBL').filter((r) => r.get('Status (adopt or remove)') === 'Open').forEach((r) => add(r.get('Next due date'), r.get('Description'), `${r.get('Agreement')} ${r.get('Clause')}`.trim(), 'dates'));
    decisions.forEach((r) => add(r.get('Needed by'), `Decision needed: ${r.get('Decision ID')}`, r.get('Decision needed'), 'raid', { tab: 'DEC', id: r.get('Decision ID') }));
    actions.filter((r) => r.get('Status') === 'Open').forEach((r) => add(r.get('Due date'), `Action due: ${r.get('AC ID')}`, r.get('Action'), 'raid', { tab: 'AC', id: r.get('AC ID') }));
    soonDates.sort((a, b) => a.d - b.d);
    const comingUp = h('div.card',
      h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '6px' } }, h('h2.cap', { style: { flex: '1 1 auto' } }, 'Coming up in 30 days'),
        h('button.link-btn', { type: 'button', onclick: () => go('dates') }, 'Calendar')),
      soonDates.length ? soonDates.slice(0, 8).map((x) => {
        const [day, mon] = fmtDate(x.d, true).split(' ');
        const isUS = isNaN(Number(day));
        return h('div.date-row',
          h('div.cal', h('b', isUS ? mon : day), h('span', (isUS ? day : mon).toUpperCase())),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 } },
            h('button.link-btn', { type: 'button', style: { fontSize: '13px', textAlign: 'left', color: 'var(--ink)' }, onclick: () => go(x.k, x.arg) }, x.title),
            h('span.small.muted', x.sub)));
      }) : h('p.small.muted', 'Nothing due in the next 30 days.'),
      soonDates.length > 8 ? h('p.small.muted', { style: { margin: '6px 0 0' } }, `and ${soonDates.length - 8} more`) : null);

    // ---- milestones in the next 30 days, from the plan
    const plan = store.records('tblPlan').filter((r) => ['Milestone', 'Gate'].includes(r.get('Type')) && r.get('Status') !== 'Complete');
    const miles = plan.map((r) => ({ r, d: Number(r.get('Planned finish')) || 0 })).filter((x) => x.d && x.d <= T + 30).sort((a, b) => a.d - b.d);
    const milesCard = h('div.card',
      h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '6px' } }, h('h2.cap', { style: { flex: '1 1 auto' } }, 'Milestones in the next 30 days'),
        h('button.link-btn', { type: 'button', onclick: () => go('plan') }, 'Exit plan')),
      miles.length ? miles.slice(0, 8).map(({ r, d }) => {
        const late = d < T;
        return h('div.date-row', { style: { alignItems: 'center' } },
          h('span', { style: { width: '50px', fontWeight: 700, color: 'var(--navy)', fontSize: '13px', flex: '0 0 50px' } }, fmtDate(d, true)),
          h('span', { style: { flex: '1 1 auto', fontSize: '13px', minWidth: 0 } }, r.get('Activity'), h('br'), h('span.small.muted', `${r.get('TSA ID')} · ${r.get('Owner') || 'no owner'}`)),
          h('span.chip', { class: late ? 'Red' : 'blue' }, late ? 'Late' : r.get('Status')));
      }) : [h('p.small.muted', { style: { margin: '0 0 4px' } }, 'None due. The next ones:'),
        plan.map((r) => ({ r, d: Number(r.get('Planned finish')) || 0 })).filter((x) => x.d > T + 30).sort((a, b) => a.d - b.d).slice(0, 3).map(({ r, d }) =>
          h('div.date-row', { style: { alignItems: 'center' } },
            h('span', { style: { width: '50px', fontWeight: 700, color: 'var(--navy)', fontSize: '13px', flex: '0 0 50px' } }, fmtDate(d, true)),
            h('span', { style: { flex: '1 1 auto', fontSize: '13px', minWidth: 0 } }, r.get('Activity'), h('br'), h('span.small.muted', `${r.get('TSA ID')} · ${r.get('Owner') || 'no owner'}`))))],
      miles.length > 8 ? h('p.small.muted', { style: { margin: '6px 0 0' } }, `${miles.length - 8} more in the exit plan, including ${miles.filter((x) => x.d < T).length} late`) : null);

    // ---- Day 1 and first 100 days
    const phaseCards = [];
    const d1 = store.records('tblDay1').filter((r) => r.get('Status') !== 'Not required');
    const d1Done = d1.length && d1.every((r) => r.get('Status') === 'Complete');
    if (n.Use_D1 !== 'N' && d1.length && !d1Done) {   // hidden once the Day 1 plan is complete
      const mand = d1.filter((r) => r.get('Mandatory or discretionary') === 'Mandatory');
      const mDone = mand.filter((r) => r.get('Status') === 'Complete').length;
      const noGo = d1.filter((r) => r.get('Go / no-go') === 'No-go' || r.get('Go / no-go') === 'No go').length;
      const before = T < close;
      phaseCards.push(h('section.card', { style: { display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'center' } },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, h('h2.cap', 'Day 1 plan'),
          h('span.small.muted', before ? `Closing ${fmtDate(close)} · ${close - T} days to go` : `Closed ${fmtDate(close)}`)),
        h('span.chip', { class: noGo ? 'Red' : 'Green', style: { fontSize: '14px', padding: '5px 12px' } }, noGo ? 'NO-GO' : before ? 'GO' : 'DONE'),
        h('div.stat', h('b', `${mDone} of ${mand.length}`), h('span', 'mandatory tasks complete')),
        h('div.stat', h('b', String(noGo)), h('span', 'no-go items')),
        h('button.btn', { type: 'button', style: { marginLeft: 'auto' }, onclick: () => go('day1') }, 'Open Day 1 plan')));
    }
    const f1 = store.records('tblFirst100').filter((r) => r.get('Status') !== 'Not required');
    if (n.Use_F100 !== 'N' && f1.length && !f1.every((r) => r.get('Status') === 'Complete')) {   // hidden once complete
      const day = T - close;
      const fDone = f1.filter((r) => r.get('Status') === 'Complete').length;
      const late = f1.filter((r) => Number(r.get('Days late')) > 0 && r.get('Status') !== 'Complete').length;
      const inProg = f1.filter((r) => r.get('Status') === 'In progress').length;
      phaseCards.push(h('section.card', { style: { display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'center' } },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, h('h2.cap', 'First 100 days'),
          h('span.small.muted', day < 0 ? 'Starts at closing' : day <= 100 ? `Day ${day} of 100` : `Finished ${fmtDate(close + 100)}`)),
        h('div.bar', h('div', { style: { width: Math.round(fDone / f1.length * 100) + '%' } })),
        h('div.stat', h('b', `${fDone} of ${f1.length}`), h('span', 'tasks complete')),
        h('div.stat', h('b', { style: { color: late ? 'var(--r-fg)' : null } }, String(late)), h('span', 'late')),
        h('div.stat', h('b', String(inProg)), h('span', 'in progress')),
        h('button.btn', { type: 'button', onclick: () => go('f100') }, 'Open First 100 days')));
    }

    const intro = `${fmtMonth(RD)} reporting. ` + (nextExit ? `${plural(nextCount, 'service')} ${nextCount === 1 ? 'exits' : 'exit'} on ${fmtDate(nextExit)}.` : 'No exits planned.')
      + (reds ? ` ${plural(reds, 'service')} ${reds === 1 ? 'is' : 'are'} red.` : '');
    // One name: the person on the People sheet with the team's lead role, else the Hub owner answer (evaluation F).
    const leadP = store.records('tblPeople').find((r) => String(r.get('Role')).toLowerCase() === `${team()} lead`.toLowerCase());
    const owner = (leadP && leadP.get('Name')) || n.HubOwner;
    const hello = greeting() + (owner ? `, ${String(owner).split(' ')[0]}` : '');

    return h('div.page',
      h('div.band',
        h('div.page-head',
          h('div', h('div.band-kicker', `${n.ProgName || 'TransitionSuite'} · ${fmtMonth(RD)}`), h('h1', hello), h('p.lede', intro)),
          h('button.btn.btn-ghost', { type: 'button', onclick: () => go('raid', { add: true }) }, 'Add risk or issue'),
          h('button.btn.btn-onband', { type: 'button', onclick: () => go('pack') }, 'Produce governance pack')),
        tiles),
      ctx.preview ? h('div.banner', h('b', 'Browser preview.'), 'You are looking at the demo workbook outside Excel. Edits are kept until you reload and calculated values do not update. In Excel, every change goes straight into the workbook.') : null,
      healthCheck(ctx),
      phaseCards,
      h('div.row-wrap', month, wsList, h('div', { style: { flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 } }, comingUp, milesCard)));
  }
};

function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}
