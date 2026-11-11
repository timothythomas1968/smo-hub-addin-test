// The other registers (0.10 item 2): one screen design, set up per table. A searchable list with status filters,
// and the same edit panel as the TSA register, built from the workbook's column definitions (schema.json).
// Each has a worksheet behind it, so the workbook still works without the add-in.
import { h, fmtDate, fmtMonth, fmtMoney, toast, ed, asOf } from '../util.js?v=0.10.3.20261111202844';
import { buildForm, personLabel } from '../form.js?v=0.10.3.20261111202844';
import { LIVE } from '../live.js?v=0.10.3.20261111202844';

/** cfg: t (table), title, lede, id (ID column), name (title column), cols [[header, label, kind]], status (column),
 *  search [headers], use (set-up answer that switches the module on), late(r, T) for the "Overdue" filter. */
export function registerScreen(cfg) {
  const ui = { q: '', f: 'all', sel: null, adding: false };
  return {
    tables: [cfg.t, ...(cfg.also || [])],
    use: cfg.use,
    render(ctx) {
      const { store } = ctx;
      const n = store.names, T = asOf(n), sym = n.CcySym || '';
      if (!store.has(cfg.t) || (cfg.use && n[cfg.use] === 'N')) {
        return h('div.page', h('div.page-head', h('div', h('h1', ed(cfg.title)), h('p.lede', ed(cfg.lede)))),
          h('div.banner.info', `This part of the Hub is not switched on for this programme, or not in this edition. ${cfg.use ? 'Switch it on in the set-up wizard.' : ''}`));
      }
      if (ctx.arg && !ctx.arg.used) { ctx.arg.used = true; if (ctx.arg.id) { ui.selId = ctx.arg.id; ui.f = 'all'; ui.q = ''; } if (ctx.arg.filter) ui.f = ctx.arg.filter; }
      const all = store.records(cfg.t);
      const st = (r) => (cfg.status ? String(r.get(cfg.status) || '') : '');
      const statuses = cfg.status ? [...new Set(all.map(st).filter(Boolean))] : [];
      const tests = { all: ['All', () => true] };
      if (cfg.late) tests.late = ['Overdue', (r) => cfg.late(r, T)];
      statuses.forEach((s) => { tests['s:' + s] = [s, (r) => st(r) === s]; });
      if (!tests[ui.f]) ui.f = 'all';
      const q = ui.q.toLowerCase();
      const match = (r) => !q || (cfg.search || [cfg.id, cfg.name]).some((c) => String(r.get(c)).toLowerCase().includes(q));
      const rows = all.filter(tests[ui.f][1]).filter(match);
      if (ui.selId != null) { const f = all.find((r) => String(r.get(cfg.id)) === String(ui.selId)); if (f) ui.sel = f.i; ui.selId = null; }
      let sel = all.find((r) => r.i === ui.sel) || null;   // selected by row: an ID is only known after the workbook recalculates
      if (!sel && !ui.adding && rows.length) { sel = rows[0]; ui.sel = sel.i; }
      const rerender = () => ctx.rerender();
      const fmt = (r, [hd, , kind]) => {
        const v = r.get(hd);
        if (kind === 'date') return fmtDate(v);
        if (kind === 'month') return fmtMonth(v);
        if (kind === 'money') return fmtMoney(v, sym) || '–';
        if (kind === 'chip') return v ? h('span.chip', { class: String(v).split(' ')[0] }, v) : '–';
        if (kind === 'person') return v ? personLabel(store, v) : '';
        return v === '' || v == null ? '' : String(v);
      };
      const search = h('input.search', { id: 'rq-' + cfg.t, type: 'search', placeholder: cfg.placeholder || 'Search', value: ui.q });
      search.addEventListener('input', () => { ui.q = search.value; const p = search.selectionStart; rerender(); setTimeout(() => { const s = document.getElementById('rq-' + cfg.t); if (s) { s.focus(); s.setSelectionRange(p, p); } }); });
      const table = h('div.tbl-wrap',
        h('table.grid',
          h('thead', h('tr', cfg.cols.map(([hd, label, kind]) => h('th', { style: kind === 'money' ? { textAlign: 'right' } : null }, label || ed(hd))))),
          h('tbody', rows.map((r) => {
            const id = r.get(cfg.id);
            const late = cfg.late && cfg.late(r, T);
            const tr = h('tr.pick', { class: sel && sel.i === r.i ? 'sel' : null, tabindex: '0', onclick: () => { ui.sel = r.i; ui.adding = false; rerender(); } },
              cfg.cols.map((c, i) => h(i === 0 ? 'td.id' : c[2] === 'money' ? 'td.num' : c[2] === 'date' || c[2] === 'month' ? 'td.nowrap' : 'td',
                i === 1 ? { style: { fontWeight: 600, minWidth: cfg.wide ? '220px' : null } } : null,
                fmt(r, c), i === 0 && late ? h('div.small', { style: { color: 'var(--r-fg)', fontWeight: 600 } }, 'overdue') : null)));
            tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') tr.click(); });
            return tr;
          }))),
        rows.length ? null : h('p.muted', { style: { padding: '16px' } }, all.length ? 'Nothing matches.' : 'Nothing here yet.'));
      return h('div.page',
        h('div.page-head',
          h('div', h('h1', ed(cfg.title)), h('p.lede', ed(cfg.lede))),
          h('button.btn', { type: 'button', onclick: () => store.show(cfg.t, sel ? sel.i : null).catch((e) => toast(e.message, true)) }, 'Show in the worksheet'),
          h('button.btn.btn-primary', { type: 'button', onclick: () => { ui.adding = true; ui.sel = null; rerender(); } }, `+ Add ${cfg.one || 'an item'}`)),
        h('div.filters', search,
          Object.entries(tests).map(([k, [label, fn]]) => h('button.fchip', { type: 'button', 'aria-pressed': String(ui.f === k), onclick: () => { ui.f = k; rerender(); } }, label, h('span.n', String(all.filter(fn).length))))),
        h('div.row-wrap', table, ui.adding ? addPanel(ctx, cfg, ui) : editPanel(ctx, cfg, ui, sel)));
    }
  };
}

function fieldsFor(store, cfg) {
  return store.schema[cfg.t].cols.filter((c) => !(c.h === cfg.id && c.t === 'C')).map((c) => (c.h === cfg.name ? { h: c.h, full: true } : c.f === 'long' ? { h: c.h, full: true } : c.h));
}

function editPanel(ctx, cfg, ui, rec) {
  const { store } = ctx;
  if (!rec) return h('aside.panel', h('div.panel-empty', 'Select an item to see it here.'));
  const form = buildForm(store, cfg.t, rec, fieldsFor(store, cfg));
  const save = async () => {
    const ch = form.collect();
    if (!Object.keys(ch).length) { toast('Nothing changed'); return; }
    try { const n = await store.save(cfg.t, rec.i, ch); toast(`Saved ${n} change${n === 1 ? '' : 's'} to the workbook`); ctx.rerender(); }
    catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  return h('aside.panel', { 'aria-label': 'Details' },
    h('div.panel-head', h('span.panel-id', `${rec.get(cfg.id)}${cfg.status && rec.get(cfg.status) ? ' · ' + rec.get(cfg.status) : ''}`), h('h2.panel-title', rec.get(cfg.name) || rec.get(cfg.id))),
    h('div.panel-body', form.el),
    h('div.panel-foot',
      h('button.btn.btn-primary', { type: 'button', onclick: save }, 'Save'),
      h('button.btn', { type: 'button', onclick: () => store.show(cfg.t, rec.i).catch((e) => toast(e.message, true)) }, 'Show row'),
      cfg.remove ? h('button.btn', { type: 'button', style: { marginLeft: 'auto', color: 'var(--r-fg)' }, onclick: () => removeRecord(ctx, cfg, ui, rec) }, cfg.remove) : null,
      h('span.small.muted', { style: { flex: '1 1 100%' } }, ed('Grey italic values are suggested by the Hub: type over them to set your own. Bold values are calculated.'))));
}

// People (Tim, 0.9.5): take someone off the register when they leave the programme or the company. Their name stays on the items they
// own until those are given to someone else, so the warning lists them first.
const OWNED = [['tblTSA', ['Provider service owner', 'Recipient service owner'], 'service'], ['tblRisks', ['Owner'], 'risk'], ['tblIssues', ['Owner'], 'issue'],
  ['tblActions', ['Owner'], 'action'], ['tblDecisions', ['Owner'], 'decision']];
function removeRecord(ctx, cfg, ui, rec) {
  const { store } = ctx;
  const who = String(rec.get(cfg.name) || '');
  const closed = /^(Exited|Terminated|Closed|Remove|Made|Withdrawn|Cancelled|Canceled|Complete)$/;
  const owned = OWNED.map(([t, cols, word]) => {
    const n = store.has(t) ? store.records(t).filter((r) => cols.some((c) => r.get(c) === who) && !closed.test(String(r.get('Status') || r.get('Status (adopt or remove)') || ''))).length : 0;
    return n ? `${n} open ${word}${n === 1 ? '' : 's'}` : null;
  }).filter(Boolean);
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) back.remove(); } });
  const go = async () => {
    try { await store.clearRow(cfg.t, rec.i); back.remove(); ui.sel = null; ui.selId = null; toast(`${who || 'The person'} is off the register`); ctx.rerender(); }
    catch (e) { toast('Could not remove: ' + (e.message || e), true); }
  };
  back.appendChild(h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Remove a person' },
    h('h2', `Remove ${who || 'this person'}?`),
    h('p', 'Their row on the People sheet is cleared, so they drop out of every dropdown. Nothing else is deleted.'),
    owned.length ? h('div.banner.warn', `${who} still owns ${owned.join(', ')}. Their name stays on those until you give them to someone else.`) : null,
    h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'),
      h('button.btn.btn-primary', { type: 'button', onclick: go }, 'Remove'))));
  document.body.appendChild(back);
}

function addPanel(ctx, cfg, ui) {
  const { store } = ctx;
  const fields = fieldsFor(store, cfg).filter((f) => (store.colDef(cfg.t, f.h || f) || {}).t !== 'C' || ((LIVE[cfg.t] || {}).calc || {})[f.h || f]);
  const form = buildForm(store, cfg.t, null, fields, { defaults: cfg.defaults ? cfg.defaults(store) : {} });
  const add = async () => {
    const v = form.collect();
    if (!v[cfg.name] && !v[cfg.live || cfg.name]) { toast(`Type the ${ed(cfg.name).toLowerCase()} first`, true); return; }
    try {
      const i = await store.add(cfg.t, v);
      const rec = store.records(cfg.t).find((r) => r.i === i);
      ui.adding = false; ui.sel = i;
      toast(`Added to the workbook${rec && rec.get(cfg.id) ? ': ' + rec.get(cfg.id) : ''}`);
      ctx.rerender();
    } catch (e) { toast('Could not add: ' + (e.message || e), true); }
  };
  return h('aside.panel', { 'aria-label': 'Add' },
    h('div.panel-head', h('span.panel-id', 'New'), h('h2.panel-title', `Add ${cfg.one || 'an item'}`)),
    h('div.panel-body', h('p.small.muted', { style: { margin: 0 } }, 'Leave a box empty to let the Hub suggest it.'), form.el),
    h('div.panel-foot',
      h('button.btn.btn-primary', { type: 'button', onclick: add }, 'Add'),
      h('button.btn', { type: 'button', onclick: () => { ui.adding = false; ctx.rerender(); } }, 'Cancel')));
}

const num = (v) => Number(v) || 0;
const open = (r, c, done) => !done.includes(String(r.get(c)));

export const people = registerScreen({
  t: 'tblPeople', title: 'People', one: 'a person', id: 'Name', name: 'Name', status: 'Organisation', wide: true, remove: 'Remove from the register',
  also: ['tblTSA', 'tblRisks', 'tblIssues', 'tblActions', 'tblDecisions'],
  lede: 'Everyone on the programme: owners, leads, chairs and contacts. Search by name, workstream or role. Email and the rest are in the panel.',
  placeholder: 'Search by name, role, workstream or organisation', search: ['Name', 'Role', 'Workstream or function', 'Organisation', 'Email'],
  cols: [['Name', 'Name'], ['Role'], ['Workstream or function'], ['Organisation']]
});
export const changes = registerScreen({
  t: 'tblChange', title: 'TSA changes', one: 'a change request', id: 'CR ID', name: 'Title', status: 'Status', live: 'Request type', also: ['tblTSA'],
  lede: 'Every change request: extensions, early exits, date changes, disputes and their decisions. To move a planned exit date, use Process a date change on the TSA register.',
  placeholder: 'Search by CR, service or title', search: ['CR ID', 'TSA ID', 'Title', 'Request type'],
  cols: [['CR ID'], ['Title'], ['Request type'], ['TSA ID'], ['Decision due', null, 'date'], ['Status']],
  late: (r, T) => /^(Draft|Submitted|Pending|Under review)$/.test(r.get('Status')) && num(r.get('Decision due')) && num(r.get('Decision due')) < T
});
export const invoices = registerScreen({
  t: 'tblInvoices', title: 'Invoices log', one: 'an invoice', id: 'Invoice ID', name: 'Their invoice number', status: 'Status', live: 'Service month', use: 'Use_INV',
  lede: 'Invoices received and issued, checked against the expected TSA fees. A variance outside the threshold shows Check.',
  placeholder: 'Search by invoice, number or month', search: ['Invoice ID', 'Their invoice number', 'Issued by'],
  cols: [['Invoice ID'], ['Their invoice number', 'Invoice number'], ['Issued by'], ['Service month', 'Month', 'month'], ['Total billed (invoice currency)', 'Billed', 'money'], ['Check'], ['Status']],
  late: (r, T) => !['Paid'].includes(r.get('Status')) && num(r.get('Payment due')) && num(r.get('Payment due')) < T
});
export const obligations = registerScreen({
  t: 'tblOBL', title: 'Obligations', one: 'an obligation', id: 'OBL ID', name: 'Description', status: 'Status (adopt or remove)', use: 'Use_OBL',
  lede: 'Recurring duties and entitlements in the agreements: reports, notices, audits and meetings, with the next due date worked out.',
  placeholder: 'Search by obligation, agreement or clause', search: ['OBL ID', 'Description', 'Agreement', 'Clause', 'Owner'],
  cols: [['OBL ID'], ['Description'], ['Agreement'], ['Clause'], ['Next due date', 'Next due', 'date'], ['Owner', null, 'person']],
  late: (r, T) => r.get('Status (adopt or remove)') === 'Open' && num(r.get('Next due date')) && num(r.get('Next due date')) < T
});
export const thirdparties = registerScreen({
  t: 'tblTPC', title: 'Third parties', one: 'a contract', id: 'TPC ID', name: 'Contract', status: 'Status', use: 'Use_TPC',
  lede: 'Vendor contracts the services rely on, and the consents, assignments or replacements each one needs.',
  placeholder: 'Search by vendor, contract or service', search: ['TPC ID', 'Vendor', 'Contract', 'TSA ID', 'Owner'],
  cols: [['TPC ID'], ['Vendor'], ['Contract'], ['Action needed'], ['Response due', null, 'date'], ['Status']],
  late: (r, T) => open(r, 'Status', ['Agreed', 'Not needed', 'Refused']) && num(r.get('Response due')) && num(r.get('Response due')) < T
});
export const datareq = registerScreen({
  t: 'tblDataReq', title: 'Data requests', one: 'a data request', id: 'DR ID', name: 'Data set requested', status: 'Status', use: 'Use_DR',
  lede: 'Data asked of the other party, with due dates and days late.',
  placeholder: 'Search by data set, purpose or service', search: ['DR ID', 'Data set requested', 'Purpose', 'TSA ID'],
  cols: [['DR ID'], ['Data set requested', 'Data set'], ['Requested from'], ['Due date', 'Due', 'date'], ['Status']],
  late: (r, T) => open(r, 'Status', ['Delivered', 'Rejected', 'Cancelled', 'Canceled']) && num(r.get('Due date')) && num(r.get('Due date')) < T
});
export const workorders = registerScreen({
  t: 'tblWO', title: 'Work orders', one: 'a work order', id: 'WO ID', name: 'Title', status: 'Status', use: 'Use_WO',
  lede: 'Extra work outside the TSA fees: quotes, approvals, invoices to date.',
  placeholder: 'Search by work order or service', search: ['WO ID', 'Title', 'Scope', 'TSA ID'],
  cols: [['WO ID'], ['Title'], ['Providing party', 'Provider'], ['Approved amount', 'Approved', 'money'], ['Target completion', 'Target', 'date'], ['Status']],
  late: (r, T) => open(r, 'Status', ['Complete', 'Rejected', 'Cancelled', 'Canceled']) && num(r.get('Target completion')) && num(r.get('Target completion')) < T
});
