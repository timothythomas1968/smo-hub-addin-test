// Home's one-page health check: nine cards, each a number, a small chart and the few items that need attention.
// Everything is worked out live from the workbook: alerts from today (asOf), reporting items from the reporting date (RD). Cards for parts of the Hub
// a programme does not use (the Use_ set-up answers, or a tier without that sheet) are left out.
import { h, fmtDate, fmtMonth, plural, ed, fromSerial, toSerial, team, asOf } from '../util.js?v=0.9.5.20261106193911';
import { COL, donut, stackBar, columns, meter } from '../charts.js?v=0.9.5.20261106193911';
import { readinessOf } from '../readiness.js?v=0.9.5.20261106193911';

export const HEALTH_TABLES = ['tblREG', 'tblTPC', 'tblOBL', 'tblActions', 'tblSLA', 'tblStatus', 'tblWorkstreams', 'tblDataReq', 'tblWO',
  'tblChange', 'tblInvoices', 'tblCostLines', 'tblReadiness', 'tblPeople', 'tblTSA'];

const monthStart = (n) => { const d = fromSerial(n); return d ? toSerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))) : 0; };
const addMonths = (n, k) => { const d = fromSerial(n); return toSerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1))); };
const yearOf = (n) => fromSerial(n).getUTCFullYear();
const num = (v) => Number(v) || 0;

/** Short money: £14.5m, £426k, £950. */
export function mshort(v, sym) {
  const a = Math.abs(v), s = v < 0 ? '−' : '';
  return s + sym + (a >= 1e6 ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'm' : a >= 1e3 ? Math.round(a / 1e3) + 'k' : Math.round(a));
}

export function healthCheck(ctx) {
  const { store, go } = ctx;
  const n = store.names, RD = num(n.RD), T = asOf(n), sym = n.CcySym || '';   // alerts run from today (T), reporting from RD
  const use = (k) => n[k] !== 'N';
  const M0 = monthStart(RD);
  const cards = [];

  // A card: title, the headline figure and its tone, a chart, up to four items, and where to go.
  const card = ({ title, big, bigSub, tone, chart, items = [], more = 0, open, openLabel = 'Open', empty }) => h('section.hc', { class: tone || 'ok' },
    h('div.hc-head', h('h3', title), h('span.hc-flag', { class: tone || 'ok' }, tone === 'red' ? 'Act now' : tone === 'amber' ? 'Watch' : 'On track')),
    h('div.hc-body', h('div.hc-fig', h('b', big), h('span', bigSub)), chart || null),
    items.length ? h('ul.hc-list', items.slice(0, 4).map((it) => h('li', h('span.hc-when', { class: it.late ? 'late' : null }, it.when || ''), h('span.hc-what', it.what)))) : h('p.hc-empty', empty || 'Nothing needs attention.'),
    h('div.hc-foot', more > 0 ? h('span.small.muted', `and ${more} more`) : h('span'),
      open ? h('button.link-btn', { type: 'button', onclick: open }, openLabel + ' ›') : null));
  const when = (d) => (num(d) ? fmtDate(num(d), true) : '');

  // 1. Regulatory approvals outstanding and third-party consents due
  const regOn = store.has('tblREG') && use('Use_REG'), tpcOn = store.has('tblTPC') && use('Use_TPC');
  if (regOn || tpcOn) {
    const reg = regOn ? store.records('tblREG') : [];
    const regDone = reg.filter((r) => /^Approved|Not required|Withdrawn|Not needed/i.test(r.get('Status')));
    const regOpen = reg.filter((r) => !regDone.includes(r));
    const regLate = regOpen.filter((r) => num(r.get('Due date')) && num(r.get('Due date')) < T);
    const tpc = tpcOn ? store.records('tblTPC') : [];
    const tpcOpen = tpc.filter((r) => r.get('Consent alert') === 'Outstanding' || !/^(Agreed|Not needed|Not required|Complete|Closed)/i.test(r.get('Status')));
    const tpcDue = tpcOpen.filter((r) => num(r.get('Response due')) && num(r.get('Response due')) <= T + 30);
    const items = [
      ...regLate.map((r) => ({ when: when(r.get('Due date')), late: true, what: `${r.get('Filing or approval')} (${r.get('Regulator') || r.get('Jurisdiction')})` })),
      ...regOpen.filter((r) => !regLate.includes(r)).sort((a, b) => num(a.get('Due date')) - num(b.get('Due date'))).map((r) => ({ when: when(r.get('Due date')), what: `${r.get('Filing or approval')} (${r.get('Regulator') || r.get('Jurisdiction')})` })),
      ...tpcDue.map((r) => ({ when: when(r.get('Response due')), late: num(r.get('Response due')) < T, what: `Consent: ${r.get('Vendor')} · ${r.get('Status')}` }))];
    cards.push(card({
      title: 'Approvals and consents', big: String(regOpen.length + tpcOpen.length), bigSub: `${plural(regOpen.length, 'approval')} and ${plural(tpcOpen.length, 'consent')} outstanding`,
      tone: regLate.length || tpcDue.some((r) => num(r.get('Response due')) < T) ? 'red' : regOpen.length || tpcOpen.length ? 'amber' : 'ok',
      chart: donut([{ v: regDone.length + (tpc.length - tpcOpen.length), c: COL.g, label: 'Done' }, { v: regOpen.length + tpcOpen.length - regLate.length, c: COL.a, label: 'Outstanding' }, { v: regLate.length, c: COL.r, label: 'Overdue' }],
        { size: 84, centre: `${regDone.length + tpc.length - tpcOpen.length}/${reg.length + tpc.length}`, caption: 'done', label: 'Approvals and consents done' }),
      items, more: items.length - 4, open: () => go('dates'), openLabel: 'Key dates'
    }));
  }

  // 2. Spend this year and next: TSA fees from the register (calendar years), and one-off costs
  const tsa = store.records('tblTSA');
  if (tsa.length) {
    const y0 = yearOf(T);
    const feeIn = (year, dir) => tsa.filter((r) => r.get('Direction') === dir).reduce((sum, r) => {
      const fee = num(r.get('Monthly fee (reporting currency)')), s = monthStart(num(r.get('Service start')) || num(n.CloseDate));
      const end = monthStart(num(r.get('Actual exit date')) || num(r.get('Forecast exit date')));
      if (!fee || !s || !end) return sum;
      let m = 0;
      for (let k = 0; k < 12; k++) { const ms = toSerial(new Date(Date.UTC(year, k, 1))); if (ms >= s && ms < end) m++; }
      return sum + fee * m;
    }, 0);
    const fwd0 = feeIn(y0, 'Forward'), fwd1 = feeIn(y0 + 1, 'Forward'), rev0 = feeIn(y0, 'Reverse'), rev1 = feeIn(y0 + 1, 'Reverse');
    const oneOff = store.records('tblCostLines').reduce((a, r) => a + num(r.get('Our share of forecast (reporting currency)')), 0);
    const cap = num(n.FeeCap), fc = num(n.FEE_FwdFcTot);
    const over = cap && fc > cap;
    cards.push(card({
      title: 'Spend this year and next', big: mshort(fwd0 + fwd1, sym), bigSub: `TSA fees we pay, ${y0} and ${y0 + 1}`,
      tone: over ? 'red' : cap && fc > cap * 0.9 ? 'amber' : 'ok',
      chart: columns([{ label: String(y0), bars: [{ v: fwd0, c: COL.navy, label: 'TSA fees we pay' }, { v: rev0, c: COL.soft, label: 'reverse fees we receive' }] },
        { label: String(y0 + 1), bars: [{ v: fwd1, c: COL.navy, label: 'TSA fees we pay' }, { v: rev1, c: COL.soft, label: 'reverse fees we receive' }] }],
      { width: 190, height: 110, fmt: (v) => mshort(v, sym), label: 'TSA fees by year' }),
      items: [
        cap ? { when: 'Fee cap', what: h('span', `${mshort(fc, sym)} forecast of ${mshort(cap, sym)} `, meter(fc, cap, { width: 110, height: 8, label: 'Forecast against the fee cap' })) } : null,
        { when: 'Reverse', what: `${mshort(rev0, sym)} in ${y0}, ${mshort(rev1, sym)} in ${y0 + 1} (we provide)` },
        oneOff ? { when: 'One-off', what: `${mshort(oneOff, sym)} separation costs, our share at completion` } : null].filter(Boolean),
      open: () => go('pack'), openLabel: 'Governance pack'
    }));
  }

  // 3. Obligations due in 60 days and actions due in 5
  const oblOn = store.has('tblOBL') && use('Use_OBL');
  const obl = oblOn ? store.records('tblOBL').filter((r) => r.get('Status (adopt or remove)') === 'Open' && num(r.get('Next due date')) && num(r.get('Next due date')) <= T + 60) : [];
  const acts = store.records('tblActions').filter((r) => r.get('Status') === 'Open' && num(r.get('Due date')) && num(r.get('Due date')) <= T + 5);
  const actLate = acts.filter((r) => num(r.get('Due date')) < T);
  {
    const items = [...actLate.map((r) => ({ when: when(r.get('Due date')), late: true, what: `${r.get('AC ID')} ${r.get('Action')}` })),
      ...acts.filter((r) => !actLate.includes(r)).map((r) => ({ when: when(r.get('Due date')), what: `${r.get('AC ID')} ${r.get('Action')}` })),
      ...obl.sort((a, b) => num(a.get('Next due date')) - num(b.get('Next due date'))).map((r) => ({ when: when(r.get('Next due date')), late: num(r.get('Next due date')) < T, what: r.get('Description') }))];
    cards.push(card({
      title: 'Due soon', big: String(acts.length + obl.length), bigSub: `${plural(acts.length, 'action')} due in 5 days${oblOn ? `, ${plural(obl.length, 'obligation')} in 60` : ''}`,
      tone: actLate.length ? 'red' : acts.length || obl.length ? 'amber' : 'ok',
      chart: stackBar([{ v: actLate.length, c: COL.r, label: 'Actions overdue' }, { v: acts.length - actLate.length, c: COL.a, label: 'Actions due in 5 days' }, { v: obl.length, c: COL.blue, label: 'Obligations due in 60 days' }], { width: 120, height: 12, label: 'Due soon' }),
      items, more: items.length - 4, open: () => go('raid', { tab: 'AC' }), openLabel: 'Actions'
    }));
  }

  // 4. Poor service delivery this month (SLA: latest month only), with the register's delivery RAG
  if (store.has('tblSLA') && use('Use_SLA')) {
    const sla = store.records('tblSLA').filter((r) => r.get('Latest result'));
    const cnt = (x) => sla.filter((r) => r.get('Latest result') === x).length;
    const met = cnt('Met'), concern = cnt('Concern'), missed = cnt('Missed');
    const redRag = tsa.filter((r) => r.get('Service delivery RAG') === 'Red' && !/Exited|Terminated/.test(r.get('Status')));
    const items = [...sla.filter((r) => r.get('Latest result') === 'Missed').map((r) => ({ when: 'Missed', late: true, what: `${r.get('TSA ID')} ${r.get('Service')}${num(r.get('Months below standard in a row')) > 1 ? ` (${r.get('Months below standard in a row')} months in a row)` : ''}` })),
      ...sla.filter((r) => r.get('Latest result') === 'Concern').map((r) => ({ when: 'Concern', what: `${r.get('TSA ID')} ${r.get('Service')}` })),
      ...redRag.filter((r) => !sla.some((s) => s.get('TSA ID') === r.get('TSA ID') && s.get('Latest result') !== 'Met')).map((r) => ({ when: 'Red', late: true, what: `${r.get('TSA ID')} ${r.get('Service name')}` }))];
    cards.push(card({
      title: 'Service delivery', big: String(missed + concern), bigSub: `below standard in the latest month · ${met} met${redRag.length ? ` · ${redRag.length} red` : ''}`,
      tone: missed ? 'red' : concern || redRag.length ? 'amber' : 'ok',
      chart: donut([{ v: met, c: COL.g, label: 'Met' }, { v: concern, c: COL.a, label: 'Concern' }, { v: missed, c: COL.r, label: 'Missed' }], { size: 84, centre: sla.length ? Math.round(met / sla.length * 100) + '%' : '–', caption: 'met', label: 'Service levels met' }),
      items, more: items.length - 4, open: () => go('register', { filter: 'ra' }), openLabel: 'TSA register'
    }));
  }

  // 5. Workstream reports outstanding for this month
  const wsRows = store.records('tblWorkstreams').filter((r) => r.get('Active (Y/N)') === 'Y');
  if (wsRows.length) {
    const got = new Set(store.records('tblStatus').filter((r) => monthStart(num(r.get('Period'))) === M0 && (r.get('Scope') || 'Overall') === 'Overall' && r.get('RAG')).map((r) => r.get('Workstream')));
    const missing = wsRows.filter((r) => !got.has(r.get('Code')));
    const done = wsRows.length - missing.length;
    cards.push(card({
      title: 'Workstream reports', big: `${done} of ${wsRows.length}`, bigSub: `in for ${fmtMonth(RD)}`,
      tone: !missing.length ? 'ok' : done < wsRows.length / 2 ? 'red' : 'amber',
      chart: donut([{ v: done, c: COL.navy, label: 'Received' }, { v: missing.length, c: COL.line, label: 'Outstanding' }], { size: 84, centre: wsRows.length ? Math.round(done / wsRows.length * 100) + '%' : '–', caption: 'in', label: 'Reports received' }),
      items: missing.map((r) => ({ when: r.get('Code'), what: `${r.get('Name')}${r.get('Buyer lead') ? ' · ' + r.get('Buyer lead') : ''}` })), more: missing.length - 4,
      empty: 'Every workstream has reported.', open: () => go('report'), openLabel: 'Workstream report'
    }));
  }

  // 6. Data requests and work orders overdue or due
  const drOn = store.has('tblDataReq') && use('Use_DR'), woOn = store.has('tblWO') && use('Use_WO');
  if (drOn || woOn) {
    const dr = drOn ? store.records('tblDataReq').filter((r) => !/^(Delivered|Cancelled|Canceled|Withdrawn|Closed)/i.test(r.get('Status')) && num(r.get('Due date')) && num(r.get('Due date')) <= T + 30) : [];
    const wo = woOn ? store.records('tblWO').filter((r) => !/^(Complete|Cancelled|Canceled|Rejected|Closed)/i.test(r.get('Status')) && num(r.get('Target completion')) && num(r.get('Target completion')) <= T + 30) : [];
    const late = [...dr.filter((r) => num(r.get('Due date')) < T), ...wo.filter((r) => num(r.get('Target completion')) < T)];
    const items = [...dr.map((r) => ({ when: when(r.get('Due date')), late: num(r.get('Due date')) < T, what: `${r.get('DR ID')} ${r.get('Data set requested')}` })),
      ...wo.map((r) => ({ when: when(r.get('Target completion')), late: num(r.get('Target completion')) < T, what: `${r.get('WO ID')} ${r.get('Title')}` }))].sort((a, b) => (b.late ? 1 : 0) - (a.late ? 1 : 0));
    cards.push(card({
      title: 'Data requests and work orders', big: String(dr.length + wo.length), bigSub: `due in 30 days or overdue (${late.length} overdue)`,
      tone: late.length ? 'red' : dr.length + wo.length ? 'amber' : 'ok',
      chart: stackBar([{ v: late.length, c: COL.r, label: 'Overdue' }, { v: dr.length + wo.length - late.length, c: COL.a, label: 'Due in 30 days' }], { width: 120, height: 12, label: 'Data requests and work orders' }),
      items, more: items.length - 4
    }));
  }

  // 7. New change requests
  if (store.has('tblChange') && use('Mod_CR')) {
    const cr = store.records('tblChange');
    const waiting = cr.filter((r) => r.get('Request type') !== 'Forecast change' && /^(New|Submitted|Pending|Under review|Raised|Draft)/i.test(r.get('Status')));
    const fresh = waiting.filter((r) => num(r.get('Raised on')) >= T - 30 || /^New/i.test(r.get('Status')));
    const items = waiting.sort((a, b) => num(b.get('Raised on')) - num(a.get('Raised on'))).map((r) => ({ when: r.get('Status'), late: num(r.get('Decision due')) && num(r.get('Decision due')) < T, what: `${r.get('CR ID')} ${r.get('Title') || r.get('Request type')}${num(r.get('Decision due')) ? ` · decide by ${fmtDate(num(r.get('Decision due')), true)}` : ''}` }));
    cards.push(card({
      title: 'Change requests', big: String(waiting.length), bigSub: `awaiting a decision (${fresh.length} new this month)`,
      tone: items.some((i) => i.late) ? 'red' : waiting.length ? 'amber' : 'ok',
      chart: donut([{ v: cr.length - waiting.length, c: COL.g, label: 'Decided' }, { v: waiting.length, c: COL.a, label: 'Awaiting a decision' }], { size: 84, centre: String(cr.length), caption: 'in total', label: 'Change requests' }),
      items, more: items.length - 4, empty: 'No change requests waiting.'
    }));
  }

  // 8. Set-up gaps
  {
    const gaps = [];
    const need = [['ProgName', 'Programme name'], ['BuyerName', 'Buyer'], ['SellerName', 'Seller'], ['CloseDate', 'Closing date'], ['RepCcy', 'Reporting currency'], ['HubOwner', 'Hub owner'], ['TeamName', 'Name of your team'], ['FeeCap', 'Fee cap']];
    need.forEach(([k, label]) => { if (k in n && (n[k] === '' || n[k] == null)) gaps.push({ when: 'Set-up', what: ed(label) + ' not answered' }); });
    const liveTsa = tsa.filter((r) => !/Exited|Terminated/.test(r.get('Status')));
    // the workbook's DQ-10 rule: a fee, or a fee basis note, or "No charge" as the charging basis
    const noFee = liveTsa.filter((r) => !num(r.get('Monthly fee (key input)')) && !String(r.get('Fee basis note') || '').trim() && !/^(No charge|Pass-through)$/.test(r.get('Charging basis'))).length;
    const noOwner = liveTsa.filter((r) => !r.get('Provider service owner') || !r.get('Recipient service owner')).length;
    const noExit = liveTsa.filter((r) => !num(r.get('Forecast exit date'))).length;
    if (noFee) gaps.push({ when: 'Services', what: `${plural(noFee, 'service')} with no monthly fee and no fee basis note` });
    if (noOwner) gaps.push({ when: 'Services', what: `${plural(noOwner, 'service')} missing a service owner` });
    if (noExit) gaps.push({ when: 'Services', what: `${plural(noExit, 'service')} with no exit date` });
    const ppl = store.records('tblPeople'), noMail = ppl.filter((r) => !r.get('Email')).length;
    if (noMail) gaps.push({ when: 'People', what: `${plural(noMail, 'person', 'people')} with no email address` });
    const noLead = wsRows.filter((r) => !r.get('Buyer lead') && !r.get('Seller lead') && r.get('Code') !== 'GOV').length;
    if (noLead) gaps.push({ when: 'Workstreams', what: `${plural(noLead, 'workstream')} with no lead` });
    const dqE = num(n.DQ_Errors), dqW = num(n.DQ_Warnings);
    cards.push(card({
      title: 'Set-up gaps', big: String(gaps.length), bigSub: `gaps · data checks: ${plural(dqE, 'error')}, ${plural(dqW, 'warning')}`,
      tone: gaps.length > 2 || dqE ? 'amber' : 'ok',
      chart: stackBar([{ v: dqE, c: COL.r, label: 'Data check errors' }, { v: dqW, c: COL.a, label: 'Data check warnings' }], { width: 120, height: 12, label: 'Data checks' }),
      items: gaps, more: gaps.length - 4, empty: 'Set-up is complete.', open: () => go('setup'), openLabel: 'Set-up wizard'
    }));
  }

  // 9. Parts of the Hub not in step with the reporting date
  {
    const off = [];
    const periods = store.records('tblStatus').map((r) => monthStart(num(r.get('Period')))).filter(Boolean);
    const lastP = periods.length ? Math.max(...periods) : 0;
    if (wsRows.length && lastP && lastP < M0) off.push({ when: 'Reports', late: true, what: `Workstream reports go up to ${fmtMonth(lastP)}` });
    if (store.has('tblSLA') && use('Use_SLA')) {
      const ms = store.records('tblSLA').map((r) => monthStart(num(r.get('Latest month')))).filter(Boolean);
      const behind = ms.filter((m) => m < M0);
      if (behind.length) {
        const latest = Math.max(...behind), most = behind.filter((m) => m === latest).length;
        off.push({ when: 'SLA', late: true, what: `Service levels entered up to ${fmtMonth(latest)}${behind.length > most ? ` (${behind.length - most} further behind)` : ''}: ${fmtMonth(RD)} not entered yet` });
      }
    }
    const waive = store.src.getSetting('ri-waive') || {}, xr = Object.fromEntries(store.records('tblReadiness').map((r) => [r.get('TSA ID'), r]));
    const rdy = tsa.filter((r) => !/Exited|Terminated/.test(r.get('Status'))).reduce((a, r) => a + readinessOf(store, r, xr[r.get('TSA ID')], waive, T).overdue, 0);
    if (rdy) off.push({ when: 'Readiness', late: true, what: `${plural(rdy, 'readiness interview')} overdue` });
    if (store.has('tblInvoices') && use('Use_INV')) {
      const exp = store.records('tblInvoices').filter((r) => r.get('Status') === 'Expected' && num(r.get('Service month')) && monthStart(num(r.get('Service month'))) < addMonths(M0, -1) + 0).length;
      if (exp) off.push({ when: 'Invoices', what: `${plural(exp, 'invoice')} for earlier months still not received` });
    }
    if (monthStart(T) > addMonths(M0, 1)) off.push({ when: 'Date', what: `The reporting date (${fmtDate(RD)}) is more than a month behind today` });
    cards.push(card({
      title: 'In step with the reporting date', big: String(off.length), bigSub: off.length ? `${off.length === 1 ? 'part' : 'parts'} of the Hub behind ${fmtMonth(RD)}` : `everything is up to ${fmtMonth(RD)}`,
      tone: off.some((o) => o.late) ? 'amber' : 'ok',
      items: off, empty: 'Every part of the Hub is up to date.', open: () => ctx.changeRD(), openLabel: 'Reporting date'
    }));
  }

  return h('section.health', h('div.health-head', h('h2.cap', `Health check · today ${fmtDate(T)} · reporting ${fmtMonth(RD)}`),
    h('span.small.muted', `${cards.filter((c) => c.classList.contains('red')).length} to act on now · ${cards.filter((c) => c.classList.contains('amber')).length} to watch · ${team()} view`)),
  h('div.hc-grid', cards));
}
