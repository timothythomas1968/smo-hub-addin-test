// Set-up wizard: the Start Here questions, the people in each role, the services marked in the Library,
// and the letterhead, in five steps. Every answer is written straight to the workbook cell the sheets use.
import { h, fmtDate, toast, isoToSerial, serialToIso, plural, ed, isUS, fieldBox, dateBox, team, fromSerial } from '../util.js?v=0.10.2.20261111182242';
import { buildForm, personLabel } from '../form.js?v=0.10.2.20261111182242';

const STEPS = [
  ['deal', 'The deal', ['About the programme', 'Key dates', 'Money']],
  ['terms', 'Contract terms', ["The TSA's terms", 'Extension fee mark-ups', 'Invoices and payment', 'Readiness and service levels']],
  ['workstreams', 'Workstreams', null], ['people', 'People', null], ['services', 'Services', null], ['review', 'Letterhead and review', null]
];
const ui = { step: 0, qs: null, vals: null, edits: {}, libQ: '', libWs: '', libOnly: false, peopleEdit: null };

export default {
  tables: ['tblPeople', 'tblLibrary', 'tblWorkstreams', 'tblCurrencies'],
  render(ctx) {
    const page = h('div.page', h('div.loading', h('div.spinner'), 'Reading the set-up answers…'));
    load(ctx, page);
    return page;
  }
};

async function load(ctx, page) {
  const { store } = ctx;
  try {
    if (!ui.qs) {
      const qs = await (await fetch(new URL('../../data/questions.json', import.meta.url))).json();
      // US edition: the questions, help and dropdown values as the US workbook spells them. Group names stay as keys for STEPS.
      ui.qs = !isUS() ? qs : qs.map((g) => ({ ...g, qs: g.qs.map((q) => ({ ...q, q: ed(q.q), help: ed(q.help),
        example: usDate(ed(q.example_us ?? q.example)), dv: Array.isArray(q.dv) ? q.dv.map((x) => ed(x)) : q.dv && q.dv.pick ? { pick: q.dv.pick.map((x) => ed(x)), free: true } : q.dv })) }));
    }
    if (ui.gen !== store.gen) { ui.gen = store.gen; ui.vals = null; }
    if (!ui.vals) await store.reloadNames();   // lists typed on the sheets (a currency added on Lists) appear straight away
    if (!ui.vals) ui.vals = await store.readNamesNow(ui.qs.flatMap((g) => g.qs.map((q) => q.name)));
    page.replaceChildren(...build(ctx).childNodes);
  } catch (e) {
    page.replaceChildren(h('div.banner.warn', 'Could not read the set-up answers: ' + (e.message || e)));
  }
}

const blank = (v) => v === '' || v == null;
// The builder writes example dates the UK way ("1 Mar 2026"); the US edition shows "Mar 1, 2026".
const usDate = (s) => (typeof s === 'string' ? s.replace(/\b(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})\b/g, '$2 $1, $3') : s);

function build(ctx) {
  const { store } = ctx;
  const V = ui.vals;
  const groups = Object.fromEntries(ui.qs.map((g) => [g.group, g.qs]));
  const extCount = Number(V.ExtCount) || 0;
  const relevant = (q) => !(/^Ext(Months|Pct)(\d)$/.test(q.name) && Number(q.name.slice(-1)) > Math.max(1, extCount));
  const stepQs = (i) => (STEPS[i][2] || []).flatMap((g) => (groups[g] || []).filter(relevant));
  const answered = (qs) => qs.filter((q) => !blank(V[q.name])).length;
  const people = store.records('tblPeople');
  // Only the lead of the team running the programme is required; a small team leaves other roles empty (evaluation E10).
  const unnamed = store.schema.tblPeople ? store.t.tblPeople.rows.filter((r) => String(r.v[store.t.tblPeople.idx.Role]).toLowerCase() === `${team()} lead`.toLowerCase() && r.v[store.t.tblPeople.idx.Name] === '').length : 0;
  const wsActive = store.records('tblWorkstreams').filter((r) => r.get('Active (Y/N)') === 'Y').length;
  const lib = store.records('tblLibrary');
  const USE = 'Include as (TSA or rTSA)';
  const marked = lib.filter((r) => r.get(USE)).length;
  const reqMissing = ui.qs.flatMap((g) => g.qs).filter((q) => q.required && relevant(q) && blank(V[q.name]));

  const counts = [`${answered(stepQs(0))} of ${stepQs(0).length}`, `${answered(stepQs(1))} of ${stepQs(1).length}`, `${wsActive} in use`, `${people.length} people`, `${marked} marked`, reqMissing.length ? `${reqMissing.length} to do` : 'ready'];
  const totalQ = stepQs(0).length + stepQs(1).length, doneQ = answered(stepQs(0)) + answered(stepQs(1));
  const pct = Math.round((doneQ + (marked ? 1 : 0) + (unnamed ? 0 : 1)) / (totalQ + 2) * 100);
  const go = (i) => { ui.step = i; ui.edits = {}; ctx.rerender(); window.scrollTo(0, 0); };

  const progress = h('div.card', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
      h('b', { style: { color: 'var(--navy)' } }, `Set-up ${pct}% complete`),
      h('div.bar', { style: { flex: '1 1 200px' } }, h('div', { style: { width: pct + '%' } })),
      h('span.small.muted', (store.names.QReq ? `${Number(store.names.QDone) || 0} of ${Number(store.names.QReq) || 0} answered · ` : '') + (reqMissing.length ? `${plural(reqMissing.length, 'required answer')} still to give` : 'All required answers given'))),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' } },
      STEPS.map(([, label], i) => h('button', { type: 'button', onclick: () => go(i), 'aria-current': i === ui.step ? 'step' : null,
        style: { textAlign: 'left', cursor: 'pointer', borderRadius: '8px', padding: '8px 10px', border: `2px solid ${i === ui.step ? 'var(--navy)' : 'var(--line)'}`, background: i === ui.step ? 'var(--selected)' : '#fff' } },
        h('div', { style: { fontWeight: 700, fontSize: '13px', color: 'var(--navy)' } }, `${i + 1}. ${label}`), h('div.small.muted', counts[i])))));

  let body;
  const k = STEPS[ui.step][0];
  if (k === 'deal' || k === 'terms') body = questionsStep(ctx, STEPS[ui.step][2], groups, relevant);
  else if (k === 'workstreams') body = workstreamsStep(ctx);
  else if (k === 'people') body = peopleStep(ctx);
  else if (k === 'services') body = servicesStep(ctx, lib, USE);
  else body = reviewStep(ctx, reqMissing, unnamed, marked, go);

  return h('div',
    h('div.page-head', h('div', h('h1', 'Set-up wizard'), h('p.lede', 'Everything the Hub needs to know, in six steps. Your answers fill in the Start Here sheet. You don\'t need to fill it in as well. People and services go into People and Library, and you can stop and come back at any time.')),
      h('button.btn', { type: 'button', onclick: () => store.showRange('Start Here', 'B1').catch((e) => toast(e.message, true)) }, 'Start Here sheet')),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '18px', marginTop: '18px' } }, progress, body,
      h('div', { style: { display: 'flex', gap: '8px' } },
        ui.step > 0 ? h('button.btn', { type: 'button', onclick: () => go(ui.step - 1) }, '‹ Back') : null,
        ui.step < STEPS.length - 1 ? h('button.btn.btn-primary', { type: 'button', onclick: async () => { if (await saveEdits(ctx)) go(ui.step + 1); } }, 'Save and continue ›')
          : h('button.btn.btn-primary', { type: 'button', onclick: () => ctx.go('home') }, 'Finish and go to Home'))));
}

async function saveEdits(ctx) {
  const pairs = Object.entries(ui.edits).filter(([n, v]) => String(v) !== String(ui.vals[n] ?? ''));
  if (!pairs.length) return true;
  try {
    await ctx.store.writeNames(pairs);
    pairs.forEach(([n, v]) => { ui.vals[n] = v; });
    ui.edits = {};
    toast(`Saved ${plural(pairs.length, 'answer')} to Start Here`);
    return true;
  } catch (e) { toast('Could not save: ' + (e.message || e), true); return false; }
}

function questionsStep(ctx, groupNames, groups, relevant) {
  const { store } = ctx;
  const V = ui.vals;
  // The initial term must not run past the long-stop date (evaluation E6): checked as you type.
  const termWarn = h('div.small', { style: { color: 'var(--r-fg)', marginTop: '4px' } });
  const val = (k) => (k in ui.edits ? ui.edits[k] : V[k]);
  const checkTerm = () => {
    const close = Number(val('CloseDate')) || 0, term = Number(val('DefTerm')) || 0, stop = Number(val('LongStop')) || 0;
    let msg = '';
    if (close && term && stop) {
      const d = fromSerial(close), end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + term, d.getUTCDate()) / 864e5 + 25569;
      if (end > stop) msg = `A ${term}-month term from closing ends on ${fmtDate(end)}, after the long-stop date (${fmtDate(stop)}). Shorten the term or check the long-stop date.`;
    }
    document.querySelectorAll('.term-warn').forEach((x) => { x.textContent = msg; });
  };
  termWarn.className = 'small term-warn';
  setTimeout(checkTerm);
  const qEl = (q) => {
    const cur = q.name in ui.edits ? ui.edits[q.name] : V[q.name];
    const set = (v) => { ui.edits[q.name] = v; };
    let el;
    if (!(q.name in V) && store.src && store.src.constructor && store.src.constructor.name === 'ExcelSource') {
      // A workbook from before this question existed (e.g. the team's name, new in Hub v0.11)
      el = h('div.small.muted', 'Not in this workbook yet: it arrives with TransitionSuite Hub v0.11.');
    }
    const opts = Array.isArray(q.dv) ? q.dv : q.dv && q.dv.name ? store.options({ h: q.name, t: 'I', dv: q.dv }) : null;
    if (el) { /* already decided above */ } else if (q.dv && q.dv.free) {   // pick from the list, or type your own
      const id = 'dl-' + q.name;
      el = h('span', h('input', { type: 'text', list: id, value: blank(cur) ? '' : String(cur), style: inp(), 'aria-label': q.q, oninput: (e) => set(e.target.value.trim()) }),
        h('datalist', { id }, q.dv.pick.map((o) => h('option', { value: o }))));
    } else if (opts) {
      el = h('select', { style: inp() }, h('option', { value: '' }, ''), [...new Set([String(cur ?? ''), ...opts].filter(Boolean))].map((o) => h('option', { value: o }, q.dv && q.dv.name === 'L_People' ? personLabel(store, o) : o)));
      el.value = blank(cur) ? '' : String(cur);
      el.addEventListener('change', () => { set(el.value); if (q.name === 'ExtCount' || q.name === 'Perspective') { ui.vals[q.name] = el.value; saveEdits(ctx).then(() => ctx.rerender()); } });
    } else if (q.fmt === 'date') {
      el = dateBox(cur, { style: inp() });
      el.addEventListener('input', () => { set(isoToSerial(el.value)); checkTerm(); });
    } else if (q.fmt === 'pct') {
      el = h('input', { type: 'number', step: '0.5', min: '0', max: '100', value: blank(cur) ? '' : String(Math.round(Number(cur) * 1000) / 10), style: inp() });
      el.addEventListener('input', () => set(el.value === '' ? '' : Number(el.value) / 100));
    } else if (q.fmt === 'int' || q.fmt === 'money') {
      el = h('input', { type: 'number', step: q.fmt === 'int' ? '1' : 'any', value: blank(cur) ? '' : String(cur), style: inp() });
      el.addEventListener('input', () => { set(el.value === '' ? '' : Number(el.value)); checkTerm(); });
      // How many extensions: show that many extension questions straight away (evaluation C)
      if (q.name === 'ExtCount') el.addEventListener('change', () => { ui.vals[q.name] = el.value === '' ? '' : Number(el.value); saveEdits(ctx).then(() => ctx.rerender()); });
    } else {
      el = h('input', { type: 'text', value: blank(cur) ? '' : String(cur), style: inp() });
      el.addEventListener('input', () => set(el.value.trim()));
    }
    const missing = q.required && blank(cur);
    return h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(160px, 1fr)', gap: '6px 16px', padding: '10px 0', borderTop: '1px solid var(--line-soft)', alignItems: 'start' } },
      h('div', h('div', { style: { fontWeight: 600, fontSize: '13px', color: missing ? 'var(--ink)' : 'var(--heading)' } }, q.q, q.required ? null : h('span.small.muted', ' (optional)')),
        h('div.small.muted', [q.help, q.example ? `Example: ${q.example}.` : ''].filter(Boolean).join(' '),
          q.ai ? [' Your AI assistant can find this in the deal agreements: ', h('button.link-btn', { type: 'button', onclick: () => store.showRange('AI Prompts', 'A1').catch((e) => toast(e.message, true)) }, 'AI Prompts sheet ›')] : null)),
      h('div', el, q.name === 'DefTerm' || q.name === 'LongStop' ? h('div.small.term-warn', { style: { color: 'var(--r-fg)', marginTop: '4px' } }) : null, q.name === 'RepCcy' ? addCurrency(ctx) : null));
  };
  return h('div.card', groupNames.map((g) => [h('div.sec', { style: { marginTop: 0, borderTop: 0 } }, ed(g)), (groups[g] || []).filter(relevant).map(qEl)]));
}

// Add a currency from the wizard (evaluation E4): code and rate, written to the Currencies list on the Lists sheet.
function addCurrency(ctx) {
  const { store } = ctx;
  const code = h('input', { type: 'text', maxlength: '3', placeholder: 'Code, e.g. AUD', style: { ...inp(), width: '110px', textTransform: 'uppercase' }, 'aria-label': 'Currency code' });
  const rate = h('input', { type: 'number', step: 'any', min: '0', placeholder: 'Rate', style: { ...inp(), width: '110px' }, 'aria-label': 'Rate' });
  const have = (store.options({ h: 'RepCcy', t: 'I', dv: { name: 'CcyCode' } }) || []);
  const add = async () => {
    const c = code.value.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c)) { toast('Type the three-letter currency code, for example AUD', true); return; }
    if (have.includes(c)) { toast(`${c} is already on the list`, true); return; }
    if (!(Number(rate.value) > 0)) { toast(`Type the value of one ${c} in the base currency`, true); return; }
    try {
      await store.need(['tblCurrencies']);
      await store.add('tblCurrencies', { Code: c, 'Rate (value of one unit in the base currency)': Number(rate.value), 'Rate source and date': 'Added in the set-up wizard ' + fmtDate(Math.floor(Date.now() / 864e5 + 25569)) });
      await store.reloadNames(); ui.vals = null;
      toast(`${c} added to the currencies on the Lists sheet`); ctx.rerender();
    } catch (e) { toast('Could not add it: ' + (e.message || e), true); }
  };
  return h('details', { style: { marginTop: '6px' } }, h('summary.small', { style: { cursor: 'pointer', color: 'var(--link)', fontWeight: 600 } }, 'Add a currency'),
    h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', alignItems: 'center' } }, code, rate, h('button.btn.btn-sm', { type: 'button', onclick: add }, 'Add')),
    h('div.small.muted', { style: { marginTop: '4px' } }, `Currencies now: ${have.join(', ') || 'none'}. The rate is the value of one unit in the base currency (usually the reporting currency, rate 1).`));
}

// Workstreams come before People (evaluation E7): tick the programme's workstreams, or add your own.
function workstreamsStep(ctx) {
  const { store } = ctx;
  const T = 'tblWorkstreams';
  const rows = store.records(T);
  const toggle = async (r, on) => {
    // written by name: since v0.11 the answer lives on Start Here (Your workstreams), and Lists shows it
    try { await store.writeNameItem('WS_Active', r.i, on ? 'Y' : 'N'); await store.need([T]); ctx.rerender(); } catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  const codeIn = h('input', { type: 'text', maxlength: '6', placeholder: 'e.g. LEG', style: { ...inp(), textTransform: 'uppercase' } });
  const nameIn = h('input', { type: 'text', placeholder: 'e.g. Legal entity and governance', style: inp() });
  const add = async () => {
    const c = codeIn.value.trim().toUpperCase(), nm = nameIn.value.trim();
    if (!c || !nm) { toast('Type a short code and a name', true); return; }
    if (rows.some((r) => String(r.get('Code')).toUpperCase() === c)) { toast(`${c} is already a workstream`, true); return; }
    try { const i = await store.add(T, { Code: c, Name: nm }); await store.writeNameItem('WS_Active', i, 'Y'); await store.need([T]); toast(`${c} added`); ctx.rerender(); } catch (e) { toast('Could not add: ' + (e.message || e), true); }
  };
  return h('div.row-wrap',
    h('div.card', { style: { flex: '999 1 480px', minWidth: 0 } },
      h('p.small.muted', { style: { margin: '0 0 8px' } }, ed('Tick the workstreams your programme has. People, services, reports and the RAID use this list. Saved as you tick.')),
      rows.map((r) => {
        const id = 'ws-' + r.i, on = r.get('Active (Y/N)') === 'Y';
        const cb = h('input', { type: 'checkbox', id, checked: on, style: { width: '18px', height: '18px', accentColor: 'var(--navy)' } });
        cb.addEventListener('change', () => toggle(r, cb.checked));
        return h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', padding: '7px 0', borderTop: '1px solid var(--line-soft)' } }, cb,
          h('label', { for: id, style: { flex: '1 1 auto', cursor: 'pointer' } }, h('b', r.get('Code')), ' · ', r.get('Name'), r.get('Description') ? h('div.small.muted', r.get('Description')) : null));
      })),
    h('aside.panel', h('div.panel-head', h('span.panel-id', 'Not on the list'), h('h2.panel-title', 'Add a workstream')),
      h('div.panel-body', fieldBox('Short code', codeIn), fieldBox('Name', nameIn)),
      h('div.panel-foot', h('button.btn.btn-primary', { type: 'button', onclick: add }, 'Add'))));
}

function peopleStep(ctx) {
  const { store } = ctx;
  const T = 'tblPeople';
  const t = store.t[T];
  const roles = t.rows.filter((r) => r.v[t.idx.Role] !== '' || r.v[t.idx.Name] !== '');
  const rows = roles.map((r) => {
    const rec = store.wrap(t, r);
    const nameIn = h('input', { type: 'text', value: rec.get('Name'), placeholder: 'Type the name', style: inp() });
    const emailIn = h('input', { type: 'email', value: rec.get('Email'), placeholder: 'Email (optional)', style: inp() });
    const save = async () => {
      const ch = {};
      if (nameIn.value.trim() !== rec.get('Name')) ch.Name = nameIn.value.trim();
      if (emailIn.value.trim() !== rec.get('Email')) ch.Email = emailIn.value.trim();
      if (!Object.keys(ch).length) return;
      try { await store.save(T, r.i, ch); toast(`${rec.get('Role')}: saved`); } catch (e) { toast('Could not save: ' + (e.message || e), true); }
    };
    nameIn.addEventListener('change', save); emailIn.addEventListener('change', save);
    return h('tr', h('td', { style: { fontWeight: 600 } }, rec.get('Role') || '–'), h('td.muted', rec.get('Organisation')), h('td.muted', rec.get('Workstream or function')), h('td', nameIn), h('td', emailIn));
  });
  const form = buildForm(store, T, null, ['Name', 'Organisation', 'Email']);
  // Role and workstream: pick from the lists or type your own (evaluation E8)
  const typed = (label, list, ph) => { const id = 'dl-p-' + label.replace(/\W/g, ''); const i = h('input', { type: 'text', list: id, placeholder: ph, style: inp() }); return { i, el: fieldBox(label, h('span', i, h('datalist', { id }, (list || []).map((o) => h('option', { value: o }))))) }; };
  const roleF = typed('Role', store.options({ h: 'Role', t: 'I', dv: { name: 'L_Role' } }), 'Pick or type a role');
  const wsF = typed(ed('Workstream or function'), store.options({ h: 'Workstream', t: 'I', dv: { name: 'L_WSP' } }) || store.options({ h: 'Workstream', t: 'I', dv: { name: 'WS_Code' } }), 'Pick or type');
  const add = async () => {
    const v = form.collect();
    if (roleF.i.value.trim()) v.Role = roleF.i.value.trim();
    if (wsF.i.value.trim()) v['Workstream or function'] = wsF.i.value.trim();
    if (!v.Name && !v.Role) { toast('Type a name or pick a role', true); return; }
    try { await store.add(T, v); toast('Added to People'); ctx.rerender(); } catch (e) { toast('Could not add: ' + (e.message || e), true); }
  };
  return h('div.row-wrap',
    h('div.card', { style: { flex: '999 1 560px', minWidth: 0 } },
      h('p.small.muted', { style: { margin: '0 0 8px' } }, 'The usual roles for every workstream are listed. Type the person\'s name against each role: owners, chairs and forum members are then suggested everywhere else. Names save as you leave each box.'),
      h('div', { style: { overflowX: 'auto' } }, h('table.grid', h('thead', h('tr', ['Role', 'Organisation', 'Workstream', 'Name', 'Email'].map((x) => h('th', ed(x))))), h('tbody', rows)))),
    h('aside.panel', h('div.panel-head', h('span.panel-id', 'Someone else'), h('h2.panel-title', 'Add a person')), h('div.panel-body', form.el, roleF.el, wsF.el),
      h('div.panel-foot', h('button.btn.btn-primary', { type: 'button', onclick: add }, 'Add'))));
}

function servicesStep(ctx, lib, USE) {
  const { store } = ctx;
  const q = ui.libQ.toLowerCase();
  const wsList = [...new Set(lib.map((r) => r.get('Workstream')).filter(Boolean))];
  const rows = lib.filter((r) => (!ui.libWs || r.get('Workstream') === ui.libWs) && (!ui.libOnly || r.get(USE)) && (!q || String(r.get('Service')).toLowerCase().includes(q) || String(r.get('Description')).toLowerCase().includes(q) || String(r.get('Library ID')).toLowerCase().includes(q)));
  const setUse = async (r, v) => {
    const box = document.getElementById('lib-list'); ui.libScroll = box ? box.scrollTop : 0;   // keep the place in the list (evaluation E9)
    try { await store.save('tblLibrary', r.i, { [USE]: v }, { force: true }); ctx.rerender(); } catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  setTimeout(() => { const box = document.getElementById('lib-list'); if (box && ui.libScroll) box.scrollTop = ui.libScroll; });
  const search = h('input.search', { id: 'lib-q', type: 'search', placeholder: 'Search the service library', value: ui.libQ });
  search.addEventListener('input', () => { ui.libQ = search.value; const p = search.selectionStart; ctx.rerender(); setTimeout(() => { const n = document.getElementById('lib-q'); if (n) { n.focus(); n.setSelectionRange(p, p); } }); });
  const wsSel = h('select.search', { style: { flex: '0 1 200px' } }, h('option', { value: '' }, 'All workstreams'), wsList.map((w) => h('option', { value: w }, w)));
  wsSel.value = ui.libWs; wsSel.addEventListener('change', () => { ui.libWs = wsSel.value; ctx.rerender(); });
  return h('div.card', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('p.small.muted', { style: { margin: 0 } }, 'Mark each service the TSA covers: TSA for services the seller provides to the buyer, rTSA for reverse services. Marked services appear on the TSA register with their details suggested; you then enter their fees there.'),
    h('div.filters', search, wsSel, h('button.fchip', { type: 'button', 'aria-pressed': String(ui.libOnly), onclick: () => { ui.libOnly = !ui.libOnly; ctx.rerender(); } }, 'Marked only', h('span.n', String(lib.filter((r) => r.get(USE)).length)))),
    h('p.small.muted', { style: { margin: 0 } }, 'To rename a service or change its description, edit it on the TSA register once it is marked. For a service that is not in the library, use + Add a service on the TSA register.'),
    h('div', { id: 'lib-list', style: { maxHeight: '60vh', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '8px' } },
      rows.map((r) => {
        const v = r.get(USE);
        return h('div', { style: { display: 'flex', gap: '12px', alignItems: 'center', padding: '9px 12px', borderBottom: '1px solid var(--line-soft)', background: v ? 'var(--row-pick)' : '#fff' } },
          h('div', { style: { flex: '1 1 auto', minWidth: 0 } }, h('div', { style: { fontWeight: 600, fontSize: '13px' } }, r.get('Service'), h('span.small.muted', ` · ${r.get('Workstream')} · ${r.get('Library ID')}`)),
            h('div.small.muted', { style: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, r.get('Description'))),
          h('div.opts', { role: 'group', 'aria-label': 'Include as', style: { flexWrap: 'nowrap', flex: '0 0 auto' } }, [['TSA', 'TSA'], ['rTSA', 'rTSA'], ['', 'Not used']].map(([val, label]) =>
            h('button', { type: 'button', 'aria-pressed': String(v === val), onclick: () => setUse(r, val) }, label))));
      })));
}

function reviewStep(ctx, reqMissing, unnamed, marked, go) {
  const { store } = ctx;
  const n = store.names;
  const office = store.src.getSetting('office-name') || 'Separation Management Office';
  const logo = store.src.getSetting('logo');
  const officeIn = h('input', { type: 'text', value: office, style: inp() });
  officeIn.addEventListener('change', async () => { await store.src.setSetting('office-name', officeIn.value.trim()); toast('Office name saved'); });
  const logoIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml' });
  logoIn.addEventListener('change', () => {
    const f = logoIn.files[0];
    if (!f) return;
    if (f.size > 300 * 1024) { toast('Please use a logo under 300 KB', true); return; }
    const rd = new FileReader();
    rd.onload = async () => { await store.src.setSetting('logo', rd.result); toast('Logo saved with the workbook'); ctx.rerender(); };
    rd.readAsDataURL(f);
  });
  const item = (ok, title, sub, step) => h('div', { style: { display: 'flex', gap: '10px', padding: '8px 0', borderTop: '1px solid var(--line-soft)', alignItems: 'flex-start' } },
    h('span', { style: { fontWeight: 700, color: ok ? 'var(--g-fg)' : 'var(--a-fg)', width: '16px' } }, ok ? '✓' : '!'),
    h('div', { style: { flex: '1 1 auto' } }, h('div', { style: { fontWeight: 600 } }, title), h('div.small.muted', sub)),
    step != null && !ok ? h('button.link-btn', { type: 'button', onclick: () => go(step) }, 'Fix') : null);
  return h('div.row-wrap',
    h('div.card', { style: { flex: '999 1 480px' } }, h('h2.cap', { style: { marginBottom: '6px' } }, 'Review'),
      item(!!(n.BuyerName && n.SellerName && n.CloseDate), 'The deal', `${n.SellerName || '?'} to ${n.BuyerName || '?'} · closing ${fmtDate(n.CloseDate) || 'not set'} · you are the ${String(n.Perspective || '?').toLowerCase()}`, 0),
      item(!reqMissing.length, 'Required answers', reqMissing.length ? reqMissing.map((q) => q.q).slice(0, 4).join(' · ') + (reqMissing.length > 4 ? ` and ${reqMissing.length - 4} more` : '') : 'All given', reqMissing.length ? (STEPS.findIndex((s) => (s[2] || []).some((g) => ui.qs.find((x) => x.group === g)?.qs.some((q) => q.name === reqMissing[0].name))) || 0) : null),
      item(!unnamed, 'People', unnamed ? `Name the ${team()} lead (the Hub owner)` : 'The Hub owner is named; other roles are optional', 3),
      item(marked > 0, 'Services', marked ? [`${plural(marked, 'service')} marked. `, h('button.link-btn', { type: 'button', onclick: () => ctx.go('register') }, 'Enter their monthly fees on the TSA register ›')] : 'No services marked yet', 4)),
    h('aside.panel', h('div.panel-head', h('span.panel-id', 'Shown on invoices and packs'), h('h2.panel-title', 'Your letterhead')),
      h('div.panel-body', fieldBox('Office name', officeIn),
        h('div.field', h('span.field-label', 'Logo (PNG, JPG or SVG, under 300 KB)'), logo ? h('img', { src: logo, alt: 'Current logo', style: { maxHeight: '56px', maxWidth: '220px', objectFit: 'contain' } }) : h('span.small.muted', 'No logo yet'), logoIn,
          logo ? h('button.link-btn', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: async () => { await store.src.setSetting('logo', null); ctx.rerender(); } }, 'Remove logo') : null))));
}

function inp() { return { border: '1px solid var(--line-strong)', background: 'var(--input)', borderRadius: '6px', padding: '7px 9px', fontSize: '13px', width: '100%', minWidth: 0 }; }
