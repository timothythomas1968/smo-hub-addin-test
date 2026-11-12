// Readiness interviews: up to four interviews per service, recorded on the Readiness Interview sheet
// (one 17-row block per service, in TSA register order). Exit Readiness picks up the latest automatically.
import { h, fmtDate, toast, plural, isoToSerial, serialToIso, theTeam, asOf, fieldBox, dateBox } from '../util.js?v=0.11.0.20261112200344';
import { personLabel } from '../form.js?v=0.11.0.20261112200344';
import { colName } from '../data.js?v=0.11.0.20261112200344';
import { todaySerial } from './checklist.js?v=0.11.0.20261112200344';
import { readinessOf } from '../readiness.js?v=0.11.0.20261112200344';

const SHEET = 'Readiness Interview';
const B0 = 22, BH = 17;
const EXITED = new Set(['Exited', 'Terminated']);
const ui = { sel: null, round: null, filter: 'due', block: null, blockKey: null, script: null, edit: null, editKey: null, busy: false };
const AREA_COLS = ['Data', 'Systems and applications', 'Knowledge transfer', 'Processes', 'People', 'Vendors', 'Other party', 'Exit plan milestones', 'Dependencies'];
const RAGC = { Y: 'Green', Partly: 'Amber', N: 'Red' };

function ragOf(ans) {
  const v = ans.filter(Boolean);
  if (!v.length) return '';
  return v.includes('N') ? 'Red' : v.includes('Partly') ? 'Amber' : v.length === 9 ? 'Green' : 'Amber';
}
const pctOf = (ans) => Math.round((ans.filter((x) => x === 'Y').length + 0.5 * ans.filter((x) => x === 'Partly').length) / 9 * 100);

export default {
  tables: ['tblTSA', 'tblReadiness'],
  render(ctx) {
    const { store } = ctx;
    const RD = asOf(store.names);   // alerts run from today (the workbook's Today), not the reporting date
    const waive = store.src.getSetting('ri-waive') || {};
    const tsa = store.records('tblTSA');
    const xr = Object.fromEntries(store.records('tblReadiness').map((r) => [r.get('TSA ID'), r]));
    const svc = tsa.filter((r) => !EXITED.has(r.get('Status'))).map((r) => {
      const id = r.get('TSA ID'), x = xr[id];
      const latest = x ? AREA_COLS.map((a) => x.get(a)) : [];
      const ro = readinessOf(store, r, x, waive, RD);   // waived rounds drop out of the overdue count and the next date
      return { r, id, x, next: ro.next, rag: ragOf(latest), overdue: ro.overdue > 0, waived: !!(waive[id] || {}).svc };
    }).sort((a, b) => (a.waived - b.waived) || ((a.next || 1e9) - (b.next || 1e9)));
    const filters = {
      due: ['Due in 30 days', (s) => !s.waived && (s.overdue || (s.next && s.next <= RD + 30))],
      all: ['All running services', () => true],
      red: ['Red or amber', (s) => s.rag === 'Red' || s.rag === 'Amber'],
      nn: ['Not needed', (s) => s.waived]
    };
    const list = svc.filter(filters[ui.filter][1]);
    if (ctx.arg && ctx.arg.id && !ctx.arg.used) { ctx.arg.used = true; ui.sel = ctx.arg.id; ui.filter = 'all'; }
    // the detail always belongs to the list on the left: a filter that leaves the selected service out selects its first service (Tim, 0.9.5)
    let sel = list.find((s) => s.id === ui.sel) || list[0] || null;
    if (sel && sel.id !== ui.sel) { ui.sel = sel.id; ui.round = null; }
    const go = (p) => { Object.assign(ui, p); ctx.rerender(); };

    const nOver = svc.filter((s) => s.overdue && !s.waived).length;
    const nDue = svc.filter(filters.due[1]).length;
    const nReady = svc.filter((s) => s.x && s.x.get('Overall ready') === 'Y').length;

    const main = h('section.card', { style: { flex: '999 1 560px', minWidth: 0, padding: '0' } }, h('div.loading', h('div.spinner'), 'Reading the interview record…'));
    if (sel) loadAndFill(ctx, main, sel, waive);
    else main.replaceChildren(h('div.panel-empty', svc.length ? `No services under "${filters[ui.filter][0]}". Pick another filter on the left.` : 'No running services.'));

    return h('div.page',
      h('div.page-head',
        h('div', h('h1', 'Readiness interviews'), h('p.lede', `Before a service exits, ${theTeam()} lead meets the workstream lead to check nine areas are ready. Up to four interviews per service, timed back from the exit date.`)),
        h('button.btn', { type: 'button', onclick: () => store.show('tblReadiness').catch((e) => toast(e.message, true)) }, 'Exit Readiness sheet')),
      h('div.tiles',
        h('button.tile', { type: 'button', class: nOver ? 'red' : 'green', onclick: () => go({ filter: 'due' }) }, h('span.tile-label', 'Overdue'), h('span.tile-value', String(nOver)), h('span.tile-sub', 'services with a missed interview')),
        h('button.tile', { type: 'button', onclick: () => go({ filter: 'due' }) }, h('span.tile-label', 'Due in 30 days'), h('span.tile-value', String(nDue))),
        h('button.tile', { type: 'button', class: 'amber', onclick: () => go({ filter: 'red' }) }, h('span.tile-label', 'Red or amber'), h('span.tile-value', String(svc.filter(filters.red[1]).length)), h('span.tile-sub', 'at the latest interview')),
        h('div.tile.green', h('span.tile-label', 'Signed off as ready'), h('span.tile-value', String(nReady)))),
      h('div.row-wrap',
        h('div', { style: { flex: '1 1 280px', maxWidth: '380px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0 } },
          h('div.filters', Object.entries(filters).map(([k, [label, fn]]) => h('button.fchip', { type: 'button', 'aria-pressed': String(ui.filter === k), onclick: () => go({ filter: k }) }, label, h('span.n', String(svc.filter(fn).length))))),
          list.length ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', paddingRight: '2px' } }, list.map((s) => h('button.item', { type: 'button', class: s.id === ui.sel ? 'sel' : null, onclick: () => go({ sel: s.id, round: null }),
            style: { padding: '10px 12px', textAlign: 'left', cursor: 'pointer', gap: '10px', flexWrap: 'nowrap' } },
            h('span.item-text', h('span', { style: { fontSize: '12px', fontWeight: 700, color: 'var(--link)' } }, s.id), h('span.item-title', { style: { fontSize: '13px' } }, s.r.get('Service name')),
              h('span.item-meta', { style: s.overdue && !s.waived ? { color: 'var(--r-fg)', fontWeight: 600 } : null },
                s.waived ? 'Interviews not needed' : s.overdue ? 'Interview overdue' : s.next ? `Next interview ${fmtDate(s.next)}` : `Exit ${fmtDate(s.r.get('Forecast exit date'))}`)),
            s.rag ? h('span.chip', { class: s.rag }, s.rag) : h('span.chip', 'None yet'))))
            : h('p.muted.small', 'No services here.')),
        main));
  }
};

async function loadAndFill(ctx, main, sel, waive) {
  const { store } = ctx;
  try {
    const key = sel.id + '@' + sel.r.i;
    if (ui.gen !== store.gen) { ui.gen = store.gen; ui.script = null; ui.block = null; }
    if (!ui.script) ui.script = await store.readRange(SHEET, 'K1:M9');
    if (ui.blockKey !== key || !ui.block) {
      const b = B0 + sel.r.i * BH;
      ui.block = await store.readRange(SHEET, `B${b}:I${b + 15}`);
      ui.blockKey = key;
    }
    if (ui.sel !== sel.id) return;   // the user moved on while we were reading
    main.replaceChildren(interviewCard(ctx, sel, waive));
  } catch (e) {
    main.replaceChildren(h('div.banner.warn', { style: { margin: '16px' } }, 'Could not read the Readiness Interview sheet: ' + (e.message || e)));
  }
}

function interviewCard(ctx, sel, waive) {
  const { store } = ctx;
  const B = ui.block;                       // 16 rows x 8 cols (B..I)
  const b = B0 + sel.r.i * BH;
  const RD = asOf(store.names);   // alerts run from today (the workbook's Today), not the reporting date
  const due = [3, 4, 5, 6].map((c) => Number(B[2][c]) || 0);
  const held = [3, 4, 5, 6].map((c) => Number(B[3][c]) || 0);
  const ans = (k) => [...Array(9).keys()].map((a) => String(B[4 + a][3 + k] || ''));
  const who = [3, 4, 5, 6].map((c) => String(B[13][c] || ''));
  const w = waive[sel.id] || {};
  const others = store.src.getSetting('ri-others') || {};
  if (ui.round == null) {
    const firstOpen = [0, 1, 2, 3].find((k) => !held[k] && !w['r' + (k + 1)]);
    const lastHeld = [3, 2, 1, 0].find((k) => held[k]);
    ui.round = firstOpen != null ? firstOpen : lastHeld != null ? lastHeld : 0;
  }
  const k = ui.round;
  const ekey = `${sel.id}:${k}:${ui.blockKey}`;
  if (ui.editKey !== ekey) {
    ui.edit = { held: held[k] || '', who: who[k], others: ((others[sel.id] || {})['r' + (k + 1)]) || '', ans: ans(k), notes: [...Array(9).keys()].map((a) => String(B[4 + a][7] || '')), actions: String(B[15][1] || ''), dirty: false };
    ui.editKey = ekey;
  }
  const E = ui.edit;
  const prevK = [k - 1, k - 2, k - 3].find((p) => p >= 0 && held[p]);
  const prev = prevK != null ? ans(prevK) : null;
  const svcWaived = !!w.svc, rWaived = !!w['r' + (k + 1)];
  const rerender = () => ctx.rerender();
  const setWaive = async (patch) => {
    const all = store.src.getSetting('ri-waive') || {};
    all[sel.id] = { ...(all[sel.id] || {}), ...patch };
    await store.src.setSetting('ri-waive', all);
    rerender();
  };

  const tabs = h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' } },
    [0, 1, 2, 3].map((i) => {
      const a = ans(i), rag = held[i] ? ragOf(a) : '', nn = svcWaived || w['r' + (i + 1)];
      const tone = nn ? 'n' : rag === 'Red' ? 'r' : rag === 'Amber' ? 'a' : rag === 'Green' ? 'g' : '';
      const bg = tone ? `var(--${tone}-bg)` : '#fff', fg = tone ? `var(--${tone}-fg)` : 'var(--heading)';
      const sub = nn ? 'Not needed' : held[i] ? `Held ${fmtDate(held[i])}${rag ? ' · ' + rag : ''}` : due[i] ? `${due[i] < RD ? 'Was due' : 'Due'} ${fmtDate(due[i])}` : 'No date';
      return h('button', { type: 'button', role: 'tab', 'aria-selected': String(i === k), onclick: () => { ui.round = i; rerender(); },
        style: { textAlign: 'left', cursor: 'pointer', borderRadius: '8px', padding: '9px 11px', background: bg, color: fg, border: `2px solid ${i === k ? 'var(--navy)' : tone ? bg : 'var(--line)'}`, minWidth: 0 } },
        h('div', { style: { fontWeight: 700, fontSize: '13px' } }, `Interview ${i + 1}`),
        h('div', { style: { fontSize: '12px', opacity: nn ? 0.8 : 1 } }, sub));
    }));

  const head = h('div', { style: { padding: '16px 18px 12px', borderBottom: '1px solid var(--line-soft)', display: 'flex', flexDirection: 'column', gap: '12px' } },
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-start' } },
      h('div', { style: { flex: '1 1 260px' } },
        h('span.panel-id', `${sel.id} · exit ${fmtDate(sel.r.get('Forecast exit date'))} · ${plural(Math.max(0, Number(sel.r.get('Forecast exit date')) - RD), 'day')} to go`),
        h('h2.panel-title', sel.r.get('Service name')),
        h('span.small.muted', `Provider ${sel.r.get('Provider service owner') || '–'} · Recipient ${sel.r.get('Recipient service owner') || '–'} · ${sel.r.get('Exit route') || 'no exit route'}`)),
      h('button.btn.btn-sm', { type: 'button', onclick: () => setWaive({ svc: !svcWaived }) }, svcWaived ? 'Interviews needed after all' : 'Click here if no interviews are needed for this service')),
    svcWaived ? null : tabs);

  if (svcWaived) {
    return h('div', head, h('div.panel-empty', 'You have marked this service as not needing readiness interviews (for example a service that simply stops). It stays off the due lists. Choose "Interviews needed after all" to undo.'));
  }

  const people = store.options({ h: 'Owner', t: 'I', dv: { name: 'L_People' } }) || [];
  const heldIn = dateBox(E.held, { style: inputStyle() });
  heldIn.addEventListener('input', () => { E.held = isoToSerial(heldIn.value); E.dirty = true; });
  const whoSel = h('select', { style: inputStyle() }, h('option', { value: '' }, ''), [...new Set([E.who, ...people].filter(Boolean))].map((p) => h('option', { value: p }, personLabel(store, p))));
  whoSel.value = E.who;
  whoSel.addEventListener('change', () => { E.who = whoSel.value; E.dirty = true; });
  const othersIn = h('input', { type: 'text', value: E.others, placeholder: 'e.g. Kate Holloway (provider), Femi Adeyemi', style: inputStyle() });
  othersIn.addEventListener('input', () => { E.others = othersIn.value; E.dirty = true; });

  const pct = pctOf(E.ans), rag = ragOf(E.ans);
  const C = { Y: ['var(--g-bg)', 'var(--g-fg)', 'var(--g-bar)'], Partly: ['var(--a-bg)', 'var(--a-fg)', 'var(--a-bar)'], N: ['var(--r-bg)', 'var(--r-fg)', 'var(--r-bar)'] };
  const areas = [...Array(9).keys()].map((a) => {
    const [area, q, ev] = (ui.script || [])[a] || [AREA_COLS[a], '', ''];
    const notes = h('textarea', { rows: 1, placeholder: 'Notes (kept across interviews)', style: { ...inputStyle(), minHeight: '34px', resize: 'vertical' } });
    notes.value = E.notes[a];
    notes.addEventListener('input', () => { E.notes[a] = notes.value; E.dirty = true; });
    return h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '6px 14px', padding: '12px 0', borderTop: '1px solid var(--line-soft)' } },
      h('div', { style: { minWidth: 0 } },
        h('div', { style: { fontWeight: 700, fontSize: '13px', color: 'var(--navy)' } }, `${a + 1}. ${area}`),
        h('div', { style: { fontSize: '13px', marginTop: '2px' } }, q),
        h('div.small.muted', { style: { marginTop: '2px' } }, 'Evidence: ' + ev)),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' } },
        h('div', { role: 'group', 'aria-label': area, style: { display: 'flex', gap: '4px' } },
          ['Y', 'Partly', 'N'].map((o) => {
            const on = E.ans[a] === o;
            return h('button', { type: 'button', 'aria-pressed': String(on), onclick: () => { E.ans[a] = on ? '' : o; if (!E.held) E.held = todaySerial(); E.dirty = true; rerender(); },
              style: { minHeight: '32px', minWidth: '58px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '12px', border: `1px solid ${on ? C[o][2] : 'var(--line)'}`, background: on ? C[o][0] : '#fff', color: on ? C[o][1] : 'var(--heading)' } },
              o === 'Y' ? 'Yes' : o === 'N' ? 'No' : 'Partly');
          })),
        prev && prev[a] ? h('span.small.muted', 'Last time: ', h('span.chip', { class: RAGC[prev[a]] }, prev[a] === 'Y' ? 'Yes' : prev[a] === 'N' ? 'No' : 'Partly')) : null),
      h('div', { style: { gridColumn: '1 / -1' } }, notes));
  });
  const actions = h('textarea', { rows: 3, style: { ...inputStyle(), resize: 'vertical' } });
  actions.value = E.actions;
  actions.addEventListener('input', () => { E.actions = actions.value; E.dirty = true; });

  const save = async () => {
    if (E.ans.some(Boolean) && !E.held) { toast('Type the date the interview was held first', true); return; }
    const col = colName(5 + k);   // E..H
    const cells = [
      { addr: `${col}${b + 3}`, value: E.held || '' },
      ...E.ans.map((v, a) => ({ addr: `${col}${b + 4 + a}`, value: v })),
      { addr: `${col}${b + 13}`, value: E.who },
      ...E.notes.map((v, a) => ({ addr: `I${b + 4 + a}`, value: v })),
      { addr: `C${b + 15}`, value: E.actions }
    ];
    try {
      ui.busy = true;
      await store.writeCells(SHEET, cells);
      const o = store.src.getSetting('ri-others') || {};
      o[sel.id] = { ...(o[sel.id] || {}), ['r' + (k + 1)]: E.others };
      await store.src.setSetting('ri-others', o);
      ui.block = null; ui.editKey = null;
      toast(`Interview ${k + 1} for ${sel.id} saved to the workbook`);
      rerender();
    } catch (e) { toast('Could not save: ' + (e.message || e), true); }
    finally { ui.busy = false; }
  };

  const body = rWaived
    ? h('div.panel-empty', `Interview ${k + 1} is marked as not needed for this service. `, h('button.link-btn', { type: 'button', onclick: () => setWaive({ ['r' + (k + 1)]: false }) }, 'Needed after all'))
    : h('div', { style: { padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px' } },
        field('Held on', heldIn), field('Interviewee (workstream lead)', whoSel), field('Others present', othersIn)),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap', background: 'var(--input)', borderRadius: '8px', padding: '10px 14px' } },
        h('div.stat', h('b', { style: { color: 'var(--navy)' } }, pct + '%'), h('span', 'ready')),
        h('div.bar', h('div', { style: { width: pct + '%', background: rag === 'Red' ? 'var(--r-bar)' : rag === 'Amber' ? 'var(--a-bar)' : 'var(--g-bar)' } })),
        rag ? h('span.chip', { class: rag, style: { fontSize: '13px', padding: '4px 12px' } }, rag) : h('span.chip', 'Not started'),
        h('span.small.muted', 'Any No makes it red; any Partly makes it amber.')),
      h('div', areas),
      field('Agreed actions (one list per service)', actions),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
        h('button.btn.btn-primary', { type: 'button', onclick: save }, `Save interview ${k + 1}`),
        h('button.btn', { type: 'button', onclick: () => store.showRange(SHEET, `B${b}:I${b + 15}`).catch((e) => toast(e.message, true)) }, 'Show in the worksheet'),
        h('button.btn', { type: 'button', style: { marginLeft: 'auto' }, onclick: () => setWaive({ ['r' + (k + 1)]: true }) }, `Click here if interview ${k + 1} is not needed`)),
      h('span.small.muted', '"Others present" and "not needed" are kept with the workbook\'s add-in settings for now; the next workbook version gives them their own cells.'));

  return h('div', head, body);
}

function field(label, el) { return fieldBox(label, el); }
function inputStyle() { return { border: '1px solid var(--line-strong)', background: 'var(--input)', borderRadius: '6px', padding: '7px 9px', fontSize: '13px', width: '100%', minWidth: 0 }; }
