// Exit plan change control (brief 4.8; recommendation docs/briefs/2026-11-17-plan-change-control.md, approved by Tim 17 Nov 2026).
// Pure functions, no reading or writing: given the plan, the TSA register and a proposed date change to one item, work out
// the knock-on (every item downstream through finish-to-start links), which workstreams and TSA services it touches,
// and whether the change needs a change request. The exit plan screen, the Gantt drawer and the Calendar's "Rules" moves use it.
// Dates are Excel serial numbers (days).

const num = (v) => Number(v) || 0;
const CLOSED_TSA = /^(Exited|Terminated)$/;

/** Working days from a to b (Mon to Fri), negative when b is earlier. */
export function workingDays(a, b) {
  if (!a || !b || a === b) return 0;
  const sign = b > a ? 1 : -1, lo = Math.min(a, b), hi = Math.max(a, b);
  let n = 0;
  for (let d = lo + 1; d <= hi; d++) { const w = (d - 1) % 7; if (w !== 0 && w !== 6) n++; }   // serial 1 = Sunday 1 Jan 1900, as in Excel
  return sign * n;
}

/** The plan as nodes. recs: plan records ({get(h)}), as Store.records('tblPlan') gives them. */
export function planNodes(recs) {
  const nodes = new Map();
  recs.forEach((r) => {
    const id = String(r.get('Activity ID') || '');
    if (!id || !r.get('Activity')) return;
    nodes.set(id, {
      id, i: r.i, name: String(r.get('Activity') || ''), type: String(r.get('Type') || ''), ws: String(r.get('Workstream') || ''),
      tsa: String(r.get('TSA ID') || ''), owner: String(r.get('Owner') || ''),
      start: num(r.get('Planned start')), finish: num(r.get('Planned finish')), bfinish: num(r.get('Baseline finish')),
      done: num(r.get('Actual finish')) > 0 || num(r.get('% complete')) >= 1,
      crit: String(r.get('Critical path') || '').toUpperCase() === 'Y',
      preds: [r.get('Predecessor 1'), r.get('Predecessor 2')].map((x) => String(x || '').trim()).filter(Boolean)
    });
  });
  nodes.forEach((n) => { n.succ = []; });
  nodes.forEach((n) => n.preds.forEach((p) => { const pn = nodes.get(p); if (pn) pn.succ.push(n.id); }));
  return nodes;
}

/** The knock-on of moving item `id` to [start, finish]. Successors keep their duration and start the day after their latest
 *  predecessor finishes, but only when that pushes them later. Finished items and TSA exit rows (the contract dates) never move.
 *  Returns a Map id -> {from: {s, f}, to: {s, f}} of every item whose dates change, the item itself first. */
export function knockOn(nodes, id, start, finish) {
  const moves = new Map();
  const me = nodes.get(id);
  if (!me) return moves;
  const dur = Math.max(0, me.finish - me.start);
  let s = num(start), f = num(finish);
  if (!f && s) f = s + dur;
  if (!s && f) s = f - dur;
  if (s === me.start && f === me.finish) return moves;
  moves.set(id, { from: { s: me.start, f: me.finish }, to: { s, f } });
  const now = (n) => (moves.has(n.id) ? moves.get(n.id).to : { s: n.start, f: n.finish });
  const queue = [...me.succ];
  let guard = 0;
  while (queue.length && guard++ < 5000) {
    const sid = queue.shift(), n = nodes.get(sid);
    if (!n || n.done || n.type === 'TSA exit') continue;
    const need = Math.max(...n.preds.map((p) => (nodes.get(p) ? now(nodes.get(p)).f + 1 : 0)));
    const cur = now(n);
    if (need > cur.s) {
      const d = n.finish - n.start;
      moves.set(n.id, { from: { s: n.start, f: n.finish }, to: { s: need, f: need + d } });
      queue.push(...n.succ);
    }
  }
  return moves;
}

/** Does the change need a change request? tsaRecs: TSA register records; names: the workbook's names (LongStop, CloseDate,
 *  PlanXWS: the cross-workstream threshold in working days, default 10; PlanMSCR: Y when every milestone change needs a request).
 *  Returns { reasons: [text], needsCR, later, byWs: {ws: [moves]}, otherWs: [ws], tsa: [{id, name, exit, notice, margin, over}],
 *  longStop: bool, critEnd: {from, to} }. */
export function assess(nodes, moves, changedId, tsaRecs, names = {}) {
  const me = nodes.get(changedId);
  const out = { reasons: [], warnings: [], needsCR: false, later: false, byWs: {}, otherWs: [], tsa: [], longStop: false, critEnd: null };
  if (!me || !moves.size) return out;
  const m0 = moves.get(changedId);
  out.later = m0.to.f > m0.from.f;
  moves.forEach((mv, id) => { const n = nodes.get(id); (out.byWs[n.ws || 'PRG'] = out.byWs[n.ws || 'PRG'] || []).push({ id, n, ...mv }); });
  const tsaOf = new Map(tsaRecs.map((r) => [String(r.get('TSA ID')), r]));
  const add = (why) => { if (!out.reasons.includes(why)) out.reasons.push(why); out.needsCR = true; };

  // 1 and 2: a TSA exit threatened (the item, or one downstream, now finishes after its service's planned exit)
  const seenTsa = new Set();
  moves.forEach((mv, id) => {
    const n = nodes.get(id), r = tsaOf.get(n.tsa);
    if (!r || CLOSED_TSA.test(String(r.get('Status')))) return;
    const exit = num(r.get('Planned exit date')) || num(r.get('Forecast exit date')), notice = num(r.get('Exit notice deadline'));
    if (!seenTsa.has(n.tsa)) {
      seenTsa.add(n.tsa);
      const latest = Math.max(...[...moves].filter(([k]) => nodes.get(k).tsa === n.tsa).map(([, v]) => v.to.f));
      out.tsa.push({ id: n.tsa, name: String(r.get('Service name') || ''), exit, notice, margin: exit ? exit - latest : null, over: !!exit && latest > exit });
    }
    if (exit && mv.to.f > exit && mv.from.f <= exit) add(`It pushes ${n.tsa} past its exit date of {d:${exit}}.`);
    if (notice && mv.to.f > notice && mv.from.f <= notice && /^(Milestone|Gate)$/.test(n.type)) out.warnings.push(`${n.id} now finishes after ${n.tsa}'s exit notice deadline ({d:${notice}}).`);
  });
  // 3: another workstream's work moves by more than the threshold, or one of its milestones becomes late
  const xws = num(names.PlanXWS) || 10;
  moves.forEach((mv, id) => {
    const n = nodes.get(id);
    if (id === changedId || n.ws === me.ws) return;
    if (!out.otherWs.includes(n.ws)) out.otherWs.push(n.ws);
    const wd = workingDays(mv.from.f, mv.to.f);
    if (wd > xws) add(`It moves ${n.ws} work (${n.id}) by ${wd} working days, more than the ${xws} allowed without a change request.`);
    if (/^(Milestone|Gate)$/.test(n.type) && n.bfinish && mv.to.f > n.bfinish && mv.from.f <= n.bfinish) add(`It makes a ${n.ws} milestone late (${n.id}).`);
  });
  // 4: a key milestone moves later (critical path, or every milestone when the programme asks for that)
  moves.forEach((mv, id) => {
    const n = nodes.get(id);
    if (mv.to.f <= mv.from.f) return;
    if (n.crit) add(`It moves a critical-path item later (${n.id}).`);
    else if (String(names.PlanMSCR || '').toUpperCase() === 'Y' && /^(Milestone|Gate)$/.test(n.type)) add(`Every milestone date change needs a change request in this programme (${n.id}).`);
  });
  // 5: the long-stop date
  const ls = num(names.LongStop);
  if (ls) moves.forEach((mv, id) => { if (mv.to.f > ls) { out.longStop = true; add(`It passes the long-stop date ({d:${ls}}), which the TSA does not allow (${id}).`); } });
  // where the critical path ends
  const crit = [...nodes.values()].filter((n) => n.crit && !n.done);
  if (crit.length) {
    const before = Math.max(...crit.map((n) => n.finish)), after = Math.max(...crit.map((n) => (moves.has(n.id) ? moves.get(n.id).to.f : n.finish)));
    if (after !== before) out.critEnd = { from: before, to: after };
  }
  return out;
}

/** Turn "{d:46000}" in a reason into a date with the given formatter. */
export const withDates = (text, fmt) => String(text).replace(/\{d:(\d+(?:\.\d+)?)\}/g, (m, n) => fmt(Number(n)));

/** Finish-to-start loops among the plan's links (for the plan import's checks). Returns the IDs on a loop. */
export function loops(nodes) {
  const state = new Map(), bad = new Set();
  const visit = (id, stack) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { stack.slice(stack.indexOf(id)).forEach((x) => bad.add(x)); return; }
    state.set(id, 1); stack.push(id);
    (nodes.get(id)?.succ || []).forEach((s) => visit(s, stack));
    stack.pop(); state.set(id, 2);
  };
  nodes.forEach((n, id) => visit(id, []));
  return [...bad];
}
