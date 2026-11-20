// Import a plan (Tim, 17 Nov 2026; brief 4.7): the exit plan, the Day 1 plan or the First 100 days, from the programme
// office's own Excel or .csv file. One import, three targets, through the general import wizard (importer.js).
import { fmtDate, ed, plural, isUS } from './util.js?v=0.12.0.20261120045426';
import { importWizard, parseDate, closest } from './importer.js?v=0.12.0.20261120045426';
import { planNodes, loops } from './planimpact.js?v=0.12.0.20261120045426';

const F = (key, label, syn, extra = {}) => ({ key, label, syn, ...extra });
const FIELDS = [
  F('id', 'ID', /^(id|ref|reference|task id|activity id|wbs|no|number|#)$/, { help: 'Your own reference; predecessors refer to it.' }),
  F('name', 'Name', /^(name|task|task name|activity|activity name|description|milestone|title|item)$/, { required: true }),
  F('ws', 'Workstream', /(workstream|stream|function|team|area)/),
  F('owner', 'Owner', /(owner|responsible|assigned|resource|lead|who)/),
  F('start', 'Start', /^(start|start date|planned start|begin|from)$/),
  F('finish', 'Finish', /^(finish|finish date|end|end date|planned finish|due|due date|date|deadline|to)$/, { required: true }),
  F('ms', 'Milestone (Y/N)', /(milestone|type|gate)/),
  F('preds', 'Predecessors', /(predecessor|depends|dependency|after)/, { help: 'IDs separated by commas or semicolons; "12FS" and "12FS+2d" are read as 12.' }),
  F('status', 'Status', /^(status|state|progress status)$/),
  F('pct', '% complete', /(% complete|percent|complete|progress)/),
  F('notes', 'Notes', /(notes|comments|remarks)/)
];

const TARGET = {
  plan: { t: 'tblPlan', title: 'Import an exit plan', live: 'Activity', id: 'Activity ID', noun: 'activity', many: 'activities',
    template: 'TransitionSuite exit plan template.csv' },
  day1: { t: 'tblDay1', title: 'Import a Day 1 plan', live: 'Task', id: 'D1 ID', noun: 'task', many: 'tasks', template: 'TransitionSuite Day 1 plan template.csv' },
  f100: { t: 'tblFirst100', title: 'Import a First 100 days plan', live: 'Task', id: 'ID', noun: 'task', many: 'tasks', template: 'TransitionSuite First 100 days template.csv' }
};
export const PLAN_PROMPT = 'Your plan is in Word, PDF or MS Project? From MS Project, use File › Save As › Excel workbook, then import that. ' +
  'From Word or PDF, give the document to your AI assistant with this prompt (also on the AI Prompts sheet):\n\n' +
  '"From the attached plan, make a table with one row per task or milestone and these columns: ID, Name, Workstream, Owner, Start, Finish, ' +
  'Milestone (Y/N), Predecessors (IDs, separated by commas), Status, % complete, Notes. Use dates like 2026-03-01. Leave a cell empty if the plan ' +
  'does not say. Do not invent tasks, owners or dates. Give the table as CSV."\n\nSave the answer as a .csv file and import it here.';

const done = (s) => /^(complete|completed|done|closed|finished|100%?)$/i.test(String(s || '').trim());
const started = (s) => /^(in progress|started|ongoing|on track|at risk|late|amber|red|green)$/i.test(String(s || '').trim());

export function openPlanImport(ctx, target) {
  const { store } = ctx;
  const T = TARGET[target], n = store.names, close = Number(n.CloseDate) || 0, long = Number(n.LongStop) || 0;
  const wsCodes = (n.WS_Code || []).map(String).filter(Boolean), wsNames = (n.WS_Name || []).map(String);
  const wsOf = (v) => { const s = String(v || '').trim(); if (!s) return ''; if (wsCodes.includes(s.toUpperCase())) return s.toUpperCase(); const i = wsNames.findIndex((x) => x.toLowerCase() === s.toLowerCase()); return i >= 0 ? wsCodes[i] : null; };
  const people = (n.L_People || []).map(String).filter(Boolean);
  const existing = store.records(T.t);
  const hubIds = new Set(existing.map((r) => String(r.get(T.id))).filter(Boolean));

  const analyse = (rows, map, choices) => {
    const get = (r, k) => (map[k] >= 0 ? r[map[k]] : '');
    const errors = [], warnings = [], items = [];
    const ids = new Map();
    rows.forEach((r, k) => {
      const line = `Row ${k + 2}`;
      const name = String(get(r, 'name') ?? '').trim();
      if (!name) { if (r.some((v) => v !== '')) warnings.push(`${line}: no name, skipped.`); return; }
      const it = { line, name, src: String(get(r, 'id') ?? '').trim(), wsRaw: String(get(r, 'ws') ?? '').trim(), ownerRaw: String(get(r, 'owner') ?? '').trim(),
        notes: String(get(r, 'notes') ?? '').trim(), status: String(get(r, 'status') ?? '').trim() };
      for (const k of ['start', 'finish']) {
        const raw = get(r, k);
        it[k] = parseDate(raw);
        if (raw !== '' && raw != null && it[k] == null) errors.push(`${line} (${name}): the ${k} date "${raw}" can't be read. Use a date such as ${ed('1 Mar 2026')} or 2026-03-01.`);
      }
      if (!it.finish && it.start) it.finish = it.start;
      if (!it.finish) errors.push(`${line} (${name}): no finish date.`);
      if (it.start && it.finish && it.finish < it.start) errors.push(`${line} (${name}): it finishes before it starts.`);
      if (!it.start) it.start = it.finish;
      const msv = String(get(r, 'ms') ?? '').trim();
      it.ms = /^(y|yes|true|1|milestone|gate)$/i.test(msv);
      const pv = get(r, 'pct');
      const pn = typeof pv === 'number' ? pv : Number(String(pv ?? '').replace('%', '').trim());
      it.pct = pv === '' || pv == null || Number.isNaN(pn) ? null : (pn > 1 || String(pv).includes('%') ? pn / 100 : pn);
      if (done(it.status)) it.pct = 1;
      it.predsRaw = String(get(r, 'preds') ?? '').split(/[,;]+/).map((x) => x.trim().replace(/(FS|SS|FF|SF)([+-]\d+\s*\w*)?$/i, '').trim()).filter(Boolean);
      if (it.src) { if (ids.has(it.src)) errors.push(`${line} (${name}): the ID "${it.src}" is used twice (also ${ids.get(it.src)}).`); else ids.set(it.src, line); }
      if (close && it.finish && it.finish < close && target !== 'day1') warnings.push(`${line} (${name}): finishes before closing (${fmtDate(close)}).`);
      if (long && it.finish && it.finish > long) warnings.push(`${line} (${name}): finishes after the long-stop date (${fmtDate(long)}).`);
      if (target === 'day1' && close && it.finish > close) warnings.push(`${line} (${name}): due after closing (${fmtDate(close)}).`);
      items.push(it);
    });
    // predecessors: in this file, or already in the Hub; and no loops
    if (target === 'plan') {
      items.forEach((it) => it.predsRaw.forEach((p) => { if (!ids.has(p) && !hubIds.has(p)) errors.push(`${it.line} (${it.name}): predecessor "${p}" is not in the file or the Hub.`); }));
      items.forEach((it) => { if (it.predsRaw.length > 2) warnings.push(`${it.line} (${it.name}): ${it.predsRaw.length} predecessors; the Hub keeps the first two.`); });
      const seenIds = new Set();
      const recs = items.filter((x) => x.src && !seenIds.has(x.src) && seenIds.add(x.src)).map((x) => ({ get: (hd) => ({ 'Activity ID': x.src, Activity: x.name, 'Predecessor 1': x.predsRaw[0] || '', 'Predecessor 2': x.predsRaw[1] || '' }[hd] ?? '') }));
      const bad = loops(planNodes(recs));
      if (bad.length) errors.push(`The predecessors go round in a loop: ${bad.join(', ')}.`);
    }
    // workstreams and owners the Hub doesn't know: match them, or add them
    const wsUnknown = [...new Set(items.map((x) => x.wsRaw).filter((v) => v && wsOf(v) == null))];
    const ownUnknown = [...new Set(items.map((x) => x.ownerRaw).filter((v) => v && !people.includes(v)))];
    items.forEach((x) => {
      x.ws = x.wsRaw ? (wsOf(x.wsRaw) ?? (choices[`ws:${x.wsRaw}`] ?? suggestWs(x.wsRaw))) : '';
      x.owner = x.ownerRaw ? (people.includes(x.ownerRaw) ? x.ownerRaw : (choices[`owner:${x.ownerRaw}`] ?? closest(x.ownerRaw, people))) : '';
    });
    return { items, errors, warnings, lists: [
      wsUnknown.length ? { key: 'ws', title: 'Workstreams the Hub doesn\'t know', values: wsUnknown, options: wsCodes, suggest: suggestWs, add: '+ Add as a new workstream', label: (c) => `${c} ${wsNames[wsCodes.indexOf(c)] || ''}` } : null,
      ownUnknown.length ? { key: 'owner', title: 'Owners not on the People register', values: ownUnknown, options: people, suggest: (v) => closest(v, people), add: '+ Add to People (role: Subject-matter expert)' } : null
    ].filter(Boolean) };
  };
  const suggestWs = (v) => { const c = closest(v, [...wsCodes, ...wsNames]); return !c ? '+add' : wsCodes.includes(c) ? c : wsCodes[wsNames.indexOf(c)] || '+add'; };

  const clearable = () => existing.filter((r) => {
    if (target === 'plan') return r.get('Type') !== 'TSA exit' && r.sugg('Activity') && !(Number(r.get('% complete')) > 0) && !Number(r.get('Actual finish'));
    return !/^(Complete|Not required)$/.test(String(r.get('Status')));
  });
  const summary = (items, mode) => {
    const upd = mode === 'update' ? items.filter((x) => x.src && hubIds.has(x.src)).length : 0;
    const add = mode === 'update' ? items.length - upd : items.length;
    const out = [];
    if (mode === 'replace') out.push(`${plural(clearable().length, target === 'plan' ? 'suggested template activity' : 'open task', target === 'plan' ? 'suggested template activities' : 'open tasks')} cleared (TSA exit rows and finished work stay).`);
    if (upd) out.push(`${plural(upd, T.noun, T.many)} updated (their IDs match).`);
    out.push(`${plural(add, T.noun, T.many)} added.`);
    const adds = items.filter((x) => x.ws === '+add').map((x) => x.wsRaw), addsP = items.filter((x) => x.owner === '+add').map((x) => x.ownerRaw);
    if (adds.length) out.push(`New workstreams: ${[...new Set(adds)].join(', ')}.`);
    if (addsP.length) out.push(`New people on the register: ${[...new Set(addsP)].join(', ')}.`);
    return out;
  };

  const write = async (items, mode) => {
    await store.need([T.t, 'tblWorkstreams', 'tblPeople']).catch(() => {});
    // new workstreams and people first
    for (const raw of [...new Set(items.filter((x) => x.ws === '+add').map((x) => x.wsRaw))]) {
      let code = raw.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'NEW';
      for (let k = 2; (store.names.WS_Code || []).map(String).includes(code); k++) code = code.slice(0, 2) + k;
      const i = await store.add('tblWorkstreams', { Code: code, Name: raw });
      await store.writeNameItem('WS_Active', i, 'Y').catch(() => {});
      items.filter((x) => x.wsRaw === raw).forEach((x) => { x.ws = code; });
    }
    for (const raw of [...new Set(items.filter((x) => x.owner === '+add').map((x) => x.ownerRaw))]) {
      await store.add('tblPeople', { Name: raw, Role: 'Subject-matter expert' });
      items.filter((x) => x.ownerRaw === raw).forEach((x) => { x.owner = raw; });
    }
    const t = store.t[T.t];
    if (mode === 'replace') await store.saveMany(T.t, clearable().map((r) => ({ i: r.i, changes: target === 'plan' ? { Activity: '' } : Object.fromEntries(t.headers.filter((hd) => !r.sugg(hd) && (t.cols[hd] || {}).t !== 'C' && r.get(hd) !== '').map((hd) => [hd, ''])) })));
    const fresh = store.records(T.t);
    const byId = new Map(fresh.map((r) => [String(r.get(T.id)), r]));
    const liveCol = t.idx[T.live];
    const free = t.rows.filter((r) => r.v[liveCol] === '' || r.v[liveCol] == null).map((r) => r.i);
    // where each item goes, and (for the exit plan) its Hub ID, so predecessors can point at it
    const plan = items.map((x) => {
      const hit = mode === 'update' && x.src ? byId.get(x.src) : null;
      const row = hit ? hit.i : free.shift();
      if (row == null) throw new Error(`The ${T.title.replace('Import a', '').replace('Import an', '').trim()} sheet is full: no empty rows left.`);
      const hubId = hit ? String(hit.get(T.id)) : target === 'plan' ? `SP-${x.ws && x.ws !== '+add' ? x.ws : 'PRG'}-${String(row + 1).padStart(4, '0')}` : '';
      return { x, row, hubId, isNew: !hit };
    });
    const idMap = new Map(plan.filter((p) => p.x.src).map((p) => [p.x.src, p.hubId]));
    const cl = close;
    const list = plan.map(({ x, row, isNew }) => {
      let ch;
      if (target === 'plan') {
        const preds = x.predsRaw.map((p) => idMap.get(p) || p);
        ch = { Activity: x.name, Type: x.ms ? 'Milestone' : 'Task', Workstream: x.ws, Owner: x.owner, 'TSA ID': isNew ? '' : undefined,
          'Baseline start': isNew ? x.start : undefined, 'Baseline finish': isNew ? x.finish : undefined, 'Planned start': x.start, 'Planned finish': x.finish,
          '% complete': x.pct == null ? undefined : x.pct, 'Actual finish': x.pct === 1 ? x.finish : undefined,
          'Predecessor 1': preds[0] || '', 'Predecessor 2': preds[1] || '', Comments: x.notes || undefined };
      } else {
        const st = done(x.status) ? 'Complete' : started(x.status) ? 'In progress' : x.status ? 'Not started' : undefined;
        ch = { Task: x.name, Workstream: x.ws, Owner: x.owner || undefined, Notes: x.notes || undefined, Status: st,
          [target === 'day1' ? 'Days from Day 1' : 'Due on day']: cl && x.finish ? x.finish - cl : undefined };
      }
      Object.keys(ch).forEach((k) => { if (ch[k] === undefined || (isNew && ch[k] === '' && k !== 'TSA ID')) delete ch[k]; });
      return { i: row, changes: ch };
    });
    // new rows go in as new (unhidden); matched rows as updates
    const news = list.filter((_, k) => plan[k].isNew), upds = list.filter((_, k) => !plan[k].isNew);
    if (upds.length) await store.saveMany(T.t, upds);
    for (const r of news) await store.save(T.t, r.i, r.changes, { unhide: true, force: true });
    return `Imported ${plural(items.length, T.noun, T.many)}${mode === 'replace' ? ', in place of the template' : ''}. ${upds.length ? `${upds.length} updated, ` : ''}${news.length} added.`;
  };

  importWizard(ctx, {
    title: T.title,
    intro: `Pick your ${target === 'plan' ? 'exit plan' : target === 'day1' ? 'Day 1 plan' : 'First 100 days plan'} as an Excel (.xlsx) or .csv file. You'll check the columns and see any problems before anything is written. Dates can be written as ${isUS() ? 'Mar 1, 2026 or 3/1/2026 (month first)' : '1 Mar 2026 or 1/3/2026 (day first)'}, or as 2026-03-01.`,
    fields: target === 'plan' ? FIELDS : FIELDS.filter((f) => !['preds', 'ms', 'pct'].includes(f.key)),
    template: { name: T.template, rows: [FIELDS.filter((f) => target === 'plan' || !['preds', 'ms', 'pct'].includes(f.key)).map((f) => f.label),
      ...(target === 'plan' ? [['1', 'Agree the data migration approach', 'TEC', '', '2026-04-01', '2026-04-30', 'N', '', 'Not started', '', ''], ['2', 'Data migration approach agreed', 'TEC', '', '2026-04-30', '2026-04-30', 'Y', '1', '', '', '']]
        : [['1', 'Confirm the Day 1 communications', 'PRG', '', '2026-02-01', '2026-02-20', 'Not started', '']]).map((r) => (target === 'plan' ? r : [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7]]))] },
    prompt: PLAN_PROMPT,
    modes: [
      ['replace', target === 'plan' ? 'Replace the template plan' : 'Replace the open tasks', target === 'plan' ? 'The suggested steps the Hub made for each service are cleared (TSA exit rows and anything started stay), then your plan goes in.' : 'Open tasks are cleared (finished ones stay), then your plan goes in.'],
      ['add', 'Add to it', `Your ${T.many} go in below what is there now.`],
      ['update', 'Update the ones whose IDs match', `Rows whose ID matches an ${T.noun} in the Hub (for example ${target === 'plan' ? 'SP-FIN-0012' : 'a re-import of a file exported from the Hub'}) are updated; the rest are added.`]
    ],
    analyse, summary, write
  });
}
