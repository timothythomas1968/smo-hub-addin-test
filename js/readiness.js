// Readiness interview rounds for a service, with the "Not needed" waivers applied (evaluation brief I).
// The workbook's own columns (Next interview, Interviews overdue) cannot see the waivers, which live in the
// add-in's document settings (ri-waive) until v0.11 gives them cells. So every screen counts through here.
// Round k is due on forecast exit minus RevPt{k} days, and overdue when not held more than 7 days after it was due,
// the same rule as the Exit Readiness sheet.
const num = (v) => Number(v) || 0;

export function rounds(store, tsaRec, xRec, waive, T) {
  const n = store.names, fc = num(tsaRec.get('Forecast exit date'));
  const w = (waive || {})[tsaRec.get('TSA ID')] || {};
  return [1, 2, 3, 4].map((k) => {
    const pt = num(n['RevPt' + k]);
    const due = fc && pt ? fc - pt : 0;
    const held = xRec ? num(xRec.get(`Interview ${k} held on`)) : 0;
    const waived = !!(w.svc || w['r' + k]);
    return { k, due, held, waived, overdue: !!due && !held && !waived && due < T - 7 };
  }).filter((r) => r.due);
}

/** {overdue, next} for one service: overdue rounds, and the next round still to hold. */
export function readinessOf(store, tsaRec, xRec, waive, T) {
  const rs = rounds(store, tsaRec, xRec, waive, T);
  const open = rs.filter((r) => !r.held && !r.waived && r.due >= T - 7).sort((a, b) => a.due - b.due);
  return { overdue: rs.filter((r) => r.overdue).length, next: open.length ? open[0].due : 0 };
}
