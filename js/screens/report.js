// Workstream report: each lead's monthly status, entered into their section of the Workstream Reports sheet
// (from there it flows into Consolidated WS Reporting and the RAID logs). The SMO sets the reporting date here.
import { h, fmtDate, fmtMonth, toast, isoToSerial, serialToIso } from '../util.js?v=0.8.1.20261030222244';

const SHEET = 'Workstream Reports';
const SEC0 = 9, SECH = 35;
const TEXTS = [[6, 'Summary for governance forums', 4], [7, 'Achievements this month', 3], [8, 'Next month', 3], [9, 'Path to green, if applicable', 3], [10, 'Help needed or escalations', 2]];
const TABLES = {
  risk: { off: 14, n: 5, label: 'Risks (new or updated)', cols: ['Risk', 'Description', 'TSA ID', 'Likelihood (1-5)', 'Impact (1-5)', 'Owner', 'Mitigation / response', 'Status'] },
  iss: { off: 22, n: 5, label: 'Issues (new or updated)', cols: ['Issue', 'Description', 'TSA ID', 'Priority', 'Due date', 'Owner', 'Other party must act', 'Status'] },
  dec: { off: 30, n: 3, label: 'Decisions needed', cols: ['Decision needed', 'Context', 'TSA ID', 'Needed by', 'Decided by', 'Owner', 'Decision', 'Status'] }
};
const OPTS = { 'Likelihood (1-5)': ['1', '2', '3', '4', '5'], 'Impact (1-5)': ['1', '2', '3', '4', '5'], Priority: ['High', 'Medium', 'Low'], 'Other party must act': ['Y', 'N'] };
const ui = { ws: null, sec: null, secKey: null, edit: null, rdEdit: false };

export default {
  tables: ['tblWorkstreams', 'tblTSA', 'tblRisks', 'tblIssues', 'tblPlan', 'tblStatus'],
  render(ctx) {
    const { store, go } = ctx;
    const n = store.names;
    const RD = Number(n.RD) || 0;
    const codes = (n.WS_Code || []).map(String);
    const active = n.WS_Active || [];
    const wsRows = Object.fromEntries(store.records('tblWorkstreams').map((r) => [r.get('Code'), r]));
    const list = codes.map((c, k) => ({ code: c, k: k + 1, name: (wsRows[c] && wsRows[c].get('Name')) || c, active: active[k] !== 'N' }))
      .filter((w) => w.code && w.active && wsRows[w.code]);
    // reported this month = the status row for this period has its summary typed or taken from a report
        // a report is in when its section on the Workstream Reports sheet has a summary
    if (!ui.summ && !ui.summLoading) {
      ui.summLoading = true;
      store.readRange(SHEET, `C${SEC0}:C${SEC0 + SECH * 30}`).then((v) => { ui.summ = v.map((r) => r[0]); ui.summLoading = false; ctx.rerender(); })
        .catch(() => { ui.summ = []; ui.summLoading = false; });
    }
    const done = (w) => !!(ui.summ && String(ui.summ[SECH * (w.k - 1) + 6] || '').trim());
    if (ctx.arg && ctx.arg.ws && !ctx.arg.used) { ctx.arg.used = true; ui.ws = ctx.arg.ws; }
    if (!list.find((w) => w.code === ui.ws)) ui.ws = (list.find((w) => !done(w)) || list[0] || {}).code;
    const sel = list.find((w) => w.code === ui.ws);
    const nDone = list.filter(done).length;

    const rdIn = h('input', { type: 'date', value: serialToIso(RD), style: { border: '1px solid var(--line-strong)', borderRadius: '6px', padding: '6px 8px', background: '#fff' } });
    const saveRD = async () => {
      const v = isoToSerial(rdIn.value);
      if (!v) { toast('Pick a date', true); return; }
      try {
        await store.writeCells('Consolidated WS Reporting', [{ addr: 'B5', value: v }]);
        await store.refresh();
        ui.sec = null; ui.summ = null; ui.rdEdit = false;
        toast(`Reporting date set to ${fmtDate(v)}. Every screen now reports to ${fmtMonth(v)}.`);
        ctx.rerender();
      } catch (e) { toast('Could not set the date: ' + (e.message || e), true); }
    };

    const main = h('section.card', { style: { padding: 0, flex: '999 1 560px', minWidth: 0 } }, h('div.loading', h('div.spinner'), 'Reading the report…'));
    if (sel) fill(ctx, main, sel, wsRows[sel.code]);

    return h('div.page',
      h('div.page-head',
        h('div', h('h1', `Workstream report · ${fmtMonth(RD)}`),
          h('p.lede', 'Each lead\'s monthly status. It flows into Consolidated WS Reporting, Home and the governance pack; risks, issues and decisions listed here appear on the RAID logs.')),
        h('div.card', { style: { padding: '10px 14px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span.small', { style: { fontWeight: 600, color: 'var(--muted)' } }, 'Reporting date (set by the SMO)'),
          ui.rdEdit ? [rdIn, h('button.btn.btn-sm.btn-primary', { type: 'button', onclick: saveRD }, 'Set'), h('button.link-btn', { type: 'button', onclick: () => { ui.rdEdit = false; ctx.rerender(); } }, 'Cancel')]
            : [h('b', fmtDate(RD)), h('button.link-btn', { type: 'button', onclick: () => { ui.rdEdit = true; ctx.rerender(); } }, 'Change')])),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
        h('span.small', { style: { fontWeight: 700, color: 'var(--navy)' } }, `${nDone} of ${list.length} reports in`),
        h('div.bar', { style: { maxWidth: '240px' } }, h('div', { style: { width: (list.length ? Math.round(nDone / list.length * 100) : 0) + '%' } }))),
      h('div.filters', list.map((w) => {
        const d = done(w);
        return h('button.fchip', { type: 'button', 'aria-pressed': String(w.code === ui.ws), title: w.name, onclick: () => { ui.ws = w.code; ctx.rerender(); },
          style: w.code === ui.ws ? null : d ? { background: 'var(--g-bg)', borderColor: '#A8D8B9', color: 'var(--g-fg)' } : null },
          `${w.code} ${d ? '✓ done' : '· due'}`);
      })),
      h('div.row-wrap', main, sel ? factsCard(ctx, sel, go) : null));
  }
};

function factsCard(ctx, w, go) {
  const { store } = ctx;
  const RD = Number(store.names.RD) || 0;
  const tsa = store.records('tblTSA').filter((r) => r.get('Workstream') === w.code);
  const live = tsa.filter((r) => !['Exited', 'Terminated'].includes(r.get('Status')));
  const ra = live.filter((r) => ['Red', 'Amber'].includes(r.get('Service delivery RAG')) || ['Red', 'Amber'].includes(r.get('Exit readiness RAG')));
  const late = store.records('tblPlan').filter((r) => r.get('Workstream') === w.code && r.get('Status') !== 'Complete' && Number(r.get('Planned finish')) && Number(r.get('Planned finish')) < RD).length;
  const iss = store.records('tblIssues').filter((r) => r.get('Workstream') === w.code && ['Open', 'In progress'].includes(r.get('Status'))).length;
  const red = store.records('tblRisks').filter((r) => r.get('Workstream') === w.code && r.get('Rating') === 'Red' && ['Open', 'In progress'].includes(r.get('Status (adopt or remove)'))).length;
  const next = live.map((r) => Number(r.get('Forecast exit date')) || 0).filter((d) => d >= RD).sort((a, b) => a - b)[0];
  const row = (label, value, onclick, tone) => h('button.ws-row', { type: 'button', onclick },
    h('span.ws-name', label), h('b', { style: { color: tone || 'var(--ink)', fontSize: '15px' } }, String(value)), h('span.small.muted', '›'));
  return h('aside.panel', { 'aria-label': 'Facts from the registers' },
    h('div.panel-head', h('span.panel-id', 'From the registers'), h('h2.panel-title', w.name)),
    h('div.panel-body', { style: { gap: 0 } },
      row('Services still running', live.length, () => go('register', { filter: 'all' })),
      row('Red or amber services', ra.length, () => go('register', { filter: 'ra' }), ra.length ? 'var(--a-fg)' : null),
      row('Plan items late', late, () => go('plan'), late ? 'var(--r-fg)' : null),
      row('Open issues', iss, () => go('raid', { ws: w.code, tab: 'ISS' })),
      row('Red risks', red, () => go('raid', { ws: w.code, tab: 'RSK' }), red ? 'var(--r-fg)' : null),
      row('Next exit', next ? fmtDate(next) : '–', () => go('dates'))),
    h('div.panel-foot', h('span.small.muted', 'Worked out by the Hub; select one to see the items behind it.')));
}

async function fill(ctx, main, w, wsRow) {
  const { store } = ctx;
  const s = SEC0 + SECH * (w.k - 1);
  try {
    if (ui.secKey !== w.code || !ui.sec) {
      ui.sec = await store.readRange(SHEET, `B${s}:I${s + 32}`);
      ui.secKey = w.code; ui.edit = null;
    }
    if (ui.ws !== w.code) return;
    main.replaceChildren(form(ctx, w, wsRow, s));
  } catch (e) {
    main.replaceChildren(h('div.banner.warn', { style: { margin: '16px' } }, 'Could not read the Workstream Reports sheet: ' + (e.message || e)));
  }
}

function form(ctx, w, wsRow, s) {
  const { store } = ctx;
  const S = ui.sec;                       // rows s..s+32, cols B..I (0..7)
  const cell = (o, c) => S[o][c];
  if (!ui.edit) {
    ui.edit = {
      rag: String(cell(5, 1) || ''), trend: String(cell(5, 4) || ''),
      texts: TEXTS.map(([o]) => String(cell(o, 1) || '')),
      tables: Object.fromEntries(Object.entries(TABLES).map(([k, t]) => [k, [...Array(t.n).keys()].map((j) => [...Array(8).keys()].map((c) => cell(t.off + j, c)))])),
      rows: Object.fromEntries(Object.entries(TABLES).map(([k, t]) => [k, Math.max(1, [...Array(t.n).keys()].filter((j) => cell(t.off + j, 0) !== '').length)]))
    };
  }
  const E = ui.edit;
  const lead = wsRow ? (store.names.Perspective === 'Seller' ? wsRow.get('Seller lead') : wsRow.get('Buyer lead')) : '';
  const RG = { Green: 'g', Amber: 'a', Red: 'r' };
  const seg = (opts, cur, set, colour) => h('div', { role: 'group', style: { display: 'flex', gap: '4px' } }, opts.map((o) => {
    const on = cur === o, t = colour && RG[o];
    return h('button', { type: 'button', 'aria-pressed': String(on), onclick: () => { set(on ? '' : o); ctx.rerender(); },
      style: { minHeight: '34px', padding: '0 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '13px',
        border: `1px solid ${on ? (t ? `var(--${t}-bar)` : 'var(--navy)') : 'var(--line)'}`, background: on ? (t ? `var(--${t}-bg)` : 'var(--navy)') : '#fff', color: on ? (t ? `var(--${t}-fg)` : '#fff') : 'var(--heading)' } }, o);
  }));
  const ta = (i, rows) => {
    const el = h('textarea', { rows, style: inputStyle() });
    el.value = E.texts[i];
    el.addEventListener('input', () => { E.texts[i] = el.value; });
    return el;
  };
  const people = store.options({ h: 'Owner', t: 'I', dv: { name: 'L_People' } }) || [];
  const tsaIds = store.options({ h: 'TSA ID', t: 'I', dv: { name: 'TSA_ID' } }) || [];
  const forums = store.options({ h: 'Forum', t: 'I', dv: { name: 'L_Forum' } }) || [];
  const tableBlock = (key) => {
    const t = TABLES[key];
    const statusOpts = key === 'dec' ? ['Open', 'Made'] : ['Open', 'Closed'];
    const lists = { 'TSA ID': tsaIds, Owner: people, 'Decided by': forums, Status: statusOpts, ...OPTS };
    const rows = [...Array(E.rows[key]).keys()].map((j) => {
      const vals = E.tables[key][j];
      return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', padding: '10px', border: '1px solid var(--line)', borderRadius: '8px', background: '#fff' } },
        t.cols.map((label, c) => {
          let el;
          const opts = lists[label];
          const isDate = label === 'Due date' || label === 'Needed by';
          if (opts) {
            el = h('select', { style: inputStyle() }, h('option', { value: '' }, ''), [...new Set([String(vals[c] || ''), ...opts].filter(Boolean))].map((o) => h('option', { value: o }, o)));
            el.value = String(vals[c] ?? '');
            el.addEventListener('change', () => { vals[c] = /^\d$/.test(el.value) ? Number(el.value) : el.value; });
          } else if (isDate) {
            el = h('input', { type: 'date', value: serialToIso(vals[c]), style: inputStyle() });
            el.addEventListener('input', () => { vals[c] = isoToSerial(el.value); });
          } else {
            el = h('input', { type: 'text', value: String(vals[c] ?? ''), style: inputStyle() });
            el.addEventListener('input', () => { vals[c] = el.value; });
          }
          return h('label.field', { style: c === 0 || c === 1 || c === 6 ? { gridColumn: 'span 2' } : null }, h('span.field-label', label), el);
        }));
    });
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('div.sec', t.label), rows,
      E.rows[key] < t.n ? h('button.link-btn', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => { E.rows[key]++; ctx.rerender(); } }, `+ Add another (room for ${t.n})`) : null);
  };

  const save = async () => {
    const cells = [{ addr: `C${s + 5}`, value: E.rag }, { addr: `F${s + 5}`, value: E.trend }];
    TEXTS.forEach(([o], i) => cells.push({ addr: `C${s + o}`, value: E.texts[i] }));
    Object.entries(TABLES).forEach(([k, t]) => E.tables[k].forEach((vals, j) => vals.forEach((v, c) => {
      if (j < E.rows[k] || v !== '') cells.push({ addr: `${'BCDEFGHI'[c]}${s + t.off + j}`, value: v ?? '' });
    })));
    // only write what changed, so untouched suggestions stay as suggestions
    const orig = (addr) => { const m = /^([A-I])(\d+)$/.exec(addr); return S[Number(m[2]) - s]['BCDEFGHI'.indexOf(m[1])]; };
    const changed = cells.filter((c) => String(c.value ?? '') !== String(orig(c.addr) ?? ''));
    if (!changed.length) { toast('Nothing changed'); return; }
    try {
      await store.writeCells(SHEET, changed);
      ui.sec = null; ui.summ = null;
      toast(`${w.name}: report saved (${changed.length} cell${changed.length === 1 ? '' : 's'})`);
      ctx.rerender();
    } catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };

  const url = (() => { try { return Office.context.document.url || ''; } catch (e) { return ''; } })();
  const RD = Number(store.names.RD) || 0;
  const mail = `mailto:?subject=${encodeURIComponent(`${w.name}: workstream report for ${fmtMonth(RD)}`)}&body=${encodeURIComponent(
    `Hello${lead ? ' ' + lead.split(' ')[0] : ''},\n\nPlease complete the ${w.name} report for ${fmtMonth(RD)} in the SMO Hub: open the workbook, then SMO Hub > Workstream report and pick ${w.code}.\n${url ? '\nWorkbook: ' + url + '\n' : ''}\nThank you.`)}`;

  return h('div',
    h('div', { style: { padding: '16px 18px 12px', borderBottom: '1px solid var(--line-soft)', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-start' } },
      h('div', { style: { flex: '1 1 240px' } }, h('span.panel-id', `${w.code} · lead ${lead || 'not named yet'}`), h('h2.panel-title', w.name)),
      h('a.btn.btn-sm', { href: mail, target: '_blank', rel: 'noopener', style: { textDecoration: 'none' } }, 'Ask the lead by email')),
    h('div', { style: { padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } },
        h('div.field', h('span.field-label', 'Overall RAG'), seg(['Green', 'Amber', 'Red'], E.rag, (v) => { E.rag = v; }, true)),
        h('div.field', h('span.field-label', 'Trend'), seg(['Improving', 'Stable', 'Worsening'], E.trend, (v) => { E.trend = v; }, false))),
      h('span.small.muted', 'The RAG starts as the Hub\'s suggestion from the registers (red if any service is red, amber if any is amber or plan items are late). Change it if you disagree.'),
      TEXTS.map(([o, label, rows], i) => h('label.field', h('span.field-label', label), ta(i, rows))),
      tableBlock('risk'), tableBlock('iss'), tableBlock('dec'),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' } },
        h('button.btn.btn-primary', { type: 'button', onclick: save }, 'Save report'),
        h('button.btn', { type: 'button', onclick: () => store.showRange(SHEET, `B${s}:I${s + 32}`).catch((e) => toast(e.message, true)) }, 'Show in the worksheet'))));
}

function inputStyle() { return { border: '1px solid var(--line-strong)', background: 'var(--input)', borderRadius: '6px', padding: '7px 9px', fontSize: '13px', width: '100%', minWidth: 0, resize: 'vertical' }; }
