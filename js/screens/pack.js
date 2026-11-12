// Governance pack: one pack per forum, built live from the registers, with the team's commentary (SMO, IMO, PMO...), the client's letterhead,
// and sections switched on or off per forum. Shared (joint) packs leave out internal-only sections and unshareable items.
import { h, fmtDate, fmtMonth, fmtMoney, fromSerial, toSerial, toast, printNode, plural, ed, team, theTeam, asOf, fieldBox, saveBlob, printNeedsFile } from '../util.js?v=0.11.2.20261112223532';
import { packDeck } from '../packdeck.js?v=0.11.2.20261112223532';
import { countTests, serviceCounts, COUNT_RULES } from '../counts.js?v=0.11.2.20261112223532';

const EXITED = new Set(['Exited', 'Terminated']);
const SECTIONS = [
  ['status', 'Workstream status', ''], ['exits', 'Closing in the next 90 days', ''], ['raid', 'Top risks and issues', ''], ['decisions', 'Decisions needed', ''],
  ['changes', 'TSA changes and extensions', ''], ['data', 'Data requests', ''], ['sla', 'Service levels', ''],
  ['obl', 'Obligations due', ''], ['consents', 'Vendor consents', 'internal'],
  ['reg', 'Regulatory approvals', 'internal'], ['costs', 'TSA fees', 'internal'], ['d1', 'Day 1 and first 100 days', 'auto']
];
function defaultsFor(name, joint) {
  const n = name.toLowerCase();
  if (n.includes('steer')) return ['status', 'exits', 'raid', 'decisions', 'obl', 'consents', 'reg', 'costs'];
  if (n.includes('tsa')) return ['exits', 'decisions', 'changes', 'sla', 'obl'];
  if (n.includes('change')) return ['changes', 'decisions', 'costs'];
  if (n.includes('data')) return ['data', 'raid'];
  if (n.includes('operational')) return ['exits', 'sla'];
  if (n.includes('workstream')) return ['status', 'raid'];
  return joint ? ['status', 'exits', 'raid', 'decisions'] : ['status', 'exits', 'raid', 'decisions', 'reg', 'costs'];
}
const ui = { forum: null };

export default {
  tables: ['tblForums', 'tblTSA', 'tblStatus', 'tblWorkstreams', 'tblRisks', 'tblIssues', 'tblDecisions', 'tblChange', 'tblDataReq', 'tblREG', 'tblDay1', 'tblFirst100', 'tblOBL', 'tblTPC'],
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
    // parts switched off in set-up never appear in a pack (Tim, 11 Nov 2026)
    const OFF = { data: ['Use_DR'], sla: ['Use_SLA'], obl: ['Use_OBL'], consents: ['Use_TPC'], reg: ['Use_REG'], changes: ['Mod_CR'], d1: ['Use_D1', 'Use_F100'] };
    const switchedOff = (k) => (OFF[k] || []).length > 0 && OFF[k].every((u) => store.names[u] === 'N');
    const on = (k) => (switchedOff(k) ? false : k === 'd1' ? d1Due : (k === 'reg' || k === 'costs') && f.joint ? false : chosen.includes(k));
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

    const pack = buildPack(store, f, on, comms[commKey] || '', ctx.go);
    const side = h('aside.panel', { 'aria-label': 'Pack contents' },
      h('div.panel-head', h('span.panel-id', f.joint ? 'Shared with the other party' : 'Internal'), h('h2.panel-title', 'Contents')),
      h('div.panel-body',
        fieldBox(`${team()} commentary for this pack`, commIn),
        h('div.sec', 'Sections'),
        SECTIONS.filter(([k]) => !switchedOff(k)).map(([k, label, kind]) => {
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
        h('div', h('h1', 'Governance pack'), h('p.lede', `Built from the registers as at ${fmtDate(RD)}. Pick the forum, write your commentary, then print, save as PDF or make PowerPoint slides. Select an ID or a workstream to see the detail behind it.`)),
        h('button.btn', { type: 'button', onclick: async (e) => {
          const b = e.currentTarget; b.disabled = true;
          try { const cm = document.getElementById('pack-comm'); const blob = await packDeck({ ...pack.model, commentary: cm ? cm.textContent : pack.model.commentary }); saveBlob(blob, `${f.name} pack ${fmtMonth(RD)}.pptx`); toast(printNeedsFile() ? 'Choose where to save the slides (next time the Mac offers the same folder), then open them from there. Everything can be edited, including the charts (Edit Data).' : 'Slides saved to your Downloads: choose Open file to open them in PowerPoint. Everything can be edited, including the charts (Edit Data).'); }
          catch (err) { toast('Could not make the slides: ' + (err.message || err), true); }
          finally { b.disabled = false; }
        } }, 'PowerPoint (.pptx)'),
        h('button.btn.btn-primary', { type: 'button', onclick: () => printNode(document.getElementById('pack'), `${f.name} pack ${fmtMonth(RD)}`) }, 'Print or save as PDF')),
      h('div.filters', forums.map((x) => h('button.fchip', { type: 'button', 'aria-pressed': String(x.name === f.name), title: x.sub, onclick: () => { ui.forum = x.name; ctx.rerender(); } }, x.name, h('span.n', x.joint ? 'shared' : 'internal')))),
      h('div.row-wrap', h('div', { style: { flex: '999 1 600px', minWidth: 0 } }, pack), side));
  }
};

function buildPack(store, f, on, commentary, go) {
  // Drill-down (Tim, 6 Nov 2026): IDs and workstream names open the item behind them. In print and PDF they are plain text.
  const drill = (text, k, arg) => (go && text ? h('button.drill', { type: 'button', title: 'Open the detail', onclick: () => go(k, arg) }, text) : text);
  const n = store.names, RD = Number(n.RD) || 0, sym = n.CcySym || '';
  const shared = f.joint;
  const ok = (r) => !shared || r.get('Shareable') === 'Y';
  const tsa = store.records('tblTSA');
  const live = tsa.filter((r) => !EXITED.has(r.get('Status')));
  const wsName = Object.fromEntries(store.records('tblWorkstreams').map((r) => [r.get('Code'), r.get('Name')]));
  const st = store.records('tblStatus').filter((r) => (r.get('Scope') || 'Overall') === 'Overall');
  const per = Math.max(0, ...st.map((r) => Number(r.get('Period')) || 0));
  const cur = st.filter((r) => Number(r.get('Period')) === per);
  const prog = cur.find((r) => r.get('Workstream') === ed('Programme'));
  const NOW = asOf(n), CT = countTests(NOW), cnt = serviceCounts(tsa, NOW);   // the same counts as Home and the TSA register
  const byExit = (a, b) => a.get('Forecast exit date') - b.get('Forecast exit date');
  const exits90 = tsa.filter(CT.soon).sort(byExit), exitsLate = tsa.filter(CT.overdue).sort(byExit);
  const decAll = store.records('tblDecisions').filter((r) => r.get('Status') === 'Open' && ok(r));
  const decisions = decAll.filter((r) => r.get('Decided by') === f.name);   // each forum's pack shows only its own decisions (Tim, 6 Nov 2026)
  const decNoForum = shared ? [] : decAll.filter((r) => !r.get('Decided by'));
  const office = store.src.getSetting('office-name') || 'Separation Management Office';
  const logo = store.src.getSetting('logo');
  const ours = n.Perspective === 'Seller' ? n.SellerName : n.BuyerName, theirs = n.Perspective === 'Seller' ? n.BuyerName : n.SellerName;

  // What the slides are built from (the PowerPoint button): every section's title, tables and text, as plain values.
  const model = { sections: [], tiles: [], commentary, forum: f.name, shared, ours, theirs, office, logo, period: fmtMonth(RD), asAt: fmtDate(RD), prog: n.ProgName || '' };
  let curSec = null;
  const note = (text) => { if (curSec && text) curSec.items.push({ text }); };
  const cap = (t, src) => { curSec = { title: t, src, items: [] }; model.sections.push(curSec); return capEl(t, src); };
  const capEl = (t, src) => h('div', { style: { margin: '22px 0 8px', display: 'flex', alignItems: 'baseline', gap: '10px', borderBottom: '2px solid var(--navy)', paddingBottom: '4px' } },
    h('h3', { style: { margin: 0, fontSize: '13px', letterSpacing: '.8px', color: 'var(--navy)' } }, t.toUpperCase()), src ? h('span.small.muted', src) : null);
  const chip = (v, cls) => h('span.chip', { class: cls || v }, v);
  const table = (heads, rows, empty) => { if (curSec) curSec.items.push({ heads, rows: rows.map((r) => r.map(cellOut)), empty }); return tableEl(heads, rows, empty); };
  const tableEl = (heads, rows, empty) => rows.length ? h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } },
    h('thead', h('tr', heads.map((x) => h('th', { style: { textAlign: x.endsWith(' ') ? 'right' : 'left', color: 'var(--muted)', fontSize: '11px', padding: '4px 6px', borderBottom: '1px solid var(--line)' } }, x.trim())))),
    h('tbody', rows.map((cells) => h('tr', cells.map((c, i) => h('td', { style: { padding: '6px', borderBottom: '1px solid var(--line-soft)', verticalAlign: 'top', textAlign: heads[i].endsWith(' ') ? 'right' : 'left', whiteSpace: i === 0 ? 'nowrap' : null } }, c))))))
    : h('p.small.muted', empty);

  const tiles = [
    ['Overall', prog ? prog.get('RAG') : '–', prog ? { Red: 'var(--r-fg)', Amber: 'var(--a-fg)', Green: 'var(--g-fg)' }[prog.get('RAG')] : null],
    ['Services closed', `${cnt.closed} of ${cnt.total}`],
    ['Closing in 90 days', String(cnt.soon) + (cnt.overdue ? ` (+${cnt.overdue} overdue)` : '')],
    shared ? ['Decisions needed', String(decisions.length)] : ['Forward fees to date', fmtMoney(n.FEE_FwdActTot, sym)]
  ];
  model.tiles = tiles.map(([l, v]) => [l, v]);
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
    h('div.small', { style: { fontWeight: 700, color: 'var(--navy)', letterSpacing: '.6px' } }, `FROM ${theTeam().toUpperCase()}`), h('div', { id: 'pack-comm', style: { whiteSpace: 'pre-wrap', marginTop: '2px' } }, commentary)));

  if (on('status')) {
    parts.push(cap('Workstream status', `Consolidated WS Reporting, ${fmtMonth(per)}`));
    curSec.status = cur.map((r) => ({ ws: wsName[r.get('Workstream')] || r.get('Workstream'), rag: r.get('RAG') || '', text: (shared ? r.get('Shared summary') : r.get('Summary')) || '', path: ['Amber', 'Red'].includes(r.get('RAG')) ? r.get('Path to green') || '' : '' }));
    parts.push(h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px 18px' } },
      cur.map((r) => h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid var(--line-soft)' } },
        h('span', { style: { width: '62px', flex: '0 0 62px' } }, chip(r.get('RAG') || '–')),
        h('div', { style: { minWidth: 0 } }, h('div', { style: { fontWeight: 600, fontSize: '12.5px' } }, drill(wsName[r.get('Workstream')] || r.get('Workstream'), 'report', { ws: r.get('Workstream') })),
          h('div.small', { style: { color: 'var(--heading)' } }, shared ? r.get('Shared summary') : r.get('Summary')),
          // Amber and red workstreams show their path to green (Tim's evaluation, H)
          ['Amber', 'Red'].includes(r.get('RAG')) && r.get('Path to green') ? h('div.small', { style: { marginTop: '3px', color: 'var(--a-fg)' } }, h('b', 'Path to green: '), r.get('Path to green')) : null)))));
  }
  if (on('exits')) {
    parts.push(cap('Closing in the next 90 days', 'TSA register and Exit Readiness'));
    const exRow = (r) => [drill(r.get('TSA ID'), 'register', { id: r.get('TSA ID') }), r.get('Service name') + (r.get('Direction') === 'Reverse' ? ' (reverse)' : ''), fmtDate(r.get('Forecast exit date')), chip(r.get('Exit readiness RAG') || '–'), chip(r.get('Service delivery RAG') || '–')];
    parts.push(table(['TSA ID', 'Service', 'Exit', 'Readiness', 'Delivery'], exits90.map(exRow), 'No exits in the next 90 days.'));
    if (exitsLate.length) { parts.push(h('div.small', { style: { margin: '10px 0 4px', fontWeight: 700, color: 'var(--r-fg)' } }, 'Exit overdue: forecast exit date passed, no actual exit entered')); note('Exit overdue: forecast exit date passed, no actual exit entered'); parts.push(table(['TSA ID', 'Service', 'Exit', 'Readiness', 'Delivery'], exitsLate.map(exRow), '')); }
    parts.push(h('p.small.muted', { style: { margin: '6px 0 0' } }, `${COUNT_RULES.soon} Counted on ${fmtDate(NOW)}.`)); note(`${COUNT_RULES.soon} Counted on ${fmtDate(NOW)}.`);
  }
  if (on('raid')) {
    const open = (s) => ['Open', 'In progress'].includes(s);
    const risks = store.records('tblRisks').filter((r) => open(r.get('Status (adopt or remove)')) && ['Red', 'Amber'].includes(r.get('Rating')) && ok(r)).sort((a, b) => b.get('Score') - a.get('Score')).slice(0, 6);
    const iss = store.records('tblIssues').filter((r) => open(r.get('Status')) && ok(r)).slice(0, 6);
    parts.push(cap('Top risks and issues', shared ? 'Risks and Issues marked shareable' : 'Risks (red and amber) and open issues'));
    parts.push(table(['ID', 'Item', 'Owner', 'Rating'], [...risks.map((r) => [drill(r.get('Risk ID'), 'raid', { tab: 'RSK', id: r.get('Risk ID') }), r.get('Risk'), r.get('Owner'), chip(r.get('Rating'))]), ...iss.map((r) => [drill(r.get('Issue ID'), 'raid', { tab: 'ISS', id: r.get('Issue ID') }), r.get('Issue'), r.get('Owner'), chip(r.get('Priority'))])], shared ? 'No shareable risks or issues.' : 'No red or amber risks or open issues.'));
  }
  if (on('decisions')) {
    const decRow = (r) => [drill(r.get('Decision ID'), 'raid', { tab: 'DEC', id: r.get('Decision ID') }), r.get('Decision needed'), fmtDate(r.get('Needed by')), r.get('Owner')];
    parts.push(cap('Decisions needed', `Decisions log: for ${f.name}`));
    parts.push(table(['ID', 'Decision needed', 'Needed by', 'Owner'], decisions.map(decRow), `No decisions waiting for ${f.name}.`));
    if (decNoForum.length) { parts.push(h('div.small', { style: { margin: '10px 0 4px', fontWeight: 700 } }, 'No forum named yet: choose who decides in the Decisions log')); note('No forum named yet: choose who decides in the Decisions log'); parts.push(table(['ID', 'Decision needed', 'Needed by', 'Owner'], decNoForum.map(decRow), '')); }
  }
  if (on('changes')) {
    const all = store.records('tblChange').filter((r) => r.get('Request type') !== 'Forecast change');
    const open = all.filter((r) => /^(Draft|Submitted|Pending|Under review)$/.test(r.get('Status')));
    const forumNames = new Set(all.map((r) => r.get('Approval forum')).filter(Boolean));
    const mine = forumNames.has(f.name) ? open.filter((r) => r.get('Approval forum') === f.name) : open;   // this forum's own requests, when it has any
    const approved = all.filter((r) => r.get('Status') === 'Approved');
    const crRow = (r) => [drill(r.get('CR ID'), 'changes', { id: r.get('CR ID') }), [r.get('Title'), r.get('Impact summary') ? h('div.small.muted', r.get('Impact summary')) : null], fmtMoney(r.get('Fee impact (calculated, reporting currency)'), sym) || '–', fmtDate(r.get('Decision due')), r.get('Status')];
    parts.push(cap('TSA changes and extensions', forumNames.has(f.name) ? `TSA Changes: outstanding for ${f.name}` : 'TSA Changes, open requests'));
    parts.push(table(['CR', 'Change', 'Fee impact ', 'Decision due', 'Status'], mine.map(crRow), 'No change requests waiting for a decision.'));
    if (approved.length) { parts.push(h('div.small', { style: { margin: '10px 0 4px', fontWeight: 700 } }, 'Approved, not yet implemented')); note('Approved, not yet implemented'); parts.push(table(['CR', 'Change', 'Fee impact ', 'Decision due', 'Status'], approved.map(crRow), '')); }
  }
  if (on('data')) {
    const dr = store.records('tblDataReq').filter((r) => !['Delivered', 'Rejected', 'Cancelled', 'Canceled'].includes(r.get('Status')));
    parts.push(cap('Data requests', 'Data Requests, open'));
    parts.push(table(['DR', 'Data set', 'From', 'Due', 'Status'], dr.map((r) => [drill(r.get('DR ID'), 'datareq', { id: r.get('DR ID') }), r.get('Data set requested'), r.get('Requested from'), fmtDate(r.get('Due date')) + (Number(r.get('Days late')) > 0 ? ` (${r.get('Days late')} days late)` : ''), r.get('Status')]), 'No open data requests.'));
  }
  if (on('sla')) {
    const below = live.filter((r) => ['Concern', 'Missed'].includes(r.get('Latest SLA result')));
    parts.push(cap('Service levels', `SLA tracker, services below standard${below.length ? '' : ''}`));
    parts.push(table(['TSA ID', 'Service', 'Latest month', 'Result', 'Months below '], below.map((r) => [drill(r.get('TSA ID'), 'register', { id: r.get('TSA ID') }), r.get('Service name'), fmtMonth(r.get('Latest SLA month')), chip(r.get('Latest SLA result'), r.get('Latest SLA result') === 'Missed' ? 'Red' : 'Amber'), String(r.get('Months below standard') || 0)]),
      `All ${plural(live.length, 'running service')} met their service levels in the latest month.`));
  }
  if (on('obl') && store.has('tblOBL')) {   // 0.10 item 7: obligations due in the next 60 days, and any overdue
    const obl = store.records('tblOBL').filter((r) => r.get('Status (adopt or remove)') === 'Open' && Number(r.get('Next due date')) && Number(r.get('Next due date')) <= NOW + 60)
      .sort((a, b) => a.get('Next due date') - b.get('Next due date'));
    parts.push(cap('Obligations due', 'Obligations, next 60 days'));
    parts.push(table(['ID', 'Obligation', 'Agreement', 'Due', 'Owner'], obl.map((r) => [drill(r.get('OBL ID'), 'obligations', { id: r.get('OBL ID') }), r.get('Description'), `${r.get('Agreement')} ${r.get('Clause')}`.trim(),
      fmtDate(r.get('Next due date')) + (Number(r.get('Next due date')) < NOW ? ' (overdue)' : ''), r.get('Owner')]), 'No obligations due in the next 60 days.'));
  }
  if (on('consents') && !shared && store.has('tblTPC')) {   // 0.10 item 7: vendor consents obtained, outstanding, and the consent cap used
    const tpc = store.records('tblTPC').filter((r) => ['Consent', 'Assign', 'Novate', 'Right to use'].includes(r.get('Action needed')));
    const got = tpc.filter((r) => r.get('Status') === 'Agreed' || r.get('Status') === 'Not needed');
    const out = tpc.filter((r) => !got.includes(r));
    const capV = Number(n.ConsentCap) || 0, used = Number(n.TPC_OurTotal) || 0;
    parts.push(cap('Vendor consents', 'Third Parties'));
    note(`${got.length} of ${tpc.length} consents obtained; ${out.length} outstanding` + (capV ? `; consent cap used ${fmtMoney(used, sym)} of ${fmtMoney(capV, sym)} (${Math.round(used / capV * 100)}%)` : '') + '.');
    parts.push(h('div', { style: { display: 'flex', gap: '18px', flexWrap: 'wrap', margin: '0 0 8px' } },
      h('div', h('b', `${got.length} of ${tpc.length}`), h('div.small.muted', 'obtained')),
      h('div', h('b', { style: { color: out.length ? 'var(--a-fg)' : null } }, String(out.length)), h('div.small.muted', 'outstanding')),
      capV ? h('div', h('b', `${fmtMoney(used, sym)} of ${fmtMoney(capV, sym)}`), h('div.small.muted', `consent cap used (${Math.round(used / capV * 100)}%)`)) : null));
    parts.push(table(['ID', 'Vendor', 'Contract', 'Due', 'Status'], out.map((r) => [drill(r.get('TPC ID'), 'thirdparties', { id: r.get('TPC ID') }), r.get('Vendor'), r.get('Contract'), fmtDate(r.get('Response due')), r.get('Status')]), 'Every consent needed has been obtained.'));
  }
  if (on('reg')) {
    const reg = store.records('tblREG');
    parts.push(cap('Regulatory approvals', 'Regulatory register'));
    parts.push(table(['Entity', 'Filing or approval', 'Regulator', 'Due', 'Status'], reg.map((r) => [r.get('Entity'), r.get('Filing or approval'), r.get('Regulator'), fmtDate(r.get('Due date')), chip(r.get('Status'), String(r.get('Status')).startsWith('Approved') ? 'Green' : r.get('Status') === 'Not started' ? 'n' : 'blue')]), 'No filings recorded.'));
  }
  if (on('costs')) parts.push(...costSection(store, tsa, cap, (d) => { if (curSec) curSec.fees = d; }, drill));
  if (on('d1')) {
    const d1 = store.records('tblDay1').filter((r) => r.get('Status') !== 'Not required');
    const f1 = store.records('tblFirst100').filter((r) => r.get('Status') !== 'Not required');
    const pc = (xs) => `${xs.filter((r) => r.get('Status') === 'Complete').length} of ${xs.length} complete`;
    parts.push(cap('Day 1 and first 100 days', 'Day 1 and First 100 Days plans'));
    const d1txt = `Day 1 plan: ${pc(d1)}. First 100 days: ${pc(f1)}, ${f1.filter((r) => Number(r.get('Days late')) > 0 && r.get('Status') !== 'Complete').length} late.`;
    parts.push(h('p', { style: { margin: 0 } }, d1txt)); note(d1txt);
  }
  parts.push(h('div.small.muted', { style: { marginTop: '22px', borderTop: '1px solid var(--line)', paddingTop: '6px' } }, `${office} · ${n.ProgName || ''} · produced ${fmtDate(Math.round(Date.now() / 86400000 + 25569))}`));
  const root = h('div', { id: 'pack' }, h('div.pack-page.invoice-page', { style: { background: '#fff', border: '1px solid var(--line)', borderRadius: '4px', padding: '30px 34px', fontSize: '13px' } }, parts));
  root.model = model;
  return root;
}

// A table cell as plain text for the slides, with the RAG colour when it is a chip.
function cellOut(c) {
  if (c == null) return { t: '' };
  if (typeof c !== 'object') return { t: String(c) };
  if (Array.isArray(c)) return { t: c.map((x) => (x == null ? '' : typeof x === 'object' ? x.textContent : String(x))).filter(Boolean).join(' — ') };
  const chip = c.classList && c.classList.contains('chip') ? c : c.querySelector ? c.querySelector('.chip') : null;
  const rag = chip ? ['Red', 'Amber', 'Green'].find((k) => chip.classList.contains(k)) : null;
  return { t: c.textContent, rag };
}

// Fees by year and by quarter, estimated from the register: monthly fee x months running, with extension mark-ups.
function costSection(store, tsa, cap, rec, drill = (t) => t) {
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
    h('thead', h('tr', ['Year', 'Forward fees (we pay)', 'Reverse fees (we receive)'].map((x, i) => h('th', { style: { textAlign: i ? 'right' : 'left', color: 'var(--muted)', fontSize: '11px', padding: '4px 6px', borderBottom: '1px solid var(--line)' } }, x)))),
    h('tbody', Object.entries(years).map(([y, v]) => h('tr', [drill(y, 'finance', { year: Number(y) }), fm(v.f), fm(v.r)].map((c, i) => h('td', { style: { textAlign: i ? 'right' : 'left', padding: '6px', borderBottom: '1px solid var(--line-soft)' } }, c))))));
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
  const capNode = cap('TSA fees', 'TSA register: monthly fees x months running, with extension mark-ups');
  if (rec) rec({ sym, years: Object.entries(years).map(([y, v]) => [y, v.f, v.r]), quarters: qs.map(([q, v]) => [q, v.past ? v.v : 0, v.past ? 0 : v.v]) });
  const more = h('div.small', { style: { marginTop: '6px' } }, drill('Open the full financial analysis (Finance) ›', 'finance', {}));
  return [capNode, yt, more,
    h('div', { style: { marginTop: '12px' } }, h('div.small', { style: { fontWeight: 600, marginBottom: '4px' } }, 'Forward fees by quarter: dark = to date, light = forecast'), svg)];
}

function inp() { return { border: '1px solid var(--line-strong)', background: 'var(--input)', borderRadius: '6px', padding: '7px 9px', fontSize: '13px', width: '100%', minWidth: 0, resize: 'vertical' }; }
