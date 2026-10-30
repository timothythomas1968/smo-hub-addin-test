// Set-up wizard: the Start Here questions, the people in each role, the services marked in the Library,
// and the letterhead, in five steps. Every answer is written straight to the workbook cell the sheets use.
import { h, fmtDate, toast, isoToSerial, serialToIso, plural } from '../util.js?v=0.8.0.20261030222058';
import { buildForm } from '../form.js?v=0.8.0.20261030222058';

const STEPS = [
  ['deal', 'The deal', ['About the programme', 'Key dates', 'Money']],
  ['terms', 'Contract terms', ["The TSA's terms", 'Extension fee mark-ups', 'Invoices and payment', 'Readiness and service levels']],
  ['people', 'People', null], ['services', 'Services', null], ['review', 'Letterhead and review', null]
];
const ui = { step: 0, qs: null, vals: null, edits: {}, libQ: '', libWs: '', libOnly: false, peopleEdit: null };

export default {
  tables: ['tblPeople', 'tblLibrary', 'tblWorkstreams'],
  render(ctx) {
    const page = h('div.page', h('div.loading', h('div.spinner'), 'Reading the set-up answers…'));
    load(ctx, page);
    return page;
  }
};

async function load(ctx, page) {
  const { store } = ctx;
  try {
    if (!ui.qs) ui.qs = await (await fetch(new URL('../../data/questions.json', import.meta.url))).json();
    if (!ui.vals) ui.vals = await store.readNamesNow(ui.qs.flatMap((g) => g.qs.map((q) => q.name)));
    page.replaceChildren(...build(ctx).childNodes);
  } catch (e) {
    page.replaceChildren(h('div.banner.warn', 'Could not read the set-up answers: ' + (e.message || e)));
  }
}

const blank = (v) => v === '' || v == null;

function build(ctx) {
  const { store } = ctx;
  const V = ui.vals;
  const groups = Object.fromEntries(ui.qs.map((g) => [g.group, g.qs]));
  const extCount = Number(V.ExtCount) || 0;
  const relevant = (q) => !(/^Ext(Months|Pct)(\d)$/.test(q.name) && Number(q.name.slice(-1)) > Math.max(1, extCount));
  const stepQs = (i) => (STEPS[i][2] || []).flatMap((g) => (groups[g] || []).filter(relevant));
  const answered = (qs) => qs.filter((q) => !blank(V[q.name])).length;
  const people = store.records('tblPeople');
  const unnamed = store.schema.tblPeople ? store.t.tblPeople.rows.filter((r) => r.v[store.t.tblPeople.idx.Role] !== '' && r.v[store.t.tblPeople.idx.Name] === '').length : 0;
  const lib = store.records('tblLibrary');
  const USE = 'Include as (TSA or rTSA)';
  const marked = lib.filter((r) => r.get(USE)).length;
  const reqMissing = ui.qs.flatMap((g) => g.qs).filter((q) => q.required && relevant(q) && blank(V[q.name]));

  const counts = [`${answered(stepQs(0))} of ${stepQs(0).length}`, `${answered(stepQs(1))} of ${stepQs(1).length}`, `${people.length} people`, `${marked} marked`, reqMissing.length ? `${reqMissing.length} to do` : 'ready'];
  const totalQ = stepQs(0).length + stepQs(1).length, doneQ = answered(stepQs(0)) + answered(stepQs(1));
  const pct = Math.round((doneQ + (marked ? 1 : 0) + (unnamed ? 0 : 1)) / (totalQ + 2) * 100);
  const go = (i) => { ui.step = i; ui.edits = {}; ctx.rerender(); window.scrollTo(0, 0); };

  const progress = h('div.card', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
      h('b', { style: { color: 'var(--navy)' } }, `Set-up ${pct}% complete`),
      h('div.bar', { style: { flex: '1 1 200px' } }, h('div', { style: { width: pct + '%' } })),
      h('span.small.muted', reqMissing.length ? `${plural(reqMissing.length, 'required answer')} still to give` : 'All required answers given')),
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' } },
      STEPS.map(([, label], i) => h('button', { type: 'button', onclick: () => go(i), 'aria-current': i === ui.step ? 'step' : null,
        style: { textAlign: 'left', cursor: 'pointer', borderRadius: '8px', padding: '8px 10px', border: `2px solid ${i === ui.step ? 'var(--navy)' : 'var(--line)'}`, background: i === ui.step ? 'var(--selected)' : '#fff' } },
        h('div', { style: { fontWeight: 700, fontSize: '13px', color: 'var(--navy)' } }, `${i + 1}. ${label}`), h('div.small.muted', counts[i])))));

  let body;
  const k = STEPS[ui.step][0];
  if (k === 'deal' || k === 'terms') body = questionsStep(ctx, STEPS[ui.step][2], groups, relevant);
  else if (k === 'people') body = peopleStep(ctx);
  else if (k === 'services') body = servicesStep(ctx, lib, USE);
  else body = reviewStep(ctx, reqMissing, unnamed, marked, go);

  return h('div',
    h('div.page-head', h('div', h('h1', 'Set-up wizard'), h('p.lede', 'Everything the Hub needs to know, in five steps. Answers go straight into the workbook (Start Here, People and Library), so you can stop and come back at any time.')),
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
  const qEl = (q) => {
    const cur = q.name in ui.edits ? ui.edits[q.name] : V[q.name];
    const set = (v) => { ui.edits[q.name] = v; };
    let el;
    const opts = Array.isArray(q.dv) ? q.dv : q.dv && q.dv.name ? store.options({ h: q.name, t: 'I', dv: q.dv }) : null;
    if (opts) {
      el = h('select', { style: inp() }, h('option', { value: '' }, ''), [...new Set([String(cur ?? ''), ...opts].filter(Boolean))].map((o) => h('option', { value: o }, o)));
      el.value = blank(cur) ? '' : String(cur);
      el.addEventListener('change', () => { set(el.value); if (q.name === 'ExtCount' || q.name === 'Perspective') { ui.vals[q.name] = el.value; saveEdits(ctx).then(() => ctx.rerender()); } });
    } else if (q.fmt === 'date') {
      el = h('input', { type: 'date', value: serialToIso(cur), style: inp() });
      el.addEventListener('input', () => set(isoToSerial(el.value)));
    } else if (q.fmt === 'pct') {
      el = h('input', { type: 'number', step: '0.5', min: '0', max: '100', value: blank(cur) ? '' : String(Math.round(Number(cur) * 1000) / 10), style: inp() });
      el.addEventListener('input', () => set(el.value === '' ? '' : Number(el.value) / 100));
    } else if (q.fmt === 'int' || q.fmt === 'money') {
      el = h('input', { type: 'number', step: q.fmt === 'int' ? '1' : 'any', value: blank(cur) ? '' : String(cur), style: inp() });
      el.addEventListener('input', () => set(el.value === '' ? '' : Number(el.value)));
    } else {
      el = h('input', { type: 'text', value: blank(cur) ? '' : String(cur), style: inp() });
      el.addEventListener('input', () => set(el.value.trim()));
    }
    const missing = q.required && blank(cur);
    return h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(160px, 1fr)', gap: '6px 16px', padding: '10px 0', borderTop: '1px solid var(--line-soft)', alignItems: 'start' } },
      h('div', h('div', { style: { fontWeight: 600, fontSize: '13px', color: missing ? 'var(--ink)' : 'var(--heading)' } }, q.q, q.required ? null : h('span.small.muted', ' (optional)')),
        h('div.small.muted', [q.help, q.example ? `Example: ${q.example}.` : '', q.ai ? 'Your AI assistant can find this in the deal agreements (see the AI Prompts sheet).' : ''].filter(Boolean).join(' '))),
      el);
  };
  return h('div.card', groupNames.map((g) => [h('div.sec', { style: { marginTop: 0, borderTop: 0 } }, g), (groups[g] || []).filter(relevant).map(qEl)]));
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
  const form = buildForm(store, T, null, ['Name', 'Organisation', 'Role', 'Workstream or function', 'Email']);
  const add = async () => {
    const v = form.collect();
    if (!v.Name && !v.Role) { toast('Type a name or pick a role', true); return; }
    try { await store.add(T, v); toast('Added to People'); ctx.rerender(); } catch (e) { toast('Could not add: ' + (e.message || e), true); }
  };
  return h('div.row-wrap',
    h('div.card', { style: { flex: '999 1 560px', minWidth: 0 } },
      h('p.small.muted', { style: { margin: '0 0 8px' } }, 'The usual roles for every workstream are listed. Type the person\'s name against each role: owners, chairs and forum members are then suggested everywhere else. Names save as you leave each box.'),
      h('div', { style: { overflowX: 'auto' } }, h('table.grid', h('thead', h('tr', ['Role', 'Organisation', 'Workstream', 'Name', 'Email'].map((x) => h('th', x)))), h('tbody', rows)))),
    h('aside.panel', h('div.panel-head', h('span.panel-id', 'Someone else'), h('h2.panel-title', 'Add a person')), h('div.panel-body', form.el),
      h('div.panel-foot', h('button.btn.btn-primary', { type: 'button', onclick: add }, 'Add'))));
}

function servicesStep(ctx, lib, USE) {
  const { store } = ctx;
  const q = ui.libQ.toLowerCase();
  const wsList = [...new Set(lib.map((r) => r.get('Workstream')).filter(Boolean))];
  const rows = lib.filter((r) => (!ui.libWs || r.get('Workstream') === ui.libWs) && (!ui.libOnly || r.get(USE)) && (!q || String(r.get('Service')).toLowerCase().includes(q) || String(r.get('Description')).toLowerCase().includes(q) || String(r.get('Library ID')).toLowerCase().includes(q)));
  const setUse = async (r, v) => {
    try { await store.save('tblLibrary', r.i, { [USE]: v }, { force: true }); ctx.rerender(); } catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  const search = h('input.search', { id: 'lib-q', type: 'search', placeholder: 'Search the service library', value: ui.libQ });
  search.addEventListener('input', () => { ui.libQ = search.value; const p = search.selectionStart; ctx.rerender(); setTimeout(() => { const n = document.getElementById('lib-q'); if (n) { n.focus(); n.setSelectionRange(p, p); } }); });
  const wsSel = h('select.search', { style: { flex: '0 1 200px' } }, h('option', { value: '' }, 'All workstreams'), wsList.map((w) => h('option', { value: w }, w)));
  wsSel.value = ui.libWs; wsSel.addEventListener('change', () => { ui.libWs = wsSel.value; ctx.rerender(); });
  return h('div.card', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('p.small.muted', { style: { margin: 0 } }, 'Mark each service the TSA covers: TSA for services the seller provides to the buyer, rTSA for reverse services. Marked services appear on the TSA register with their details suggested; you then enter their fees there.'),
    h('div.filters', search, wsSel, h('button.fchip', { type: 'button', 'aria-pressed': String(ui.libOnly), onclick: () => { ui.libOnly = !ui.libOnly; ctx.rerender(); } }, 'Marked only', h('span.n', String(lib.filter((r) => r.get(USE)).length)))),
    h('div', { style: { maxHeight: '60vh', overflowY: 'auto', border: '1px solid var(--line)', borderRadius: '8px' } },
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
      item(!unnamed, 'People', unnamed ? `${plural(unnamed, 'role')} without a name` : 'Every listed role has a name', 2),
      item(marked > 0, 'Services', marked ? `${plural(marked, 'service')} marked; enter their monthly fees on the TSA register` : 'No services marked yet', 3)),
    h('aside.panel', h('div.panel-head', h('span.panel-id', 'Shown on invoices and packs'), h('h2.panel-title', 'Your letterhead')),
      h('div.panel-body', h('label.field', h('span.field-label', 'Office name'), officeIn),
        h('div.field', h('span.field-label', 'Logo (PNG, JPG or SVG, under 300 KB)'), logo ? h('img', { src: logo, alt: 'Current logo', style: { maxHeight: '56px', maxWidth: '220px', objectFit: 'contain' } }) : h('span.small.muted', 'No logo yet'), logoIn,
          logo ? h('button.link-btn', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: async () => { await store.src.setSetting('logo', null); ctx.rerender(); } }, 'Remove logo') : null))));
}

function inp() { return { border: '1px solid var(--line-strong)', background: 'var(--input)', borderRadius: '6px', padding: '7px 9px', fontSize: '13px', width: '100%', minWidth: 0 }; }
