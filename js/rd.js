// Change the reporting date: one dialog, opened from the title bar, Home or the workstream report.
// The date lives in the name RD: typed in Home's title band since workbook v0.11 (before that, 'Consolidated WS Reporting'!B5).
// It is written by name, so both work; every screen reports to its month.
import { h, toast, fmtDate, fmtMonth, serialToIso, isoToSerial, fromSerial, dateBox, unit, monthly, periodLabel, reportingDates } from './util.js?v=0.11.4.20261117215350';

const monthNo = (n) => { const d = fromSerial(n); return d ? d.getUTCFullYear() * 12 + d.getUTCMonth() : 0; };

/** after(): called once the date is saved and the workbook re-read. */
export function openRDDialog(store, after) {
  document.querySelector('.modal-back')?.remove();
  const RD = Number(store.names.RD) || 0;
  const input = dateBox(RD, { 'aria-label': 'Reporting date' });
  const warn = h('div.banner.warn', { style: { display: 'none' } });
  const setBtn = h('button.btn.btn-primary', { type: 'button' }, 'Set the date');
  const close = () => back.remove();
  const check = () => {
    const v = isoToSerial(input.value);
    const backwards = v && RD && monthNo(v) < monthNo(RD);
    warn.style.display = backwards ? '' : 'none';
    warn.textContent = backwards
      ? `You are moving back from ${fmtMonth(RD)} to ${fmtMonth(v)}. The Workstream Reports sheet holds one month of reports at a time, so the reports on it now will count for ${fmtMonth(v)}. ${fmtMonth(RD)}'s status is already kept on Consolidated WS Reporting.`
      : '';
    setBtn.textContent = backwards ? 'Move back anyway' : 'Set the date';
  };
  input.addEventListener('input', check);
  // the reporting dates of the programme's cycle (set-up: How often do the workstreams report?)
  const list = reportingDates(RD || Math.floor(Date.now() / 86400000) + 25569, 8);
  const pick = h('select', { 'aria-label': `Pick a ${unit()}` }, h('option', { value: '' }, `Pick a ${monthly() ? 'month-end' : 'reporting date'}…`),
    list.map((d) => h('option', { value: String(d) }, `${fmtDate(d)}${monthly() ? '' : ''}${d === RD ? ' (now)' : ''}`)));
  pick.addEventListener('change', () => { if (pick.value) { input.value = serialToIso(Number(pick.value)); check(); } });
  const nextD = list.find((d) => d > RD);
  setBtn.addEventListener('click', async () => {
    const v = isoToSerial(input.value);
    if (!v) { toast('Pick a date', true); return; }
    setBtn.disabled = true;
    try {
      await store.writeNames([['RD', v]]);
      await store.refresh();
      close();
      toast(`Reporting date set to ${fmtDate(v)}. Every screen now reports to ${periodLabel(v)}.`);
      if (after) await after();
    } catch (e) { setBtn.disabled = false; toast('Could not set the date: ' + (e.message || e), true); }
  });
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) close(); } },
    h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Reporting date' },
      h('h2', 'Reporting date'),
      h('p.small.muted', monthly()
        ? 'Every screen reports to the month of this date: workstream reports, the governance pack, service levels, readiness and the Home checklist. It is usually the last day of the month you are reporting on.'
        : `The workstreams report every ${unit()}, so this is the last day of the ${unit()} you are reporting on. Workstream reports, the pack and the Home checklist follow it. Invoices, service levels and fees stay monthly, by the month of this date.`),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, pick,
        nextD ? h('button.btn.btn-sm', { type: 'button', onclick: () => { input.value = serialToIso(nextD); check(); } }, `Next ${unit()}: ${fmtDate(nextD)}`) : null),
      h('div.field', input),
      warn,
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, h('button.btn', { type: 'button', onclick: close }, 'Cancel'), setBtn)));
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.appendChild(back);
  input.focus();
}
