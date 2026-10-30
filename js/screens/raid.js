// RAID and actions: risks, issues, decisions, assumptions and dependencies, and the action log, in one list.
import { h, fmtDate, toast, toSerial } from '../util.js?v=0.6.0.20261030221728';
import { buildForm } from '../form.js?v=0.6.0.20261030221728';

const TYPES = {
  RSK: { t: 'tblRisks', one: 'Risk', many: 'Risks', id: 'Risk ID', title: 'Risk', st: 'Status (adopt or remove)', raised: 'Date raised' },
  ISS: { t: 'tblIssues', one: 'Issue', many: 'Issues', id: 'Issue ID', title: 'Issue', st: 'Status', raised: 'Date raised' },
  DEC: { t: 'tblDecisions', one: 'Decision', many: 'Decisions', id: 'Decision ID', title: 'Decision needed', st: 'Status' },
  AD: { t: 'tblAssumpDep', one: 'Assumption or dependency', many: 'Assumptions & dependencies', id: 'ID', title: 'Assumption or dependency', st: 'Status (adopt or remove)' },
  AC: { t: 'tblActions', one: 'Action', many: 'Actions', id: 'AC ID', title: 'Action', st: 'Status' }
};
const DONE = new Set(['Closed', 'Remove', 'Removed', 'Made', 'Withdrawn', 'Cancelled']);
const ui = { tab: 'ALL', showClosed: false, sel: null, adding: null, ws: null, suggestedOnly: false };

export default {
  tables: Object.values(TYPES).map((x) => x.t).concat(['tblWorkstreams']),
  render(ctx) {
    const { store, arg } = ctx;
    const RD = Number(store.names.RD) || 0;
    if (arg && !arg.used) {
      arg.used = true;
      ui.ws = arg.ws || null; ui.suggestedOnly = !!arg.suggested; ui.showClosed = false;
      ui.tab = arg.tab || 'ALL';
      if (arg.id) ui.sel = arg.tab + ':' + arg.id;
      if (arg.add) { ui.adding = 'RSK'; ui.sel = null; }
    }
    const wsName = Object.fromEntries(store.records('tblWorkstreams').map((r) => [r.get('Code'), r.get('Name')]));

    // every record, tagged with its type
    const items = [];
    for (const [k, cfg] of Object.entries(TYPES)) {
      for (const r of store.records(cfg.t)) items.push({ k, cfg, r, key: k + ':' + r.get(cfg.id), st: r.get(cfg.st) || '' });
    }
    const wsOk = (x) => !ui.ws || x.r.get('Workstream') === ui.ws || (ui.ws === 'Programme' && !x.r.get('Workstream'));
    const vis = (x) => (ui.showClosed || !DONE.has(x.st)) && wsOk(x) && (!ui.suggestedOnly || x.st === 'Suggested');
    const inTab = (x, t) => t === 'ALL' || x.k === t;
    const list = items.filter((x) => inTab(x, ui.tab) && vis(x))
      .sort((a, b) => (a.st === 'Suggested') - (b.st === 'Suggested') || rank(b) - rank(a));
    const hidden = items.filter((x) => inTab(x, ui.tab) && wsOk(x) && DONE.has(x.st)).length;
    let sel = ui.adding ? null : items.find((x) => x.key === ui.sel) || null;
    if (!sel && !ui.adding && list.length) { sel = list[0]; ui.sel = sel.key; }

    const open = (k) => items.filter((x) => x.k === k && !DONE.has(x.st) && x.st !== 'Suggested');
    const tile = (label, value, tone, onclick) => h('button.tile', { type: 'button', class: tone, onclick }, h('span.tile-label', label), h('span.tile-value', String(value)));
    const redRisks = open('RSK').filter((x) => x.r.get('Rating') === 'Red').length;
    const due30 = open('AC').filter((x) => { const d = Number(x.r.get('Due date')); return d && d <= RD + 30; }).length;
    const waiting = items.filter((x) => x.st === 'Suggested').length;
    const go = (patch) => { Object.assign(ui, patch); ctx.rerender(); };

    return h('div.page',
      h('div.page-head',
        h('div', h('h1', 'RAID and actions'), h('p.lede', 'Risks, issues, decisions, assumptions and dependencies, and actions. Select any item to review or edit it.')),
        h('button.btn', { type: 'button', 'aria-pressed': String(ui.showClosed), onclick: () => go({ showClosed: !ui.showClosed }) }, ui.showClosed ? 'Hide closed and removed' : 'Show closed and removed'),
        h('button.btn.btn-primary', { type: 'button', onclick: () => go({ adding: ui.tab === 'ALL' ? 'RSK' : ui.tab, sel: null }) }, '+ Add item')),
      h('div.tiles',
        tile('Red risks', redRisks, redRisks ? 'red' : null, () => go({ tab: 'RSK', suggestedOnly: false })),
        tile('Open issues', open('ISS').length, null, () => go({ tab: 'ISS', suggestedOnly: false })),
        tile('Decisions needed', open('DEC').length, null, () => go({ tab: 'DEC', suggestedOnly: false })),
        tile('Actions due in 30 days', due30, null, () => go({ tab: 'AC', suggestedOnly: false })),
        tile('Waiting for review', waiting, waiting ? 'info' : null, () => go({ tab: 'ALL', suggestedOnly: true }))),
      (ui.ws || ui.suggestedOnly) ? h('div.filters',
        ui.ws ? h('button.fchip', { type: 'button', 'aria-pressed': 'true', onclick: () => go({ ws: null }) }, `Workstream: ${wsName[ui.ws] || ui.ws}  ✕`) : null,
        ui.suggestedOnly ? h('button.fchip', { type: 'button', 'aria-pressed': 'true', onclick: () => go({ suggestedOnly: false }) }, 'Suggested only  ✕') : null) : null,
      h('div.tabs', { role: 'tablist', 'aria-label': 'Type' },
        [['ALL', 'All'], ...Object.entries(TYPES).map(([k, c]) => [k, c.many])].map(([k, label]) =>
          h('button.tab', { type: 'button', role: 'tab', 'aria-selected': String(ui.tab === k), onclick: () => go({ tab: k }) },
            label, h('span.n', String(items.filter((x) => inTab(x, k) && vis(x)).length))))),
      h('div.row-wrap',
        h('div.list',
          list.map((x) => row(x, sel, ctx, wsName)),
          list.length ? null : h('p.muted', { style: { margin: 0 } }, 'Nothing open here.'),
          !ui.showClosed && hidden ? h('p.small.muted', { style: { margin: '4px 0 0' } }, `${hidden} closed or removed item${hidden === 1 ? ' is' : 's are'} hidden. They stay in the workbook for the record.`) : null),
        ui.adding ? addPanel(ctx) : editPanel(ctx, sel)));
  }
};

function rank(x) {
  const r = x.r;
  if (x.k === 'RSK') return Number(r.get('Score')) || 0;
  if (x.k === 'ISS') return { High: 20, Medium: 10, Low: 5 }[r.get('Priority')] || 0;
  if (x.k === 'AC') return r.get('Overdue') === 'Overdue' ? 30 : 1;
  return 8;
}

function badge(x) {
  const r = x.r;
  if (x.k === 'RSK') return r.get('Rating') ? h('span.chip', { class: r.get('Rating') }, r.get('Rating')) : null;
  if (x.k === 'ISS') return r.get('Priority') ? h('span.chip', { class: r.get('Priority') }, r.get('Priority')) : null;
  if (x.k === 'AD') return h('span.chip', r.get('Type') || 'Item');
  if (x.k === 'AC') return r.get('Overdue') === 'Overdue' ? h('span.chip.Red', 'Overdue') : h('span.chip', 'Action');
  return h('span.chip.blue', 'Decision');
}

function meta(x, wsName) {
  const r = x.r, parts = [];
  const where = r.get('TSA ID') || wsName[r.get('Workstream')] || r.get('Workstream');
  if (x.k === 'AC') {
    parts.push([r.get('Forum'), fmtDate(r.get('Meeting date'))].filter(Boolean).join(' '), r.get('Owner'));
    if (r.get('Due date')) parts.push((x.st === 'Closed' ? 'closed ' + fmtDate(r.get('Closed on')) : 'due ' + fmtDate(r.get('Due date'))));
  } else {
    if (x.st === 'Suggested') parts.push('From the starter library');
    parts.push(where, r.get('Owner'));
    if (x.k === 'RSK' && r.get('Score')) parts.push(`${r.get('Likelihood (1-5)')} × ${r.get('Impact (1-5)')}`);
    if (x.k === 'ISS' && r.get('Due date')) parts.push('due ' + fmtDate(r.get('Due date')));
    if ((x.k === 'DEC' || x.k === 'AD') && r.get('Needed by')) parts.push('needed by ' + fmtDate(r.get('Needed by')));
    if (x.k === 'DEC' && r.get('Decided by')) parts.unshift(r.get('Decided by'));
  }
  return parts.filter(Boolean).join(' · ');
}

function row(x, sel, ctx, wsName) {
  const { store } = ctx;
  const isSel = sel && sel.key === x.key;
  const setStatus = (v) => async (e) => {
    e.stopPropagation();
    try { await store.save(x.cfg.t, x.r.i, { [x.cfg.st]: v }); toast(v === 'Open' ? 'Adopted: now open' : 'Removed: hidden from the list, kept in the workbook'); ctx.rerender(); }
    catch (err) { toast('Could not save: ' + (err.message || err), true); }
  };
  return h('div.item', { class: [isSel ? 'sel' : '', x.st === 'Suggested' ? 'suggested' : '', DONE.has(x.st) ? 'faded' : ''].join(' ') },
    h('button.item-main', { type: 'button', onclick: () => { ui.sel = x.key; ui.adding = null; ctx.rerender(); } },
      h('span.item-id', x.r.get(x.cfg.id)),
      h('span.item-text', h('span.item-title', x.r.get(x.cfg.title)), h('span.item-meta', meta(x, wsName))),
      badge(x)),
    h('div.item-side',
      x.st === 'Suggested'
        ? [h('span.tag-sugg', 'SUGGESTED'), h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: setStatus('Open') }, 'Adopt'), h('button.btn.btn-sm', { type: 'button', onclick: setStatus('Remove') }, 'Remove')]
        : h('span.item-status', x.st)));
}

function fieldsFor(store, cfg) {
  const def = store.schema[cfg.t];
  return def.cols.filter((c) => c.h !== cfg.id && c.k !== 'ID').map((c) => (c.h === cfg.title ? { h: c.h, full: true, area: true, rows: 2 } : c.h));
}

function editPanel(ctx, x) {
  const { store } = ctx;
  if (!x) return h('aside.panel', h('div.panel-empty', 'Select an item to see it here.'));
  const form = buildForm(store, x.cfg.t, x.r, fieldsFor(store, x.cfg));
  const save = async () => {
    const ch = form.collect();
    if (!Object.keys(ch).length) { toast('Nothing changed'); return; }
    try { const n = await store.save(x.cfg.t, x.r.i, ch); toast(`Saved ${n} change${n === 1 ? '' : 's'} to the workbook`); ctx.rerender(); }
    catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  return h('aside.panel', { 'aria-label': 'Item details' },
    h('div.panel-head', h('span.panel-id', `${x.r.get(x.cfg.id)} · ${x.cfg.one}`), h('h2.panel-title', x.r.get(x.cfg.title))),
    h('div.panel-body', form.el),
    h('div.panel-foot',
      h('button.btn.btn-primary', { type: 'button', onclick: save }, 'Save'),
      h('button.btn', { type: 'button', onclick: () => store.show(x.cfg.t, x.r.i).catch((e) => toast(e.message, true)) }, 'Show row'),
      h('span.small.muted', { style: { flex: '1 1 100%' } }, 'To take an item off the list, set its status to Remove or Closed. It stays in the workbook for the record.')));
}

function addPanel(ctx) {
  const { store } = ctx;
  const cfg = TYPES[ui.adding];
  const today = toSerial(new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())));
  const defaults = cfg.raised ? { [cfg.raised]: today } : {};
  const form = buildForm(store, cfg.t, null, fieldsFor(store, cfg).filter((f) => (store.colDef(cfg.t, f.h || f) || {}).t !== 'C'), { defaults });
  const add = async () => {
    const v = form.collect();
    if (cfg.raised && !(cfg.raised in v)) v[cfg.raised] = today;
    if (!v[cfg.title]) { toast(`Type the ${cfg.title.toLowerCase()} first`, true); return; }
    try {
      const i = await store.add(cfg.t, v);
      const rec = store.records(cfg.t).find((r) => r.i === i);
      ui.adding = null; ui.sel = ui.adding + ':' + (rec ? rec.get(cfg.id) : '');
      ui.sel = Object.keys(TYPES).find((k) => TYPES[k] === cfg) + ':' + (rec ? rec.get(cfg.id) : '');
      toast(`${cfg.one} ${rec ? rec.get(cfg.id) : ''} added to the workbook`);
      ctx.rerender();
    } catch (e) { toast('Could not add: ' + (e.message || e), true); }
  };
  return h('aside.panel', { 'aria-label': 'Add an item' },
    h('div.panel-head', h('span.panel-id', 'New item'), h('h2.panel-title', `Add ${cfg.one.toLowerCase().startsWith('a') ? 'an' : 'a'} ${cfg.one.toLowerCase()}`),
      h('div.opts', { role: 'group', 'aria-label': 'Type', style: { margin: '8px 0 12px' } },
        Object.entries(TYPES).map(([k, c]) => h('button', { type: 'button', 'aria-pressed': String(ui.adding === k), onclick: () => { ui.adding = k; ctx.rerender(); } }, c.one)))),
    h('div.panel-body', h('p.small.muted', { style: { margin: 0 } }, 'Leave a box empty to let the Hub suggest it (owner, workstream, due date and so on).'), form.el),
    h('div.panel-foot',
      h('button.btn.btn-primary', { type: 'button', onclick: add }, 'Add'),
      h('button.btn', { type: 'button', onclick: () => { ui.adding = null; ctx.rerender(); } }, 'Cancel')));
}
