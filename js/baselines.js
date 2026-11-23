// Re-baselining (build waves P7; brief docs/briefs/rebaseline.md). The programme office records a new baseline when leadership
// agrees the plan itself has changed. Nothing is overwritten: Baselines keeps every baseline (B0 is the contract as signed) and
// Baseline History keeps the values each one held. A new baseline is saved as a Draft and becomes Current only once its
// approving decision is Made on the Decisions log. Leads never re-baseline.
import { h, toast, fmtDate, plural, isoToSerial, asOf, dateBox } from './util.js?v=0.12.9.20261123225222';

const num = (v) => Number(v) || 0;
const fwd = (store) => store.records('tblTSA').filter((r) => r.get('TSA ID') && r.get('Direction') !== 'Reverse');
const plan = (store) => (store.has('tblPlan') ? store.records('tblPlan').filter((r) => r.get('Activity ID')) : []);

function modal(title, body, actions) {
  document.querySelector('.modal-back')?.remove();
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) back.remove(); } },
    h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { maxWidth: '620px' } }, h('h2', title), body,
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' } }, actions)));
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') back.remove(); });
  document.body.appendChild(back);
  return back;
}

/** The value a baseline holds for an item: its Baseline History row, or else (B0) the contract's initial end date. */
export function baselineValue(store, id, kind, item, field) {
  const hist = store.has('tblBaseHist') ? store.records('tblBaseHist') : [];
  const row = hist.find((r) => r.get('Baseline ID') === id && r.get('What') === kind && r.get('Item ID') === item && r.get('Field') === field);
  if (row) return num(row.get('Value'));
  return null;
}

/** What a re-baseline would move now: services whose working planned exit differs from the current baseline,
 *  and plan items whose planned dates differ from their baseline dates. */
export function pendingMoves(store, cur) {
  const exits = fwd(store).map((r) => {
    const id = r.get('TSA ID'), now = num(r.get('Planned exit date'));
    const was = (cur && baselineValue(store, cur.get('Baseline ID'), 'Exit date', id, 'Planned exit date')) || num(r.get('Initial end date'));
    return { id, name: r.get('Service name'), was, now };
  }).filter((x) => x.was && x.now && x.was !== x.now);
  const tasks = plan(store).map((r) => ({ i: r.i, id: r.get('Activity ID'), name: r.get('Activity'),
    bs: num(r.get('Baseline start')), bf: num(r.get('Baseline finish')), ps: num(r.get('Planned start')), pf: num(r.get('Planned finish')) }))
    .filter((x) => x.pf && x.bf && (x.pf !== x.bf || (x.ps && x.bs && x.ps !== x.bs)));
  return { exits, tasks };
}

/** Record the contract as signed as B0 (a Hub that has no baselines yet). */
async function recordB0(ctx) {
  const { store } = ctx;
  await store.add('tblBaselines', { Name: 'Contract as signed', 'Takes effect from': num(store.names.CloseDate) || asOf(store.names), 'Reason (shown on reports)': 'The TSA as signed at closing.', 'What moved': 'Everything', Status: 'Current' });
  const rows = fwd(store).filter((r) => num(r.get('Initial end date'))).map((r) => ({ i: null, changes: { 'Baseline ID': 'B0', What: 'Exit date', 'Item ID': r.get('TSA ID'), Field: 'Planned exit date', Value: num(r.get('Initial end date')) } }));
  if (rows.length) await store.saveMany('tblBaseHist', rows);
  toast(`B0 recorded: the contract as signed, with ${plural(rows.length, 'exit date')}.`);
  ctx.rerender();
}

/** Start a re-baseline: what moves, when, the approving decision and the reason. Saves a Draft with its values. */
export function openRebaseline(ctx) {
  const { store } = ctx;
  const all = store.records('tblBaselines');
  if (!all.length) {
    const go = h('button.btn.btn-primary', { type: 'button' }, 'Record B0');
    go.addEventListener('click', async () => { go.disabled = true; back.remove(); try { await recordB0(ctx); } catch (e) { toast('Could not record it: ' + (e.message || e), true); } });
    const back = modal('Record the original contract first',
      h('p', 'The Hub has no baselines yet. B0 is the contract as signed: every service\'s initial end date. Record it now, then start the re-baseline.'),
      [h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'), go]);
    return back;
  }
  const cur = all.find((r) => r.get('Status') === 'Current') || all[all.length - 1];
  const nextId = 'B' + all.length;
  const mv = pendingMoves(store, cur);
  const decs = store.records('tblDecisions').filter((r) => r.get('Decision ID') && !/^Withdrawn$/.test(r.get('Status')));
  const name = h('input', { type: 'text', placeholder: 'For example: Policy administration moved to June 2027' });
  const eff = dateBox(num(store.names.RD) || asOf(store.names), { 'aria-label': 'Takes effect from' });
  const dec = h('select', { 'aria-label': 'Approving decision' }, h('option', { value: '' }, 'Pick the decision'),
    decs.map((r) => h('option', { value: r.get('Decision ID') }, `${r.get('Decision ID')} · ${r.get('Decision needed')} (${r.get('Status') || 'Open'})`)));
  const reason = h('textarea', { rows: 3, placeholder: 'Why the plan itself changed. Shown on the reports.' });
  const cbExit = h('input.cb-plain', { type: 'checkbox', checked: mv.exits.length > 0 }), cbTask = h('input.cb-plain', { type: 'checkbox', checked: mv.tasks.length > 0 });
  const lineE = (x) => h('li', `${x.id} ${x.name}: ${fmtDate(x.was)} → ${fmtDate(x.now)}`);
  const lineT = (x) => h('li', `${x.id} ${x.name}: finish ${fmtDate(x.bf)} → ${fmtDate(x.pf)}`);
  const preview = h('div.banner.info', { style: { margin: '6px 0 0' } },
    h('div', h('b', `Exit dates that move from ${cur.get('Baseline ID')}: ${mv.exits.length}`)), mv.exits.length ? h('ul', { style: { margin: '4px 0 6px 18px' } }, mv.exits.slice(0, 8).map(lineE)) : h('div.small', 'None: every planned exit date matches the current baseline.'),
    h('div', h('b', `Plan items behind or ahead of their baseline: ${mv.tasks.length}`)), mv.tasks.length ? h('ul', { style: { margin: '4px 0 0 18px' } }, mv.tasks.slice(0, 8).map(lineT)) : h('div.small', 'None.'),
    (mv.exits.length > 8 || mv.tasks.length > 8) ? h('div.small.muted', 'The first eight of each are shown.') : null);
  const go = h('button.btn.btn-primary', { type: 'button' }, `Save ${nextId} as a draft`);
  go.addEventListener('click', async () => {
    const moveE = cbExit.checked && mv.exits.length, moveT = cbTask.checked && mv.tasks.length;
    if (!name.value.trim()) { toast('Give the baseline a name', true); return; }
    if (!dec.value) { toast('Pick the decision that approves it', true); return; }
    if (!reason.value.trim()) { toast('Say why the plan changed', true); return; }
    if (!moveE && !moveT) { toast('Nothing to move: tick exit dates or task dates', true); return; }
    go.disabled = true;
    try {
      await store.need(['tblBaseHist']);
      await store.add('tblBaselines', { Name: name.value.trim(), 'Takes effect from': isoToSerial(eff.value) || asOf(store.names), 'Approving decision': dec.value,
        'Reason (shown on reports)': reason.value.trim(), 'What moved': [moveE ? 'Exit dates' : '', moveT ? 'Task dates' : ''].filter(Boolean).join(', '), Status: 'Draft' });
      const rows = [], prev = cur.get('Baseline ID');
      const keep = (base, kind, item, field, value) => rows.push({ i: null, changes: { 'Baseline ID': base, What: kind, 'Item ID': item, Field: field, Value: value } });
      if (moveE) mv.exits.forEach((x) => {
        if (baselineValue(store, prev, 'Exit date', x.id, 'Planned exit date') == null) keep(prev, 'Exit date', x.id, 'Planned exit date', x.was);
        keep(nextId, 'Exit date', x.id, 'Planned exit date', x.now);
      });
      if (moveT) mv.tasks.forEach((x) => {
        if (baselineValue(store, prev, 'Task dates', x.id, 'Baseline finish') == null) { keep(prev, 'Task dates', x.id, 'Baseline start', x.bs); keep(prev, 'Task dates', x.id, 'Baseline finish', x.bf); }
        keep(nextId, 'Task dates', x.id, 'Baseline start', x.ps || x.bs); keep(nextId, 'Task dates', x.id, 'Baseline finish', x.pf);
      });
      await store.saveMany('tblBaseHist', rows);
      back.remove();
      const d = decs.find((r) => r.get('Decision ID') === dec.value);
      toast(`${nextId} saved as a draft. ${d && d.get('Status') === 'Made' ? 'Its decision is Made: choose Make current.' : `It becomes current once ${dec.value} is Made.`}`);
      ctx.rerender();
    } catch (e) { go.disabled = false; toast('Could not save it: ' + (e.message || e), true); }
  });
  const back = modal(`Start a re-baseline: ${nextId}`,
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('p.small.muted', { style: { margin: 0 } }, `Reports now measure against ${cur.get('Baseline ID')} (${cur.get('Name')}). A new baseline is for when leadership agrees the plan itself has changed: reports then stop showing a variance everyone has accepted. Nothing is overwritten, and the original contract stays visible.`),
      h('div.field', h('label.field-label', 'Name'), name),
      h('div.field', h('label.field-label', 'Takes effect from'), eff),
      h('div.field', h('label.field-label', 'Approving decision (Decisions log)'), dec),
      h('div.field', h('label.field-label', 'Reason (shown on reports)'), reason),
      h('div.field', h('span.field-label', 'What moves'),
        h('label', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, cbExit, `Exit dates (${mv.exits.length})`),
        h('label', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, cbTask, `Exit plan task dates (${mv.tasks.length}): their baseline dates become today's planned dates`)),
      preview),
    [h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'), go]);
  return back;
}

/** Make a draft baseline current: its decision must be Made. The one before becomes Superseded; task dates are applied to the plan. */
export async function makeCurrent(ctx, rec) {
  const { store } = ctx;
  // the decision's status straight from the Decisions log (the sheet's Decision status column recalculates only in Excel)
  const d = store.has('tblDecisions') ? store.records('tblDecisions').find((r) => r.get('Decision ID') === rec.get('Approving decision')) : null;
  if ((d ? d.get('Status') : rec.get('Decision status')) !== 'Made') { toast(`${rec.get('Approving decision') || 'Its decision'} is not Made yet. Record the decision on the Decisions log first.`, true); return; }
  const all = store.records('tblBaselines');
  const id = rec.get('Baseline ID') || 'B' + all.findIndex((r) => r.i === rec.i);
  try {
    for (const r of store.records('tblBaselines')) if (r.get('Status') === 'Current' && r.i !== rec.i) await store.save('tblBaselines', r.i, { Status: 'Superseded' });
    await store.save('tblBaselines', rec.i, { Status: 'Current' });
    let k = 0;
    if (store.has('tblPlan') && store.has('tblBaseHist')) {
      const hist = store.records('tblBaseHist').filter((r) => r.get('Baseline ID') === id && r.get('What') === 'Task dates');
      const byItem = {};
      hist.forEach((r) => { (byItem[r.get('Item ID')] = byItem[r.get('Item ID')] || {})[r.get('Field')] = num(r.get('Value')); });
      const list = plan(store).filter((r) => byItem[r.get('Activity ID')]).map((r) => ({ i: r.i, changes: Object.fromEntries(Object.entries(byItem[r.get('Activity ID')]).filter(([, v]) => v)) }));
      if (list.length) { await store.saveMany('tblPlan', list); k = list.length; }
    }
    toast(`${id} is now the current baseline${k ? `; ${plural(k, 'plan item')} re-baselined` : ''}. Reports measure against it.`);
    ctx.rerender();
  } catch (e) { toast('Could not make it current: ' + (e.message || e), true); }
}
