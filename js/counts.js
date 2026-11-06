// One definition of the service counts management asks about most: how many TSAs are open, how many have
// closed, how many close soon, and how many are past their exit date. Home, the TSA register, the governance
// pack (and later the executive summary, Teams and Finance) all use these, so the numbers always agree.
// Counts run from today (asOf), not the reporting date. The workbook holds the same rules (Today, TSA Status).
import { fmtDate } from './util.js?v=0.10.1.20261106220328';

export const CLOSED = new Set(['Exited', 'Terminated']);
export const isOpen = (r) => !CLOSED.has(r.get('Status'));
const fc = (r) => Number(r.get('Forecast exit date')) || 0;

export const COUNT_RULES = {
  open: 'Open: services not yet exited or terminated.',
  closed: 'Closed: services exited or terminated.',
  soon: 'Closing in 90 days: open services with a forecast exit date within 90 days from today.',
  overdue: 'Exit overdue: open services whose forecast exit date has passed and no actual exit date is entered.'
};

/** The tests themselves, so a register filter and a tile count exactly the same rows. T = today as an Excel serial. */
export function countTests(T) {
  return {
    open: isOpen,
    closed: (r) => !isOpen(r),
    soon: (r) => isOpen(r) && fc(r) >= T && fc(r) <= T + 90,
    overdue: (r) => isOpen(r) && fc(r) > 0 && fc(r) < T
  };
}

export function serviceCounts(records, T) {
  const t = countTests(T), out = {};
  for (const k of Object.keys(t)) out[k] = records.filter(t[k]).length;
  out.total = records.length;
  return out;
}

/** "as at 5 Oct 2026" wording for footnotes. */
export const asAtText = (T) => `Counts as at ${fmtDate(T)}.`;

/** Workstream reports in for the reporting month: a report is in when its section on the Workstream Reports sheet has a summary
 *  (the same rule as the Workstream report screen and Home on the sheet). Consolidated WS Reporting always has a RAG for every
 *  workstream, suggested from the registers when no report has come in, so it cannot be used to count reports. */
export function reportsIn(store) {
  const n = store.names, codes = (n.WRS_WS || []).map(String), sums = n.WRS_Sum || [];
  const inSet = new Set(codes.filter((c, i) => c && String(sums[i] ?? '').trim()));
  const active = store.records('tblWorkstreams').filter((r) => r.get('Active (Y/N)') === 'Y').map((r) => r.get('Code'));
  return { active, in: active.filter((c) => inSet.has(c)), waiting: active.filter((c) => !inSet.has(c)), has: (c) => inSet.has(c) };
}
