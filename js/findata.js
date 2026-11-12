// Finance figures for the panel's Finance and Executive summary screens, worked out live from the workbook
// (the same rules as the Teams Finance tab's data, design/mockup-spokes/make_data.py, without the simulated parts).
// A service is "running" in a month from its first month (service start, or closing) until it exits: the actual exit date,
// or else the date being compared (forecast exit, the current plan's planned exit, or the contract's initial end).
// Fees are the monthly fee in the reporting currency; extension mark-ups are left out, as on Home.
import { fromSerial, toSerial, asOf } from './util.js?v=0.11.1.20261112214706';

const num = (v) => Number(v) || 0;
const mStart = (n) => { const d = fromSerial(n); return d ? toSerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))) : 0; };
const addM = (n, k) => { const d = fromSerial(n); return toSerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1))); };
const yearOf = (n) => fromSerial(n).getUTCFullYear();
const qOf = (n) => { const d = fromSerial(n); return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`; };

export function financeData(store) {
  const n = store.names, T = asOf(n), RD = num(n.RD), close = num(n.CloseDate);
  const tsa = store.records('tblTSA').filter((r) => r.get('TSA ID'));
  const ours = n.Perspective === 'Seller' ? 'Seller' : 'Buyer';
  const rec = tsa.map((r) => ({
    id: r.get('TSA ID'), name: r.get('Service name'), dir: r.get('Direction') || 'Forward', status: r.get('Status'),
    fee: num(r.get('Monthly fee (reporting currency)')), start: mStart(num(r.get('Service start')) || close),
    actual: num(r.get('Actual exit date')), fc: num(r.get('Forecast exit date')), plan: num(r.get('Planned exit date')), contract: num(r.get('Initial end date')),
    ws: r.get('Workstream'), drag: r.get('Service delivery RAG'), xrag: r.get('Exit readiness RAG'), ptg: r.get('Path to green')
  }));
  // the months the programme runs: from the first service month to the month after the last exit (at most six years)
  const starts = rec.map((x) => x.start).filter(Boolean), ends = rec.flatMap((x) => [x.actual, x.fc, x.plan, x.contract]).filter(Boolean);
  const m0 = mStart(Math.min(...(starts.length ? starts : [close || RD || T]))), m1 = mStart(Math.max(...(ends.length ? ends : [m0])));
  const months = [];
  for (let m = m0; m <= m1 && months.length < 72; m = addM(m, 1)) months.push(m);
  const running = (x, m, key) => x.start && x.start <= m && (x.actual || x[key] || 9e9) > m;
  // invoiced (actual) forward fees by service month: billed in the reporting currency less other charges
  const act = {};
  if (store.has('tblInvoices')) store.records('tblInvoices').forEach((r) => {
    const m = mStart(num(r.get('Service month'))), billed = num(r.get('Billed (reporting currency)'));
    if (!m || !billed || r.get('Issued by') === ours) return;
    act[m] = (act[m] || 0) + billed - num(r.get('Other charges billed'));
  });
  // work orders (approved or quoted, not rejected or cancelled) by target month
  const wo = {};
  const woList = store.has('tblWO') ? store.records('tblWO').filter((r) => !/^(Rejected|Cancelled|Canceled)$/.test(r.get('Status'))).map((r) => ({
    id: r.get('WO ID'), title: r.get('Title'), status: r.get('Status'), amount: num(r.get('Approved amount')) || num(r.get('Quote')), m: mStart(num(r.get('Target completion')))
  })) : [];
  woList.forEach((w) => { if (w.m) wo[w.m] = (wo[w.m] || 0) + w.amount; });
  // one-off separation costs: actual by month (M01 = the closing month) to the reporting month, then the rest of the forecast spread evenly
  const oc = {}; let ocBudget = 0, ocFac = 0, ocActual = 0;
  if (store.has('tblCostLines')) store.records('tblCostLines').forEach((r) => {
    const rate = num(r.get('Rate')) || 1, fac = num(r.get('Forecast at completion (reporting currency)'));
    ocBudget += num(r.get('Budget (reporting currency)')); ocFac += fac; ocActual += num(r.get('Actual to date (reporting currency)'));
    let spent = 0;
    for (let i = 0; i < 36; i++) {
      const m = addM(mStart(close || m0), i);
      if (m > RD) break;
      const v = num(r.get('M' + String(i + 1).padStart(2, '0'))) * rate;
      if (v) { oc[m] = (oc[m] || 0) + v; spent += v; }
    }
    const end = mStart(num(r.get('Spend to')) || RD), fut = months.filter((m) => m > RD && m <= end), left = Math.max(0, fac - spent);
    fut.forEach((m) => { oc[m] = (oc[m] || 0) + left / fut.length; });
  });
  const burn = months.map((m) => {
    const row = { m, fwd: { fc: 0, plan: 0, contract: 0 }, n: { fc: 0, plan: 0, contract: 0 }, rev: 0, act: act[m] ?? null, wo: wo[m] || 0, oc: oc[m] || 0 };
    rec.forEach((x) => {
      if (x.dir === 'Reverse') { if (running(x, m, 'fc')) row.rev += x.fee; return; }
      for (const k of ['fc', 'plan', 'contract']) if (running(x, m, k)) { row.fwd[k] += x.fee; row.n[k]++; }
    });
    // what we expect to pay: the invoiced amount where the month is invoiced, else the forecast
    row.fees = row.act != null && m <= RD ? row.act : row.fwd.fc;
    return row;
  });
  const roll = (keyFn) => {
    const out = new Map();
    burn.forEach((b) => {
      const k = keyFn(b.m);
      const e = out.get(k) || { key: k, fc: 0, plan: 0, contract: 0, rev: 0, act: 0, fees: 0, wo: 0, oc: 0, hasAct: false };
      e.fc += b.fwd.fc; e.plan += b.fwd.plan; e.contract += b.fwd.contract; e.rev += b.rev; e.fees += b.fees; e.wo += b.wo; e.oc += b.oc;
      if (b.act != null) { e.act += b.act; e.hasAct = true; }
      out.set(k, e);
    });
    return [...out.values()];
  };
  const fwd = rec.filter((x) => x.dir !== 'Reverse');
  const nowM = mStart(T), nowRow = burn.find((b) => b.m === nowM) || burn[burn.length - 1] || { fwd: { fc: 0 }, n: { fc: 0 }, rev: 0 };
  return {
    T, RD, months, burn, years: roll(yearOf), quarters: roll(qOf), rec, wo: woList,
    oneoff: { budget: ocBudget, fac: ocFac, actual: ocActual },
    runRate: nowRow.fwd.fc, liveNow: nowRow.n.fc, revRate: nowRow.rev,
    exits: {
      total: fwd.length,
      actual: fwd.filter((x) => x.actual && x.actual <= T).length,
      plan: fwd.filter((x) => x.plan && x.plan <= T).length,
      contract: fwd.filter((x) => x.contract && x.contract <= T).length
    },
    cap: num(n.FeeCap)
  };
}
