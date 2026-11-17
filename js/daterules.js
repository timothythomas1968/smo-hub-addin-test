// Moving dates on the Calendar (Tim, 17 Nov 2026; brief 4.4) and exit plan change control (brief 4.8).
// Who may move each kind of date comes from the Hub's "Date change rules" table (Library; names DCR_Key and DCR_Rule):
//   Fixed            cannot be moved on the calendar; the pop-up says where the date comes from
//   Owner            the item's owner, or the programme office (the panel moves it after a confirmation, with Undo)
//   Programme office the programme office (the same)
//   Rules            the exit plan change rules: the impact preview, then a logged forecast change or a change request
//   CR               a Pending change request; the date moves only when the request is approved
// Keep RULES in step with DATE_RULES in workbook/builder/lib3.py (the defaults, for workbooks that predate the table).
import { h, toast, fmtDate, ed, asOf, dateBox, isoToSerial, plural } from './util.js?v=0.11.5.20261117220441';
import { planNodes, knockOn, assess, withDates } from './planimpact.js?v=0.11.5.20261117220441';

export const RULES = {   // key: [calendar item, where the date comes from, default rule, note]
  deal: ['Closing and long-stop dates', 'Deal set-up (Start Here)', 'Fixed', 'A deal amendment, outside the Hub.'],
  exit: ['TSA planned exit date', 'TSA register', 'CR', 'Through Process a date change, with the fee impact.'],
  notice: ['Exit and extension notice deadlines, extension reminders', 'Worked out from the exit date and the notice periods (set-up)', 'Fixed', 'They follow the exit date. Changing a notice period in set-up needs a change request.'],
  forum: ['Governance meeting', 'Forums (Lists) and Meeting moves', 'Programme office', 'A moved meeting is kept in Meeting moves on the Lists sheet.'],
  report: ['Workstream report due date', 'The reporting period', 'Programme office', ''],
  interview: ['Readiness interview', 'Readiness interviews', 'Programme office', ''],
  milestone: ['Exit plan milestone', 'Exit plan', 'Rules', 'The exit plan change rules decide whether it needs a change request.'],
  task: ['Exit plan task', 'Exit plan', 'Rules', 'The exit plan change rules decide whether it needs a change request.'],
  day1: ['Day 1 plan task', 'Day 1 plan', 'Programme office', 'A change request if it slips past closing.'],
  f100: ['First 100 days task', 'First 100 days', 'Programme office', 'A change request if it slips past the end of the first 100 days.'],
  action: ['Action due date', 'Actions', 'Owner', 'The owner and the programme office can move it.'],
  issue: ['Issue due date', 'Issues', 'Owner', 'The owner and the programme office can move it.'],
  decision: ['Decision needed by', 'Decisions', 'Programme office', ''],
  obl: ['Contractual obligation due', 'Obligations', 'CR', 'The other party must agree.'],
  reg: ['Regulatory filing or approval date', 'Regulatory', 'Programme office', 'A change request if it delays closing or an exit.'],
  tpc: ['Third-party consent date', 'Third parties', 'Programme office', 'A change request if it delays an exit.'],
  dr: ['Data request due date', 'Data requests', 'Programme office', ''],
  wo: ['Work order date', 'Work orders', 'CR', 'It can change the cost.'],
  invoice: ['Invoice date', 'The billing terms (set-up: the invoice day)', 'Fixed', 'Change the invoice day in set-up.']
};
const WORDS = ['Fixed', 'Owner', 'Programme office', 'Rules', 'CR'];

/** The rule for a kind of date: one of WORDS (UK spelling), from the workbook's table or the default. */
export function ruleFor(store, key) {
  const n = store.names, keys = n.DCR_Key, rules = n.DCR_Rule;
  if (Array.isArray(keys) && Array.isArray(rules)) {
    const i = keys.findIndex((k) => String(k).trim() === key);
    if (i >= 0) {
      const v = String(rules[i] || '').trim();
      const w = WORDS.find((x) => x.toLowerCase() === v.toLowerCase() || ed(x, true).toLowerCase() === v.toLowerCase());
      if (w) return w;
    }
  }
  return RULES[key] ? RULES[key][2] : 'Fixed';
}
export const ruleText = (rule) => ed({
  Fixed: 'Fixed: it cannot be moved on the calendar.', Owner: 'The owner and the programme office can move it.',
  'Programme office': 'The programme office can move it.', Rules: 'The exit plan change rules decide whether it needs a change request.',
  CR: 'Moving it raises a change request; the date moves when the request is approved.' }[rule] || '');

// How each kind of item's date is written. offset: the sheet keeps days from closing rather than a date.
export const TARGETS = {
  action: { t: 'tblActions', id: 'AC ID', col: 'Due date' },
  issue: { t: 'tblIssues', id: 'Issue ID', col: 'Due date' },
  decision: { t: 'tblDecisions', id: 'Decision ID', col: 'Needed by' },
  dr: { t: 'tblDataReq', id: 'DR ID', col: 'Due date' },
  wo: { t: 'tblWO', id: 'WO ID', col: 'Target completion' },
  reg: { t: 'tblREG', id: 'REG ID', col: 'Due date' },
  tpc: { t: 'tblTPC', id: 'TPC ID', col: 'Response due' },
  obl: { t: 'tblOBL', id: 'OBL ID', col: 'Fixed date', also: { 'Rule type': 'Fixed date' } },
  day1: { t: 'tblDay1', id: 'D1 ID', col: 'Days from Day 1', offset: true },
  f100: { t: 'tblFirst100', id: 'ID', col: 'Due on day', offset: true }
};
const num = (v) => Number(v) || 0;
const close = (store) => num(store.names.CloseDate);

/** Write a new date for a calendar item. ev: {key, row, forum, orig}. Returns a function that puts it back. */
export async function applyDate(store, ev, date) {
  if (ev.key === 'forum') {
    const before = meetingEntry(store, ev.forum, ev.orig);
    await setMeetingMove(store, ev.forum, ev.orig, date);
    return () => setMeetingMove(store, ev.forum, ev.orig, before ? before.to : ev.orig);
  }
  const tg = TARGETS[ev.key];
  if (!tg) throw new Error('This date cannot be moved here.');
  await store.need([tg.t]);
  const rec = store.records(tg.t).find((r) => r.i === ev.row);
  const old = rec ? rec.get(tg.col) : '';
  const oldAlso = Object.fromEntries(Object.keys(tg.also || {}).map((k) => [k, rec ? rec.get(k) : '']));
  const value = tg.offset ? date - close(store) : date;
  await store.save(tg.t, ev.row, { ...(tg.also || {}), [tg.col]: value }, { force: true });
  return () => store.save(tg.t, ev.row, { ...oldAlso, [tg.col]: old }, { force: true });
}

// Forum meetings come from each forum's first meeting and frequency, so a moved meeting is kept in Meeting moves (Lists):
// the Governance dates list, the worksheet Calendar and the panel all use the moved date.
export function meetingMoves(store) {
  const n = store.names, f = n.MV_Forum || [], a = n.MV_From || [], b = n.MV_To || [];
  return f.map((x, i) => ({ i, forum: String(x || ''), from: num(a[i]), to: num(b[i]) })).filter((m) => m.forum && m.from && m.to);
}
function meetingEntry(store, forum, from) { return meetingMoves(store).find((m) => m.forum === forum && m.from === from) || null; }
async function setMeetingMove(store, forum, from, to) {
  if (!Array.isArray(store.names.MV_Forum)) throw new Error('This workbook has no Meeting moves table (it comes with workbook v0.11). Change the forum\'s first meeting on the Lists sheet instead.');
  const e = meetingEntry(store, forum, from);
  const back = to === from;
  const i = e ? e.i : (store.names.MV_Forum || []).findIndex((x) => !x);
  if (i < 0) { if (back) return; throw new Error('Meeting moves is full (40 rows). Clear some old ones on the Lists sheet.'); }
  if (back) { await store.writeNameItem('MV_To', i, ''); await store.writeNameItem('MV_From', i, ''); await store.writeNameItem('MV_Forum', i, ''); return; }
  if (!e) { await store.writeNameItem('MV_Forum', i, forum); await store.writeNameItem('MV_From', i, from); }
  await store.writeNameItem('MV_To', i, to);
}

/** A move that the rule allows directly can still need a change request: Day 1 past closing, a regulatory date past closing
 *  (a condition to closing), a consent past its service's exit. Returns the reason, or ''. */
export function conditionalCR(store, ev, date) {
  const c = close(store);
  if (ev.key === 'day1' && c && date > c) return `It slips past closing (${fmtDate(c)}).`;
  if (ev.key === 'f100' && c && date > c + 100) return `It slips past the end of the first 100 days (${fmtDate(c + 100)}).`;
  if (ev.key === 'reg' && c && date > c && ev.rec && /^Y/i.test(String(ev.rec.get('Condition to closing')))) return `It is a condition to closing and would delay closing (${fmtDate(c)}).`;
  if ((ev.key === 'reg' || ev.key === 'tpc') && ev.rec && ev.rec.get('TSA ID')) {
    const t = store.records('tblTSA').find((r) => r.get('TSA ID') === ev.rec.get('TSA ID'));
    const exit = t ? num(t.get('Planned exit date')) || num(t.get('Forecast exit date')) : 0;
    if (exit && date > exit) return `It would delay the exit of ${ev.rec.get('TSA ID')} (${fmtDate(exit)}).`;
  }
  return '';
}

function modal(title, body, actions, wide) {
  document.querySelector('.modal-back.mv')?.remove();
  const back = h('div.modal-back.mv', { onclick: (e) => { if (e.target === back) back.remove(); } },
    h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { maxWidth: wide ? '680px' : '520px', width: wide ? 'min(680px, 100%)' : null } }, h('h2', title), body,
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px', flexWrap: 'wrap' } }, actions)));
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') back.remove(); });
  document.body.appendChild(back);
  setTimeout(() => back.querySelector('button.btn-primary, textarea, input')?.focus(), 0);
  return back;
}

/** Move a calendar item to `date`, by its rule. ev: an event from the Calendar ({key, title, d, row, rec, forum, orig, plan, open}). */
export function moveItem(ctx, ev, date) {
  const { store } = ctx;
  if (!date || date === ev.d) return;
  const rule = ruleFor(store, ev.key);
  if (ev.key === 'exit') { ctx.go('register', { id: ev.rec && ev.rec.get('TSA ID'), dateChange: date }); return; }
  if (rule === 'Fixed') { toast(ed(`${ev.title}: this date is fixed. It comes from ${RULES[ev.key] ? RULES[ev.key][1] : 'the registers'}.`), true); return; }
  if (ev.key === 'interview') { toast('Change interview dates on the Readiness interviews screen.', false, { label: 'Open it', fn: () => ctx.go('interview', { id: ev.rec && ev.rec.get('TSA ID') }) }); return; }
  if (rule === 'Rules' || ev.plan) { openPlanChange(ctx, ev.plan, date); return; }
  const why = conditionalCR(store, ev, date);
  if (rule === 'CR' || why) { openDateCR(ctx, ev, date, why); return; }
  const back = modal(`Move ${ev.short || ev.title}?`,
    h('div', h('p', { style: { margin: 0 } }, `From ${fmtDate(ev.d)} to ${fmtDate(date)}.`),
      h('p.small.muted', { style: { margin: '6px 0 0' } }, `${ruleText(rule)}${ev.owner && rule === 'Owner' ? ` Owner: ${ev.owner}.` : ''}`)),
    [h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'),
      h('button.btn.btn-primary', { type: 'button', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try {
          const undo = await applyDate(store, ev, date);
          back.remove(); await ctx.rerender();
          toast(`Moved to ${fmtDate(date)}.`, false, { label: 'Undo', fn: async () => { try { await undo(); await ctx.rerender(); toast('Moved back.'); } catch (x) { toast('Could not undo: ' + (x.message || x), true); } } });
        } catch (x) { back.remove(); toast('Could not move it: ' + (x.message || x), true); }
      } }, 'Move it')]);
}

/** CR: raise a Pending "Date change" request; the date moves when it is approved (openDecision in datechange.js). */
function openDateCR(ctx, ev, date, why) {
  const { store } = ctx;
  const reason = h('textarea', { rows: 3, placeholder: 'Why the date needs to change, and who asked' });
  const go = h('button.btn.btn-primary', { type: 'button' }, 'Raise the change request');
  go.addEventListener('click', async () => {
    if (!reason.value.trim()) { toast('Say why the date needs to change', true); return; }
    go.disabled = true;
    try {
      await store.need(['tblChange']);
      await store.add('tblChange', {
        'Request type': 'Date change', 'TSA ID': ev.rec && ev.rec.get('TSA ID') ? ev.rec.get('TSA ID') : '',
        Title: `Move ${ev.short || ev.title} to ${fmtDate(date)}`, 'Raised on': asOf(store.names), 'Proposed exit date': date,
        'Item ID': itemRef(ev), 'Impact summary': `${reason.value.trim()} Moves ${ev.short || ev.title} from ${fmtDate(ev.d)} to ${fmtDate(date)}.${why ? ' ' + why : ''}`,
        Status: 'Pending'
      });
      back.remove();
      toast('Change request raised. The date moves when it is approved (TSA changes › Record decision).');
      ctx.rerender();
    } catch (x) { go.disabled = false; toast('Could not raise it: ' + (x.message || x), true); }
  });
  const back = modal('This move needs a change request',
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('p', { style: { margin: 0 } }, `${ev.short || ev.title}: from ${fmtDate(ev.d)} to ${fmtDate(date)}.`),
      h('div.banner.warn', { style: { margin: 0 } }, ed(why || `${RULES[ev.key] ? RULES[ev.key][0] : 'This date'}: ${RULES[ev.key] && RULES[ev.key][3] ? RULES[ev.key][3] + ' ' : ''}A change request is needed.`)),
      h('p.small.muted', { style: { margin: 0 } }, 'It goes into TSA Changes as Pending and on the change forum\'s agenda. The date stays as it is until the request is approved.'),
      h('div.field', h('label.field-label', 'Reason'), reason)),
    [h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'), go]);
}

// The item a Date change request moves, as text in its Item ID: the item's ID, or the meeting and its usual date.
function itemRef(ev) {
  if (ev.key === 'forum') return `Meeting: ${ev.forum} (${ev.orig})`;
  const tg = TARGETS[ev.key];
  return tg && ev.rec ? String(ev.rec.get(tg.id) || '') : '';
}
/** Approved Date change: apply it. Returns a sentence for the toast. */
export async function applyApprovedDate(store, cr) {
  const ref = String(cr.get('Item ID') || ''), date = num(cr.get('Proposed exit date'));
  if (!ref || !date) return '';
  const m = /^Meeting: (.+) \((\d+)\)$/.exec(ref);
  if (m) { await setMeetingMove(store, m[1], Number(m[2]), date); return `${m[1]} now meets on ${fmtDate(date)}.`; }
  for (const [key, tg] of Object.entries(TARGETS)) {
    await store.need([tg.t]).catch(() => {});
    if (!store.has(tg.t)) continue;
    const rec = store.records(tg.t).find((r) => String(r.get(tg.id)) === ref);
    if (rec) { await applyDate(store, { key, row: rec.i }, date); return `${ref} now falls on ${fmtDate(date)}.`; }
  }
  return '';
}

// ---------------------------------------------------------------- exit plan changes (brief 4.8)
/** The impact preview for moving plan item `id` to finish on `finish` (and start on `start`, if given). */
export function openPlanChange(ctx, id, finish, start) {
  const { store } = ctx;
  const nodes = planNodes(store.records('tblPlan'));
  const me = nodes.get(id);
  if (!me) { toast('That plan item was not found.', true); return; }
  if (me.type === 'TSA exit') { ctx.go('register', { id: me.tsa, dateChange: finish }); return; }
  const moves = knockOn(nodes, id, start || 0, finish);
  if (!moves.size) return;
  const a = assess(nodes, moves, id, store.records('tblTSA'), store.names);
  const d = (t) => withDates(t, fmtDate);
  const reason = h('textarea', { rows: 3, placeholder: 'Why the date needs to change' });
  const groups = Object.entries(a.byWs).map(([ws, list]) => h('div', { style: { marginTop: '6px' } },
    h('b.small', `${ws}${ws === me.ws ? '' : ' (another workstream)'}`),
    h('ul.small', { style: { margin: '2px 0 0', paddingLeft: '18px' } }, list.map((x) => h('li', `${x.id} ${x.n.name}: ${fmtDate(x.from.f)} → ${fmtDate(x.to.f)}`)))));
  const tsaList = a.tsa.length ? h('div.small', { style: { marginTop: '8px' } }, h('b', 'TSA services affected'),
    h('ul', { style: { margin: '2px 0 0', paddingLeft: '18px' } }, a.tsa.map((t) => h('li', { style: t.over ? { color: 'var(--r-fg)', fontWeight: 600 } : null },
      `${t.id} ${t.name}: exit ${fmtDate(t.exit)}, ${t.margin == null ? '' : t.margin >= 0 ? `${plural(t.margin, 'day')} to spare` : `${plural(-t.margin, 'day')} late`}`)))) : null;
  const verdict = a.needsCR
    ? h('div.banner.warn', { style: { margin: '10px 0 0' } }, h('b', 'Needs a change request: '), d(a.reasons[0]), a.reasons.length > 1 ? h('ul.small', { style: { margin: '4px 0 0', paddingLeft: '18px' } }, a.reasons.slice(1).map((r) => h('li', d(r)))) : null)
    : h('div.banner.info', { style: { margin: '10px 0 0' } }, h('b', 'No change request needed. '), `The new dates are saved${moves.size > 1 ? ', with the items downstream,' : ''} and logged as a forecast change.`);
  const warn = a.warnings.length ? h('div.small.muted', { style: { marginTop: '6px' } }, a.warnings.map((w) => h('div', d(w)))) : null;
  const go = h('button.btn.btn-primary', { type: 'button' }, a.needsCR ? 'Raise the change request' : 'Save the new dates');
  go.addEventListener('click', async () => {
    if (a.needsCR && !reason.value.trim()) { toast('Say why the date needs to change', true); return; }
    go.disabled = true;
    try {
      const msg = a.needsCR ? await raisePlanCR(store, nodes, moves, id, a, reason.value.trim()) : await applyPlanMoves(store, nodes, moves, id, reason.value.trim());
      back.remove(); await ctx.rerender(); toast(msg);
    } catch (x) { go.disabled = false; toast('Could not save: ' + (x.message || x), true); }
  });
  const back = modal(`Move ${id}: ${me.name}`,
    h('div', { style: { display: 'flex', flexDirection: 'column' } },
      h('p.small.muted', { style: { margin: 0 } }, `Finish from ${fmtDate(me.finish)} to ${fmtDate(moves.get(id).to.f)}. ${moves.size > 1 ? `${plural(moves.size - 1, 'item')} downstream move${moves.size === 2 ? 's' : ''} with it.` : 'Nothing downstream moves.'}`),
      groups, tsaList, a.critEnd ? h('div.small', { style: { marginTop: '6px' } }, `The critical path now ends ${fmtDate(a.critEnd.to)} (was ${fmtDate(a.critEnd.from)}).`) : null,
      verdict, warn,
      h('div.field', { style: { marginTop: '10px' } }, h('label.field-label', a.needsCR ? 'Reason (for the change forum)' : 'Reason (optional)'), reason)),
    [h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'), go], true);
}

const rowsOf = (nodes, moves, fn) => [...moves].map(([k, mv]) => ({ i: nodes.get(k).i, changes: fn(mv) }));

/** No request needed: the new dates go straight in, the knock-on included, logged as a Forecast change. */
export async function applyPlanMoves(store, nodes, moves, id, reason) {
  await store.saveMany('tblPlan', rowsOf(nodes, moves, (mv) => ({ 'Planned start': mv.to.s, 'Planned finish': mv.to.f })));
  const me = nodes.get(id), mv = moves.get(id);
  await store.need(['tblChange']);
  await store.add('tblChange', {
    'Request type': 'Forecast change', 'TSA ID': me.tsa, Title: `Plan dates moved: ${me.name}`, 'Raised on': asOf(store.names), 'Item ID': id,
    'Impact summary': `${reason ? reason + ' ' : ''}${id} moves from ${fmtDate(mv.from.f)} to ${fmtDate(mv.to.f)}${moves.size > 1 ? `, with ${plural(moves.size - 1, 'item')} downstream` : ''}. No change request needed.`,
    Status: 'Implemented', Decision: 'Within the plan change rules: no approval needed', 'Decision date': asOf(store.names)
  });
  return `Saved. ${moves.size > 1 ? `${plural(moves.size, 'item')} moved` : 'The item moved'}, logged as a forecast change.`;
}

/** A request is needed: a Pending Plan change with the impact written for you; the items show their proposed dates. */
export async function raisePlanCR(store, nodes, moves, id, a, reason) {
  const me = nodes.get(id), mv = moves.get(id);
  await store.need(['tblChange']);
  const lines = Object.entries(a.byWs).map(([ws, list]) => `${ws}: ${list.map((x) => `${x.id} ${fmtDate(x.from.f)} → ${fmtDate(x.to.f)}`).join('; ')}`);
  const i = await store.add('tblChange', {
    'Request type': 'Plan change', 'TSA ID': me.tsa, Title: `Plan change: ${me.name} to ${fmtDate(mv.to.f)}`, 'Raised on': asOf(store.names), 'Item ID': id,
    'Impact summary': [reason, ...a.reasons.map((r) => withDates(r, fmtDate)), `Moves: ${lines.join('. ')}.`].filter(Boolean).join(' '), Status: 'Pending'
  });
  const rec = store.records('tblChange').find((r) => r.i === i);
  const crId = (rec && rec.get('CR ID')) || `CR-${String(i + 1).padStart(3, '0')}`;
  await store.saveMany('tblPlan', rowsOf(nodes, moves, (m) => ({ 'Proposed start': m.to.s, 'Proposed finish': m.to.f, 'Change request': crId })));
  return `Change request ${crId} raised for the change forum. The plan keeps its current dates until it is approved.`;
}

/** The forum's decision on a Plan change: approved applies the proposed dates; rejected clears them and asks the owner to recover. */
export async function decidePlanCR(store, cr, approved) {
  await store.need(['tblPlan']);
  const crId = String(cr.get('CR ID') || `CR-${String(cr.i + 1).padStart(3, '0')}`);
  const rows = store.records('tblPlan').filter((r) => String(r.get('Change request')) === crId);
  if (approved) {
    await store.saveMany('tblPlan', rows.map((r) => ({ i: r.i, changes: { 'Planned start': r.get('Proposed start') || r.get('Planned start'), 'Planned finish': r.get('Proposed finish') || r.get('Planned finish'), 'Proposed start': '', 'Proposed finish': '', 'Change request': '' } })));
    return `${plural(rows.length, 'plan item')} moved to the approved dates.`;
  }
  await store.saveMany('tblPlan', rows.map((r) => ({ i: r.i, changes: { 'Proposed start': '', 'Proposed finish': '', 'Change request': '' } })));
  const item = store.records('tblPlan').find((r) => String(r.get('Activity ID')) === String(cr.get('Item ID')));
  if (item && store.has('tblActions')) {
    await store.add('tblActions', { Action: `Recover the plan for ${item.get('Activity ID')} ${item.get('Activity')}: plan change ${crId} was rejected`, Owner: item.get('Owner'), 'Linked ID': item.get('Activity ID') }).catch(() => {});
  }
  return 'Rejected. The plan keeps its dates, and the owner has an action to recover it.';
}

/** For the plan screen: move an item by typing its new finish (and start). */
export function planDateField(ctx, rec) {
  const box = dateBox(Number(rec.get('Planned finish')) || '', { 'aria-label': 'New planned finish' });
  const go = h('button.btn.btn-sm', { type: 'button', onclick: () => { const d = isoToSerial(box.value); if (d) openPlanChange(ctx, rec.get('Activity ID'), d); } }, 'Check the impact');
  return h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, box, go);
}
