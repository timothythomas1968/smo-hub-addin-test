// Home: the month at a glance, built live from the workbook.
import { h, fmtDate, fmtMonth, plural } from '../util.js?v=0.2.3.20261030214117';

const EXITED = new Set(['Exited', 'Terminated']);
const closedLike = new Set(['Closed', 'Remove', 'Removed', 'Made', 'Withdrawn', 'Cancelled', 'Complete', 'Not required']);

export default {
  tables: ['tblTSA', 'tblStatus', 'tblWorkstreams', 'tblRisks', 'tblIssues', 'tblDecisions', 'tblAssumpDep', 'tblActions', 'tblOBL', 'tblPlan', 'tblDay1', 'tblFirst100'],
  render(ctx) {
    const { store, go } = ctx;
    const n = store.names;
    const RD = Number(n.RD) || 0, close = Number(n.CloseDate) || 0;
    const tsa = store.records('tblTSA');
    const live = tsa.filter((r) => !EXITED.has(r.get('Status')));
    const exited = tsa.length - live.length;
    const ragOf = (r) => [r.get('Service delivery RAG'), r.get('Exit readiness RAG')];
    const reds = live.filter((r) => ragOf(r).includes('Red')).length;
    const ambers = live.filter((r) => !ragOf(r).includes('Red') && ragOf(r).includes('Amber')).length;
    const future = live.map((r) => Number(r.get('Forecast exit date')) || 0).filter((d) => d >= RD).sort((a, b) => a - b);
    const nextExit = future[0];
    const nextCount = future.filter((d) => d === nextExit).length;

    const decisions = store.records('tblDecisions').filter((r) => r.get('Status') === 'Open');
    const nextDec = decisions.map((r) => Number(r.get('Needed by')) || 0).filter(Boolean).sort((a, b) => a - b)[0];
    const actions = store.records('tblActions');
    const overdue = actions.filter((r) => r.get('Overdue') === 'Overdue').length;
    const openActions = actions.filter((r) => r.get('Status') === 'Open').length;
    const suggested = ['tblRisks', 'tblAssumpDep'].reduce((a, t) => a + store.records(t).filter((r) => r.get('Status (adopt or remove)') === 'Suggested').length, 0);
    const dqE = Number(n.DQ_Errors) || 0, dqW = Number(n.DQ_Warnings) || 0;

    const tile = (label, value, sub, tone, onclick) => h(onclick ? 'button.tile' : 'div.tile', { type: onclick ? 'button' : null, class: tone, onclick },
      h('span.tile-label', label), h('span.tile-value', value), h('span.tile-sub', sub, onclick ? ' ›' : ''));
    const tiles = h('div.tiles',
      tile('Services', String(live.length), `running · ${exited} exited`, null, () => go('register')),
      tile('Red or amber', String(reds + ambers), `${reds} red · ${ambers} amber`, reds ? 'red' : ambers ? 'amber' : 'green', () => go('register', { filter: 'ra' })),
      tile('Next exits', nextExit ? fmtDate(nextExit, true) : '–', nextExit ? plural(nextCount, 'service') : 'none planned', null, () => go('register', { filter: 'next' })),
      tile('Decisions needed', String(decisions.length), nextDec ? `next by ${fmtDate(nextDec, true)}` : 'none open', null, () => go('raid', { tab: 'DEC' })),
      tile('Actions overdue', String(overdue), `${openActions} open`, overdue ? 'red' : null, () => go('raid', { tab: 'AC' })),
      tile('Data quality', String(dqE), `errors · ${dqW} warnings`, dqE ? 'amber' : 'green', null));

    // ---- this month checklist: some items tick themselves from the data; the rest are ticked by hand
    const key = 'month-' + RD;
    const manual = store.src.getSetting(key) || {};
    const daysSinceRD = Math.floor(Date.now() / 86400000 + 25569) - RD;   // today as an Excel serial, minus RD
    const interviewsDue = live.filter((r) => { const d = Number(r.get('Next readiness interview')); return d && d <= RD + 14; }).length;
    const items = [
      ['rd', `Set the reporting date (now ${fmtDate(RD)})`, 'Ticks itself when the date is within the last month', daysSinceRD <= 35, null],
      ['raid', suggested ? `Review the RAID: ${plural(suggested, 'suggested item')} waiting` : 'Review the RAID: nothing waiting', 'Ticks itself when nothing is waiting', suggested === 0, () => go('raid', { suggested: true })],
      ['act', overdue ? `Chase ${plural(overdue, 'overdue action')}` : 'No overdue actions', 'Ticks itself when no actions are overdue', overdue === 0, () => go('raid', { tab: 'AC' })],
      ['int', interviewsDue ? `Hold the readiness interviews due (${interviewsDue})` : 'No readiness interviews due', 'Ticks itself when none are due', interviewsDue === 0, () => go('interview')],
      ['dq', dqE ? `Clear the data quality errors (${dqE})` : 'Data quality: no errors', 'Ticks itself when there are no errors', dqE === 0, null],
      ['inv', 'Record the invoices received this month', 'Tick it yourself', null, () => go('invoice')],
      ['rep', 'Collect the workstream reports', 'Tick it yourself', null, () => go('report')],
      ['pack', 'Send the governance pack', 'Tick it yourself', null, () => go('pack')]
    ];
    const isDone = (it) => (manual[it[0]] != null ? manual[it[0]] : !!it[3]);
    const doneCount = items.filter(isDone).length;
    const month = h('section.card', { style: { flex: '1 1 340px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' } },
        h('h2.cap', `This month · ${fmtMonth(RD)}`), h('div.bar', h('div', { style: { width: Math.round(doneCount / items.length * 100) + '%' } })),
        h('span.small', { style: { fontWeight: 600, color: 'var(--navy)' } }, `${doneCount} of ${items.length}`)),
      items.map((it, i) => {
        const done = isDone(it), id = 'm-' + it[0];
        const cb = h('input', { type: 'checkbox', id, checked: done, style: { width: '18px', height: '18px', accentColor: 'var(--navy)', flex: '0 0 auto' } });
        cb.addEventListener('change', async () => { manual[it[0]] = cb.checked; await store.src.setSetting(key, manual); ctx.rerender(); });
        return h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 0', borderTop: '1px solid var(--line-soft)' } },
          cb, h('label', { for: id, style: { flex: '1 1 auto', fontSize: '13px', color: done ? 'var(--muted)' : 'var(--ink)' } }, it[1], h('br'), h('span.small.muted', it[2])),
          it[4] ? h('button.btn.btn-sm', { type: 'button', onclick: it[4] }, 'Open') : null);
      }));

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
        return h('button.ws-row', { type: 'button', onclick: () => go('raid', { ws }), title: 'Open the RAID for this workstream' },
          h('span.ws-name', wsName[ws] || ws),
          nNew ? h('span.chip.info', `${nNew} new`) : null,
          h('span.ws-trend', trend),
          h('span.ws-rag', h('span.chip', { class: rag }, rag || '–')));
      }) : h('p.muted.small', 'No workstream status yet for this month.'),
      h('p.small.muted', { style: { margin: '8px 0 0' } }, 'Blue badges: risks and issues raised this month. Select a workstream to see its RAID.'));

    // ---- coming up in the next 30 days
    const soonDates = [];
    const add = (d, title, sub, k, arg) => { d = Number(d); if (d && d >= RD && d <= RD + 30) soonDates.push({ d, title, sub, k, arg }); };
    live.forEach((r) => {
      const id = r.get('TSA ID'), nm = r.get('Service name');
      add(r.get('Exit notice deadline'), `Exit notice due: ${id}`, nm, 'register', { id });
      add(r.get('Extension notice deadline'), `Extension notice deadline: ${id}`, nm, 'register', { id });
      add(r.get('Forecast exit date'), `Exit: ${id}`, nm, 'register', { id });
      add(r.get('Next readiness interview'), `Readiness interview: ${id}`, nm, 'interview');
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
    const miles = plan.map((r) => ({ r, d: Number(r.get('Planned finish')) || 0 })).filter((x) => x.d && x.d <= RD + 30).sort((a, b) => a.d - b.d);
    const milesCard = h('div.card',
      h('div', { style: { display: 'flex', alignItems: 'center', marginBottom: '6px' } }, h('h2.cap', { style: { flex: '1 1 auto' } }, 'Milestones in the next 30 days'),
        h('button.link-btn', { type: 'button', onclick: () => go('plan') }, 'Exit plan')),
      miles.length ? miles.slice(0, 8).map(({ r, d }) => {
        const late = d < RD;
        return h('div.date-row', { style: { alignItems: 'center' } },
          h('span', { style: { width: '50px', fontWeight: 700, color: 'var(--navy)', fontSize: '13px', flex: '0 0 50px' } }, fmtDate(d, true)),
          h('span', { style: { flex: '1 1 auto', fontSize: '13px', minWidth: 0 } }, r.get('Activity'), h('br'), h('span.small.muted', `${r.get('TSA ID')} · ${r.get('Owner') || 'no owner'}`)),
          h('span.chip', { class: late ? 'Red' : 'blue' }, late ? 'Late' : r.get('Status')));
      }) : [h('p.small.muted', { style: { margin: '0 0 4px' } }, 'None due. The next ones:'),
        plan.map((r) => ({ r, d: Number(r.get('Planned finish')) || 0 })).filter((x) => x.d > RD + 30).sort((a, b) => a.d - b.d).slice(0, 3).map(({ r, d }) =>
          h('div.date-row', { style: { alignItems: 'center' } },
            h('span', { style: { width: '50px', fontWeight: 700, color: 'var(--navy)', fontSize: '13px', flex: '0 0 50px' } }, fmtDate(d, true)),
            h('span', { style: { flex: '1 1 auto', fontSize: '13px', minWidth: 0 } }, r.get('Activity'), h('br'), h('span.small.muted', `${r.get('TSA ID')} · ${r.get('Owner') || 'no owner'}`))))],
      miles.length > 8 ? h('p.small.muted', { style: { margin: '6px 0 0' } }, `${miles.length - 8} more in the exit plan, including ${miles.filter((x) => x.d < RD).length} late`) : null);

    // ---- Day 1 and first 100 days
    const phaseCards = [];
    const d1 = store.records('tblDay1').filter((r) => r.get('Status') !== 'Not required');
    if (n.Use_D1 !== 'N' && d1.length) {
      const mand = d1.filter((r) => r.get('Mandatory or discretionary') === 'Mandatory');
      const mDone = mand.filter((r) => r.get('Status') === 'Complete').length;
      const noGo = d1.filter((r) => r.get('Go / no-go') === 'No-go' || r.get('Go / no-go') === 'No go').length;
      const before = RD < close;
      phaseCards.push(h('section.card', { style: { display: 'flex', flexWrap: 'wrap', gap: '18px', alignItems: 'center' } },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '2px' } }, h('h2.cap', 'Day 1 plan'),
          h('span.small.muted', before ? `Closing ${fmtDate(close)} · ${close - RD} days to go` : `Closed ${fmtDate(close)}`)),
        h('span.chip', { class: noGo ? 'Red' : 'Green', style: { fontSize: '14px', padding: '5px 12px' } }, noGo ? 'NO-GO' : before ? 'GO' : 'DONE'),
        h('div.stat', h('b', `${mDone} of ${mand.length}`), h('span', 'mandatory tasks complete')),
        h('div.stat', h('b', String(noGo)), h('span', 'no-go items')),
        h('button.btn', { type: 'button', style: { marginLeft: 'auto' }, onclick: () => go('day1') }, 'Open Day 1 plan')));
    }
    const f1 = store.records('tblFirst100').filter((r) => r.get('Status') !== 'Not required');
    if (n.Use_F100 !== 'N' && f1.length) {
      const day = RD - close;
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
    const hello = greeting() + (n.HubOwner ? `, ${String(n.HubOwner).split(' ')[0]}` : '');

    return h('div.page',
      ctx.preview ? h('div.banner', h('b', 'Browser preview.'), 'You are looking at the demo workbook outside Excel. Edits are kept until you reload and calculated values do not update. In Excel, every change goes straight into the workbook.') : null,
      h('div.page-head',
        h('div', h('h1', hello), h('p.lede', intro)),
        h('button.btn', { type: 'button', onclick: () => go('raid', { add: true }) }, 'Add risk or issue'),
        h('button.btn.btn-primary', { type: 'button', onclick: () => go('pack') }, 'Produce governance pack')),
      tiles,
      phaseCards,
      h('div.row-wrap', month, wsList, h('div', { style: { flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: '18px', minWidth: 0 } }, comingUp, milesCard)));
  }
};

function greeting() {
  const hr = new Date().getHours();
  return hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
}
