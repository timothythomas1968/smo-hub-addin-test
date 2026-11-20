// Calendar (the Calendar sheet, formerly Key Dates): a month calendar of every dated item in the Hub, with a type filter.
// Restyled after the worksheet (Tim, 17 Nov 2026; brief 4.3): the same pastel event colours and the grey band behind the day names.
// A day opens in a pop-up; items move by dragging them to another day, or with "Move to another date" in the pop-up,
// by the Hub's date change rules (brief 4.4, daterules.js).
import { h, fmtDate, fromSerial, toSerial, MONTHS, toast, asOf, ed, dateBox, isoToSerial } from '../util.js?v=0.12.5.20261120071957';
import { ruleFor, ruleText, moveItem, meetingMoves, RULES } from '../daterules.js?v=0.12.5.20261120071957';

// [label, background, text]: keep in step with KD_COLOURS in workbook/builder/hub3_d.py (the worksheet Calendar)
export const TYPES = {
  deal: ['Deal dates', '#EDE9FE', '#5B21B6'],
  exit: ['Exits', '#FEE2E2', '#8E1B1B'],
  notice: ['Exit notice deadlines', '#FEE2E2', '#8E1B1B'],
  ext: ['Extension deadlines', '#FEF3C7', '#7A4A00'],
  interview: ['Readiness interviews', '#CCFBF1', '#115E59'],
  forum: ['Forum meetings', '#E6EEF7', '#003A70'],
  cr: ['Change decisions', '#FEF9C3', '#713F12'],
  obl: ['Obligations', '#FFEDD5', '#9A3412'],
  reg: ['Regulatory', '#FCE7F3', '#9D174D'],
  tpc: ['Third-party consents', '#E0E7FF', '#3730A3'],
  raid: ['Decisions, issues and actions', '#F3F4F6', '#3A4250'],
  dr: ['Data requests', '#E0F2FE', '#075985'],
  wo: ['Work orders', '#ECFCCB', '#3F6212'],
  plan: ['Plan milestones', '#D1FAE5', '#065F46'],
  task: ['Plan tasks', '#ECFDF5', '#065F46'],
  d1: ['Day 1 tasks', '#FAE8FF', '#86198F'],
  f100: ['First 100 days tasks', '#F1F5F9', '#334155']
};
const ui = { month: null, off: new Set(['task']), exp: false, months: 6 };
const EXITED = new Set(['Exited', 'Terminated']);

export function events(store) {
  const ev = [];
  const add = (type, d, title, sub, open, more = {}) => { d = Number(d); if (d > 0) ev.push({ type, key: more.key || type, d, title, sub, open, ...more }); };
  const recs = (t) => (store.has(t) ? store.records(t) : []);
  const n = store.names;
  add('deal', n.CloseDate, 'Closing (Day 1)', n.ProgName || '', null, { key: 'deal' });
  add('deal', n.LongStop, 'Long-stop date', 'Every TSA service must have ended', null, { key: 'deal' });
  recs('tblTSA').forEach((r) => {
    const id = r.get('TSA ID'), nm = r.get('Service name'), go = { k: 'register', arg: { id } };
    if (EXITED.has(r.get('Status'))) { add('exit', r.get('Actual exit date') || r.get('Forecast exit date'), `Exited: ${id}`, nm, go, { key: 'notice', rec: r }); return; }
    add('exit', r.get('Planned exit date') || r.get('Forecast exit date'), `Exit: ${id}`, nm, go, { key: 'exit', rec: r, short: `${id} ${nm} exit` });
    add('notice', r.get('Exit notice deadline'), `Exit notice due: ${id}`, nm, go, { key: 'notice', rec: r });
    add('ext', r.get('Extension notice deadline'), `Extension deadline: ${id}`, nm, go, { key: 'notice', rec: r });
    add('interview', r.get('Next readiness interview'), `Readiness interview: ${id}`, nm, { k: 'interview', arg: { id } }, { key: 'interview', rec: r });
  });
  // forums: repeat from the first meeting at their frequency, for two years; a moved meeting falls on its new date
  const step = { Weekly: [0, 7], Fortnightly: [0, 14], Monthly: [1, 0], Quarterly: [3, 0] };
  const moved = meetingMoves(store);
  // to the end of the programme: the latest of the long-stop date and the last exit, or two years (brief 4.9)
  const lastExit = Math.max(0, ...recs('tblTSA').map((r) => Number(r.get('Planned exit date')) || Number(r.get('Forecast exit date')) || 0));
  const until = Math.max(Number(n.LongStop) || 0, lastExit);
  recs('tblForums').forEach((r) => {
    const first = fromSerial(r.get('First meeting')), st = step[r.get('Frequency')], forum = r.get('Forum');
    if (!first || !st) return;
    for (let i = 0; i < 400; i++) {
      const d = st[0] ? new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + st[0] * i, first.getUTCDate())) : new Date(first.getTime() + st[1] * i * 86400000);
      if (until ? toSerial(d) > until : d.getTime() - first.getTime() > 2 * 366 * 86400000) break;
      const orig = toSerial(d), mv = moved.find((m) => m.forum === forum && m.from === orig);
      add('forum', mv ? mv.to : orig, forum, [r.get('Time'), r.get('Joint or internal'), r.get('Chair') && 'chair ' + r.get('Chair'), mv ? `moved from ${fmtDate(orig)}` : null].filter(Boolean).join(' · '), null,
        { key: 'forum', forum, orig, short: `${forum} (${fmtDate(mv ? mv.to : orig)})` });
    }
  });
  recs('tblChange').filter((r) => /^(Draft|Submitted|Pending|Under review)$/.test(r.get('Status'))).forEach((r) =>
    add('cr', r.get('Decision due'), `Change decision due: ${r.get('CR ID')}`, r.get('Title'), { k: 'changes', arg: { id: r.get('CR ID') } }, { key: 'notice', rec: r }));
  recs('tblOBL').filter((r) => r.get('Status (adopt or remove)') === 'Open').forEach((r) =>
    add('obl', r.get('Next due date'), r.get('Description'), `${r.get('OBL ID')} · ${r.get('Agreement')} ${r.get('Clause')}`.trim(), { k: 'obligations', arg: { id: r.get('OBL ID') } }, { key: 'obl', row: r.i, rec: r, short: r.get('OBL ID'), owner: r.get('Owner') }));
  recs('tblDecisions').filter((r) => ['Open', 'New'].includes(r.get('Status'))).forEach((r) =>
    add('raid', r.get('Needed by'), `Decision needed: ${r.get('Decision needed')}`, r.get('Decision ID'), { k: 'raid', arg: { tab: 'DEC', id: r.get('Decision ID') } }, { key: 'decision', row: r.i, rec: r, short: r.get('Decision ID'), owner: r.get('Owner') }));
  recs('tblIssues').filter((r) => !['Closed', 'Remove'].includes(r.get('Status'))).forEach((r) =>
    add('raid', r.get('Due date'), `Issue due: ${r.get('Issue')}`, r.get('Issue ID'), { k: 'raid', arg: { tab: 'ISS', id: r.get('Issue ID') } }, { key: 'issue', row: r.i, rec: r, short: r.get('Issue ID'), owner: r.get('Owner') }));
  recs('tblActions').filter((r) => r.get('Status') === 'Open').forEach((r) =>
    add('raid', r.get('Due date'), `Action due: ${r.get('Action')}`, `${r.get('AC ID')} · ${r.get('Owner')}`, { k: 'raid', arg: { tab: 'AC', id: r.get('AC ID') } }, { key: 'action', row: r.i, rec: r, short: r.get('AC ID'), owner: r.get('Owner') }));
  recs('tblAssumpDep').filter((r) => ['Open', 'In progress'].includes(r.get('Status (adopt or remove)'))).forEach((r) =>
    add('raid', r.get('Needed by'), `${r.get('Type') || 'Assumption or dependency'} needed by: ${r.get('Assumption or dependency')}`, r.get('ID'), { k: 'raid', arg: { tab: 'AD', id: r.get('ID') } }, { key: 'notice' }));
  recs('tblDataReq').filter((r) => !['Delivered', 'Rejected', 'Cancelled', 'Canceled'].includes(r.get('Status'))).forEach((r) =>
    add('dr', r.get('Due date'), `Data due: ${r.get('Data set requested')}`, `${r.get('DR ID')} · from ${r.get('Requested from')}`, { k: 'datareq', arg: { id: r.get('DR ID') } }, { key: 'dr', row: r.i, rec: r, short: r.get('DR ID') }));
  recs('tblWO').filter((r) => !['Complete', 'Rejected', 'Cancelled', 'Canceled'].includes(r.get('Status'))).forEach((r) =>
    add('wo', r.get('Target completion'), `Work order: ${r.get('Title')}`, `${r.get('WO ID')} · ${r.get('Status')}`, { k: 'workorders', arg: { id: r.get('WO ID') } }, { key: 'wo', row: r.i, rec: r, short: r.get('WO ID') }));
  recs('tblREG').filter((r) => !String(r.get('Status')).startsWith('Approved') && r.get('Status') !== 'Refused').forEach((r) =>
    add('reg', r.get('Due date'), r.get('Filing or approval'), `${r.get('REG ID')} · ${r.get('Regulator')}`, null, { key: 'reg', row: r.i, rec: r, short: r.get('REG ID'), owner: r.get('Owner') }));
  recs('tblTPC').filter((r) => !['Agreed', 'Not needed', 'Refused'].includes(r.get('Status'))).forEach((r) =>
    add('tpc', r.get('Response due'), `Consent due: ${r.get('Vendor')}`, `${r.get('TPC ID')} · ${r.get('Contract')}`, { k: 'thirdparties', arg: { id: r.get('TPC ID') } }, { key: 'tpc', row: r.i, rec: r, short: r.get('TPC ID'), owner: r.get('Owner') }));
  recs('tblPlan').filter((r) => r.get('Activity') && r.get('Status') !== 'Complete' && r.get('Type') !== 'TSA exit').forEach((r) => {
    const ms = ['Milestone', 'Gate'].includes(r.get('Type'));
    add(ms ? 'plan' : 'task', r.get('Planned finish'), r.get('Activity'), `${r.get('Activity ID')} · ${r.get('TSA ID')} · ${r.get('Owner')}${r.get('Proposed finish') ? ` · change requested to ${fmtDate(r.get('Proposed finish'))}` : ''}`,
      { k: 'plan', arg: { id: r.get('Activity ID') } }, { key: ms ? 'milestone' : 'task', plan: r.get('Activity ID'), rec: r, short: `${r.get('Activity ID')} ${r.get('Activity')}` });
  });
  recs('tblDay1').filter((r) => r.get('Task') && !/^(Complete|Not required)$/.test(r.get('Status'))).forEach((r) =>
    add('d1', r.get('Due date'), `Day 1: ${r.get('Task')}`, `${r.get('D1 ID')} · ${r.get('Owner')}`, { k: 'day1' }, { key: 'day1', row: r.i, rec: r, short: r.get('D1 ID'), owner: r.get('Owner') }));
  recs('tblFirst100').filter((r) => r.get('Task') && !/^(Complete|Not required|Suggested|Remove)$/.test(r.get('Status'))).forEach((r) =>
    add('f100', r.get('Due date'), `First 100 days: ${r.get('Task')}`, `${r.get('ID')} · ${r.get('Owner')}`, { k: 'f100' }, { key: 'f100', row: r.i, rec: r, short: r.get('ID'), owner: r.get('Owner') }));
  return ev;
}

const chip = (type) => ({ background: TYPES[type][1], color: TYPES[type][2] });

export default {
  tables: ['tblTSA', 'tblForums', 'tblOBL', 'tblDecisions', 'tblIssues', 'tblActions', 'tblAssumpDep', 'tblDataReq', 'tblWO', 'tblREG', 'tblTPC', 'tblPlan', 'tblChange', 'tblDay1', 'tblFirst100'],
  render(ctx) {
    const { store, go } = ctx;
    const TODAY = asOf(store.names);   // alerts run from today (the workbook's Today), not the reporting date
    const RD = Number(store.names.RD) || 0;
    const US = store.names.Edition === 'US';
    const td = fromSerial(TODAY) || new Date();
    if (!ui.month) ui.month = new Date(Date.UTC(td.getUTCFullYear(), td.getUTCMonth(), 1));
    const all = events(store);
    if (store.src.kind === 'preview') window.__cal = { all, move: (pred, d) => moveItem(ctx, all.find(pred), d) };   // for the browser tests only
    const shown = all.filter((e) => !ui.off.has(e.type));
    const byDay = {};
    shown.forEach((e) => (byDay[e.d] = byDay[e.d] || []).push(e));

    const y = ui.month.getUTCFullYear(), m = ui.month.getUTCMonth();
    const first = toSerial(ui.month);
    const startDow = (ui.month.getUTCDay() + (US ? 0 : 6)) % 7;   // Monday first (UK) or Sunday first (US)
    const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(first - startDow + i);
    for (let d = 0; d < days; d++) cells.push(first + d);
    while (cells.length % 7) cells.push(first + days + (cells.length - startDow - days));
    const rerender = () => ctx.rerender();
    const shiftMonth = (n) => { ui.month = new Date(Date.UTC(y, m + n, 1)); rerender(); };
    const dow = US ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const movable = (e) => !e.done && ruleFor(store, e.key) !== 'Fixed' && !['notice', 'interview', 'deal'].includes(e.key);   // interviews move on their own screen
    let dragged = null;

    const grid = h('section.card.cal-card', { style: { minWidth: 0, padding: '14px' } },
      h('div.cal-nav',
        h('button.btn.btn-sm', { type: 'button', 'aria-label': 'Previous month', onclick: () => shiftMonth(-1) }, '‹'),
        h('h2', `${MONTHS[m]} ${y}`),
        h('button.btn.btn-sm', { type: 'button', 'aria-label': 'Next month', onclick: () => shiftMonth(1) }, '›'),
        h('button.btn.btn-sm', { type: 'button', style: { marginLeft: '8px' }, onclick: () => { ui.month = new Date(Date.UTC(td.getUTCFullYear(), td.getUTCMonth(), 1)); rerender(); } }, 'Today'),
        h('span.small.muted.cal-key', h('span.cal-key-today'), 'Today', h('span.cal-key-rd'), 'Reporting date')),
      h('div.cal-grid',
        dow.map((d) => h('div.cal-dow', h('span.cal-dow-long', ed(d)), h('span.cal-dow-short', ed(d).slice(0, 3)))),
        cells.map((d) => {
          const inMonth = d >= first && d < first + days;
          const ev = inMonth ? (byDay[d] || []) : [];
          const cell = h('div.cal-day', { role: 'button', tabindex: inMonth ? '0' : '-1', class: [inMonth ? null : 'out', d === TODAY ? 'today' : null, d === RD ? 'rd' : null].filter(Boolean).join(' ') || null,
            'aria-label': `${fmtDate(d)}: ${ev.length} item${ev.length === 1 ? '' : 's'}`, 'data-d': String(d) },
          h('span.cal-num', String(fromSerial(d).getUTCDate())),
          ev.slice(0, 4).map((e) => {
            const c = h('span.cal-ev', { style: chip(e.type), title: `${e.title}${e.sub ? ' · ' + e.sub : ''}${movable(e) ? ' (drag to move)' : ''}`, draggable: movable(e) ? 'true' : null }, e.title);
            if (movable(e)) c.addEventListener('dragstart', (x) => { dragged = e; x.dataTransfer.effectAllowed = 'move'; try { x.dataTransfer.setData('text/plain', e.title); } catch (er) { /* old engines */ } });
            return c;
          }),
          ev.length > 4 ? h('span.cal-more', `+${ev.length - 4} more`) : null);
          if (inMonth) {
            const open = () => dayPopup(ctx, d, byDay[d] || [], movable);
            cell.addEventListener('click', open);
            cell.addEventListener('keydown', (x) => { if (x.key === 'Enter' || x.key === ' ') { x.preventDefault(); open(); } });
            cell.addEventListener('dragover', (x) => { if (dragged) { x.preventDefault(); cell.classList.add('drop'); } });
            cell.addEventListener('dragleave', () => cell.classList.remove('drop'));
            cell.addEventListener('drop', (x) => { x.preventDefault(); cell.classList.remove('drop'); const e = dragged; dragged = null; if (e && d !== e.d) moveItem(ctx, e, d); });
          }
          return cell;
        })));

    const upcoming = shown.filter((e) => e.d >= TODAY).sort((a, b) => a.d - b.d).slice(0, 10);
    const side = h('section.card', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('h2.cap', 'Coming up'),
      upcoming.length ? upcoming.map((e) => evRow(ctx, e, true)) : h('p.small.muted', 'Nothing coming up.'),
      h('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: '6px', borderTop: '1px solid var(--line-soft)', paddingTop: '10px' } },
        h('span.small.muted', 'Select a day to see everything on it. Drag an item to another day to move it: the Hub\'s date change rules (Library sheet) say whether it moves straight away or needs a change request.'),
        ui.exp ? exportBox(store, shown, TODAY, rerender) : h('button.link-btn', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => { ui.exp = true; rerender(); } }, 'Copy these dates to Outlook…')));

    return h('div.page',
      h('div.page-head', h('div', h('h1', 'Calendar'),
        h('p.lede', 'Every date in the Hub: exits, notice deadlines, forums, interviews, obligations, RAID, plans and more. Select a day to see it, or drag an item to move it.'))),
      typeTable(all, first, first + days - 1, rerender),
      grid, side);
  }
};

function evRow(ctx, e, withDate) {
  return h('div.date-row',
    h('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: TYPES[e.type][1], border: `1px solid ${TYPES[e.type][2]}`, flex: '0 0 10px', marginTop: '5px' } }),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: '1 1 auto' } },
      e.open ? h('button.link-btn', { type: 'button', style: { fontSize: '13px', textAlign: 'left', color: 'var(--ink)' }, onclick: () => { document.querySelector('.modal-back.day')?.remove(); ctx.go(e.open.k, e.open.arg); } }, e.title) : h('span', { style: { fontSize: '13px', fontWeight: 600 } }, e.title),
      h('span.small.muted', [withDate ? fmtDate(e.d) : null, TYPES[e.type][0], e.sub].filter(Boolean).join(' · '))));
}

// The day's items in a pop-up, by type, in the style of the TSA register's detail panel (Tim, 17 Nov 2026).
function dayPopup(ctx, d, list, movable) {
  const { store } = ctx;
  document.querySelector('.modal-back.day')?.remove();
  const back = h('div.modal-back.day', { onclick: (x) => { if (x.target === back) close(); } });
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
  const esc = (x) => { if (x.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  const types = Object.keys(TYPES).filter((t) => list.some((e) => e.type === t));
  const item = (e) => {
    const rule = ruleFor(store, e.key);
    const can = movable(e);
    const box = h('div.mv-box', { hidden: true });
    const row = h('div.day-item', evRow(ctx, e, false),
      can ? h('button.link-btn.small', { type: 'button', onclick: () => {
        if (!box.hidden) { box.hidden = true; return; }
        const date = dateBox(e.d, { 'aria-label': 'New date' });
        box.replaceChildren(date, h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: () => { const nd = isoToSerial(date.value); if (nd) { close(); moveItem(ctx, e, nd); } } }, 'Move'),
          h('span.small.muted', ruleText(rule)));
        box.hidden = false; setTimeout(() => date.focus && date.focus(), 0);
      } }, 'Move to another date') : e.key === 'interview' ? h('span.small.muted', 'Change interview dates on the Readiness interviews screen.')
        : h('span.small.muted', e.key === 'notice' || rule === 'Fixed' ? ed(`Fixed: ${RULES[e.key] ? RULES[e.key][1] : 'from the registers'}.`) : ''),
      box);
    return row;
  };
  back.appendChild(h('div.panel.day-pop', { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Everything on ${fmtDate(d)}` },
    h('div.panel-head', h('span.panel-id', fromSerial(d).toLocaleDateString(store.names.Edition === 'US' ? 'en-US' : 'en-GB', { weekday: 'long', timeZone: 'UTC' })),
      h('h2.panel-title', fmtDate(d)), h('button.icon-btn.day-x', { type: 'button', 'aria-label': 'Close', onclick: close }, '×')),
    h('div.panel-body', list.length ? types.map((t) => h('div.day-group', h('div.sec', { style: { borderLeft: `4px solid ${TYPES[t][2]}`, paddingLeft: '8px' } }, TYPES[t][0]), list.filter((e) => e.type === t).map(item)))
      : h('p.muted', 'Nothing on this day.'))));
  document.body.appendChild(back);
  setTimeout(() => back.querySelector('.day-x').focus(), 0);
}

// The event types as a table with tick boxes (Tim, 2 Nov 2026): colour, name, this month and in total.
function typeTable(all, from, to, rerender) {
  const cnt = (k, inMonth) => all.filter((e) => e.type === k && (!inMonth || (e.d >= from && e.d <= to))).length;
  const allOn = Object.keys(TYPES).every((k) => !ui.off.has(k));
  return h('section.card', { style: { padding: '10px 14px' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' } }, h('h2.cap', { style: { flex: '1 1 auto' } }, 'Show on the calendar'),
      h('button.link-btn', { type: 'button', onclick: () => { if (allOn) Object.keys(TYPES).forEach((k) => ui.off.add(k)); else ui.off.clear(); rerender(); } }, allOn ? ed('Untick all') : ed('Tick all'))),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '2px 18px' } },
      Object.entries(TYPES).map(([k, [label, bg, fg]]) => {
        const id = 'kd-' + k;
        const cb = h('input.cb-plain', { type: 'checkbox', id, checked: !ui.off.has(k) });
        cb.addEventListener('change', () => { cb.checked ? ui.off.delete(k) : ui.off.add(k); rerender(); });
        return h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: '1px solid var(--line-soft)' } }, cb,
          h('span', { style: { width: '12px', height: '12px', borderRadius: '3px', background: bg, border: `1px solid ${fg}`, flex: '0 0 12px' } }),
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
