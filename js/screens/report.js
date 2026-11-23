// Workstream report: each lead's monthly status, entered into their section of the Workstream Reports sheet
// (from there it flows into Consolidated WS Reporting and the RAID logs). The programme's team (SMO, IMO, PMO...) sets the reporting date here.
import { h, fmtDate, fmtMonth, toast, isoToSerial, serialToIso, theTeam, fieldBox, asOf, dateBox, unit, periodLabel, periodStart, ed, monthly as monthlyCycle } from '../util.js?v=0.12.9.20261123225222';
import { personLabel, SCALE_WORDS } from '../form.js?v=0.12.9.20261123225222';
import { LEAD_UPD, LEAD_CLOSE } from '../counts.js?v=0.12.9.20261123225222';
import { openReportImport } from '../wrimport.js?v=0.12.9.20261123225222';

const SHEET = 'Workstream Reports';
const SEC0 = 9, SECH = 35;
const TEXTS = [[6, 'Summary for governance forums', 4], [7, 'Achievements this month', 3], [8, 'Next month', 3], [9, 'Path to green, if applicable', 3], [10, 'Help needed or escalations', 2]];
const TABLES = {
  risk: { off: 14, n: 5, label: 'Risks (new or updated)', cols: ['Risk', 'Description', 'TSA ID', 'Likelihood (1-5)', 'Impact (1-5)', 'Owner', 'Mitigation / response', 'Status'] },
  iss: { off: 22, n: 5, label: 'Issues (new or updated)', cols: ['Issue', 'Description', 'TSA ID', 'Priority', 'Due date', 'Owner', 'Other party must act', 'Status'] },
  dec: { off: 30, n: 3, label: 'Decisions needed', cols: ['Decision needed', 'Context', 'TSA ID', 'Needed by', 'Decided by', 'Owner', 'Decision', 'Status'] }
};
const OPTS = { 'Likelihood (1-5)': ['1', '2', '3', '4', '5'], 'Impact (1-5)': ['1', '2', '3', '4', '5'], Priority: ['High', 'Medium', 'Low'], 'Other party must act': ['Y', 'N'] };
const ui = { ws: null, sec: null, secKey: null, edit: null, rdSeen: null };

export default {
  tables: ['tblWorkstreams', 'tblTSA', 'tblRisks', 'tblIssues', 'tblDecisions', 'tblPlan', 'tblStatus'],
  render(ctx) {
    const { store, go } = ctx;
    const n = store.names;
    const RD = Number(n.RD) || 0;
    if (ui.rdSeen !== RD || ui.gen !== store.gen) { ui.rdSeen = RD; ui.gen = store.gen; ui.sec = null; ui.summ = null; }   // the reporting date changed: read the sheet again
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

    const main = h('section.card', { style: { padding: 0, flex: '999 1 560px', minWidth: 0 } }, h('div.loading', h('div.spinner'), 'Reading the report…'));
    // Report history (v0.11 item 4; build waves P6): the sheet holds one period of reports. With the reporting date moved back before
    // the period they belong to (WR_Period), show that earlier period's reports from the stored history, read-only.
    const pk = (d) => { const x = Number(d) || 0; if (!x) return 0; return monthlyCycle() ? Math.floor(periodStart(x) / 1) : x; };
    const sheetP = Number(n.WR_Period) || 0, past = sheetP && RD && pk(RD) < pk(sheetP);
    if (past && sel) historyView(ctx, main, sel, sheetP);
    else if (sel) fill(ctx, main, sel, wsRows[sel.code]);

    return h('div.page',
      h('div.page-head',
        h('div', h('h1', `Workstream report · ${periodLabel(RD)}`),
          h('p.lede', `Each lead's status for the ${unit()}. It flows into Consolidated WS Reporting, Home and the governance pack; new risks, issues and decisions raised here go straight into RAID, marked New.`)),
        h('div.card', { style: { padding: '10px 14px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span.small', { style: { fontWeight: 600, color: 'var(--muted)' } }, `Reporting date (set by ${theTeam()})`),
          [h('b', fmtDate(RD)), h('button.link-btn', { type: 'button', onclick: () => ctx.changeRD() }, 'Change')]),
          h('button.btn.btn-sm', { type: 'button', title: 'Bring in the report files the leads sent you', onclick: () => openReportImport(ctx, () => { ui.sec = null; ui.summ = null; }) }, 'Import reports')),
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
      // New risks, issues and decisions go straight into the main registers (status New), so these start empty.
      tables: Object.fromEntries(Object.entries(TABLES).map(([k, t]) => [k, [...Array(t.n).keys()].map(() => Array(8).fill(''))])),
      rows: Object.fromEntries(Object.keys(TABLES).map((k) => [k, 1])),
      open: {}   // edits to the workstream's existing risks, issues and decisions: 'tbl:row' -> {header: value}
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
      // A risk's rating (likelihood x impact, the Risks sheet's rule) shows as you pick, before saving.
      const ratingEl = key === 'risk' ? h('span.chip', { style: { alignSelf: 'end', justifySelf: 'start' } }) : null;
      const paintRating = () => {
        if (!ratingEl) return;
        const L = Number(vals[3]) || 0, I = Number(vals[4]) || 0, sc = L * I;
        const r = !L || !I ? '' : sc >= 15 ? 'Red' : sc >= 8 ? 'Amber' : 'Green';
        ratingEl.className = 'chip ' + r; ratingEl.textContent = r ? `Rating: ${r} (${sc})` : 'Rating: pick likelihood and impact';
      };
      paintRating();
      return h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', padding: '10px', border: '1px solid var(--line)', borderRadius: '8px', background: '#fff' } },
        ratingEl ? h('div.field', { style: { gridColumn: '1 / -1' } }, ratingEl) : null,
        t.cols.map((label, c) => {
          if (label === 'Status') return null;   // set to New when it goes into the register
          let el;
          const opts = lists[label];
          const isDate = label === 'Due date' || label === 'Needed by';
          if (opts) {
            el = h('select', { style: inputStyle() }, h('option', { value: '' }, ''), [...new Set([String(vals[c] || ''), ...opts].filter(Boolean))].map((o) => h('option', { value: o }, label === 'Owner' ? personLabel(ctx.store, o) : SCALE_WORDS[label] && /^[1-5]$/.test(o) ? `${o} – ${SCALE_WORDS[label][o - 1]}` : o)));
            el.value = String(vals[c] ?? '');
            el.addEventListener('change', () => { vals[c] = /^\d$/.test(el.value) ? Number(el.value) : el.value; paintRating(); });
          } else if (isDate) {
            el = dateBox(vals[c], { style: inputStyle() });
            el.addEventListener('input', () => { vals[c] = isoToSerial(el.value); });
          } else {
            el = h('input', { type: 'text', value: String(vals[c] ?? ''), style: inputStyle() });
            el.addEventListener('input', () => { vals[c] = el.value; });
          }
          return fieldBox(label, el, { style: c === 0 || c === 1 || c === 6 ? { gridColumn: 'span 2' } : null });
        }));
    });
    const REG = { risk: ['tblRisks', 'Status (adopt or remove)', 'RSK'], iss: ['tblIssues', 'Status', 'ISS'], dec: ['tblDecisions', 'Status', 'DEC'] }[key];
    const waitingNew = store.records(REG[0]).filter((r) => r.get('Workstream') === w.code && r.get(REG[1]) === 'New').length;
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
      h('div.sec', t.label.replace(' (new or updated)', ': raise a new one')),
      waitingNew ? h('div.small', h('span.tag-new', 'NEW'), ` ${waitingNew} raised from ${w.code} reports and waiting for ${theTeam()} to accept them. `, h('button.link-btn', { type: 'button', onclick: () => ctx.go('raid', { ws: w.code, tab: REG[2], newOnly: true }) }, 'Open in RAID ›')) : null,
      rows,
      E.rows[key] < t.n ? h('button.link-btn', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => { E.rows[key]++; ctx.rerender(); } }, `+ Add another (room for ${t.n})`) : null);
  };

  // Risks, issues and decisions typed here go straight into the main registers, status New (Tim, 2 Nov 2026; evaluation D).
  const toRegister = async () => {
    const today = asOf(store.names), out = { risk: 0, iss: 0, dec: 0 };
    const val = (vals, k, label) => vals[TABLES[k].cols.indexOf(label)];
    for (const [k, t] of Object.entries(TABLES)) {
      for (const vals of E.tables[k].slice(0, E.rows[k])) {
        if (!String(vals[0] ?? '').trim()) continue;
        let rec;
        if (k === 'risk') rec = ['tblRisks', { Risk: vals[0], Description: val(vals, k, 'Description'), 'TSA ID': val(vals, k, 'TSA ID'), 'Likelihood (1-5)': val(vals, k, 'Likelihood (1-5)'), 'Impact (1-5)': val(vals, k, 'Impact (1-5)'), Owner: val(vals, k, 'Owner'), 'Mitigation / response': val(vals, k, 'Mitigation / response'), 'Status (adopt or remove)': 'New', Workstream: w.code, 'Date raised': today }];
        if (k === 'iss') rec = ['tblIssues', { Issue: vals[0], Description: val(vals, k, 'Description'), 'TSA ID': val(vals, k, 'TSA ID'), Priority: val(vals, k, 'Priority'), 'Due date': val(vals, k, 'Due date'), Owner: val(vals, k, 'Owner'), 'Other party must act': val(vals, k, 'Other party must act'), Status: 'New', Workstream: w.code, 'Date raised': today }];
        if (k === 'dec') rec = ['tblDecisions', { 'Decision needed': [vals[0], val(vals, k, 'Context')].filter(Boolean).join(': '), 'TSA ID': val(vals, k, 'TSA ID'), 'Needed by': val(vals, k, 'Needed by'), 'Decided by': val(vals, k, 'Decided by'), Owner: val(vals, k, 'Owner'), Decision: val(vals, k, 'Decision'), Status: 'New', Workstream: w.code }];
        await store.add(rec[0], rec[1]); out[k]++;
      }
    }
    return out;
  };
  const save = async () => {
    const cells = [{ addr: `C${s + 5}`, value: E.rag }, { addr: `F${s + 5}`, value: E.trend }];
    TEXTS.forEach(([o], i) => cells.push({ addr: `C${s + o}`, value: E.texts[i] }));
    // only write what changed, so untouched suggestions stay as suggestions
    const orig = (addr) => { const m = /^([A-I])(\d+)$/.exec(addr); return S[Number(m[2]) - s]['BCDEFGHI'.indexOf(m[1])]; };
    const changed = cells.filter((c) => String(c.value ?? '') !== String(orig(c.addr) ?? ''));
    const anyNew = Object.keys(TABLES).some((k) => E.tables[k].slice(0, E.rows[k]).some((v) => String(v[0] ?? '').trim()));
    const anyOpen = Object.values(E.open).some((o) => Object.keys(o).length);
    if (!changed.length && !anyNew && !anyOpen) { toast('Nothing changed'); return; }
    try {
      if (changed.length) await store.writeCells(SHEET, changed);
      // the reports on the sheet now belong to this reporting date (report history, build waves P6)
      if (store.names.WR_Period !== undefined && Number(store.names.WR_Period) !== Number(store.names.RD)) await store.writeNames([['WR_Period', Number(store.names.RD)]]);
      const added = anyNew ? await toRegister() : { risk: 0, iss: 0, dec: 0 };
      const nUpd = anyOpen ? await saveOpen(store, E) : 0;
      const nAdded = added.risk + added.iss + added.dec;
      ui.sec = null; ui.summ = null; ui.edit = null;
      toast(`${w.name}: report saved` + (nUpd ? `; ${nUpd} existing item${nUpd > 1 ? 's' : ''} updated` : '') + (nAdded ? `; ${[added.risk && `${added.risk} risk${added.risk > 1 ? 's' : ''}`, added.iss && `${added.iss} issue${added.iss > 1 ? 's' : ''}`, added.dec && `${added.dec} decision${added.dec > 1 ? 's' : ''}`].filter(Boolean).join(', ')} added to RAID as New` : ''));
      ctx.rerender();
    } catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };

  // Only a web address (SharePoint or OneDrive) works as a link in an email; a path on someone's computer does not.
  const url = (() => { try { const u = Office.context.document.url || ''; return /^https:\/\//i.test(u) ? encodeURI(decodeURI(u)) : ''; } catch (e) { return ''; } })();
  const RD = Number(store.names.RD) || 0;
  const mail = `mailto:?subject=${encodeURIComponent(`${w.name}: workstream report for ${periodLabel(RD)}`)}&body=${encodeURIComponent(
    `Hello${lead ? ' ' + lead.split(' ')[0] : ''},\n\nPlease complete the ${w.name} report for ${periodLabel(RD)} in TransitionSuite: open the Hub workbook, then TransitionSuite > Workstream report and pick ${w.code}.\n${url ? '\nWorkbook: ' + url + '\n' : '\nIf you use the report file instead, fill in the attached report file and send it back.\n'}\nThank you.`)}`;

  return h('div',
    h('div', { style: { padding: '16px 18px 12px', borderBottom: '1px solid var(--line-soft)', display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'flex-start' } },
      h('div', { style: { flex: '1 1 240px' } }, h('span.panel-id', `${w.code} · lead ${lead || 'not named yet'}`), h('h2.panel-title', w.name)),
      h('a.btn.btn-sm', { href: mail, target: '_blank', rel: 'noopener', style: { textDecoration: 'none' } }, 'Send email to lead, asking for report')),
    h('div', { style: { padding: '14px 18px 18px', display: 'flex', flexDirection: 'column', gap: '12px' } },
      h('div', { style: { display: 'flex', gap: '20px', flexWrap: 'wrap' } },
        h('div.field', h('span.field-label', 'Overall RAG'), seg(['Green', 'Amber', 'Red'], E.rag, (v) => { E.rag = v; }, true)),
        h('div.field', h('span.field-label', 'Trend'), seg(['Improving', 'Stable', 'Worsening'], E.trend, (v) => { E.trend = v; }, false))),
      h('span.small.muted', 'The RAG starts as the Hub\'s suggestion from the registers (red if any service is red, amber if any is amber or plan items are late). Change it if you disagree.'),
      TEXTS.map(([o, label, rows], i) => fieldBox(label.replace(/ month$/, ` ${unit()}`), ta(i, rows))),
      openItems(ctx, w, E),
      tableBlock('risk'), tableBlock('iss'), tableBlock('dec'),
      h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '6px' } },
        h('button.btn.btn-primary', { type: 'button', onclick: save }, 'Save report'),
        h('button.btn', { type: 'button', onclick: () => store.showRange(SHEET, `B${s}:I${s + 32}`).catch((e) => toast(e.message, true)) }, 'Show in the worksheet'))));
}

function inputStyle() { return { border: '1px solid var(--line-strong)', background: 'var(--input)', borderRadius: '6px', padding: '7px 9px', fontSize: '13px', width: '100%', minWidth: 0, resize: 'vertical' }; }

// ---------------------------------------------------------------- the workstream's open items (Tim, 17 Nov 2026; brief 4.5)
// A lead reviews the workstream's open risks, issues and decisions while writing the report: edits save to the registers, and
// each changed item is marked "Updated in this period's report" (Lead updated on) for the programme office to review on RAID and Home.
// A lead can't remove an item: closing is proposed (Close proposed (lead) = Y) and the programme office confirms.
const OPEN = {
  risk: { t: 'tblRisks', id: 'Risk ID', title: 'Risk', status: 'Status (adopt or remove)', live: ['Open', 'In progress', 'New'], label: 'Risks',
    fields: [['Likelihood (1-5)', 'scale'], ['Impact (1-5)', 'scale'], ['Mitigation / response', 'text'], ['Status (adopt or remove)', ['Open', 'In progress']]] },
  iss: { t: 'tblIssues', id: 'Issue ID', title: 'Issue', status: 'Status', live: ['Open', 'In progress', 'New'], label: 'Issues',
    fields: [['Due date', 'date'], ['Owner', 'person'], ['Status', ['Open', 'In progress']], ['Latest update', 'text']] },
  dec: { t: 'tblDecisions', id: 'Decision ID', title: 'Decision needed', status: 'Status', live: ['Open', 'New'], label: 'Decisions',
    fields: [['Needed by', 'date'], ['Status', ['Open']]] }
};

function openItems(ctx, w, E) {
  const { store } = ctx;
  const people = store.options({ h: 'Owner', t: 'I', dv: { name: 'L_People' } }) || [];
  const blocks = Object.entries(OPEN).map(([k, o]) => {
    if (!store.has(o.t)) return null;
    const hasCol = (hd) => !!store.colDef(o.t, hd) || store.records(o.t).some((r) => r.get(hd) !== '');
    const recs = store.records(o.t).filter((r) => r.get('Workstream') === w.code && o.live.includes(String(r.get(o.status))));
    if (!recs.length) return null;
    return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('div.small', { style: { fontWeight: 700, color: 'var(--heading)' } }, `${o.label} (${recs.length})`),
      recs.map((r) => {
        const key = `${o.t}:${r.i}`, ed0 = (E.open[key] = E.open[key] || {});
        const val = (hd) => (hd in ed0 ? ed0[hd] : r.get(hd));
        const set = (hd, v) => { if (String(v) === String(r.get(hd) ?? '')) delete ed0[hd]; else ed0[hd] = v; row.classList.toggle('changed', Object.keys(ed0).length > 0); };
        const fields = o.fields.filter(([hd]) => hasCol(hd) || hd !== 'Latest update').map(([hd, kind]) => {
          let el;
          if (kind === 'scale' || Array.isArray(kind) || kind === 'person') {
            const opts = kind === 'scale' ? ['1', '2', '3', '4', '5'] : kind === 'person' ? people : kind;
            el = h('select', { style: inputStyle(), 'aria-label': hd }, h('option', { value: '' }, ''), [...new Set([String(val(hd) ?? ''), ...opts].filter(Boolean))].map((x) => h('option', { value: x }, kind === 'person' ? personLabel(store, x) : x)));
            el.value = String(val(hd) ?? '');
            el.addEventListener('change', () => set(hd, kind === 'scale' && el.value ? Number(el.value) : el.value));
          } else if (kind === 'date') {
            el = dateBox(val(hd), { style: inputStyle(), 'aria-label': hd });
            el.addEventListener('input', () => set(hd, isoToSerial(el.value)));
          } else {
            el = h('input', { type: 'text', value: String(val(hd) ?? ''), style: inputStyle(), 'aria-label': hd });
            el.addEventListener('input', () => set(hd, el.value));
          }
          return fieldBox(hd.replace(' (adopt or remove)', ''), el, { style: kind === 'text' ? { gridColumn: 'span 2' } : null });
        });
        const close = hasCol(LEAD_CLOSE) ? h('label.small', { style: { display: 'flex', gap: '6px', alignItems: 'center', alignSelf: 'end', paddingBottom: '8px' } },
          (() => { const cb = h('input.cb-plain', { type: 'checkbox', checked: /^Y/i.test(String(val(LEAD_CLOSE))) });
            cb.addEventListener('change', () => set(LEAD_CLOSE, cb.checked ? 'Y' : '')); return cb; })(), 'Propose close') : null;
        const flag = /^Y/i.test(String(r.get(LEAD_CLOSE))) ? h('span.chip.Amber', 'Close proposed') : Number(r.get(LEAD_UPD)) >= periodStart(store.names.RD) ? h('span.chip.info', 'Updated in this report') : null;
        const row = h('div.open-item', { class: Object.keys(ed0).length ? 'changed' : null },
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' } },
            h('b.small', r.get(o.id) || ''), h('span.small', { style: { flex: '1 1 200px' } }, String(r.get(o.title) || '')), flag),
          h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' } }, fields, close));
        return row;
      }));
  }).filter(Boolean);
  return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h('div.sec', 'Your open items: review and update'),
    h('span.small.muted', ed(`Change what has moved since the last report. Changes save to the registers with the report, marked for ${theTeam()} to review. You can't remove an item: tick Propose close and ${theTeam()} confirms it.`)),
    blocks.length ? blocks : h('p.small.muted', { style: { margin: 0 } }, 'No open risks, issues or decisions for this workstream.'));
}

async function saveOpen(store, E) {
  const today = asOf(store.names);
  let n = 0;
  for (const [key, ch] of Object.entries(E.open)) {
    if (!Object.keys(ch).length) continue;
    const [t, i] = key.split(':');
    const extra = store.colDef(t, LEAD_UPD) ? { [LEAD_UPD]: today } : {};
    await store.save(t, Number(i), { ...ch, ...extra });
    n++;
  }
  return n;
}

/** An earlier period's report, read-only, from the stored history (Consolidated WS Reporting, tblStatus): the status the
 *  workstream had that period, its words, and how to get back to the current reports. */
function historyView(ctx, main, w, sheetP) {
  const { store } = ctx;
  const RD = Number(store.names.RD) || 0;
  const mS = (d) => { const x = new Date((Number(d) - 25569) * 864e5); return Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1); };
  const hit = store.records('tblStatus').find((r) => r.get('Workstream') === w.code && (r.get('Scope') || 'Overall') === 'Overall' && mS(r.get('Period')) === mS(RD));
  const field = (label, v) => h('div', { style: { marginTop: '10px' } }, h('div.small', { style: { fontWeight: 700, color: 'var(--muted)' } }, label), h('div', { style: { whiteSpace: 'pre-wrap' } }, String(v || '–')));
  main.replaceChildren(h('div', { style: { padding: '16px 18px' } },
    h('div.banner.info', { style: { margin: '0 0 12px' } }, `You are looking at ${periodLabel(RD)}. The reports on the Workstream Reports sheet are for ${periodLabel(sheetP)}, so this is ${w.name}'s report for ${periodLabel(RD)} from the stored history, read-only. Set the reporting date back to ${fmtDate(sheetP)} to work on the current reports.`),
    hit ? h('div',
      h('div', h('span.chip', { class: hit.get('RAG') }, `Status: ${hit.get('RAG') || 'not reported'}`)),
      field('Summary', hit.get('Summary') || hit.get('Shared summary')), field('Achievements', hit.get('Achievements')), field('Next steps', hit.get('Next steps')),
      field('Path to green', hit.get('Path to green')), field('Escalations and help needed', hit.get('Escalations')))
      : h('p.muted', `No report from ${w.name} is stored for ${periodLabel(RD)}. Past periods are stored when ${theTeam()} saves the consolidated report to history.`),
    h('div', { style: { marginTop: '14px' } }, h('button.btn', { type: 'button', onclick: () => ctx.changeRD() }, 'Change the reporting date'))));
}
