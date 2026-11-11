// Change control on exit dates (evaluation brief B, Tim 6 Nov 2026).
// The programme office runs change control, so the action is "Process a date change": it raises a change request
// in TSA Changes (status Pending) with the impact worked out. The planned exit date only moves when the forum
// approves it: the workbook's Planned exit date formula takes the latest approved Extend or Early exit request.
// A forecast exit date stays editable; moving it is logged in TSA Changes as a "Forecast change".
import { h, toast, fmtDate, fmtMoney, plural, serialToIso, isoToSerial, fromSerial, asOf, realToday, dateBox } from './util.js?v=0.10.3.20261111202844';

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

// Contract-wide extensions (evaluation C, Tim 6 Nov 2026). Use it when the parties jointly agree a contractual
// extension to the initial term, or to a term already extended. Only after management or Legal confirm it.
// Each service gets an approved Extend change request (one request, a line per service), so the Planned exit
// date formula moves every one of them, and Key dates, readiness interviews and the exit plan follow.
export const EXTEND_HELP = 'Use this when the parties jointly agree a contractual extension to the initial term, or to a term already extended. It moves the planned exit date of every service you pick by the same number of months.';

export function openExtension(ctx) {
  const { store } = ctx;
  const n = store.names, sym = n.CcySym || '', T = asOf(n);
  const open = store.records('tblTSA').filter((r) => !['Exited', 'Terminated'].includes(r.get('Status')));
  const months = h('input', { type: 'number', min: '1', max: '36', step: '1', value: String(Number(n.ExtMaxMonths) || 6), style: { width: '90px' }, 'aria-label': 'Months' });
  const forums = (store.options({ h: 'Approval forum', t: 'I', dv: { name: 'L_Forum' } }) || []);
  const forum = h('select', { 'aria-label': 'Agreed at' }, forums.map((f) => h('option', { value: f }, f)));
  const def = forums.find((f) => /separation committee|steering/i.test(f)); if (def) forum.value = def;
  const chosen = new Set(open.filter((r) => r.get('Qualifies for extension') !== 'N').map((r) => r.i));
  const confirm = h('input', { type: 'checkbox', id: 'ext-ok' });
  const list = h('div', { style: { maxHeight: '38vh', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '8px' } });
  const total = h('div.small', { style: { fontWeight: 600 } });
  const draw = () => {
    const m = Math.max(0, Math.round(Number(months.value) || 0));
    let fees = 0;
    list.replaceChildren(...open.map((r) => {
      const from = Number(r.get('Planned exit date')) || Number(r.get('Initial end date')) || 0;
      const d = fromSerial(from), to = from ? Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, d.getUTCDate()) / 864e5 + 25569) : 0;
      const fee = m * (Number(r.get('Monthly fee (reporting currency)')) || 0);
      const on = chosen.has(r.i), qual = r.get('Qualifies for extension') !== 'N';
      if (on) fees += fee;
      const notice = Number(r.get('On-time exit notice (days)'));
      const cb = h('input', { type: 'checkbox', checked: on, 'aria-label': r.get('TSA ID') });
      cb.addEventListener('change', () => { cb.checked ? chosen.add(r.i) : chosen.delete(r.i); draw(); });
      return h('label', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '6px 10px', borderBottom: '1px solid var(--line-soft)', background: on ? 'var(--row-pick)' : '#fff', cursor: 'pointer' } }, cb,
        h('span', { style: { flex: '1 1 auto', fontSize: '12.5px' } }, h('b', r.get('TSA ID')), ' ', r.get('Service name'), qual ? null : h('span.small', { style: { color: 'var(--a-fg)' } }, ' · not extendable under the contract'),
          h('div.small.muted', from ? `${fmtDate(from)} → ${fmtDate(to)} · ${fmtMoney(fee, sym)} more${notice ? ` · exit notice by ${fmtDate(to - notice)}` : ''}` : 'No planned exit date')));
    }));
    total.textContent = `${plural(chosen.size, 'service')} · about ${fmtMoney(fees, sym)} more in fees`;
  };
  months.addEventListener('input', draw);
  const go = h('button.btn.btn-primary', { type: 'button' }, 'Apply the extension');
  go.addEventListener('click', async () => {
    const m = Math.round(Number(months.value) || 0);
    if (!m) { toast('Type the number of months', true); return; }
    if (!chosen.size) { toast('Pick at least one service', true); return; }
    if (!confirm.checked) { toast('Tick the box to confirm the extension has been agreed', true); return; }
    go.disabled = true;
    try {
      await store.need(['tblChange']);
      const title = `Contract-wide extension: ${m} months`;
      for (const r of open.filter((x) => chosen.has(x.i))) {
        const from = Number(r.get('Planned exit date')) || Number(r.get('Initial end date')) || 0;
        const d = fromSerial(from), to = Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, d.getUTCDate()) / 864e5 + 25569);
        await store.add('tblChange', { 'Request type': 'Extend', 'TSA ID': r.get('TSA ID'), Title: title, 'Raised on': T, 'Exit date before change': from, 'Proposed exit date': to,
          'Approval forum': forum.value, Status: 'Approved', Decision: `Agreed by the parties (${forum.value}); applied to ${plural(chosen.size, 'service')}`, 'Decision date': T });
      }
      back.remove();
      toast(`Extension applied: ${plural(chosen.size, 'service')} moved by ${m} months and logged in TSA Changes`);
      ctx.rerender();
    } catch (e) { go.disabled = false; toast('Could not apply it: ' + (e.message || e), true); }
  });
  const back = modal('Apply an extension',
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('p.small.muted', { style: { margin: 0 } }, EXTEND_HELP),
      h('div.banner.warn', h('b', 'Only apply this after management or Legal confirm the extension has been agreed. '), 'Every service you pick gets an approved change request in TSA Changes, and its planned exit date moves.'),
      h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' } }, h('span.small', { style: { fontWeight: 600 } }, 'Extend by'), months, h('span.small', 'months'), h('span.small', { style: { fontWeight: 600, marginLeft: '12px' } }, 'Agreed at'), forum),
      h('div.small', 'Services (all open services that qualify are picked):'), list, total,
      h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px' } }, confirm, 'Management or Legal have confirmed the extension is agreed')),
    [h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'), go]);
  draw();
}
