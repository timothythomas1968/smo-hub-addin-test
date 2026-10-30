// Shared screen for the Day 1 checklist and the first 100 days plan: a long task list with
// filters, a status you can change in the row, an edit panel, add and delete.
import { h, fmtDate, toast, plural } from '../util.js';
import { buildForm } from '../form.js';

export function checklist(cfg) {
  // cfg: { t, title, lede, id, dueLabel, extraTile(store, recs), lateTest(r, RD), statusTags }
  const ui = { st: 'open', ws: '', q: '', sel: null, adding: false, del: null };

  return {
    tables: [cfg.t, 'tblWorkstreams'],
    render(ctx) {
      const { store } = ctx;
      const RD = Number(store.names.RD) || 0;
      const recs = store.records(cfg.t);
      const wsName = Object.fromEntries(store.records('tblWorkstreams').map((r) => [r.get('Code'), r.get('Name')]));
      const stOf = (r) => r.get('Status') || 'Not started';
      const late = (r) => cfg.lateTest(r, RD);
      const filters = {
        open: ['Still to do', (r) => !['Complete', 'Not required'].includes(stOf(r))],
        late: ['Late', late],
        prog: ['In progress', (r) => stOf(r) === 'In progress'],
        done: ['Complete', (r) => stOf(r) === 'Complete'],
        nr: ['Not required', (r) => stOf(r) === 'Not required'],
        all: ['All', () => true]
      };
      const q = ui.q.toLowerCase();
      const rows = recs.filter(filters[ui.st][1]).filter((r) => !ui.ws || r.get('Workstream') === ui.ws)
        .filter((r) => !q || ['Task', 'Owner', 'Notes', cfg.id, 'TSA ID'].some((c) => String(r.get(c)).toLowerCase().includes(q)))
        .sort((a, b) => (Number(a.get('Due date')) || 1e9) - (Number(b.get('Due date')) || 1e9));
      let sel = ui.adding ? null : recs.find((r) => r.i === ui.sel) || null;
      if (!sel && !ui.adding && rows.length) { sel = rows[0]; ui.sel = sel.i; }

      const req = recs.filter((r) => stOf(r) !== 'Not required');
      const done = req.filter((r) => stOf(r) === 'Complete').length;
      const mand = req.filter((r) => r.get('Mandatory or discretionary') === 'Mandatory');
      const mandDone = mand.filter((r) => stOf(r) === 'Complete').length;
      const nLate = recs.filter(late).length;
      const statusOpts = store.options(store.colDef(cfg.t, 'Status')) || ['Not started', 'In progress', 'Complete', 'Not required'];
      const go = (p) => { Object.assign(ui, p); ctx.rerender(); };

      const setStatus = async (r, v) => {
        try {
          const ch = { Status: v };
          if (v === 'Complete' && store.colDef(cfg.t, 'Completed on') && !r.get('Completed on')) ch['Completed on'] = todaySerial();
          await store.save(cfg.t, r.i, ch);
          toast(`${r.get(cfg.id) || 'Task'}: ${v}`);
          ctx.rerender();
        } catch (e) { toast('Could not save: ' + (e.message || e), true); }
      };

      const search = h('input.search', { id: cfg.t + '-q', type: 'search', placeholder: 'Search tasks, owners or IDs', value: ui.q });
      search.addEventListener('input', () => { ui.q = search.value; const pos = search.selectionStart; ctx.rerender(); setTimeout(() => { const n = document.getElementById(cfg.t + '-q'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); });
      const wsSel = h('select.search', { 'aria-label': 'Workstream', style: { flex: '0 1 220px' } }, h('option', { value: '' }, 'All workstreams'),
        [...new Set(recs.map((r) => r.get('Workstream')).filter(Boolean))].map((w) => h('option', { value: w }, wsName[w] || w)));
      wsSel.value = ui.ws;
      wsSel.addEventListener('change', () => go({ ws: wsSel.value }));

      const table = h('div.tbl-wrap',
        h('table.grid',
          h('thead', h('tr', ['ID', 'Task', 'WS', 'Owner', cfg.dueLabel, 'Status'].map((c) => h('th', c)))),
          h('tbody', rows.map((r) => {
            const s = h('select', { 'aria-label': 'Status', style: { border: '1px solid var(--line-strong)', borderRadius: '6px', padding: '4px 6px', background: '#fff', fontSize: '12px', fontWeight: 600 } },
              statusOpts.map((o) => h('option', { value: o }, o)));
            s.value = stOf(r);
            s.addEventListener('click', (e) => e.stopPropagation());
            s.addEventListener('change', () => setStatus(r, s.value));
            const isLate = late(r);
            return h('tr.pick', { class: sel && sel.i === r.i ? 'sel' : null, onclick: () => go({ sel: r.i, adding: false, del: null }) },
              h('td.id', r.get(cfg.id) || '(new)'),
              h('td', h('span', { style: { fontWeight: 500 } }, r.get('Task')),
                r.get('Mandatory or discretionary') === 'Mandatory' ? h('span.small.muted', ' · mandatory') : null),
              h('td.muted', r.get('Workstream')),
              h('td', r.get('Owner') || h('span.muted', '–')),
              h('td.nowrap', { style: isLate ? { color: 'var(--r-fg)', fontWeight: 600 } : null }, fmtDate(r.get('Due date')) + (isLate ? ' · late' : '')),
              h('td', s));
          }))),
        rows.length ? null : h('p.muted', { style: { padding: '16px' } }, 'No tasks match.'));

      return h('div.page',
        h('div.page-head',
          h('div', h('h1', cfg.title), h('p.lede', cfg.lede(store))),
          h('button.btn', { type: 'button', onclick: () => store.show(cfg.t, sel ? sel.i : null).catch((e) => toast(e.message, true)) }, 'Show in the worksheet'),
          h('button.btn.btn-primary', { type: 'button', onclick: () => go({ adding: true, sel: null }) }, '+ Add a task')),
        h('div.tiles',
          h('div.tile', h('span.tile-label', 'Complete'), h('span.tile-value', `${done} of ${req.length}`), h('div.bar', { style: { flex: '0 0 8px', marginTop: '4px' } }, h('div', { style: { width: (req.length ? Math.round(done / req.length * 100) : 0) + '%' } }))),
          h('div.tile', h('span.tile-label', 'Mandatory complete'), h('span.tile-value', `${mandDone} of ${mand.length}`)),
          h('button.tile', { type: 'button', class: nLate ? 'red' : 'green', onclick: () => go({ st: 'late' }) }, h('span.tile-label', 'Late'), h('span.tile-value', String(nLate))),
          cfg.extraTile ? cfg.extraTile(store, recs) : null),
        h('div.filters', search, wsSel,
          Object.entries(filters).map(([k, [label, fn]]) => h('button.fchip', { type: 'button', 'aria-pressed': String(ui.st === k), onclick: () => go({ st: k }) },
            label, h('span.n', String(recs.filter(fn).filter((r) => !ui.ws || r.get('Workstream') === ui.ws).length))))),
        h('div.row-wrap', table, ui.adding ? addPanel(ctx) : editPanel(ctx, sel)));
    }
  };

  function fields(store) {
    return store.schema[cfg.t].cols.filter((c) => c.h !== cfg.id).map((c) => (c.h === 'Task' ? { h: 'Task', full: true, area: true, rows: 2 } : c.h));
  }

  function editPanel(ctx, r) {
    const { store } = ctx;
    if (!r) return h('aside.panel', h('div.panel-empty', 'Select a task.'));
    const form = buildForm(store, cfg.t, r, fields(store));
    const save = async () => {
      const ch = form.collect();
      if (!Object.keys(ch).length) { toast('Nothing changed'); return; }
      try { const n = await store.save(cfg.t, r.i, ch); toast(`Saved ${n} change${n === 1 ? '' : 's'} to the workbook`); ctx.rerender(); }
      catch (e) { toast('Could not save: ' + (e.message || e), true); }
    };
    const confirming = ui.del === r.i;
    const del = async () => {
      if (!confirming) { ui.del = r.i; ctx.rerender(); return; }
      try {
        // As the worksheet says: deleting a task means clearing its wording. The row is reused for new tasks.
        const blank = {};
        store.schema[cfg.t].cols.filter((c) => c.t === 'I').forEach((c) => { if (r.get(c.h) !== '') blank[c.h] = ''; });
        await store.save(cfg.t, r.i, blank, { force: true });
        ui.del = null; ui.sel = null;
        toast('Task deleted');
        ctx.rerender();
      } catch (e) { toast('Could not delete: ' + (e.message || e), true); }
    };
    return h('aside.panel', { 'aria-label': 'Task details' },
      h('div.panel-head', h('span.panel-id', `${r.get(cfg.id)} · ${r.get('Status')}`), h('h2.panel-title', r.get('Task'))),
      h('div.panel-body', form.el),
      h('div.panel-foot',
        h('button.btn.btn-primary', { type: 'button', onclick: save }, 'Save'),
        h('button.btn', { type: 'button', onclick: () => store.show(cfg.t, r.i).catch((e) => toast(e.message, true)) }, 'Show row'),
        h('button.btn', { type: 'button', onclick: del, style: confirming ? { borderColor: 'var(--r-bar)', color: 'var(--r-fg)' } : { marginLeft: 'auto' } }, confirming ? 'Click again to delete' : 'Delete'),
        h('span.small.muted', { style: { flex: '1 1 100%' } }, 'If a task does not apply, set it to Not required rather than deleting it, so the record shows it was considered.')));
  }

  function addPanel(ctx) {
    const { store } = ctx;
    const form = buildForm(store, cfg.t, null, fields(store).filter((f) => (store.colDef(cfg.t, f.h || f) || {}).t !== 'C'));
    const add = async () => {
      const v = form.collect();
      if (!v.Task) { toast('Type the task first', true); return; }
      try { ui.sel = await store.add(cfg.t, v); ui.adding = false; ui.st = 'all'; toast('Task added to the workbook'); ctx.rerender(); }
      catch (e) { toast('Could not add: ' + (e.message || e), true); }
    };
    return h('aside.panel', { 'aria-label': 'Add a task' },
      h('div.panel-head', h('span.panel-id', 'New task'), h('h2.panel-title', 'Add a task')),
      h('div.panel-body', h('p.small.muted', { style: { margin: 0 } }, 'Leave the owner and status empty to let the Hub suggest them.'), form.el),
      h('div.panel-foot',
        h('button.btn.btn-primary', { type: 'button', onclick: add }, 'Add task'),
        h('button.btn', { type: 'button', onclick: () => { ui.adding = false; ctx.rerender(); } }, 'Cancel')));
  }
}

export function todaySerial() {
  const d = new Date();
  return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000);
}

export const day1 = checklist({
  t: 'tblDay1', title: 'Day 1 plan', id: 'D1 ID', dueLabel: 'Due',
  lede: (store) => {
    const RD = Number(store.names.RD), close = Number(store.names.CloseDate);
    return RD < close ? `Everything that must be in place for closing on ${fmtDate(close)}: ${plural(close - RD, 'day')} to go.` : `The Day 1 checklist for closing on ${fmtDate(close)}.`;
  },
  lateTest: (r, RD) => !['Complete', 'Not required'].includes(r.get('Status')) && Number(r.get('Due date')) > 0 && Number(r.get('Due date')) < RD,
  extraTile: (store, recs) => {
    const noGo = recs.filter((r) => /no/i.test(String(r.get('Go / no-go')))).length;
    return h('div.tile', { class: noGo ? 'red' : 'green' }, h('span.tile-label', 'Go / no-go'), h('span.tile-value', noGo ? 'NO-GO' : 'GO'), h('span.tile-sub', plural(noGo, 'no-go item')));
  }
});

export const f100 = checklist({
  t: 'tblFirst100', title: 'First 100 days', id: 'ID', dueLabel: 'Due',
  lede: (store) => {
    const RD = Number(store.names.RD), close = Number(store.names.CloseDate), day = RD - close;
    return 'What must be true in the first 100 days so the business is safe, secure and separate. '
      + (day < 0 ? 'Starts at closing.' : day <= 100 ? `Day ${day} of 100.` : `The 100 days ended on ${fmtDate(close + 100)}.`);
  },
  lateTest: (r) => Number(r.get('Days late')) > 0 && !['Complete', 'Not required'].includes(r.get('Status')),
  extraTile: (store, recs) => {
    const sug = recs.filter((r) => r.get('Status') === 'Suggested').length;
    return sug ? h('div.tile.info', h('span.tile-label', 'Suggested'), h('span.tile-value', String(sug)), h('span.tile-sub', 'set a status to adopt')) : null;
  }
});
