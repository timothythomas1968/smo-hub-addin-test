// Governance pack: one pack per forum, built live from the registers, with SMO commentary, the client's letterhead,
// and sections switched on or off per forum. Shared (joint) packs leave out internal-only sections and unshareable items.
import { h, fmtDate, fmtMonth, fmtMoney, fromSerial, toSerial, toast, printNode, plural } from '../util.js?v=0.8.1.20261030222244';

const EXITED = new Set(['Exited', 'Terminated']);
const SECTIONS = [
  ['status', 'Workstream status', ''], ['exits', 'Exits in the next 90 days', ''], ['raid', 'Top risks and issues', ''], ['decisions', 'Decisions needed', ''],
  ['changes', 'TSA changes and extensions', ''], ['data', 'Data requests', ''], ['sla', 'Service levels', ''],
  ['reg', 'Regulatory approvals', 'internal'], ['costs', 'TSA fees', 'internal'], ['d1', 'Day 1 and first 100 days', 'auto']
];
function defaultsFor(name, joint) {
  const n = name.toLowerCase();
  if (n.includes('steer')) return ['status', 'exits', 'raid', 'decisions', 'reg', 'costs'];
  if (n.includes('tsa')) return ['exits', 'decisions', 'changes', 'sla'];
  if (n.includes('change')) return ['changes', 'decisions', 'costs'];
  if (n.includes('data')) return ['data', 'raid'];
  if (n.includes('operational')) return ['exits', 'sla'];
  if (n.includes('workstream')) return ['status', 'raid'];
  return joint ? ['status', 'exits', 'raid', 'decisions'] : ['status', 'exits', 'raid', 'decisions', 'reg', 'costs'];
}
const ui = { forum: null };

export default {
  tables: ['tblForums', 'tblTSA', 'tblStatus', 'tblWorkstreams', 'tblRisks', 'tblIssues', 'tblDecisions', 'tblChange', 'tblDataReq', 'tblREG', 'tblDay1', 'tblFirst100'],
  render(ctx) {
    const { store } = ctx;
    const n = store.names, RD = Number(n.RD) || 0, close = Number(n.CloseDate) || 0;
    const forums = store.records('tblForums').map((r) => ({ name: r.get('Forum'), joint: r.get('Joint or internal') === 'Joint', sub: [r.get('Joint or internal'), r.get('Frequency'), r.get('Chair') && 'chair ' + r.get('Chair')].filter(Boolean).join(' · ') }));
    if (!forums.length) return h('div.page', h('h1', 'Governance pack'), h('p.banner.warn', 'Add your forums on the Lists sheet first.'));
    if (!forums.find((f) => f.name === ui.forum)) ui.forum = forums[0].name;
    const f = forums.find((x) => x.name === ui.forum);
    const secSet = store.src.getSetting('pack-sections') || {};
    const chosen = secSet[f.name] || defaultsFor(f.name, f.joint);
    const d1Due = close && RD >= close - 60 && RD <= close + 100;
    const on = (k) => (k === 'd1' ? d1Due : (k === 'reg' || k === 'costs') && f.joint ? false : chosen.includes(k));
    const toggle = async (k) => {
      const all = store.src.getSetting('pack-sections') || {};
      const cur = all[f.name] || defaultsFor(f.name, f.joint);
      all[f.name] = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
      await store.src.setSetting('pack-sections', all);
      ctx.rerender();
    };
    const commKey = `${f.name}@${RD}`;
    const comms = store.src.getSetting('pack-comm') || {};
    const commIn = h('textarea', { rows: 5, placeholder: 'Your message to the forum: the headline, what you need from them, and anything the figures do not show.', style: inp() });
    commIn.value = comms[commKey] || '';
    let commTimer;
    commIn.addEventListener('input', () => {
      clearTimeout(commTimer);
      commTimer = setTimeout(async () => { const all = store.src.getSetting('pack-comm') || {}; all[commKey] = commIn.value; await store.src.setSetting('pack-comm', all); const p = document.getElementById('pack-comm'); if (p) { p.textContent = commIn.value; p.parentElement.style.display = commIn.value ? '' : 'none'; } }, 400);
    });

    const pack = buildPack(store, f, on, comms[commKey] || '');
    const side = h('aside.panel', { 'aria-label': 'Pack contents' },
      h('div.panel-head', h('span.panel-id', f.joint ? 'Shared with the other party' : 'Internal'), h('h2.panel-title', 'Contents')),
      h('div.panel-body',
        h('label.field', h('span.field-label', 'SMO commentary for this pack'), commIn),
        h('div.sec', 'Sections'),
        SECTIONS.map(([k, label, kind]) => {
          const locked = kind === 'auto' || (kind === 'internal' && f.joint);
          const id = 'pk-' + k;
          const cb = h('input', { type: 'checkbox', id, checked: on(k), disabled: locked });
          cb.addEventListener('change', () => toggle(k));
          return h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '3px 0', color: locked ? 'var(--muted)' : null } }, cb,
            h('label', { for: id }, label, kind === 'auto' ? h('span.small.muted', { style: { display: 'block' } }, 'Added automatically from 60 days before closing until day 100')
              : locked ? h('span.small.muted', { style: { display: 'block' } }, 'Internal packs only') : null));
        })),
      h('div.panel-foot', h('span.small.muted', 'Your choice of sections and the commentary are saved with the workbook, per forum.')));

    return h('div.page',
      h('div.page-head',
        h('div', h('h1', 'Governance pack'), h('p.lede', `Built from the registers as at ${fmtDate(RD)}. Pick the forum, write your commentary, then print or save as PDF.`)),
        h('button.btn.btn-primary', { type: 'button', onclick: () => printNode(document.getElementById('pack')) }, 'Print or save as PDF')),
      h('div.filters', forums.map((x) => h('button.fchip', { type: 'button', 'aria-pressed': String(x.name === f.name), title: x.sub, onclick: () => { ui.forum = x.name; ctx.rerender(); } }, x.name, h('span.n', x.joint ? 'shared' : 'internal')))),
      h('div.row-wrap', h('div', { style: { flex: '999 1 600px', minWidth: 0 } }, pack), side));
  }
};

function buildPack(store, f, on, commentary) {
  const n = store.names, RD = Number(n.RD) || 0, sym = n.CcySym || '';
  const shared = f.joint;
  const ok = (r) => !shared || r.get('Shareable') === 'Y';
  const tsa = store.records('tblTSA');
  const live = tsa.filter((r) => !EXITED.has(r.get('Status')));
  const wsName = Object.fromEntries(store.records('tblWorkstreams').map((r) => [r.get('Code'), r.get('Name')]));
  const st = store.records('tblStatus').filter((r) => (r.get('Scope') || 'Overall') === 'Overall');
  const per = Math.max(0, ...st.map((r) => Number(r.get('Period')) || 0));
  const cur = st.filter((r) => Number(r.get('Period')) === per);
  const prog = cur.find((r) => r.get('Workstream') === 'Programme');
  const exits90 = live.filter((r) => { const d = Number(r.get('Forecast exit date')); return d >= RD && d <= RD + 90; }).sort((a, b) => a.get('Forecast exit date') - b.get('Forecast exit date'));
  const decisions = store.records('tblDecisions').filter((r) => r.get('Status') === 'Open' && ok(r));
  const office = store.src.getSetting('office-name') || 'Separation Management Office';
  const logo = store.src.getSetting('logo');
  const ours = n.Perspective === 'Seller' ? n.SellerName : n.BuyerName, theirs = n.Perspective === 'Seller' ? n.BuyerName : n.SellerName;

  const cap = (t, src) => h('div', { style: { margin: '22px 0 8px', display: 'flex', alignItems: 'baseline', gap: '10px', borderBottom: '2px solid var(--navy)', paddingBottom: '4px' } },
    h('h3', { style: { margin: 0, fontSize: '13px', letterSpacing: '.8px', color: 'var(--navy)' } }, t.toUpperCase()), src ? h('span.small.muted', src) : null);
  const chip = (v, cls) => h('span.chip', { class: cls || v }, v);
  const table = (heads, rows, empty) => rows.length ? h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } },
    h('thead', h('tr', heads.map((x) => h('th', { style: { textAlign: x.endsWith(' ') ? 'right' : 'left', color: 'var(--muted)', fontSize: '11px', padding: '4px 6px', borderBottom: '1px solid var(--line)' } }, x.trim())))),
    h('tbody', rows.map((cells) => h('tr', cells.map((c, i) => h('td', { style: { padding: '6px', borderBottom: '1px solid var(--line-soft)', verticalAlign: 'top', textAlign: heads[i].endsWith(' ') ? 'right' : 'left', whiteSpace: i === 0 ? 'nowrap' : null } }, c))))))
    : h('p.small.muted', empty);

  const tiles = [
    ['Overall', prog ? prog.get('RAG') : '–', prog ? { Red: 'var(--r-fg)', Amber: 'var(--a-fg)', Green: 'var(--g-fg)' }[prog.get('RAG')] : null],
    ['Services exited', `${tsa.length - live.length} of ${tsa.length}`],
    ['Exits in 90 days', String(exits90.length)],
    shared ? ['Decisions needed', String(decisions.length)] : ['Forward fees to date', fmtMoney(n.FEE_FwdActTot, sym)]
  ];
  const parts = [];
  parts.push(h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', borderBottom: '3px solid var(--navy)', paddingBottom: '12px' } },
    h('div', h('div.small', { style: { fontWeight: 700, letterSpacing: '1px', color: shared ? 'var(--link)' : 'var(--r-fg)' } }, shared ? `SHARED WITH ${String(theirs || '').toUpperCase()}` : 'INTERNAL · CONFIDENTIAL'),
      h('div', { style: { fontSize: '22px', fontWeight: 700, color: 'var(--navy)' } }, f.name),
      h('div.muted', `${n.ProgName || ''} · ${fmtMonth(RD)} pack · as at ${fmtDate(RD)}`)),
    h('div', { style: { textAlign: 'right' } }, logo ? h('img', { src: logo, alt: '', style: { maxHeight: '48px', maxWidth: '200px', objectFit: 'contain', display: 'block', marginLeft: 'auto', marginBottom: '4px' } }) : null,
      h('div', { style: { fontWeight: 700 } }, ours), h('div.small.muted', office))));
  parts.push(h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '10px', marginTop: '14px' } },
    tiles.map(([l, v, col]) => h('div', { style: { border: '1px solid var(--line)', borderRadius: '6px', padding: '8px 10px' } }, h('div.small', { style: { fontWeight: 700, color: 'var(--muted)', letterSpacing: '.6px', fontSize: '10.5px' } }, l.toUpperCase()), h('div', { style: { fontSize: '18px', fontWeight: 700, color: col || 'var(--ink)' } }, v)))));
  parts.push(h('div', { style: { display: commentary ? '' : 'none', marginTop: '14px', background: 'var(--selected)', borderLeft: '4px solid var(--navy)', padding: '10px 14px', borderRadius: '4px' } },
    h('div.small', { style: { fontWeight: 700, color: 'var(--navy)', letterSpacing: '.6px' } }, 'FROM THE SMO'), h('div', { id: 'pack-comm', style: { whiteSpace: 'pre-wrap', marginTop: '2px' } }, commentary)));

  if (on('status')) {
    parts.push(cap('Workstream status', `Consolidated WS Reporting, ${fmtMonth(per)}`));
    parts.push(h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 18px' } },
      cur.map((r) => h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--line-soft)' } },
        h('span', { style: { width: '62px', flex: '0 0 62px' } }, chip(r.get('RAG') || '–')),
        h('div', { style: { minWidth: 0 } }, h('div', { style: { fontWeight: 600, fontSize: '12.5px' } }, wsName[r.get('Workstream')] || r.get('Workstream')),
          h('div.small', { style: { color: 'var(--heading)' } }, shared ? r.get('Shared summary') : r.get('Summary')))))));
  }
  if (on('exits')) {
    parts.push(cap('Exits in the next 90 days', 'TSA register and Exit Readiness'));
    parts.push(table(['TSA ID', 'Service', 'Exit', 'Readiness', 'Delivery'], exits90.map((r) => [r.get('TSA ID'), r.get('Service name') + (r.get('Direction') === 'Reverse' ? ' (reverse)' : ''), fmtDate(r.get('Forecast exit date')), chip(r.get('Exit readiness RAG') || '–'), chip(r.get('Service delivery RAG') || '–')]), 'No exits in the next 90 days.'));
  }
  if (on('raid')) {
    const open = (s) => ['Open', 'In progress'].includes(s);
    const risks = store.records('tblRisks').filter((r) => open(r.get('Status (adopt or remove)')) && ['Red', 'Amber'].includes(r.get('Rating')) && ok(r)).sort((a, b) => b.get('Score') - a.get('Score')).slice(0, 6);
    const iss = store.records('tblIssues').filter((r) => open(r.get('Status')) && ok(r)).slice(0, 6);
    parts.push(cap('Top risks and issues', shared ? 'Risks and Issues marked shareable' : 'Risks (red and amber) and open issues'));
    parts.push(table(['ID', 'Item', 'Owner', 'Rating'], [...risks.map((r) => [r.get('Risk ID'), r.get('Risk'), r.get('Owner'), chip(r.get('Rating'))]), ...iss.map((r) => [r.get('Issue ID'), r.get('Issue'), r.get('Owner'), chip(r.get('Priority'))])], shared ? 'No shareable risks or issues.' : 'No red or amber risks or open issues.'));
  }
  if (on('decisions')) {
    parts.push(cap('Decisions needed', 'Decisions log'));
    parts.push(table(['ID', 'Decision needed', 'Needed by', 'Owner'], decisions.map((r) => [r.get('Decision ID'), r.get('Decision needed'), fmtDate(r.get('Needed by')), r.get('Owner')]), 'No decisions waiting.'));
  }
  if (on('changes')) {
    const cr = store.records('tblChange').filter((r) => !['Implemented', 'Rejected', 'Withdrawn'].includes(r.get('Status')));
    parts.push(cap('TSA changes and extensions', 'TSA Changes, open requests'));
    parts.push(table(['CR', 'Change', 'Fee impact ', 'Decision due', 'Status'], cr.map((r) => [r.get('CR ID'), r.get('Title'), fmtMoney(r.get('Fee impact (calculated, reporting currency)'), sym) || '–', fmtDate(r.get('Decision due')), r.get('Status')]), 'No open change requests.'));
  }
  if (on('data')) {
    const dr = store.records('tblDataReq').filter((r) => !['Delivered', 'Rejected', 'Cancelled'].includes(r.get('Status')));
    parts.push(cap('Data requests', 'Data Requests, open'));
    parts.push(table(['DR', 'Data set', 'From', 'Due', 'Status'], dr.map((r) => [r.get('DR ID'), r.get('Data set requested'), r.get('Requested from'), fmtDate(r.get('Due date')) + (Number(r.get('Days late')) > 0 ? ` (${r.get('Days late')} days late)` : ''), r.get('Status')]), 'No open data requests.'));
  }
  if (on('sla')) {
    const below = live.filter((r) => ['Concern', 'Missed'].includes(r.get('Latest SLA result')));
    parts.push(cap('Service levels', `SLA tracker, services below standard${below.length ? '' : ''}`));
    parts.push(table(['TSA ID', 'Service', 'Latest month', 'Result', 'Months below '], below.map((r) => [r.get('TSA ID'), r.get('Service name'), fmtMonth(r.get('Latest SLA month')), chip(r.get('Latest SLA result'), r.get('Latest SLA result') === 'Missed' ? 'Red' : 'Amber'), String(r.get('Months below standard') || 0)]),
      `All ${plural(live.length, 'running service')} met their service levels in the latest month.`));
  }
  if (on('reg')) {
    const reg = store.records('tblREG');
    parts.push(cap('Regulatory approvals', 'Regulatory register'));
    parts.push(table(['Entity', 'Filing or approval', 'Regulator', 'Due', 'Status'], reg.map((r) => [r.get('Entity'), r.get('Filing or approval'), r.get('Regulator'), fmtDate(r.get('Due date')), chip(r.get('Status'), String(r.get('Status')).startsWith('Approved') ? 'Green' : r.get('Status') === 'Not started' ? 'n' : 'blue')]), 'No filings recorded.'));
  }
  if (on('costs')) parts.push(...costSection(store, tsa, cap));
  if (on('d1')) {
    const d1 = store.records('tblDay1').filter((r) => r.get('Status') !== 'Not required');
    const f1 = store.records('tblFirst100').filter((r) => r.get('Status') !== 'Not required');
    const pc = (xs) => `${xs.filter((r) => r.get('Status') === 'Complete').length} of ${xs.length} complete`;
    parts.push(cap('Day 1 and first 100 days', 'Day 1 and First 100 Days plans'));
    parts.push(h('p', { style: { margin: 0 } }, `Day 1 plan: ${pc(d1)}. First 100 days: ${pc(f1)}, ${f1.filter((r) => Number(r.get('Days late')) > 0 && r.get('Status') !== 'Complete').length} late.`));
  }
  parts.push(h('div.small.muted', { style: { marginTop: '22px', borderTop: '1px solid var(--line)', paddingTop: '6px' } }, `${office} · ${n.ProgName || ''} · produced ${fmtDate(Math.round(Date.now() / 86400000 + 25569))}`));
  return h('div', { id: 'pack' }, h('div.pack-page.invoice-page', { style: { background: '#fff', border: '1px solid var(--line)', borderRadius: '4px', padding: '30px 34px', fontSize: '13px' } }, parts));
}

// Fees by year and by quarter, estimated from the register: monthly fee x months running, with extension mark-ups.
function costSection(store, tsa, cap) {
  const n = store.names, RD = Number(n.RD) || 0, sym = n.CcySym || '';
  const months = {};
  const monthKey = (d) => d.getUTCFullYear() * 12 + d.getUTCMonth();
  tsa.forEach((r) => {
    const fee = Number(r.get('Monthly fee (reporting currency)')) || 0;
    const s0 = fromSerial(r.get('Service start')), e0 = fromSerial(r.get('Actual exit date') || r.get('Forecast exit date'));
    if (!fee || !s0 || !e0) return;
    const mks = fromSerial(r.get('Mark-up starts'));
    const rev = r.get('Direction') === 'Reverse';
    for (let k = monthKey(s0); k < monthKey(e0); k++) {
      const m = months[k] = months[k] || { f: 0, r: 0 };
      const up = mks && k >= monthKey(mks) ? 1 + (Number(n.MkPct1) || 0) : 1;
      m[rev ? 'r' : 'f'] += fee * up;
    }
  });
  const keys = Object.keys(months).map(Number).sort((a, b) => a - b);
  if (!keys.length) return [cap('TSA fees', ''), h('p.small.muted', 'No fees in the register yet.')];
  const rdK = monthKey(fromSerial(RD));
  const years = {}, quarters = {};
  keys.forEach((k) => {
    const y = Math.floor(k / 12), q = `Q${Math.floor((k % 12) / 3) + 1} ${String(y).slice(2)}`;
    years[y] = years[y] || { f: 0, r: 0 }; years[y].f += months[k].f; years[y].r += months[k].r;
    quarters[q] = quarters[q] || { v: 0, past: true, k }; quarters[q].v += months[k].f; if (k > rdK) quarters[q].past = false;
  });
  const fm = (v) => fmtMoney(v, sym);
  const yt = h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } },
    h('thead', h('tr', ['Year', 'Forward fees (we pay)', 'Reverse fees (we receive)', 'Net'].map((x, i) => h('th', { style: { textAlign: i ? 'right' : 'left', color: 'var(--muted)', fontSize: '11px', padding: '4px 6px', borderBottom: '1px solid var(--line)' } }, x)))),
    h('tbody', Object.entries(years).map(([y, v]) => h('tr', [y, fm(v.f), fm(v.r), fm(v.f - v.r)].map((c, i) => h('td', { style: { textAlign: i ? 'right' : 'left', padding: '6px', borderBottom: '1px solid var(--line-soft)', fontWeight: i === 3 ? 700 : 400 } }, c))))));
  // bar chart
  const qs = Object.entries(quarters);
  const max = Math.max(...qs.map(([, v]) => v.v)) || 1;
  const W = 640, H = 200, padL = 46, padB = 26, bw = (W - padL - 10) / qs.length;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('width', '100%'); svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Forward TSA fees by quarter');
  const el = (t, a, txt) => { const e = document.createElementNS(ns, t); Object.entries(a).forEach(([k, v]) => e.setAttribute(k, v)); if (txt != null) e.textContent = txt; svg.appendChild(e); return e; };
  const unit = max >= 1e6 ? 1e6 : 1e3, uL = unit === 1e6 ? 'm' : 'k';
  for (let i = 0; i <= 4; i++) {
    const y = H - padB - (H - padB - 14) * i / 4;
    el('line', { x1: padL, x2: W - 6, y1: y, y2: y, stroke: '#ECEFF3' });
    el('text', { x: padL - 6, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: '#5A6573' }, `${sym}${(max * i / 4 / unit).toFixed(1)}${uL}`);
  }
  qs.forEach(([q, v], i) => {
    const bh = (H - padB - 14) * v.v / max, x = padL + i * bw + bw * 0.15, y = H - padB - bh;
    el('rect', { x, y, width: bw * 0.7, height: bh, rx: 2, fill: v.past ? '#003A70' : '#AAB8C9' });
    el('text', { x: x + bw * 0.35, y: y - 4, 'text-anchor': 'middle', 'font-size': 9.5, fill: '#212529' }, `${(v.v / unit).toFixed(1)}${uL}`);
    el('text', { x: x + bw * 0.35, y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: '#5A6573' }, q);
  });
  return [cap('TSA fees', 'TSA register: monthly fees x months running, with extension mark-ups'), yt,
    h('div', { style: { marginTop: '12px' } }, h('div.small', { style: { fontWeight: 600, marginBottom: '4px' } }, 'Forward fees by quarter: dark = to date, light = forecast'), svg)];
}

function inp() { return { border: '1px solid var(--line-strong)', background: 'var(--input)', borderRadius: '6px', padding: '7px 9px', fontSize: '13px', width: '100%', minWidth: 0, resize: 'vertical' }; }
