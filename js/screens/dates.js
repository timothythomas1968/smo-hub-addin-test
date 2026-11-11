// Key dates: a month calendar of every dated item in the Hub, with a type filter and a day list.
import { h, fmtDate, fromSerial, toSerial, MONTHS, toast, asOf, ed } from '../util.js?v=0.10.2.20261111182242';

const TYPES = {
  exit: ['Exits', '#003A70'],
  notice: ['Notice deadlines', '#D9534F'],
  interview: ['Readiness interviews', '#007BFF'],
  forum: ['Forums', '#6F42C1'],
  obl: ['Obligations', '#E0A030'],
  raid: ['RAID and actions', '#5A6573'],
  dr: ['Data requests', '#1F8A70'],
  wo: ['Work orders', '#0B7285'],
  reg: ['Regulatory', '#A61E4D'],
  plan: ['Milestones', '#3AA265']
};
const ui = { month: null, day: null, off: new Set(), exp: false, months: 6 };
const EXITED = new Set(['Exited', 'Terminated']);

function events(store) {
  const ev = [];
  const add = (type, d, title, sub, open) => { d = Number(d); if (d > 0) ev.push({ type, d, title, sub, open }); };
  const recs = (t) => (store.has(t) ? store.records(t) : []);
  recs('tblTSA').forEach((r) => {
    const id = r.get('TSA ID'), nm = r.get('Service name'), go = { k: 'register', arg: { id } };
    if (EXITED.has(r.get('Status'))) { add('exit', r.get('Actual exit date') || r.get('Forecast exit date'), `Exited: ${id}`, nm, go); return; }
    add('exit', r.get('Forecast exit date'), `Exit: ${id}`, nm, go);
    add('notice', r.get('Exit notice deadline'), `Exit notice due: ${id}`, nm, go);
    add('notice', r.get('Extension notice deadline'), `Extension notice deadline: ${id}`, nm, go);
    add('interview', r.get('Next readiness interview'), `Readiness interview: ${id}`, nm, { k: 'interview', arg: { id } });
  });
  // forums: repeat from the first meeting at their frequency, for two years
  const step = { Weekly: [0, 7], Fortnightly: [0, 14], Monthly: [1, 0], Quarterly: [3, 0] };
  recs('tblForums').forEach((r) => {
    const first = fromSerial(r.get('First meeting')), st = step[r.get('Frequency')];
    if (!first || !st) return;
    for (let i = 0; i < 120; i++) {
      const d = st[0] ? new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + st[0] * i, first.getUTCDate())) : new Date(first.getTime() + st[1] * i * 86400000);
      if (d.getTime() - first.getTime() > 2 * 366 * 86400000) break;
      add('forum', toSerial(d), r.get('Forum'), [r.get('Time'), r.get('Joint or internal'), r.get('Chair') && 'chair ' + r.get('Chair')].filter(Boolean).join(' · '), null);
    }
  });
  recs('tblOBL').filter((r) => r.get('Status (adopt or remove)') === 'Open').forEach((r) =>
    add('obl', r.get('Next due date'), r.get('Description'), `${r.get('OBL ID')} · ${r.get('Agreement')} ${r.get('Clause')}`.trim(), null));
  recs('tblDecisions').filter((r) => r.get('Status') === 'Open').forEach((r) =>
    add('raid', r.get('Needed by'), `Decision needed: ${r.get('Decision needed')}`, r.get('Decision ID'), { k: 'raid', arg: { tab: 'DEC', id: r.get('Decision ID') } }));
  recs('tblIssues').filter((r) => !['Closed', 'Remove'].includes(r.get('Status'))).forEach((r) =>
    add('raid', r.get('Due date'), `Issue due: ${r.get('Issue')}`, r.get('Issue ID'), { k: 'raid', arg: { tab: 'ISS', id: r.get('Issue ID') } }));
  recs('tblActions').filter((r) => r.get('Status') === 'Open').forEach((r) =>
    add('raid', r.get('Due date'), `Action due: ${r.get('Action')}`, `${r.get('AC ID')} · ${r.get('Owner')}`, { k: 'raid', arg: { tab: 'AC', id: r.get('AC ID') } }));
  recs('tblAssumpDep').filter((r) => ['Open', 'In progress'].includes(r.get('Status (adopt or remove)'))).forEach((r) =>
    add('raid', r.get('Needed by'), `${r.get('Type') || 'Assumption or dependency'} needed by: ${r.get('Assumption or dependency')}`, r.get('ID'), { k: 'raid', arg: { tab: 'AD', id: r.get('ID') } }));
  recs('tblDataReq').filter((r) => !['Delivered', 'Rejected', 'Cancelled', 'Canceled'].includes(r.get('Status'))).forEach((r) =>
    add('dr', r.get('Due date'), `Data due: ${r.get('Data set requested')}`, `${r.get('DR ID')} · from ${r.get('Requested from')}`, null));
  recs('tblWO').filter((r) => !['Complete', 'Rejected', 'Cancelled', 'Canceled'].includes(r.get('Status'))).forEach((r) =>
    add('wo', r.get('Target completion'), `Work order: ${r.get('Title')}`, `${r.get('WO ID')} · ${r.get('Status')}`, null));
  recs('tblREG').filter((r) => !String(r.get('Status')).startsWith('Approved') && r.get('Status') !== 'Refused').forEach((r) =>
    add('reg', r.get('Due date'), r.get('Filing or approval'), `${r.get('REG ID')} · ${r.get('Regulator')}`, null));
  recs('tblPlan').filter((r) => ['Milestone', 'Gate'].includes(r.get('Type')) && r.get('Status') !== 'Complete').forEach((r) =>
    add('plan', r.get('Planned finish'), r.get('Activity'), `${r.get('TSA ID')} · ${r.get('Owner')}`, { k: 'plan' }));
  return ev;
}

export default {
  tables: ['tblTSA', 'tblForums', 'tblOBL', 'tblDecisions', 'tblIssues', 'tblActions', 'tblAssumpDep', 'tblDataReq', 'tblWO', 'tblREG', 'tblPlan'],
  render(ctx) {
    const { store, go } = ctx;
    const RD = asOf(store.names);   // alerts run from today (the workbook's Today), not the reporting date
    const US = store.names.Edition === 'US';
    const rd = fromSerial(RD) || new Date();
    if (!ui.month) ui.month = new Date(Date.UTC(rd.getUTCFullYear(), rd.getUTCMonth(), 1));
    if (ui.day == null) ui.day = RD;
    const all = events(store);
    const shown = all.filter((e) => !ui.off.has(e.type));
    const byDay = {};
    shown.forEach((e) => (byDay[e.d] = byDay[e.d] || []).push(e));

    const y = ui.month.getUTCFullYear(), m = ui.month.getUTCMonth();
    const first = toSerial(ui.month);
    const startDow = (ui.month.getUTCDay() + (US ? 0 : 6)) % 7;   // Monday first (UK) or Sunday first (US)
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 0; d < days; d++) cells.push(first + d);
    while (cells.length % 7) cells.push(null);
    const today = Math.round((Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
    const rerender = () => ctx.rerender();
    const shiftMonth = (n) => { ui.month = new Date(Date.UTC(y, m + n, 1)); rerender(); };
    const dow = US ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const grid = h('section.card', { style: { minWidth: 0, padding: '14px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } },
        h('button.btn.btn-sm', { type: 'button', 'aria-label': 'Previous month', onclick: () => shiftMonth(-1) }, '‹'),
        h('h2', { style: { margin: 0, fontSize: '18px', color: 'var(--navy)', minWidth: '150px', textAlign: 'center' } }, `${MONTHS[m]} ${y}`),
        h('button.btn.btn-sm', { type: 'button', 'aria-label': 'Next month', onclick: () => shiftMonth(1) }, '›'),
        h('button.btn.btn-sm', { type: 'button', style: { marginLeft: '8px' }, onclick: () => { ui.month = new Date(Date.UTC(rd.getUTCFullYear(), rd.getUTCMonth(), 1)); ui.day = RD; rerender(); } }, 'Today')),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' } },
        dow.map((d) => h('div', { style: { fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textAlign: 'center', padding: '4px 0' } }, d.toUpperCase())),
        cells.map((d) => {
          if (d == null) return h('div');
          const ev = byDay[d] || [];
          const isSel = d === ui.day;
          return h('button', { type: 'button', 'aria-label': `${fmtDate(d)}: ${ev.length} items`, onclick: () => { ui.day = d; rerender(); },
            style: { minHeight: '108px', textAlign: 'left', verticalAlign: 'top', border: `1px solid ${isSel ? 'var(--blue)' : 'var(--line-soft)'}`, boxShadow: isSel ? 'inset 0 0 0 1px var(--blue)' : 'none',
              borderRadius: '6px', background: d === RD ? 'var(--selected)' : '#fff', padding: '4px 5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, overflow: 'hidden' } },
            h('span', { style: { fontSize: '12px', fontWeight: d === today || d === RD ? 700 : 500, color: d === RD ? 'var(--navy)' : 'var(--heading)' } }, String(fromSerial(d).getUTCDate()), d === RD ? ' · today' : ''),
            ev.slice(0, 4).map((e) => h('span', { style: { fontSize: '10.5px', lineHeight: '1.25', color: '#fff', background: TYPES[e.type][1], borderRadius: '3px', padding: '1px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, e.title)),
            ev.length > 4 ? h('span', { style: { fontSize: '10.5px', color: 'var(--muted)', fontWeight: 600 } }, `+${ev.length - 4} more`) : null);
        })));

    const dayEv = (byDay[ui.day] || []);
    const upcoming = shown.filter((e) => e.d > ui.day).sort((a, b) => a.d - b.d).slice(0, 10);
    const evRow = (e, withDate) => h('div.date-row',
      h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: TYPES[e.type][1], flex: '0 0 10px', marginTop: '5px' } }),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: '1 1 auto' } },
        e.open ? h('button.link-btn', { type: 'button', style: { fontSize: '13px', textAlign: 'left', color: 'var(--ink)' }, onclick: () => go(e.open.k, e.open.arg) }, e.title) : h('span', { style: { fontSize: '13px', fontWeight: 600 } }, e.title),
        h('span.small.muted', [withDate ? fmtDate(e.d) : null, TYPES[e.type][0], e.sub].filter(Boolean).join(' · '))));
    // The selected day sits under the full-width calendar (evaluation H; 0.10 item 3)
    const side = h('section.card', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('div.row-wrap', { style: { alignItems: 'flex-start' } },
        h('div', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', `Selected day · ${fmtDate(ui.day)}`),
          dayEv.length ? dayEv.map((e) => evRow(e, false)) : h('p.small.muted', { style: { margin: '6px 0 0' } }, 'Nothing on this day.')),
        h('div', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', 'Next after this day'), upcoming.map((e) => evRow(e, true)))),
      h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '6px', borderTop: '1px solid var(--line-soft)', paddingTop: '10px' } },
        h('span.small.muted', 'Dates come from the registers. Change them there (or on the matching screen) and the calendar follows.'),
        ui.exp ? exportBox(store, shown, RD, rerender) : h('button.link-btn', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => { ui.exp = true; rerender(); } }, 'Copy these dates to Outlook…')));

    return h('div.page',
      h('div.page-head', h('div', h('h1', 'Key dates'),
        h('p.lede', 'Exits, notice deadlines, readiness interviews, forums, obligations, RAID and action due dates, data requests, work orders, regulatory filings and plan milestones.'))),
      typeTable(all, first, first + days - 1, rerender),
      grid, side);
  }
};

// The event types as a table with tick boxes (Tim, 2 Nov 2026): colour, name, this month and in total.
function typeTable(all, from, to, rerender) {
  const cnt = (k, inMonth) => all.filter((e) => e.type === k && (!inMonth || (e.d >= from && e.d <= to))).length;
  const allOn = Object.keys(TYPES).every((k) => !ui.off.has(k));
  return h('section.card', { style: { padding: '10px 14px' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' } }, h('h2.cap', { style: { flex: '1 1 auto' } }, 'Show on the calendar'),
      h('button.link-btn', { type: 'button', onclick: () => { if (allOn) Object.keys(TYPES).forEach((k) => ui.off.add(k)); else ui.off.clear(); rerender(); } }, allOn ? ed('Untick all') : ed('Tick all'))),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '2px 18px' } },
      Object.entries(TYPES).map(([k, [label, col]]) => {
        const id = 'kd-' + k;
        const cb = h('input.cb-plain', { type: 'checkbox', id, checked: !ui.off.has(k) });
        cb.addEventListener('change', () => { cb.checked ? ui.off.delete(k) : ui.off.add(k); rerender(); });
        return h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: '1px solid var(--line-soft)' } }, cb,
          h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: col, flex: '0 0 10px' } }),
          h('label', { for: id, style: { flex: '1 1 auto', fontSize: '13px', cursor: 'pointer' } }, label),
          h('span.small.muted', { title: 'This month · in total' }, `${cnt(k, true)} · ${cnt(k, false)}`));
      })));
}

function exportBox(store, shown, RD, rerender) {
  const sel = h('select', { 'aria-label': 'Period', style: { border: '1px solid var(--line-strong)', borderRadius: '6px', padding: '5px 8px', background: '#fff' } },
    [3, 6, 12].map((m) => h('option', { value: String(m) }, `Next ${m} months`)));
  sel.value = String(ui.months);
  sel.addEventListener('change', () => { ui.months = Number(sel.value); });
  const until = () => { const d = fromSerial(RD); return toSerial(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + ui.months, d.getUTCDate()))); };
  return h('div', { style: { background: 'var(--input)', border: '1px solid var(--line)', borderRadius: '6px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' } },
    h('b', { style: { fontSize: '13px' } }, 'Copy dates to Outlook'),
    h('ol.small', { style: { margin: '0', paddingLeft: '18px' } },
      h('li', 'Download the file below (only the types switched on above).'),
      h('li', 'Open the downloaded .ics file. Outlook asks which calendar to add the dates to.')),
    h('span.small.muted', 'Tip: add them to a calendar of their own (for example one called TransitionSuite), so they can be removed in one go.'),
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } }, sel,
      h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => { const u = until(); exportIcs(shown.filter((e) => e.type !== 'forum' && e.d >= RD && e.d <= u), ui.off.has('forum') ? [] : store.records('tblForums'), RD, u); } }, 'Download (.ics)'),
      h('button.link-btn', { type: 'button', onclick: () => { ui.exp = false; rerender(); } }, 'Close')));
}

function exportIcs(evs, forums, from, until) {
  // From the reporting date on only; each forum is one repeating meeting rather than hundreds of single entries.
  const pad = (n) => String(n).padStart(2, '0');
  const dt = (s) => { const d = fromSerial(s); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; };
  const esc = (s) => String(s || '').replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, ' ');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Whisper Consulting//TransitionSuite//EN', 'X-WR-CALNAME:TransitionSuite key dates'];
  const stamp = 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  evs.forEach((e, i) => lines.push('BEGIN:VEVENT', `UID:smohub-${e.type}-${e.d}-${i}`, stamp, `DTSTART;VALUE=DATE:${dt(e.d)}`, `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.sub)}`, 'TRANSP:TRANSPARENT', 'CATEGORIES:TransitionSuite', 'END:VEVENT'));
  const rule = { Weekly: 'FREQ=WEEKLY', Fortnightly: 'FREQ=WEEKLY;INTERVAL=2', Monthly: 'FREQ=MONTHLY', Quarterly: 'FREQ=MONTHLY;INTERVAL=3' };
  forums.forEach((r, i) => {
    let f = Number(r.get('First meeting'));
    const rr = rule[r.get('Frequency')];
    if (!f || !rr) return;
    // start the series at the first meeting on or after the reporting date
    const fd = fromSerial(f), fq = r.get('Frequency');
    for (let i = 0; f < from && i < 600; i++) {
      f = fq === 'Weekly' ? f + 7 : fq === 'Fortnightly' ? f + 14
        : toSerial(new Date(Date.UTC(fd.getUTCFullYear(), fd.getUTCMonth() + (fq === 'Monthly' ? 1 : 3) * (i + 1), fd.getUTCDate())));
    }
    if (f > until) return;
    const tm = /^(\d{1,2}):(\d\d)/.exec(String(r.get('Time') || ''));
    const start = tm ? `DTSTART:${dt(f)}T${pad(tm[1])}${tm[2]}00` : `DTSTART;VALUE=DATE:${dt(f)}`;
    lines.push('BEGIN:VEVENT', `UID:smohub-forum-${i}`, stamp, start, tm ? 'DURATION:PT1H' : '', `RRULE:${rr};UNTIL=${dt(until)}T235959Z`,
      `SUMMARY:${esc(r.get('Forum'))}`, 'CATEGORIES:TransitionSuite', `DESCRIPTION:${esc([r.get('Joint or internal'), r.get('Chair') && 'Chair ' + r.get('Chair')].filter(Boolean).join(' · '))}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.filter(Boolean).join('\r\n')], { type: 'text/calendar' }));
    a.download = 'TransitionSuite key dates.ics';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast('Download is not available here', true); }
}
