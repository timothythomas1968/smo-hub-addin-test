// TSA register: every service, with a details panel that edits the register row.
import { h, fmtDate, fmtMoney, toast, ed, asOf } from '../util.js?v=0.10.1.20261106220328';
import { countTests, COUNT_RULES } from '../counts.js?v=0.10.1.20261106220328';
import { openDateChange, openDecision, pendingFor, impactOf, logForecast, openExtension, EXTEND_HELP } from '../datechange.js?v=0.10.1.20261106220328';
import { buildForm } from '../form.js?v=0.10.1.20261106220328';

const T = 'tblTSA';
const EXITED = new Set(['Exited', 'Terminated']);
const ui = { filter: 'all', ws: '', q: '', sel: null, tab: 'Overview', adding: false, pending: {}, pendingRow: null };

const TABS = {
  Overview: ['TSA ID', { h: 'Service name', full: true }, 'Service description', 'Provider service owner', 'Recipient service owner', 'Status',
    'Service delivery RAG', 'Exit readiness RAG', { h: 'Path to green', full: true }, 'Workstream', 'Direction', 'Critical', 'Data checks'],
  Contract: ['Schedule ref', 'Service start', 'Initial term (months)', 'Initial end date', { h: 'Planned exit date', readonly: true }, { h: 'Forecast exit date', readonly: true, note: 'Change it on the Exit tab' },
    { sec: 'Contract terms' }, 'On-time exit notice (days)', 'Exit notice deadline', 'Qualifies for extension', 'Extension notice (days)', 'Extension notice deadline',
    'Maximum extension (months)', 'Early exit notice (days)', 'Partial exit allowed', 'Provider entity', 'Recipient entity'],
  Exit: [{ sec: 'Exit dates' }, { h: 'Planned exit date', readonly: true, note: 'Part of the agreed plan: it moves only when a date change is approved' }, 'Forecast exit date', 'Actual exit date', { sec: 'Exit plan' }, 'Exit route', 'Exit plan status', 'Exit plan approved on (date)', 'Exit type', 'Next readiness interview', 'Plan items open after exit',
    'Entanglement', 'Exit complexity', 'Move group', 'Staff transfer', 'Exit hypothesis', 'Alternative exit options', 'Dependent services', 'Exit date check'],
  Costs: ['Fee currency', 'Monthly fee (key input)', 'Monthly fee (reporting currency)', 'Charging basis', 'Inside fee cap', 'First billed month',
    'Billing stops', 'Mark-up starts', { h: 'Fee basis note', full: true }],
  Notes: ['Comments', 'Shared comments', { sec: 'Linked records' }, 'Open issues', 'Open actions', 'Open change requests', 'Latest SLA month', 'Latest SLA result', 'Months below standard']
};

export default {
  tables: [T, 'tblChange', 'tblPlan'],
  render(ctx) {
    const { store, arg } = ctx;
    const RD = Number(store.names.RD) || 0, NOW = asOf(store.names), CT = countTests(NOW);
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
    const nextDate = all.filter(live).map((r) => Number(r.get('Forecast exit date')) || 0).filter((d) => d >= NOW).sort((a, b) => a - b)[0];
    const tests = {
      all: ['All', () => true],
      next: ['Next exit', (r) => live(r) && Number(r.get('Forecast exit date')) === nextDate],
      open: ['Open', CT.open, COUNT_RULES.open],
      soon: ['Closing in 90 days', CT.soon, COUNT_RULES.soon],
      overdue: ['Exit overdue', CT.overdue, COUNT_RULES.overdue],
      ra: ['Red or amber', ra],
      exited: ['Closed', CT.closed, COUNT_RULES.closed],
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
        h('button.btn', { type: 'button', title: EXTEND_HELP, onclick: () => openExtension(ctx) }, 'Apply an extension'),
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
        Object.entries(tests).filter(([k, [, fn]]) => k !== 'overdue' || all.some(fn)).map(([k, [label, fn, rule]]) => h('button.fchip', { type: 'button', title: rule || null, 'aria-pressed': String(ui.filter === k), onclick: () => { ui.filter = k; rerender(); } },
          label, h('span.n', String(all.filter(fn).filter(inWs).length))))));

    const table = h('div.tbl-wrap',
      h('table.grid',
        // Fits a half-screen panel (evaluation G): the workstream sits under the ID, and the two RAGs share a column.
        h('thead', h('tr', ['TSA ID', 'Service', 'Forecast exit', 'Monthly fee', 'Delivery / readiness', 'Status'].map((c, i) => h('th', { style: i === 3 ? { textAlign: 'right' } : null }, c)))),
        h('tbody', rows.map((r) => {
          const id = r.get('TSA ID');
          const tr = h('tr.pick', { class: sel && sel.i === r.i ? 'sel' : null, tabindex: '0', onclick: () => { ui.sel = id; ui.adding = false; rerender(); } },
            h('td.id', id, h('div.small.muted', { style: { fontWeight: 400 } }, r.get('Workstream'))),
            h('td', h('span', { style: { fontWeight: 600 } }, r.get('Service name')), r.get('Direction') === 'Reverse' ? h('span.small.muted', ' · reverse') : null),
            h('td.nowrap', fmtDate(r.get('Forecast exit date'))),
            h('td.num', fmtMoney(r.get('Monthly fee (reporting currency)'), sym) || '–'),
            h('td', h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-start' } }, ragChip(r.get('Service delivery RAG'), 'Delivery'), ragChip(r.get('Exit readiness RAG'), 'Readiness'))),
            h('td', { style: { color: 'var(--heading)' } }, r.get('Status')));
          tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') tr.click(); });
          return tr;
        }))),
      rows.length ? null : h('p.muted', { style: { padding: '16px' } }, 'No services match.'));

    page.append(h('div.row-wrap', table, ui.adding ? addPanel(ctx) : detailPanel(ctx, sel)));
    return page;
  }
};

function dupName(store, name, row) {
  const k = String(name || '').trim().toLowerCase();
  return !!k && store.records(T).some((r) => r.i !== row && String(r.get('Service name')).trim().toLowerCase() === k);
}

function ragChip(v, what) { return v ? h('span.chip', { class: v, title: what ? `${what}: ${v}` : null }, v) : h('span.muted', '–'); }

function detailPanel(ctx, rec) {
  const { store } = ctx;
  if (!rec) return h('aside.panel', h('div.panel-empty', 'Select a service.'));
  if (ui.pendingRow !== rec.i) { ui.pending = {}; ui.pendingRow = rec.i; }
  const form = buildForm(store, T, rec, TABS[ui.tab], { pending: ui.pending });
  const nPending = Object.keys(ui.pending).length;
  const save = async () => {
    const ch = { ...ui.pending, ...form.collect() };
    if (!Object.keys(ch).length) { toast('Nothing changed'); return; }
    if (ch['Service name'] && dupName(store, ch['Service name'], rec.i)) { toast(`Another service is already called "${ch['Service name']}". Give this one a different name.`, true); return; }
    ui.pending = {};
    const oldF = Number(rec.get('Forecast exit date')) || 0;
    try {
      const n = await store.save(T, rec.i, ch);
      if ('Forecast exit date' in ch && Number(ch['Forecast exit date']) !== oldF) {
        await logForecast(store, rec, oldF, Number(ch['Forecast exit date']) || 0);
        ui.logged = true;
      }
      if (ch['TSA ID']) ui.sel = ch['TSA ID'];
      toast((n ? `Saved ${n} change${n === 1 ? '' : 's'} to the workbook` : 'Nothing changed') + (ui.logged ? '. The forecast move is logged in TSA Changes.' : '')); ui.logged = false;
      ctx.rerender();
    } catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  // Exit tab: the date change route, decisions waiting, and the impact of a forecast move as you type.
  let exitBox = null;
  if (ui.tab === 'Exit') {
    const planned = Number(rec.get('Planned exit date')) || 0;
    const waiting = pendingFor(store, rec.get('TSA ID'));
    const fImpact = h('div.small', { style: { color: 'var(--a-fg)' } });
    const showF = () => {
      const f = Number(form.collect()['Forecast exit date'] ?? ui.pending['Forecast exit date'] ?? rec.get('Forecast exit date')) || 0;
      const i = f && planned && f > planned ? impactOf(store, rec, planned, f) : null;
      fImpact.replaceChildren(...(i ? [h('b', 'Forecast after the planned exit. '), i.lines.join(' '), h('br'), 'Saving logs this in TSA Changes. To move the planned date itself, process a date change.'] : []));
    };
    form.el.addEventListener('input', showF); form.el.addEventListener('change', showF);
    showF();
    exitBox = h('div.card', { style: { padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--page)' } },
      fImpact,
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
        h('button.btn', { type: 'button', onclick: () => openDateChange(ctx, rec), title: 'Raise a change request to move the planned exit date. It moves only when the forum approves.' }, 'Process a date change'),
        h('span.small.muted', waiting.length ? `${waiting.length} waiting for a decision` : 'No date changes waiting')),
      waiting.map((cr) => h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid var(--line-soft)', paddingTop: '6px' } },
        h('span.chip.Amber', cr.get('Status') || 'Pending'),
        h('span.small', { style: { flex: '1 1 200px' } }, `${cr.get('CR ID')} → ${fmtDate(cr.get('Proposed exit date'))} · ${cr.get('Approval forum') || 'forum to pick'}`),
        h('button.btn.btn-sm', { type: 'button', onclick: () => openDecision(ctx, cr) }, 'Record decision'))));
  }
  return h('aside.panel', { 'aria-label': 'Service details' },
    h('div.panel-head',
      h('span.panel-id', `${rec.get('TSA ID')} · ${rec.get('Direction') === 'Reverse' ? 'Reverse TSA' : 'TSA'} · ${rec.get('Status')}`),
      h('h2.panel-title', rec.get('Service name')),
      h('div.tabs', { role: 'tablist' }, Object.keys(TABS).map((t) => h('button.tab', { type: 'button', role: 'tab', 'aria-selected': String(ui.tab === t),
        onclick: () => { Object.assign(ui.pending, form.collect()); ui.tab = t; ctx.rerender(); } }, t)))),
    h('div.panel-body', form.el, exitBox),
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
    if (dupName(store, v['Service name'], null)) { toast(`A service called "${v['Service name']}" is already in the register. Give this one a different name.`, true); return; }
    if (store.records(T).some((r) => r.get('TSA ID') === v['TSA ID'])) { toast(`${v['TSA ID']} is already in the register.`, true); return; }
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
