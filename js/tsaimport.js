// Import the TSA schedule (brief 2026-11-05-import-tsa-schedule.md; build waves P4): the seller's schedule (.xlsx or .csv)
// into the TSA register, with column matching (saved for the next version), matching to the service library, checks before
// writing, and re-import of a new version: new services added, changes applied and logged in TSA Changes, services no longer
// in the schedule marked for review (never deleted). Read on this computer only (xlsxread.js); nothing is uploaded.
//
// Dates: the import writes Service start and Initial term (worked out from the seller's terminate date when only that is
// given). It doesn't overwrite Planned exit date: that column follows approved change requests, so the contract end comes
// from the start and the term, and any row where the Hub's end date differs from the seller's is flagged.
import { ed, plural, isUS, fmtDate, fmtMoney, asOf } from './util.js?v=0.12.6.20261120074927';
import { importWizard, parseDate, closest } from './importer.js?v=0.12.6.20261120074927';

const F = (key, label, syn, extra = {}) => ({ key, label, syn, ...extra });
export const TSA_FIELDS = [
  F('ref', 'Service ID', /(service id|service ref|schedule ref|ref|reference|service no|service number|^id$|^no$)/, { required: true, help: "The seller's own ID. A new version is matched to the register on it." }),
  F('name', 'Service name', /(service name|^service$|^name$|title)/, { required: true }),
  F('desc', 'Description', /(description|detail|scope)/),
  F('ws', 'Workstream', /(workstream|stream|function|tower|area)/),
  F('term', 'Service term', /(term|duration|period of service|months)/, { help: 'For example 12, "12 months", "1 year" or "18m".' }),
  F('end', 'Terminate date', /(terminat|end date|expiry|expires|end$|until|service end)/),
  F('start', 'Commencement date', /(commence|start)/, { help: 'Leave as "Not in my file" to use the closing date.' }),
  F('fee', 'Service fee', /(fee|charge|price|cost)/, { help: 'A currency symbol or code in the cell or the heading is read too.' }),
  F('ccy', 'Fee currency', /(currency|ccy)/),
  F('per', 'Fee period', /(frequency|per |period|basis|billing)/, { help: 'Monthly, quarterly, annual or for the whole term. If your file has no such column, you choose it at the checks step.' }),
  F('prov', 'Service provider', /(provider name|service provider|provided by|provider$|^from$)/),
  F('recip', 'Service recipient', /(recipient name|service recipient|received by|recipient$|^to$)/),
  F('provJ', 'Provider jurisdiction', /(provider (jurisdiction|country|location))/),
  F('recipJ', 'Recipient jurisdiction', /(recipient (jurisdiction|country|location))/),
  F('deps', 'Dependencies', /(dependenc|depends|linked services)/, { help: "The seller's Service IDs; they're turned into our TSA IDs." }),
  F('tp', 'Third-party suppliers', /(third part|vendor|supplier)/, { help: 'One per line or separated by semicolons; each becomes a consent to check.' }),
  F('sla', 'Service levels', /(service level|sla|kpi)/),
  F('notes', 'Comments', /(comment|note|remark)/)
];

export const TSA_PROMPT = 'Your TSA schedule is in Word or PDF? Give the document to your AI assistant (for example Copilot in Word) with this prompt (also on the AI Prompts sheet):\n\n' +
  '"From the attached TSA schedule, make a table with one row per service and these columns: Workstream, Service ID, Service name, Description, ' +
  'Service term (months), Terminate date, Commencement date, Service fee, Fee currency, Fee period (monthly, quarterly, annual or whole term), ' +
  'Service provider, Service recipient, Provider jurisdiction, Recipient jurisdiction, Dependencies (Service IDs, separated by semicolons), ' +
  'Third-party suppliers (separated by semicolons), Service levels. Use dates like 2026-03-01. Leave a cell empty if the schedule does not say. ' +
  'Do not invent services, fees or dates. Give the table as CSV."\n\nSave the answer as a .csv file (or paste it into the template) and import it here.';

const num = (v) => Number(v) || 0;
const SYM = { '£': 'GBP', '€': 'EUR', '$': 'USD', 'US$': 'USD', 'CHF': 'CHF', '¥': 'JPY', 'A$': 'AUD', 'C$': 'CAD' };
/** A fee cell or heading: the amount and any currency code or symbol in it. */
export function readFee(v, heading = '') {
  if (typeof v === 'number') return { amount: v, ccy: ccyIn(heading) };
  const s = String(v ?? '').trim();
  if (!s) return { amount: null, ccy: ccyIn(heading) };
  const m = s.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  let amount = m ? Number(m[0]) : null;
  if (amount != null && /\d\s*k\b/i.test(s)) amount *= 1000;
  if (amount != null && /\d\s*m\b/i.test(s) && !/month/i.test(s)) amount *= 1e6;
  return { amount, ccy: ccyIn(s) || ccyIn(heading) };
}
function ccyIn(s) {
  const t = String(s || '');
  const code = t.match(/\b([A-Z]{3})\b/);
  if (code && !/^(TSA|SLA|KPI|VAT|GST|FTE|ID)$/.test(code[1])) return code[1];
  for (const k of Object.keys(SYM).sort((a, b) => b.length - a.length)) if (t.includes(k)) return SYM[k];
  return '';
}
/** "12", "12 months", "1 year", "18m", "2 yrs" as months, or null. */
export function readTerm(v) {
  if (typeof v === 'number') return v > 0 && v <= 120 ? Math.round(v) : null;
  const s = String(v ?? '').toLowerCase().trim();
  const m = s.match(/(\d+(\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Math.round(/y(ea)?r|yrs?/.test(s) ? n * 12 : /w(ee)?k/.test(s) ? n / 4.345 : n);
}
const PERIOD = { Monthly: 1, Quarterly: 3, Annual: 12, 'Whole term': 0 };
function readPeriod(v) {
  const s = String(v ?? '').toLowerCase();
  if (!s.trim()) return '';
  if (/quarter/.test(s)) return 'Quarterly';
  if (/annual|year|p\.?a\.?/.test(s)) return 'Annual';
  if (/whole|total|term|one.?off|lump/.test(s)) return 'Whole term';
  if (/month|p\.?c\.?m/.test(s)) return 'Monthly';
  return '';
}
const months = (a, b) => { const d1 = new Date((a - 25569) * 864e5), d2 = new Date((b - 25569) * 864e5); return (d2.getUTCFullYear() - d1.getUTCFullYear()) * 12 + d2.getUTCMonth() - d1.getUTCMonth() + (d2.getUTCDate() >= d1.getUTCDate() ? 0 : -1) + 1; };
const addMonths = (a, k) => { const d = new Date((a - 25569) * 864e5); return Math.round(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, d.getUTCDate()) / 864e5) + 25569 - 1; };
const words = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 3));
/** The nearest library service by shared words in the name (counted twice) and description; '' when nothing is close. */
export function libraryMatch(name, desc, lib) {
  const wn = words(name), wd = words(desc);
  let best = '', score = 0;
  lib.forEach((l) => {
    const ln = words(l.name), ld = words(l.desc);
    let s = 0;
    wn.forEach((w) => { if (ln.has(w)) s += 2; else if (ld.has(w)) s += 1; });
    wd.forEach((w) => { if (ln.has(w)) s += 1; });
    const norm = s / Math.max(3, wn.size * 2 + Math.min(wd.size, 6));
    if (norm > score) { score = norm; best = l.id; }
  });
  return score >= 0.34 ? best : '';
}
const splitList = (v) => String(v ?? '').split(/[;\n,]+/).map((x) => x.trim()).filter(Boolean);

export async function openTsaImport(ctx) {
  const { store } = ctx;
  await store.need(['tblTSA', 'tblEntities', 'tblCurrencies', 'tblLibrary', 'tblWorkstreams', 'tblChange', 'tblTPC']).catch(() => {});
  const n = store.names, close = num(n.CloseDate), longStop = num(n.LongStop), today = asOf(n);
  const ours = n.Perspective === 'Seller' ? 'Seller' : 'Buyer';
  const wsCodes = (n.WS_Code || []).map(String).filter(Boolean), wsNames = (n.WS_Name || []).map(String);
  const wsOf = (v) => { const s = String(v || '').trim(); if (!s) return ''; if (wsCodes.includes(s.toUpperCase())) return s.toUpperCase(); const i = wsNames.findIndex((x) => x.toLowerCase() === s.toLowerCase()); return i >= 0 ? wsCodes[i] : closest(s, wsNames) ? wsCodes[wsNames.indexOf(closest(s, wsNames))] : null; };
  const ents = store.has('tblEntities') ? store.records('tblEntities').map((r) => ({ code: String(r.get('Entity code')), name: String(r.get('Legal name')), party: r.get('Party'), country: String(r.get('Country')) })).filter((e) => e.code) : [];
  const entOf = (name, jur) => {
    const s = String(name || '').trim().toLowerCase();
    if (s) { const e = ents.find((x) => x.code.toLowerCase() === s || x.name.toLowerCase() === s) || ents.find((x) => x.name.toLowerCase().includes(s) || s.includes(x.name.toLowerCase())); if (e) return e.code; }
    const j = String(jur || '').trim().toLowerCase();
    if (j) { const inC = ents.filter((x) => x.country.toLowerCase() === j); if (inC.length === 1) return inC[0].code; }
    return s || j ? null : '';
  };
  const ccys = store.has('tblCurrencies') ? store.records('tblCurrencies').map((r) => String(r.get('Code'))).filter(Boolean) : [n.RepCcy].filter(Boolean);
  const lib = store.has('tblLibrary') ? store.records('tblLibrary').map((r) => ({ id: String(r.get('Library ID')), name: r.get('Service'), desc: r.get('Description'), ws: r.get('Workstream') })).filter((l) => l.id) : [];
  const libById = new Map(lib.map((l) => [l.id, l]));
  const tsa = store.records('tblTSA');
  // services already imported: those with a Schedule ref typed in (not the Hub's suggested 2.01(a))
  const byRef = new Map(tsa.filter((r) => r.get('TSA ID') && r.get('Schedule ref') && !r.sugg('Schedule ref')).map((r) => [String(r.get('Schedule ref')).trim(), r]));
  const saved = store.src.getSetting('tsa-import-map') || null;
  let feeHeading = '';

  const analyse = (rows, map, choices) => {
    const get = (r, k) => (map[k] >= 0 ? r[map[k]] : '');
    const errors = [], warnings = [], items = [], refs = new Map();
    rows.forEach((r, k) => {
      const line = `Row ${k + 2}`;
      const name = String(get(r, 'name') ?? '').trim(), ref = String(get(r, 'ref') ?? '').trim();
      if (!name && !ref) return;
      if (!name) { warnings.push(`${line}: no service name, skipped.`); return; }
      if (!ref) { errors.push(`${line} (${name}): no Service ID. Every service needs one, so a new version can be matched to it.`); return; }
      if (refs.has(ref)) errors.push(`${line} (${name}): the Service ID ${ref} is used twice (also ${refs.get(ref)}).`);
      refs.set(ref, line);
      const it = { line, ref, name, desc: String(get(r, 'desc') ?? '').trim(), wsRaw: String(get(r, 'ws') ?? '').trim(), sla: String(get(r, 'sla') ?? '').trim(), notes: String(get(r, 'notes') ?? '').trim(),
        provRaw: String(get(r, 'prov') ?? '').trim(), recipRaw: String(get(r, 'recip') ?? '').trim(), provJ: String(get(r, 'provJ') ?? '').trim(), recipJ: String(get(r, 'recipJ') ?? '').trim(),
        depsRaw: splitList(get(r, 'deps')), vendors: splitList(get(r, 'tp')), hit: byRef.get(ref) || null };
      for (const [key, label] of [['start', 'commencement'], ['end', 'terminate']]) {
        const raw = get(r, key);
        it[key] = parseDate(raw);
        if (raw !== '' && raw != null && it[key] == null) errors.push(`${line} (${name}): the ${label} date "${raw}" can't be read. Use a date such as ${ed('1 Mar 2026')} or 2026-03-01.`);
      }
      it.start = it.start || close || null;
      it.term = readTerm(get(r, 'term'));
      if (get(r, 'term') !== '' && get(r, 'term') != null && !it.term) warnings.push(`${line} (${name}): the term "${get(r, 'term')}" can't be read; worked out from the dates instead.`);
      if (!it.term && it.start && it.end) it.term = months(it.start, it.end);
      if (it.start && it.end && it.end < it.start) errors.push(`${line} (${name}): the terminate date is before the commencement date.`);
      if (it.term && it.start && it.end && addMonths(it.start, it.term) !== it.end) warnings.push(`${line} (${name}): the term (${it.term} months from ${fmtDate(it.start)}) ends on ${fmtDate(addMonths(it.start, it.term))}, but the schedule says ${fmtDate(it.end)}. The Hub uses the term; check which is right.`);
      if (!it.term && !it.end) warnings.push(`${line} (${name}): no term or terminate date; the Hub's default term is used.`);
      const endBy = it.end || (it.start && it.term ? addMonths(it.start, it.term) : 0);
      if (longStop && endBy > longStop) warnings.push(`${line} (${name}): runs to ${fmtDate(endBy)}, past the long-stop date of ${fmtDate(longStop)}.`);
      const fee = readFee(get(r, 'fee'), feeHeading);
      it.feeRaw = get(r, 'fee'); it.ccy = String(get(r, 'ccy') ?? '').trim().toUpperCase() || fee.ccy || '';
      it.per = readPeriod(get(r, 'per'));
      it.amount = fee.amount;
      if (it.amount == null) warnings.push(`${line} (${name}): no fee. It will be flagged in the register's data checks.`);
      if (it.ccy && !ccys.includes(it.ccy)) warnings.push(`${line} (${name}): the currency ${it.ccy} isn't in your currencies list. Add it in the set-up wizard (Contract terms) with its rate, or the fee won't convert.`);
      items.push(it);
    });
    // the choices: workstreams, entities, the fee period, and the match to the service library
    const lists = [];
    const wsVals = [...new Set(items.map((x) => x.wsRaw).filter((v) => v && wsOf(v) == null))];
    if (wsVals.length) lists.push({ key: 'ws', title: 'Workstreams not in your list', values: wsVals, options: wsCodes, add: 'Add as a new workstream', suggest: () => '+add', label: (c) => `${c} · ${wsNames[wsCodes.indexOf(c)] || ''}` });
    const entVals = [...new Set(items.flatMap((x) => [[x.provRaw, x.provJ], [x.recipRaw, x.recipJ]]).filter(([a, b]) => (a || b) && entOf(a, b) == null).map(([a, b]) => a || b))];
    if (entVals.length) lists.push({ key: 'ent', title: 'Providers and recipients: which entity is each one?', values: entVals, options: ents.map((e) => e.code), suggest: () => '', label: (c) => { const e = ents.find((x) => x.code === c); return e ? `${c} · ${e.name} (${e.party})` : c; } });
    if (map.per < 0 || items.some((x) => x.amount != null && !x.per)) lists.push({ key: 'per', title: 'Are the fees in your file monthly?', values: ['Fees without a period'], options: Object.keys(PERIOD), suggest: () => 'Monthly' });
    const libVals = items.filter((x) => !x.hit).map((x) => x.ref);
    if (libVals.length && lib.length) lists.push({ key: 'lib', title: 'Nearest service in the library (it brings suggested risks, readiness questions and exit tasks). "Leave blank" for a custom service.', values: libVals,
      options: lib.map((l) => l.id), suggest: (ref) => { const x = items.find((i) => i.ref === ref); return libraryMatch(x.name, x.desc, lib); }, label: (id) => `${libById.get(id).name} (${id})` });
    // a new version: what changed against the register, and what is no longer in the schedule
    const inFile = new Set(items.map((x) => x.ref));
    items.forEach((x) => {
      if (!x.hit) return;
      const r = x.hit, ch = [];
      const cmp = (label, a, b, fmt = String) => { if (b !== '' && b != null && String(a ?? '') !== String(b)) ch.push({ label, from: a, to: b, text: `${label}: ${a === '' || a == null ? '(blank)' : fmt(a)} → ${fmt(b)}` }); };
      cmp('Service name', r.get('Service name'), x.name);
      if (x.desc) cmp('Service description', r.get('Service description'), x.desc, (v) => (String(v).length > 60 ? String(v).slice(0, 57) + '…' : v));
      if (x.amount != null) cmp('Monthly fee (key input)', num(r.get('Monthly fee (key input)')) || '', Math.round(x.amount * 100) / 100, (v) => fmtMoney(v, ''));
      if (x.term) cmp('Initial term (months)', num(r.get('Initial term (months)')) || '', x.term);
      if (x.sla) cmp('Service levels', r.get('Service levels'), x.sla, (v) => (String(v).length > 60 ? String(v).slice(0, 57) + '…' : v));
      x.changes = ch;
      if (ch.length) warnings.push(`Changed, ${r.get('TSA ID')} (${x.ref}): ${ch.map((c) => c.text).join('; ')}.`);
    });
    const gone = [...byRef.entries()].filter(([ref]) => !inFile.has(ref)).map(([ref, r]) => ({ ref, r }));
    gone.forEach((g) => warnings.push(`Not in this version: ${g.r.get('TSA ID')} ${g.r.get('Service name')} (${g.ref}). It stays in the register and is marked for review.`));
    const out = { items, errors, warnings, lists, gone };
    return out;
  };

  const summary = (items, mode) => {
    const news = items.filter((x) => !x.hit), changed = items.filter((x) => x.hit && x.changes && x.changes.length);
    const a = [`${plural(news.length, 'new service')} will be added to the TSA register.`];
    if (mode === 'update') a.push(changed.length ? `${plural(changed.length, 'service')} will be updated from this version, each change logged in TSA Changes.` : 'No changes to services already in the register.');
    else if (changed.length) a.push(`${plural(changed.length, 'service')} in the register differ from this version; they are left as they are (choose "Add new services and apply the changes" to update them).`);
    const vend = items.filter((x) => !x.hit).reduce((s, x) => s + x.vendors.length, 0);
    if (vend) a.push(`${plural(vend, 'third-party consent')} to check will be added to the Third parties register.`);
    a.push('Nothing you typed in the register is overwritten without being listed here.');
    return a;
  };

  const write = async (items, mode, choices, meta = {}) => {
    await store.need(['tblTSA', 'tblChange', 'tblTPC', 'tblWorkstreams']).catch(() => {});
    if (meta.headers) {   // remember which heading went to which field, for the next version
      const m = {}; Object.entries(meta.map || {}).forEach(([k, i]) => { if (i >= 0) m[k] = meta.headers[i]; });
      await store.src.setSetting('tsa-import-map', m);
    }
    // new workstreams first
    for (const raw of [...new Set(items.filter((x) => x.wsRaw && wsOf(x.wsRaw) == null && (choices[`ws:${x.wsRaw}`] ?? '+add') === '+add').map((x) => x.wsRaw))]) {
      let code = raw.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'NEW';
      for (let k = 2; (store.names.WS_Code || []).map(String).includes(code); k++) code = code.slice(0, 2) + k;
      const i = await store.add('tblWorkstreams', { Code: code, Name: raw });
      await store.writeNameItem('WS_Active', i, 'Y').catch(() => {});
      wsCodes.push(code); wsNames.push(raw);
    }
    const wsFor = (x, libId) => { const w = x.wsRaw ? (wsOf(x.wsRaw) || choices[`ws:${x.wsRaw}`] || '') : ''; return w && w !== '+add' ? w : (libId && libById.get(libId) ? libById.get(libId).ws : 'PRG'); };
    const ent = (raw, jur) => { const e = entOf(raw, jur); return e != null ? e : (choices[`ent:${raw || jur}`] || ''); };
    const period = (x) => x.per || choices['per:Fees without a period'] || 'Monthly';
    const monthly = (x) => { if (x.amount == null) return null; const p = period(x); return p === 'Whole term' ? (x.term ? x.amount / x.term : x.amount) : x.amount / PERIOD[p]; };
    // the next free TSA ID for each prefix and workstream
    const used = new Set(store.records('tblTSA').map((r) => String(r.get('TSA ID'))).filter(Boolean));
    const nextId = (pre, ws) => { for (let k = 1; k < 1000; k++) { const id = `${pre}-${ws}-${String(k).padStart(3, '0')}`; if (!used.has(id)) { used.add(id); return id; } } return ''; };
    const idOf = new Map([...byRef.entries()].map(([ref, r]) => [ref, String(r.get('TSA ID'))]));
    const news = items.filter((x) => !x.hit);
    let added = 0, updated = 0, logged = 0, vendors = 0;
    for (const x of news) {
      const libId = choices[`lib:${x.ref}`] ?? libraryMatch(x.name, x.desc, lib);
      const prov = ent(x.provRaw, x.provJ), recip = ent(x.recipRaw, x.recipJ);
      const provParty = (ents.find((e) => e.code === prov) || {}).party;
      const pre = provParty && provParty === ours ? 'rTSA' : 'TSA';
      const ws = wsFor(x, libId), id = nextId(pre, ws);
      idOf.set(x.ref, id);
      const fee = monthly(x);
      const notes = [x.notes, x.provJ && !prov ? `Provider jurisdiction: ${x.provJ}` : '', x.recipJ && !recip ? `Recipient jurisdiction: ${x.recipJ}` : '',
        period(x) !== 'Monthly' && x.amount != null ? `Fee in the schedule: ${x.feeRaw} ${period(x).toLowerCase()}` : '',
        x.end && x.term && x.start && addMonths(x.start, x.term) !== x.end ? `The schedule's terminate date is ${fmtDate(x.end)}` : ''].filter(Boolean).join('. ');
      const ch = { 'TSA ID': id, 'Library ID': libId || '', 'Service name': x.name, 'Schedule ref': x.ref };
      if (x.desc || !libId) ch['Service description'] = x.desc;
      if (prov) ch['Provider entity'] = prov;
      if (recip) ch['Recipient entity'] = recip;
      if (x.start) ch['Service start'] = x.start;
      if (x.term) ch['Initial term (months)'] = x.term;
      if (fee != null) ch['Monthly fee (key input)'] = Math.round(fee * 100) / 100;
      if (x.ccy) ch['Fee currency'] = x.ccy;
      if (x.sla) ch['Service levels'] = x.sla;
      if (notes) ch.Comments = notes;
      x.row = await store.add('tblTSA', ch); added++;
      if (mode === 'update' && byRef.size) { await store.add('tblChange', { 'Request type': 'Add', 'TSA ID': id, Title: `Added from the schedule${meta.file ? ` (${meta.file})` : ''}: ${x.name}`, 'Raised on': today, 'Impact summary': `New service in this version of the schedule (${x.ref}).`, Status: 'Implemented', Decision: 'Taken from the seller\'s schedule', 'Decision date': today }); logged++; }
      for (const v of x.vendors) { await store.add('tblTPC', { Vendor: v, 'TSA ID': id, 'Action needed': 'Check whether consent is needed' }); vendors++; }
    }
    // dependencies: the seller's Service IDs into our TSA IDs
    for (const x of news) if (x.depsRaw.length) await store.save('tblTSA', x.row, { 'Dependent services': x.depsRaw.map((d) => idOf.get(d) || d).join('; ') });
    // a new version: apply the changes (when chosen) and log each one
    if (mode === 'update') {
      for (const x of items.filter((i) => i.hit && i.changes && i.changes.length)) {
        const r = x.hit, ch = Object.fromEntries(x.changes.map((c) => [c.label, c.to]));
        await store.save('tblTSA', r.i, ch, { force: true }); updated++;
        for (const c of x.changes) {
          await store.add('tblChange', { 'Request type': 'Change', 'TSA ID': String(r.get('TSA ID')), Title: `Schedule${meta.file ? ` ${meta.file}` : ''}: ${c.label.replace(' (key input)', '').toLowerCase()} changed`, 'Raised on': today,
            'Impact summary': c.text, Status: 'Implemented', Decision: 'Taken from the seller\'s schedule', 'Decision date': today }); logged++;
        }
      }
      const a = (meta.analysis && meta.analysis.gone) || [];
      for (const g of a) { const c = String(g.r.get('Comments') || ''); if (!/not in the schedule/i.test(c)) await store.save('tblTSA', g.r.i, { Comments: `${c ? c + '. ' : ''}Review: not in the schedule${meta.file ? ` ${meta.file}` : ''} (${fmtDate(today)})` }); }
    }
    return `Imported: ${plural(added, 'new service')}${updated ? `, ${plural(updated, 'service')} updated` : ''}${logged ? `, ${plural(logged, 'entry', 'entries')} in TSA Changes` : ''}${vendors ? `, ${plural(vendors, 'third-party consent')} to check` : ''}. Open the TSA register to check the fees and dates marked for attention.`;
  };

  const tplHead = TSA_FIELDS.map((f) => f.label);
  importWizard(ctx, {
    title: 'Import the TSA schedule',
    intro: `Pick the seller's TSA schedule as an Excel (.xlsx) or .csv file. You'll check the columns, the match to the service library and any problems before anything is written. For a new version of a schedule you've imported before, the changes are listed and logged. Dates can be written as ${isUS() ? 'Mar 1, 2026 or 3/1/2026 (month first)' : '1 Mar 2026 or 1/3/2026 (day first)'}, or as 2026-03-01.`,
    fields: TSA_FIELDS,
    saved,
    onHeaders: (hd, map) => { feeHeading = map.fee >= 0 ? hd[map.fee] : ''; },
    template: { name: `TransitionSuite TSA schedule template (${isUS() ? 'US' : 'UK'}).csv`, rows: [tplHead,
      ['FIN', 'FIN-01', 'General ledger processing', 'Run the general ledger, month-end close and management accounts for the transferred business.', '12', '2027-02-28', '2026-03-01', '18500', 'GBP', 'Monthly', 'Fernhallow Mutual Assurance Ltd', 'Quillmere Life Ltd', 'UK', 'UK', '', 'Ledger software vendor', 'Month-end close within 8 working days', '']] },
    prompt: TSA_PROMPT,
    promptLabel: 'Schedule in Word or PDF?',
    modes: byRef.size ? [
      ['update', 'Add new services and apply the changes', 'New services are added. For services already in the register (matched on Service ID), the changes listed at the checks step are applied and each one is logged in TSA Changes. Services no longer in the schedule are marked for review, never deleted.'],
      ['add', 'Add new services only', 'New services are added; services already in the register are left exactly as they are.']
    ] : [['add', 'Add the services to the TSA register', 'Each service goes into the first empty row of the register, with a TSA ID worked out from its workstream and who provides it.']],
    analyse, summary, write
  });
}
