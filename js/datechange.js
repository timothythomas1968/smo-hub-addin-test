// Change control on exit dates (evaluation brief B, Tim 6 Nov 2026).
// The programme office runs change control, so the action is "Process a date change": it raises a change request
// in TSA Changes (status Pending) with the impact worked out. The planned exit date only moves when the forum
// approves it: the workbook's Planned exit date formula takes the latest approved Extend or Early exit request.
// A forecast exit date stays editable; moving it is logged in TSA Changes as a "Forecast change".
import { h, toast, fmtDate, fmtMoney, plural, serialToIso, isoToSerial, fromSerial, asOf, realToday, dateBox } from './util.js?v=0.9.4.20261106172320';

const num = (v) => Number(v) || 0;
const monthsBetween = (a, b) => { const x = fromSerial(a), y = fromSerial(b); return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth()); };
export const OPEN_CR = /^(Draft|Submitted|Pending|Under review)$/;

/** What moving a service's exit from `from` to `to` does: months, fees, notice deadline, plan items, interviews. */
export function impactOf(store, rec, from, to) {
  const n = store.names, sym = n.CcySym || '';
  const out = { months: 0, fees: 0, lines: [] };
  if (!from || !to || from === to) return out;
  out.months = monthsBetween(from, to);
  out.fees = out.months * num(rec.get('Monthly fee (reporting currency)'));
  const later = to > from;
  out.lines.push(`${later ? 'Exit moves later' : 'Exit moves earlier'} by ${plural(Math.abs(out.months), 'month')} (${fmtDate(from)} → ${fmtDate(to)}).`);
  if (out.fees) out.lines.push(`${out.fees > 0 ? 'Adds about' : 'Saves about'} ${fmtMoney(Math.abs(out.fees), sym)} in fees.`);
  const notice = num(rec.get('On-time exit notice (days)'));
  if (notice) out.lines.push(`The exit notice deadline becomes ${fmtDate(to - notice)}${to - notice < asOf(n) ? ' (already passed)' : ''}.`);
  const long = num(n.LongStop);
  if (long && to > long) out.lines.push(`Beyond the long-stop date (${fmtDate(long)}): this needs a special approval.`);
  const id = rec.get('TSA ID');
  const plan = store.records('tblPlan').filter((r) => r.get('TSA ID') === id && r.get('Status') !== 'Complete');
  const hit = later ? plan.filter((r) => r.get('Type') === 'TSA exit' || num(r.get('Planned finish')) >= from)
    : plan.filter((r) => num(r.get('Planned finish')) > to);
  if (hit.length) out.lines.push(`${plural(hit.length, 'exit plan item')} ${later ? 'can move with it' : 'now finish after the new exit date and need re-planning'}.`);
  const pts = [n.RevPt1, n.RevPt2, n.RevPt3, n.RevPt4].map(num).filter(Boolean);
  if (pts.length) out.lines.push(`Readiness interviews move to ${pts.map((p) => fmtDate(to - p, true)).join(', ')}.`);
  return out;
}

/** Change requests for this service that are still waiting for a decision. */
export function pendingFor(store, id) {
  return store.records('tblChange').filter((r) => r.get('TSA ID') === id && OPEN_CR.test(r.get('Status')) && ['Extend', 'Early exit', 'Terminate'].includes(r.get('Request type')));
}

function modal(title, body, actions) {
  document.querySelector('.modal-back')?.remove();
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) back.remove(); } },
    h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { maxWidth: '560px' } }, h('h2', title), body,
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' } }, actions)));
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') back.remove(); });
  document.body.appendChild(back);
  return back;
}

/** "Process a date change": raise a Pending change request with its impact. */
export function openDateChange(ctx, rec) {
  const { store } = ctx;
  const planned = num(rec.get('Planned exit date')) || num(rec.get('Initial end date'));
  const forums = (store.options({ h: 'Approval forum', t: 'I', dv: { name: 'L_Forum' } }) || []);
  const date = dateBox(planned, { 'aria-label': 'New planned exit date' });
  const reason = h('textarea', { rows: 3, placeholder: 'Why the date needs to change, and who asked' });
  const forum = h('select', { 'aria-label': 'Approval forum' }, forums.map((f) => h('option', { value: f }, f)));
  const def = forums.find((f) => /change|separation committee/i.test(f)); if (def) forum.value = def;
  const imp = h('div.banner.info', { style: { margin: '8px 0 0' } });
  const show = () => {
    const to = isoToSerial(date.value);
    const i = impactOf(store, rec, planned, to);
    imp.replaceChildren(...(i.lines.length ? i.lines.map((l) => h('div', l)) : [h('div', 'Pick the new exit date to see the impact.')]));
  };
  date.addEventListener('input', show);
  const go = h('button.btn.btn-primary', { type: 'button' }, 'Raise the change request');
  go.addEventListener('click', async () => {
    const to = isoToSerial(date.value);
    if (!to || to === planned) { toast('Pick a new exit date', true); return; }
    if (!reason.value.trim()) { toast('Say why the date needs to change', true); return; }
    const i = impactOf(store, rec, planned, to);
    go.disabled = true;
    try {
      await store.need(['tblChange']);
      await store.add('tblChange', {
        'Request type': to > planned ? 'Extend' : 'Early exit', 'TSA ID': rec.get('TSA ID'),
        Title: `${to > planned ? 'Extend' : 'Early exit'}: ${rec.get('Service name')} to ${fmtDate(to)}`,
        'Raised on': asOf(store.names), 'Exit date before change': planned, 'Proposed exit date': to,
        'Impact summary': `${reason.value.trim()} ${i.lines.join(' ')}`.trim(), 'Approval forum': forum.value, Status: 'Pending'
      });
      back.remove();
      toast(`Change request raised and waiting for ${forum.value || 'the forum'}. The planned exit date moves when it is approved.`);
      ctx.rerender();
    } catch (e) { go.disabled = false; toast('Could not raise it: ' + (e.message || e), true); }
  });
  const back = modal('Process a date change',
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('p.small.muted', { style: { margin: 0 } }, `${rec.get('TSA ID')} ${rec.get('Service name')}. The planned exit date is part of the agreed plan (now ${fmtDate(planned)}). This raises a change request in TSA Changes, shown in the forum's governance pack under outstanding items. The date moves only when the forum approves it.`),
      h('div.field', h('label.field-label', 'New planned exit date'), date),
      h('div.field', h('label.field-label', 'Approval forum'), forum),
      h('div.field', h('label.field-label', 'Reason'), reason),
      imp),
    [h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'), go]);
  show();
}

/** Record the forum's decision on a pending date change. */
export function openDecision(ctx, cr) {
  const { store } = ctx;
  const forums = (store.options({ h: 'Approval forum', t: 'I', dv: { name: 'L_Forum' } }) || []);
  const forum = h('select', { 'aria-label': 'Forum' }, forums.map((f) => h('option', { value: f }, f)));
  if (cr.get('Approval forum')) forum.value = cr.get('Approval forum');
  const date = dateBox(asOf(store.names), { 'aria-label': 'Decision date' });
  const note = h('input', { type: 'text', placeholder: 'Optional: minute reference or conditions' });
  const decide = (ok) => async () => {
    const d = isoToSerial(date.value);
    if (!d) { toast('Pick the decision date', true); return; }
    try {
      await store.save('tblChange', cr.i, { Status: ok ? 'Approved' : 'Rejected', Decision: `${ok ? 'Approved' : 'Rejected'} by ${forum.value}${note.value.trim() ? ': ' + note.value.trim() : ''}`, 'Decision date': d, 'Approval forum': forum.value });
      back.remove();
      toast(ok ? `Approved. The planned exit date is now ${fmtDate(cr.get('Proposed exit date'))}.` : 'Rejected. The planned exit date stays as it was.');
      ctx.rerender();
    } catch (e) { toast('Could not record it: ' + (e.message || e), true); }
  };
  const back = modal(`Decision on ${cr.get('CR ID')}`,
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('p', { style: { margin: 0 } }, cr.get('Title') || `${cr.get('Request type')} ${cr.get('TSA ID')}`),
      h('p.small.muted', { style: { margin: 0 } }, cr.get('Impact summary')),
      h('div.field', h('label.field-label', 'Decided by'), forum),
      h('div.field', h('label.field-label', 'Decision date'), date),
      h('div.field', h('label.field-label', 'Note'), note)),
    [h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'), h('button.btn', { type: 'button', onclick: decide(false) }, 'Reject'), h('button.btn.btn-primary', { type: 'button', onclick: decide(true) }, 'Approve')]);
}

/** A forecast exit date was saved: log it in TSA Changes so every move has a record. */
export async function logForecast(store, rec, from, to) {
  if (!to || from === to) return;
  const i = impactOf(store, rec, from || to, to);
  await store.need(['tblChange']);
  await store.add('tblChange', {
    'Request type': 'Forecast change', 'TSA ID': rec.get('TSA ID'), Title: `Forecast exit moved: ${rec.get('Service name')}`,
    'Raised on': realToday(), 'Exit date before change': from || '', 'Proposed exit date': to,
    'Impact summary': i.lines.join(' '), Status: 'Implemented', Decision: 'Forecast updated in the TSA register', 'Decision date': realToday()
  });
}
