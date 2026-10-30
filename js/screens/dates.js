// Key dates: a month calendar of every dated item in the Hub, with a type filter and a day list.
import { h, fmtDate, fromSerial, toSerial, MONTHS, toast } from '../util.js?v=0.2.3.20261030214117';

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
const ui = { month: null, day: null, off: new Set() };
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
    add('interview', r.get('Next readiness interview'), `Readiness interview: ${id}`, nm, { k: 'interview' });
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
  recs('tblDataReq').filter((r) => !['Delivered', 'Rejected', 'Cancelled'].includes(r.get('Status'))).forEach((r) =>
    add('dr', r.get('Due date'), `Data due: ${r.get('Data set requested')}`, `${r.get('DR ID')} · from ${r.get('Requested from')}`, null));
  recs('tblWO').filter((r) => !['Complete', 'Rejected', 'Cancelled'].includes(r.get('Status'))).forEach((r) =>
    add('wo', r.get('Target completion'), `Work order: ${r.get('Title')}`, `${r.get('WO ID')} · ${r.get('Status')}`, null));
  recs('tblREG').filter((r) => !String(r.get('Status')).startsWith('Approved') && r.get('Status') !== 'Refused').forEach((r) =>
    add('reg', r.get('Due date'), r.get('Filing or approval'), `${r.get('REG ID')} · ${r.get('Regulator')}`, null));
  recs('tblPlan').filter((r) => ['Milestone', 'Gate'].includes(r.get('Type')) && r.get('Status') !== 'Complete').forEach((r) =>
    add('plan', r.get('Planned finish'), r.get('Activity'), `${r.get('TSA ID')} · ${r.get('Owner')}`, { k: 'plan' }));
  return ev;
}

export default {
  tables: ['tblTSA', 'tblForums', 'tblOBL', 'tblDecisions', 'tblIssues', 'tblActions', 'tblDataReq', 'tblWO', 'tblREG', 'tblPlan'],
  render(ctx) {
    const { store, go } = ctx;
    const RD = Number(store.names.RD) || 0;
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

    const grid = h('section.card', { style: { flex: '999 1 560px', minWidth: 0, padding: '14px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' } },
        h('button.btn.btn-sm', { type: 'button', 'aria-label': 'Previous month', onclick: () => shiftMonth(-1) }, '‹'),
        h('h2', { style: { margin: 0, fontSize: '18px', color: 'var(--navy)', minWidth: '150px', textAlign: 'center' } }, `${MONTHS[m]} ${y}`),
        h('button.btn.btn-sm', { type: 'button', 'aria-label': 'Next month', onclick: () => shiftMonth(1) }, '›'),
        h('button.btn.btn-sm', { type: 'button', style: { marginLeft: '8px' }, onclick: () => { ui.month = new Date(Date.UTC(rd.getUTCFullYear(), rd.getUTCMonth(), 1)); ui.day = RD; rerender(); } }, 'Reporting month')),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: '4px' } },
        dow.map((d) => h('div', { style: { fontSize: '11px', fontWeight: 700, color: 'var(--muted)', textAlign: 'center', padding: '4px 0' } }, d.toUpperCase())),
        cells.map((d) => {
          if (d == null) return h('div');
          const ev = byDay[d] || [];
          const isSel = d === ui.day;
          return h('button', { type: 'button', 'aria-label': `${fmtDate(d)}: ${ev.length} items`, onclick: () => { ui.day = d; rerender(); },
            style: { minHeight: '84px', textAlign: 'left', verticalAlign: 'top', border: `1px solid ${isSel ? 'var(--blue)' : 'var(--line-soft)'}`, boxShadow: isSel ? 'inset 0 0 0 1px var(--blue)' : 'none',
              borderRadius: '6px', background: d === RD ? 'var(--selected)' : '#fff', padding: '4px 5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, overflow: 'hidden' } },
            h('span', { style: { fontSize: '12px', fontWeight: d === today || d === RD ? 700 : 500, color: d === RD ? 'var(--navy)' : 'var(--heading)' } }, String(fromSerial(d).getUTCDate()), d === RD ? ' · RD' : ''),
            ev.slice(0, 3).map((e) => h('span', { style: { fontSize: '10.5px', lineHeight: '1.25', color: '#fff', background: TYPES[e.type][1], borderRadius: '3px', padding: '1px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, e.title)),
            ev.length > 3 ? h('span', { style: { fontSize: '10.5px', color: 'var(--muted)', fontWeight: 600 } }, `+${ev.length - 3} more`) : null);
        })));

    const dayEv = (byDay[ui.day] || []);
    const upcoming = shown.filter((e) => e.d > ui.day).sort((a, b) => a.d - b.d).slice(0, 10);
    const evRow = (e, withDate) => h('div.date-row',
      h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: TYPES[e.type][1], flex: '0 0 10px', marginTop: '5px' } }),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: '1 1 auto' } },
        e.open ? h('button.link-btn', { type: 'button', style: { fontSize: '13px', textAlign: 'left', color: 'var(--ink)' }, onclick: () => go(e.open.k, e.open.arg) }, e.title) : h('span', { style: { fontSize: '13px', fontWeight: 600 } }, e.title),
        h('span.small.muted', [withDate ? fmtDate(e.d) : null, TYPES[e.type][0], e.sub].filter(Boolean).join(' · '))));
    const side = h('aside.panel', { style: { padding: '0' } },
      h('div.panel-head', h('span.panel-id', 'Selected day'), h('h2.panel-title', fmtDate(ui.day))),
      h('div.panel-body',
        dayEv.length ? dayEv.map((e) => evRow(e, false)) : h('p.small.muted', { style: { margin: 0 } }, 'Nothing on this day.'),
        h('div.sec', 'Next after this day'),
        upcoming.map((e) => evRow(e, true))),
      h('div.panel-foot', h('span.small.muted', 'Dates come from the registers. Change them there (or on the matching screen) and the calendar follows.')));

    return h('div.page',
      h('div.page-head', h('div', h('h1', 'Key dates'),
        h('p.lede', 'Exits, notice deadlines, readiness interviews, forums, obligations, RAID and action due dates, data requests, work orders, regulatory filings and plan milestones.')),
        h('button.btn', { type: 'button', onclick: () => exportIcs(shown.filter((e) => e.type !== 'forum' && e.d >= RD), ui.off.has('forum') ? [] : store.records('tblForums')) }, 'Download calendar (.ics)')),
      h('div.filters', Object.entries(TYPES).map(([k, [label, col]]) => {
        const on = !ui.off.has(k);
        return h('button.fchip', { type: 'button', 'aria-pressed': String(on), onclick: () => { on ? ui.off.add(k) : ui.off.delete(k); rerender(); },
          style: on ? { background: col, borderColor: col, color: '#fff' } : null }, label, h('span.n', String(all.filter((e) => e.type === k).length)));
      })),
      h('div.row-wrap', grid, side));
  }
};

function exportIcs(evs, forums) {
  // From the reporting date on only; each forum is one repeating meeting rather than hundreds of single entries.
  const pad = (n) => String(n).padStart(2, '0');
  const dt = (s) => { const d = fromSerial(s); return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`; };
  const esc = (s) => String(s || '').replace(/[\\,;]/g, (c) => '\\' + c).replace(/\n/g, ' ');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Whisper Consulting//SMO Hub//EN', 'X-WR-CALNAME:SMO Hub key dates'];
  const stamp = 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  evs.forEach((e, i) => lines.push('BEGIN:VEVENT', `UID:smohub-${e.type}-${e.d}-${i}`, stamp, `DTSTART;VALUE=DATE:${dt(e.d)}`, `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(e.sub)}`, 'TRANSP:TRANSPARENT', 'END:VEVENT'));
  const rule = { Weekly: 'FREQ=WEEKLY', Fortnightly: 'FREQ=WEEKLY;INTERVAL=2', Monthly: 'FREQ=MONTHLY', Quarterly: 'FREQ=MONTHLY;INTERVAL=3' };
  forums.forEach((r, i) => {
    const f = r.get('First meeting'), rr = rule[r.get('Frequency')];
    if (!f || !rr) return;
    const tm = /^(\d{1,2}):(\d\d)/.exec(String(r.get('Time') || ''));
    const start = tm ? `DTSTART:${dt(f)}T${pad(tm[1])}${tm[2]}00` : `DTSTART;VALUE=DATE:${dt(f)}`;
    lines.push('BEGIN:VEVENT', `UID:smohub-forum-${i}`, stamp, start, tm ? 'DURATION:PT1H' : '', `RRULE:${rr};COUNT=${{ Weekly: 104, Fortnightly: 52, Monthly: 24, Quarterly: 8 }[r.get('Frequency')]}`,
      `SUMMARY:${esc(r.get('Forum'))}`, `DESCRIPTION:${esc([r.get('Joint or internal'), r.get('Chair') && 'Chair ' + r.get('Chair')].filter(Boolean).join(' · '))}`, 'END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([lines.filter(Boolean).join('\r\n')], { type: 'text/calendar' }));
    a.download = 'SMO Hub key dates.ics';
    document.body.appendChild(a); a.click(); a.remove();
  } catch (e) { toast('Download is not available here', true); }
}
