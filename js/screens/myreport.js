// My workstream report (the Connected level; build waves P8): the lead's monthly report, filled in on the Teams tab or the web
// page and sent to the programme office as one submission. It is the same report as the standalone report file and the
// Workstream Reports sheet (wrblock.js), so the programme office takes it in the same way. It starts from what is already in
// the workstream's section of the published Hub.
import { h, toast, fmtMonth, ed, theTeam, dateBox, isoToSerial, serialToIso, periodLabel } from '../util.js?v=0.12.8.20261122225802';
import { toBlock, fromBlock, TEXTS, ROWS, COLS } from '../wrblock.js?v=0.12.8.20261122225802';

const SHEET = 'Workstream Reports', SEC0 = 9, SECH = 35;
const ui = { ws: null, r: null, sent: {} };

function sectionReport(store, k) {
  const cells = (store.src.snap && store.src.snap.cells && store.src.snap.cells[SHEET]) || {};
  const s = SEC0 + SECH * (k - 1);
  const b = Array.from({ length: ROWS }, (_, i) => Array.from({ length: COLS }, (_, j) => { const v = cells['BCDEFGHI'[j] + (s + 5 + i)]; return v == null ? '' : v; }));
  const r = fromBlock(b);
  r.trend = String(b[0][4] || '');
  return r;
}

export default {
  tables: ['tblWorkstreams', 'tblPeople', 'tblTSA'],
  render(ctx) {
    const { store } = ctx;
    const n = store.names, RD = Number(n.RD) || 0;
    const codes = (n.WS_Code || []).map(String), active = n.WS_Active || [];
    const wsRows = Object.fromEntries(store.records('tblWorkstreams').map((r) => [r.get('Code'), r]));
    const list = codes.map((c, k) => ({ code: c, k: k + 1, name: (wsRows[c] && wsRows[c].get('Name')) || c })).filter((w, i) => w.code && active[i] !== 'N' && wsRows[w.code]);
    const who = store.src.who || '';
    if (!ui.ws) {
      const q = new URLSearchParams(location.search).get('ws');
      const mine = store.records('tblPeople').find((p) => p.get('Name') === who && /lead/i.test(p.get('Role')));
      ui.ws = (list.find((w) => w.code === q) || list.find((w) => mine && w.code === mine.get('Workstream code')) || list[0] || {}).code;
    }
    const w = list.find((x) => x.code === ui.ws);
    if (!w) return h('div.page', h('div.banner.info', 'No workstreams have been published yet.'));
    if (!ui.r || ui.r.code !== w.code) { ui.r = sectionReport(store, w.k); ui.r.code = w.code; ['risk', 'iss', 'dec'].forEach((k) => { if (!ui.r[k].length) ui.r[k].push({}); }); }
    const R = ui.r;
    const sel = (opts, val, on, label) => h('select', { 'aria-label': label, onchange: (e) => on(e.target.value) }, h('option', { value: '' }, '–'), opts.map((o) => h('option', { value: o, selected: String(val) === o }, ed(o))));
    const txt = (val, on, label, rows) => h(rows ? 'textarea' : 'input', Object.assign({ 'aria-label': label, oninput: (e) => on(e.target.value) }, rows ? { rows } : { type: 'text', value: val || '' }), rows ? (val || '') : null);
    const date = (val, on, label) => { const d = dateBox(Number(val) || '', { 'aria-label': label }); d.addEventListener('change', () => on(isoToSerial(d.value) || '')); return d; };
    const table = (key, cols, max, title) => h('div', { style: { marginTop: '14px' } },
      h('h3', { style: { margin: '0 0 6px', fontSize: '14px' } }, title),
      h('div', { style: { overflowX: 'auto' } }, h('table.grid', h('thead', h('tr', cols.map((c) => h('th', c[1])))),
        h('tbody', R[key].map((row) => h('tr', cols.map(([f, label, kind, opts]) => h('td',
          kind === 'sel' ? sel(opts, row[f], (v) => { row[f] = v; }, label) : kind === 'date' ? date(row[f], (v) => { row[f] = v; }, label) : txt(row[f], (v) => { row[f] = v; }, label)))))))),
      R[key].length < max ? h('button.link-btn', { type: 'button', onclick: () => { R[key].push({}); ctx.rerender(); } }, `+ Add another (room for ${max})`) : null);
    const send = async (btn) => {
      if (!R.rag) { toast('Pick the overall RAG', true); return; }
      if (!String(R.texts.Sum || '').trim()) { toast('Write the summary for governance forums', true); return; }
      if (/^(Amber|Red)$/.test(R.rag) && !String(R.texts.PTG || '').trim()) { toast('Amber or red: say what the path to green is', true); return; }
      ['risk', 'iss', 'dec'].forEach((k) => R[k].forEach((x) => { if (String(x.Title || '').trim() && !x.Status) x.Status = 'Open'; }));
      btn.disabled = true;
      try {
        const block = toBlock(Object.assign({}, R, { code: w.code, month: RD }));
        await store.src.submit('report', `report ${w.code} ${serialToIso(RD).slice(0, 7)}`, { code: w.code, month: RD, block });
        ui.sent[w.code] = new Date();
        toast(`Sent to ${theTeam()}. You can send it again if something changes; the latest one is used.`);
      } catch (e) { toast('Could not send it: ' + (e.message || e), true); }
      btn.disabled = false; ctx.rerender();
    };
    return h('div.page',
      h('div.page-head', h('div', h('h1', `My workstream report · ${periodLabel(RD)}`),
        h('p.lede', `Your report for ${fmtMonth(RD)}, sent to ${theTeam()}. It goes into the Hub as your report file would. Fields start from what is already in the Hub.`))),
      h('section.card', { style: { minWidth: 0 } },
        h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' } },
          h('div.field', h('label.field-label', 'Workstream'), h('select', { 'aria-label': 'Workstream', onchange: (e) => { ui.ws = e.target.value; ui.r = null; ctx.rerender(); } }, list.map((x) => h('option', { value: x.code, selected: x.code === w.code }, `${x.name} (${x.code})`)))),
          h('div.field', h('label.field-label', 'Overall RAG'), sel(['Red', 'Amber', 'Green'], R.rag, (v) => { R.rag = v; }, 'Overall RAG')),
          h('div.field', h('label.field-label', 'Trend'), sel(['Improving', 'Stable', 'Worsening'], R.trend, (v) => { R.trend = v; }, 'Trend'))),
        TEXTS.map(([k, label]) => h('div.field', { style: { marginTop: '10px' } }, h('label.field-label', ed(label)), txt(R.texts[k], (v) => { R.texts[k] = v; }, label, k === 'Sum' ? 3 : 2))),
        table('risk', [['Title', 'Risk'], ['L', 'Likelihood (1-5)', 'sel', ['1', '2', '3', '4', '5']], ['I', 'Impact (1-5)', 'sel', ['1', '2', '3', '4', '5']], ['Resp', 'Mitigation / response'], ['Status', 'Status', 'sel', ['Open', 'Closed']]], 6, 'Risks (new or updated)'),
        table('iss', [['Title', 'Issue'], ['Pri', 'Priority', 'sel', ['High', 'Medium', 'Low']], ['Due', 'Due date', 'date'], ['XP', 'Other party must act', 'sel', ['Y', 'N']], ['Status', 'Status', 'sel', ['Open', 'Closed']]], 6, 'Issues (new or updated)'),
        table('dec', [['Title', 'Decision needed'], ['Due', 'Needed by', 'date'], ['Forum', 'Decided by'], ['Status', 'Status', 'sel', ['Open', 'Made']]], 3, 'Decisions needed'),
        h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap' } },
          h('button.btn.btn-primary', { type: 'button', onclick: (e) => send(e.currentTarget) }, `Send to ${theTeam()}`),
          ui.sent[w.code] ? h('span.small', { style: { color: 'var(--g-fg)' } }, `✓ Sent at ${ui.sent[w.code].toTimeString().slice(0, 5)}`) : null)));
  }
};
