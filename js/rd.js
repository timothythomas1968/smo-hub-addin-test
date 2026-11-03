// Change the reporting date: one dialog, opened from the title bar, Home or the workstream report.
// The date lives in 'Consolidated WS Reporting'!B5 (the name RD); every screen reports to its month.
import { h, toast, fmtDate, fmtMonth, serialToIso, isoToSerial, fromSerial } from './util.js?v=0.9.1.20261103220325';

const monthNo = (n) => { const d = fromSerial(n); return d ? d.getUTCFullYear() * 12 + d.getUTCMonth() : 0; };

/** after(): called once the date is saved and the workbook re-read. */
export function openRDDialog(store, after) {
  document.querySelector('.modal-back')?.remove();
  const RD = Number(store.names.RD) || 0;
  const input = h('input', { type: 'date', value: serialToIso(RD), 'aria-label': 'Reporting date' });
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
  setBtn.addEventListener('click', async () => {
    const v = isoToSerial(input.value);
    if (!v) { toast('Pick a date', true); return; }
    setBtn.disabled = true;
    try {
      await store.writeCells('Consolidated WS Reporting', [{ addr: 'B5', value: v }]);
      await store.refresh();
      close();
      toast(`Reporting date set to ${fmtDate(v)}. Every screen now reports to ${fmtMonth(v)}.`);
      if (after) await after();
    } catch (e) { setBtn.disabled = false; toast('Could not set the date: ' + (e.message || e), true); }
  });
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) close(); } },
    h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Reporting date' },
      h('h2', 'Reporting date'),
      h('p.small.muted', 'Every screen reports to the month of this date: workstream reports, the governance pack, service levels, readiness and the Home checklist. It is usually the last day of the month you are reporting on.'),
      h('div.field', input),
      warn,
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, h('button.btn', { type: 'button', onclick: close }, 'Cancel'), setBtn)));
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.appendChild(back);
  input.focus();
}
