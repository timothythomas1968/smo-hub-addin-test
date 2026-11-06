// TSA register: every service, with a details panel that edits the register row.
import { h, fmtDate, fmtMoney, toast, ed } from '../util.js?v=0.9.3.20261106165044';
import { buildForm } from '../form.js?v=0.9.3.20261106165044';

const T = 'tblTSA';
const EXITED = new Set(['Exited', 'Terminated']);
const ui = { filter: 'all', ws: '', q: '', sel: null, tab: 'Overview', adding: false, pending: {}, pendingRow: null };

const TABS = {
  Overview: ['TSA ID', { h: 'Service name', full: true }, 'Service description', 'Provider service owner', 'Recipient service owner', 'Status',
    'Service delivery RAG', 'Exit readiness RAG', { h: 'Path to green', full: true }, 'Workstream', 'Direction', 'Critical', 'Data checks'],
  Contract: ['Schedule ref', 'Service start', 'Initial term (months)', 'Initial end date', 'Planned exit date', 'Forecast exit date', 'Actual exit date',
    { sec: 'Contract terms' }, 'On-time exit notice (days)', 'Exit notice deadline', 'Extension allowed', 'Extension notice (days)', 'Extension notice deadline',
    'Maximum extension (months)', 'Early exit notice (days)', 'Partial exit allowed', 'Provider entity', 'Recipient entity'],
  Exit: ['Exit route', 'Exit plan status', 'Exit plan approved on (date)', 'Exit type', 'Next readiness interview', 'Plan items open after exit',
    'Entanglement', 'Exit complexity', 'Move group', 'Staff transfer', 'Exit hypothesis', 'Alternative exit options', 'Dependent services', 'Exit date check'],
  Costs: ['Fee currency', 'Monthly fee (key input)', 'Monthly fee (reporting currency)', 'Charging basis', 'Inside fee cap', 'First billed month',
    'Billing stops', 'Mark-up starts', { h: 'Fee basis note', full: true }],
  Notes: ['Comments', 'Shared comments', { sec: 'Linked records' }, 'Open issues', 'Open actions', 'Open change requests', 'Latest SLA month', 'Latest SLA result', 'Months below standard']
};

export default {
  tables: [T],
  render(ctx) {
    const { store, arg } = ctx;
    const RD = Number(store.names.RD) || 0;
    const sym = store.names.CcySym || '';
    if (arg && !arg.used) {
      arg.used = true;
      if (arg.filter) ui.filter = arg.filter;
      if (arg.id) { ui.sel = arg.id; ui.filter = 'all'; ui.q = ''; ui.ws = ''; }
      if (arg.ws) ui.ws = arg.ws;
    }
    const all = store.records(T);
    const live = (r) => !EXITED.has(r.get('Status'));
    const ra = (r) => live(r) && ['Red', 'Amber'].some((c) => r.get('Service delivery RAG') === c || r.get('Exit readiness RAG') === c);
    const nextDate = all.filter(live).map((r) => Number(r.get('Forecast exit date')) || 0).filter((d) => d >= RD).sort((a, b) => a - b)[0];
    const tests = {
      all: ['All', () => true],
      next: ['Next exit', (r) => live(r) && Number(r.get('Forecast exit date')) === nextDate],
      d90: ['Exiting in 90 days', (r) => live(r) && Number(r.get('Forecast exit date')) <= RD + 90],
      ra: ['Red or amber', ra],
      exited: ['Exited', (r) => !live(r)],
      rev: ['Reverse TSA', (r) => r.get('Direction') === 'Reverse']
    };
    if (!tests[ui.filter]) ui.filter = 'all';
    const q = ui.q.toLowerCase();
    const match = (r) => !q || ['TSA ID', 'Service name', 'Provider service owner', 'Recipient service owner', 'Workstream'].some((c) => String(r.get(c)).toLowerCase().includes(q));
    const wsOf = (r) => String(r.get('Workstream') || '');
    const codes = (store.names.WS_Code || []).map(String), wsNames = store.names.WS_Name || [];
    const wsList = [...new Set(all.map(wsOf).filter(Boolean))].sort((a, b) => codes.indexOf(a) - codes.indexOf(b));
    if (ui.ws && !wsList.includes(ui.ws)) ui.ws = '';
    const inWs = (r) => !ui.ws || wsOf(r) === ui.ws;
    const rows = all.filter(tests[ui.filter][1]).filter(inWs).filter(match);
    let sel = all.find((r) => r.get('TSA ID') === ui.sel) || null;
    if (!sel && !ui.adding && rows.length) { sel = rows[0]; ui.sel = sel.get('TSA ID'); }

    const page = h('div.page');
    const rerender = () => ctx.rerender();

    page.append(
      h('div.page-head',
        h('div', h('h1', 'TSA register'), h('p.lede', `${all.length} services under the TSA and reverse TSA. Select a service to see and edit its details.`)),
        h('button.btn', { type: 'button', onclick: () => store.show(T, sel ? sel.i : null).catch((e) => toast(e.message, true)) }, 'Show in the worksheet'),
        h('button.btn.btn-primary', { type: 'button', onclick: () => { ui.adding = true; ui.sel = null; rerender(); } }, '+ Add a service')),
      h('div.filters',
        h('label.sr', { for: 'reg-q' }, 'Search services'),
        (() => {
          const s = h('input.search', { id: 'reg-q', type: 'search', placeholder: 'Search by ID, name, owner or workstream', value: ui.q });
          s.addEventListener('input', () => { ui.q = s.value; const pos = s.selectionStart; rerender(); setTimeout(() => { const n = document.getElementById('reg-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); });
          return s;
        })(),
        (() => {
          const s = h('select.search', { 'aria-label': 'Workstream', style: { flex: '0 1 240px' } }, h('option', { value: '' }, 'All workstreams'),
            wsList.map((c) => h('option', { value: c }, `${c} · ${wsNames[codes.indexOf(c)] || c}`)));
          s.value = ui.ws;
          s.addEventListener('change', () => { ui.ws = s.value; rerender(); });
          return s;
        })(),
        Object.entries(tests).map(([k, [label, fn]]) => h('button.fchip', { type: 'button', 'aria-pressed': String(ui.filter === k), onclick: () => { ui.filter = k; rerender(); } },
          label, h('span.n', String(all.filter(fn).filter(inWs).length))))));

    const table = h('div.tbl-wrap',
      h('table.grid',
        h('thead', h('tr', ['TSA ID', 'Service', 'WS', 'Forecast exit', 'Monthly fee', 'Delivery', 'Readiness', 'Status'].map((c, i) => h('th', { style: i === 4 ? { textAlign: 'right' } : null }, c)))),
        h('tbody', rows.map((r) => {
          const id = r.get('TSA ID');
          const tr = h('tr.pick', { class: sel && sel.i === r.i ? 'sel' : null, tabindex: '0', onclick: () => { ui.sel = id; ui.adding = false; rerender(); } },
            h('td.id', id),
            h('td', h('span', { style: { fontWeight: 600 } }, r.get('Service name')), r.get('Direction') === 'Reverse' ? h('span.small.muted', ' · reverse') : null),
            h('td.muted', r.get('Workstream')),
            h('td.nowrap', fmtDate(r.get('Forecast exit date'))),
            h('td.num', fmtMoney(r.get('Monthly fee (reporting currency)'), sym) || '–'),
            h('td', ragChip(r.get('Service delivery RAG'))),
            h('td', ragChip(r.get('Exit readiness RAG'))),
            h('td', { style: { color: 'var(--heading)' } }, r.get('Status')));
          tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') tr.click(); });
          return tr;
        }))),
      rows.length ? null : h('p.muted', { style: { padding: '16px' } }, 'No services match.'));

    page.append(h('div.row-wrap', table, ui.adding ? addPanel(ctx) : detailPanel(ctx, sel)));
    return page;
  }
};

function ragChip(v) { return v ? h('span.chip', { class: v }, v) : h('span.muted', '–'); }

function detailPanel(ctx, rec) {
  const { store } = ctx;
  if (!rec) return h('aside.panel', h('div.panel-empty', 'Select a service.'));
  if (ui.pendingRow !== rec.i) { ui.pending = {}; ui.pendingRow = rec.i; }
  const form = buildForm(store, T, rec, TABS[ui.tab], { pending: ui.pending });
  const nPending = Object.keys(ui.pending).length;
  const save = async () => {
    const ch = { ...ui.pending, ...form.collect() };
    ui.pending = {};
    if (!Object.keys(ch).length) { toast('Nothing changed'); return; }
    try {
      const n = await store.save(T, rec.i, ch);
      if (ch['TSA ID']) ui.sel = ch['TSA ID'];
      toast(n ? `Saved ${n} change${n === 1 ? '' : 's'} to the workbook` : 'Nothing changed');
      ctx.rerender();
    } catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  return h('aside.panel', { 'aria-label': 'Service details' },
    h('div.panel-head',
      h('span.panel-id', `${rec.get('TSA ID')} · ${rec.get('Direction') === 'Reverse' ? 'Reverse TSA' : 'TSA'} · ${rec.get('Status')}`),
      h('h2.panel-title', rec.get('Service name')),
      h('div.tabs', { role: 'tablist' }, Object.keys(TABS).map((t) => h('button.tab', { type: 'button', role: 'tab', 'aria-selected': String(ui.tab === t),
        onclick: () => { Object.assign(ui.pending, form.collect()); ui.tab = t; ctx.rerender(); } }, t)))),
    h('div.panel-body', form.el),
    h('div.panel-foot',
      h('button.btn.btn-primary', { type: 'button', onclick: save }, 'Save'),
      h('button.btn', { type: 'button', onclick: () => store.show(T, rec.i).catch((e) => toast(e.message, true)) }, 'Show row'),
      nPending ? h('span.small', { style: { color: 'var(--link)', fontWeight: 600 } }, `${nPending} unsaved change${nPending === 1 ? '' : 's'} on other tabs`) : null,
      h('span.small.muted', { style: { flex: '1 1 100%' } }, ed('Grey italic values are suggested by the Hub: type over them to set your own. Bold values are calculated.'))));
}

function addPanel(ctx) {
  const { store } = ctx;
  const form = buildForm(store, T, null, ['TSA ID', 'Service name', 'Service description', 'Service start', 'Monthly fee (key input)', 'Fee currency',
    'Provider service owner', 'Recipient service owner']);
  const add = async () => {
    const v = form.collect();
    if (!v['TSA ID'] || !v['Service name']) { toast('Type at least the TSA ID and the service name', true); return; }
    try {
      await store.add(T, v);
      ui.adding = false; ui.sel = v['TSA ID']; ui.filter = 'all';
      toast('Service added to the register');
      ctx.rerender();
    } catch (e) { toast('Could not add: ' + (e.message || e), true); }
  };
  return h('aside.panel', { 'aria-label': 'Add a service' },
    h('div.panel-head', h('span.panel-id', 'New service'), h('h2.panel-title', 'Add a service')),
    h('div.panel-body',
      h('p.small.muted', { style: { margin: 0 } }, 'Most services come from the Library: mark them there and they appear here with their details suggested. Use this for a service that is not in the Library.'),
      form.el),
    h('div.panel-foot',
      h('button.btn.btn-primary', { type: 'button', onclick: add }, 'Add service'),
      h('button.btn', { type: 'button', onclick: () => { ui.adding = false; ctx.rerender(); } }, 'Cancel')));
}
