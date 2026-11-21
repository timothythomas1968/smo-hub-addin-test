// The change request form (P1, Tim 20 Nov 2026): any stakeholder can ask the programme office for a change, at every level.
// One model for every way in: the panel's Request a change screen, the standalone form file (crimport.js), and later the
// Teams tab and web page (P8). A request is a plain object; requestRecord() turns it into a TSA Changes row with status New.
// Nothing here knows where the data lives: it works through the Store, whatever its source.
import { h, ed, fmtDate, asOf, dateBox, isoToSerial, fieldBox, theTeam, parseDate as parseTyped } from './util.js?v=0.12.7.20261121230531';
import { impactOf } from './datechange.js?v=0.12.7.20261121230531';
import { closest } from './importer.js?v=0.12.7.20261121230531';

/** The kinds of change on the form and the request type each becomes. Keep in step with CR_FORM_TYPES in workbook/builder/lists.py. */
export const CR_KINDS = [
  ['Service dates (exit, extension, early exit)', 'Extend'],
  ['Costs and fees', 'Fee change'],
  ['Description and scope', 'Scope change'],
  ['Service levels', 'Service level change'],
  ['Add an omitted service', 'Omitted service'],
  ['Plan dates', 'Plan change'],
  ['Other', 'Other']
];
export const KIND_DATES = CR_KINDS[0][0], KIND_PLAN = CR_KINDS[5][0];
const NEEDS_SERVICE = new Set(['Extend', 'Fee change', 'Scope change', 'Service level change']);
const num = (v) => Number(v) || 0;

/** A date from a cell or typed text (either edition's style, or an Excel serial). '' when empty, null when unreadable. */
export function readDate(v) {
  if (v === '' || v == null) return '';
  if (typeof v === 'number') return v > 20000 && v < 80000 ? Math.floor(v) : null;
  const s = String(v).trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return readDate(Number(s));
  const d = parseTyped(s);
  return d === '' ? '' : d;
}

/** The TSA service a request is about: by TSA ID, or by its name (closest match). */
export function findService(store, text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const all = store.records('tblTSA');
  const byId = all.find((r) => String(r.get('TSA ID')).toUpperCase() === s.toUpperCase());
  if (byId) return byId;
  const lead = /^([A-Z]+-[A-Z]+-\d+)\b/i.exec(s);   // "TSA-FIN-001 General ledger hosting", as the panel lists them
  if (lead) { const r = all.find((x) => String(x.get('TSA ID')).toUpperCase() === lead[1].toUpperCase()); if (r) return r; }
  const name = closest(s, all.map((r) => String(r.get('Service name') || '')).filter(Boolean));
  return name ? all.find((r) => r.get('Service name') === name) : null;
}
export const findPlanItem = (store, id) => (id ? store.records('tblPlan').find((r) => String(r.get('Activity ID')).toUpperCase() === String(id).trim().toUpperCase()) || null : null);

/** What a service's exit date is now: the planned exit date, or the initial end date. */
export const exitOf = (rec) => (rec ? num(rec.get('Planned exit date')) || num(rec.get('Initial end date')) : 0);

/** The request type in TSA Changes. Service dates: Extend, or Early exit when the new date is before the current one. */
export function requestType(kind, fromDate, toDate) {
  const k = CR_KINDS.find(([label, type]) => label === kind || ed(label) === kind || type === kind);
  const t = k ? k[1] : 'Other';
  if (t === 'Extend' && fromDate && toDate && toDate < fromDate) return 'Early exit';
  return t;
}

/** Check a request before it is saved. req: {name, email, kind, service, item, what, from, to, why, impact, via, raised}.
 *  Returns { errors, warnings, type, svc, plan, toDate, fromDate }. */
export function checkRequest(store, req) {
  const n = store.names, errors = [], warnings = [];
  const isDates = requestType(req.kind) === 'Extend', isPlan = requestType(req.kind) === 'Plan change';
  const svc = findService(store, req.service);
  const plan = isPlan ? findPlanItem(store, req.item) : null;
  let fromDate = isDates || isPlan ? readDate(req.from) : '', toDate = isDates || isPlan ? readDate(req.to) : '';
  if (isDates && !fromDate && svc) fromDate = exitOf(svc);
  if (isPlan && !fromDate && plan) fromDate = num(plan.get('Planned finish'));
  const type = requestType(req.kind, fromDate, toDate);
  if (!String(req.name || '').trim()) errors.push('Say who is asking (your name).');
  if (!req.kind) errors.push('Pick the kind of change.');
  if (!String(req.what || '').trim() && !String(req.to || '').trim()) errors.push('Say what should change.');
  if (!String(req.why || '').trim()) errors.push('Say why the change is needed.');
  if (NEEDS_SERVICE.has(requestType(req.kind)) && !svc) errors.push(req.service ? `The service "${req.service}" is not in the TSA register. Pick it from the list, or type its TSA ID.` : 'Pick the service the change is about.');
  if (req.service && !svc && !NEEDS_SERVICE.has(requestType(req.kind))) warnings.push(`The service "${req.service}" was not found in the TSA register; it is kept in the request's wording.`);
  if (isPlan && !plan) errors.push(req.item ? `The plan item "${req.item}" is not in the exit plan.` : 'Pick the plan item whose dates should change.');
  if ((isDates || isPlan) && toDate === null) errors.push(`The new date "${req.to}" can't be read. Type a date such as ${ed(fmtDate(46082))}.`);
  if ((isDates || isPlan) && toDate === '') errors.push('Type the new date.');
  if (isDates && toDate) {
    if (num(n.CloseDate) && toDate < num(n.CloseDate)) errors.push(`The new exit date is before closing (${fmtDate(n.CloseDate)}).`);
    if (num(n.LongStop) && toDate > num(n.LongStop)) warnings.push(`The new exit date is after the long-stop date (${fmtDate(n.LongStop)}): the TSA would need a special approval.`);
    if (fromDate && toDate === fromDate) errors.push('The new exit date is the same as the current one.');
  }
  return { errors, warnings, type, svc, plan, toDate, fromDate };
}

/** The TSA Changes row for a request, status New. Columns an older Hub lacks are folded into the Impact summary. */
export function requestRecord(store, req, chk = checkRequest(store, req)) {
  const has = (hd) => !!(store.t && store.t.tblChange && store.t.tblChange.idx[hd] != null);   // the workbook's own headings: an older Hub lacks the form's columns
  const { type, svc, plan, toDate, fromDate } = chk;
  const dated = type === 'Extend' || type === 'Early exit' || type === 'Plan change';
  const fromTxt = dated && fromDate ? fmtDate(fromDate) : String(req.from ?? '').trim();
  const toTxt = dated && toDate ? fmtDate(toDate) : String(req.to ?? '').trim();
  const what = String(req.what || '').trim() + (req.service && !svc ? ` (service: ${req.service})` : '');
  const subject = plan ? `${plan.get('Activity ID')} ${plan.get('Activity')}` : svc ? svc.get('Service name') : what.slice(0, 60);
  const row = {
    'Request type': type, 'TSA ID': svc ? svc.get('TSA ID') : plan ? plan.get('TSA ID') || '' : '', Title: `${type}: ${subject}`.slice(0, 120),
    'Raised on': req.raised || asOf(store.names), Status: 'New'
  };
  if (plan) row['Item ID'] = plan.get('Activity ID');
  if ((type === 'Extend' || type === 'Early exit') && toDate) row['Proposed exit date'] = toDate;
  const form = [['Requested by', String(req.name || '').trim()], ['Requester email', String(req.email || '').trim()], ['What should change', what],
    ['Change from', fromTxt], ['Change to', toTxt], ['Reason for the change', String(req.why || '').trim()], ["Impact (requester's view)", String(req.impact || '').trim()],
    ['Received through', req.via || 'Panel']];
  const folded = [];
  form.forEach(([hd, v]) => { if (!v) return; if (has(hd)) row[hd] = v; else folded.push(`${hd}: ${v}.`); });
  if (folded.length) row['Impact summary'] = folded.join(' ');   // a Hub from before the change request form
  return row;
}

/** Save a request into TSA Changes as New. Returns the new row's index. */
export async function saveRequest(store, req) {
  await store.need(['tblChange', 'tblTSA', 'tblPlan']);
  const chk = checkRequest(store, req);
  if (chk.errors.length) throw new Error(chk.errors.join(' '));
  return store.add('tblChange', requestRecord(store, req, chk));
}

/** The form itself (the panel screen; the Teams tab and web page reuse it). opts: {service, item, onSubmit(req)}. Returns {el, collect}. */
export function requestForm(store, opts = {}) {
  const tsa = store.records('tblTSA').filter((r) => r.get('Service name'));
  const planAll = store.has('tblPlan') ? store.records('tblPlan').filter((r) => r.get('Activity')) : [];
  const name = h('input', { type: 'text', autocomplete: 'name', value: opts.name || '' });
  const email = h('input', { type: 'email', autocomplete: 'email', value: opts.email || '' });
  const kind = h('select', h('option', { value: '' }, 'Pick one'), CR_KINDS.filter(([, t]) => t !== 'Plan change' || planAll.length).map(([label]) => h('option', { value: label }, ed(label))));
  if (opts.kind) kind.value = opts.kind;
  const service = h('select', h('option', { value: '' }, 'Not about one service'), tsa.map((r) => h('option', { value: r.get('TSA ID') }, `${r.get('TSA ID')} ${r.get('Service name')}`)));
  if (opts.service) service.value = opts.service;
  const item = h('select');
  const fillItems = () => {
    const list = planAll.filter((r) => !service.value || r.get('TSA ID') === service.value);
    const keep = item.value || opts.item || '';
    item.replaceChildren(h('option', { value: '' }, list.length ? 'Pick the plan item' : 'No plan items for this service'),
      ...list.map((r) => h('option', { value: r.get('Activity ID') }, `${r.get('Activity ID')} ${r.get('Activity')}`)));
    if (list.some((r) => r.get('Activity ID') === keep)) item.value = keep;
  };
  if (opts.item) { const p = findPlanItem(store, opts.item); if (p && p.get('TSA ID') && !opts.service) service.value = p.get('TSA ID'); }
  fillItems();
  const what = h('textarea', { rows: 3, placeholder: 'For example: extend the service by three months, or lower the monthly fee once the ledger moves.' });
  const fromTxt = h('input', { type: 'text', placeholder: 'What it is now' });
  const toTxt = h('input', { type: 'text', placeholder: 'What you are asking for' });
  const fromDate = h('div.small', { style: { padding: '6px 0' } });
  const toDate = dateBox('', { 'aria-label': 'New date' });
  const why = h('textarea', { rows: 3, placeholder: 'Why the change is needed' });
  const impact = h('textarea', { rows: 2, placeholder: 'Cost, risk, other services or teams affected, if you know' });
  const live = h('div.banner.info', { style: { margin: 0 } });   // what the request will be recorded as, as you type
  const fServiceEl = fieldBox('Which service?', service), fItemEl = fieldBox('Which plan item?', item);
  const fFrom = fieldBox('From (what it is now)', fromTxt), fTo = fieldBox('To (what you are asking for)', toTxt);
  const fFromD = fieldBox('Date now', fromDate), fToD = fieldBox('New date', toDate);

  const collect = () => {
    const k = kind.value, dated = k === KIND_DATES || k === KIND_PLAN;
    return { name: name.value, email: email.value, kind: k, service: service.value, item: k === KIND_PLAN ? item.value : '',
      what: what.value, from: dated ? '' : fromTxt.value, to: dated ? isoToSerial(toDate.value) || '' : toTxt.value,
      why: why.value, impact: impact.value, via: opts.via || 'Panel', raised: asOf(store.names) };
  };
  // Live: which fields show, and what the request will be recorded as (Tim's rule: worked-out values update as you type)
  const update = () => {
    const k = kind.value, dated = k === KIND_DATES || k === KIND_PLAN;
    fItemEl.style.display = k === KIND_PLAN ? '' : 'none';
    fFrom.style.display = fTo.style.display = dated || !k ? 'none' : '';
    fFromD.style.display = fToD.style.display = dated ? '' : 'none';
    if (k === KIND_PLAN) fillItems();
    const req = collect(), chk = checkRequest(store, req);
    const svc = chk.svc, plan = chk.plan;
    fromDate.textContent = k === KIND_DATES ? (svc ? `${fmtDate(exitOf(svc))} (planned exit)` : 'Pick the service') : k === KIND_PLAN ? (plan ? `${fmtDate(plan.get('Planned finish'))} (planned finish)` : 'Pick the plan item') : '';
    const lines = [];
    if (k) lines.push(h('div', h('b', 'Recorded as: '), `${chk.type}${svc ? ` for ${svc.get('TSA ID')}` : ''}${plan ? `, plan item ${plan.get('Activity ID')}` : ''}, status New. ${ed(`${theTeamText()} reviews it before it goes to a forum.`)}`));
    if (k === KIND_DATES && svc && chk.toDate) impactOf(store, svc, chk.fromDate, chk.toDate).lines.forEach((l) => lines.push(h('div.small', l)));
    if (k === KIND_PLAN && plan && chk.toDate) lines.push(h('div.small', `${plan.get('Activity')}: ${fmtDate(chk.fromDate)} → ${fmtDate(chk.toDate)}. ${ed('The programme office checks the knock-on against the plan change rules when it reviews the request.')}`));
    if (chk.toDate) chk.errors.filter((e) => /date/.test(e)).forEach((e) => lines.push(h('div.small', { style: { color: 'var(--r-fg)', fontWeight: 600 } }, e)));
    chk.warnings.forEach((w) => lines.push(h('div.small', { style: { color: 'var(--a-fg)' } }, w)));
    live.replaceChildren(...(lines.length ? lines : [h('div', 'Pick the kind of change to start.')]));
    live.style.display = '';
  };
  [kind, service, item, toDate, what, why, fromTxt, toTxt, name].forEach((el) => { el.addEventListener('input', update); el.addEventListener('change', update); });
  const el = h('div.cr-form', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('div.cr-row', fieldBox('Your name', name), fieldBox('Your email', email)),
    h('div.cr-row', fieldBox('What kind of change?', kind), fServiceEl),
    fItemEl,
    fieldBox('What should change?', what),
    h('div.cr-row', fFrom, fTo, fFromD, fToD),
    fieldBox('Why?', why),
    fieldBox('Impact, if you know it', impact),
    live);
  update();
  return { el, collect, refresh: update };
}

// "The programme office", or the team's own name (theTeam() in util.js, from the workbook)
const theTeamText = () => { const t = theTeam(); return t.charAt(0).toUpperCase() + t.slice(1); };

/** A short summary of a saved request, for the review and the import preview. */
export function requestLines(rec) {
  const g = (hd) => String(rec.get ? rec.get(hd) ?? '' : rec[hd] ?? '').trim();
  return [
    g('Requested by') ? `Asked by ${g('Requested by')}${g('Requester email') ? ` (${g('Requester email')})` : ''}${g('Received through') ? `, through the ${g('Received through').toLowerCase()}` : ''}.` : null,
    g('What should change') ? `What: ${g('What should change')}` : null,
    g('Change from') || g('Change to') ? `From ${g('Change from') || '–'} to ${g('Change to') || '–'}.` : null,
    g('Reason for the change') ? `Why: ${g('Reason for the change')}` : null,
    g("Impact (requester's view)") ? `Impact, as they see it: ${g("Impact (requester's view)")}` : null
  ].filter(Boolean);
}
