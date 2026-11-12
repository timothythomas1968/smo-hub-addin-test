// TransitionSuite add-in shell (repository and code names keep the old smo-hub names): header, navigation, routing.
import { h, toast, fmtDate, setEdition, ed, realToday, installSelectFix } from './util.js?v=0.11.1.20261112220436';
import { ExcelSource, PreviewSource, Store } from './data.js?v=0.11.1.20261112220436';
import { openRDDialog } from './rd.js?v=0.11.1.20261112220436';
import home from './screens/home.js?v=0.11.1.20261112220436';
import register from './screens/register.js?v=0.11.1.20261112220436';
import raid from './screens/raid.js?v=0.11.1.20261112220436';
import dates from './screens/dates.js?v=0.11.1.20261112220436';
import interview from './screens/interview.js?v=0.11.1.20261112220436';
import report from './screens/report.js?v=0.11.1.20261112220436';
import invoice from './screens/invoice.js?v=0.11.1.20261112220436';
import pack from './screens/pack.js?v=0.11.1.20261112220436';
import plan from './screens/plan.js?v=0.11.1.20261112220436';
import setup from './screens/setup.js?v=0.11.1.20261112220436';
import contents from './screens/contents.js?v=0.11.1.20261112220436';
import { tidyTabs } from './tabs.js?v=0.11.1.20261112220436';
import { day1, f100 } from './screens/checklist.js?v=0.11.1.20261112220436';
import consolidated from './screens/consolidated.js?v=0.11.1.20261112220436';
import finance from './screens/finance.js?v=0.11.1.20261112220436';
import execSummary from './screens/exec.js?v=0.11.1.20261112220436';
import { people, changes, invoices, obligations, thirdparties, datareq, workorders } from './screens/registers.js?v=0.11.1.20261112220436';

export const VERSION = '0.11.1';

// The menu (0.10 item 2): the monthly routine, then the registers grouped together, then the plans.
const NAV = [
  { group: 'Every month', items: [
    ['home', 'Home', home], ['dates', 'Calendar', dates],
    ['report', 'Workstream report', report], ['consolidated', 'Consolidated reporting', consolidated],
    ['interview', 'Readiness interviews', interview],
    ['invoice', 'Our invoice', invoice],
    ['pack', 'Governance pack', pack]] },
  { group: 'Reports', items: [
    ['exec', 'Executive summary', execSummary], ['finance', 'Finance', finance]] },
  { group: 'Registers', items: [
    ['register', 'TSA register', register], ['people', 'People', people],
    ['changes', 'TSA changes', changes], ['invoices', 'Invoices log', invoices],
    ['raid', 'RAID and actions', raid], ['obligations', 'Obligations', obligations],
    ['thirdparties', 'Third parties', thirdparties], ['datareq', 'Data requests', datareq],
    ['workorders', 'Work orders', workorders]] },
  { group: 'Plans', items: [
    ['plan', 'Exit plan', plan],
    ['day1', 'Day 1 plan', day1],
    ['f100', 'First 100 days', f100]] },
  { group: 'Set-up', items: [['contents', 'Contents (every sheet)', contents], ['setup', 'Set-up wizard', setup]] }
];
const SCREENS = Object.fromEntries(NAV.flatMap((g) => g.items.map(([k, label, mod]) => [k, { k, label, mod }])));

const state = { screen: 'home', arg: null, store: null };

function go(k, arg) {
  if (!SCREENS[k]) return;
  state.screen = k; state.arg = arg ?? null;
  try { localStorage.setItem('smohub.screen', k); } catch (e) { /* storage unavailable */ }
  closeNav();
  render();
  document.querySelector('.main').scrollTop = 0;
  window.scrollTo(0, 0);
}

function closeNav() { document.querySelector('.nav')?.classList.remove('open'); }

function shell() {
  const s = state.store, n = s.names;
  const side = n.Perspective === 'Seller' ? `${n.SellerName || 'Seller'} (seller)` : `${n.BuyerName || 'Buyer'} (buyer)`;
  const preview = s.src.kind === 'preview';
  const nav = h('nav.nav', { 'aria-label': 'Hub sections' },
    NAV.map((g) => [h('span.nav-group', g.group.toUpperCase()),
      g.items.filter(([, , mod]) => !(mod.use && state.store && state.store.names[mod.use] === 'N')).map(([k, label, mod]) => h('button.nav-item', { type: 'button', 'data-k': k, onclick: () => go(k) }, label, mod.placeholder ? h('span.nav-soon', 'SOON') : null))]),
    h('div.nav-foot',
      h('button.btn.btn-sm', { type: 'button', onclick: refresh }, 'Refresh from the workbook'),
      h('span', 'Everything is saved in', h('br'), h('b', s.file)),
      h('span', `Add-in ${VERSION}`)));
  const app = h('div.app',
    h('header.top',
      h('button.icon-btn.menu-btn', { type: 'button', 'aria-label': 'Menu', onclick: () => document.querySelector('.nav').classList.toggle('open') }, '☰ Menu'),
      h('div.brand',
        h('div.brand-mark', svgMark()),
        h('div.brand-text', h('span.brand-name', h('b', 'Transition'), h('span.brand-suite', 'Suite'), h('span.brand-by', 'by Whisper Consulting')), h('span.brand-sub', `${n.ProgName || ed('Separation programme')} · ${side}`))),
      h('div.top-right',
        h('span.top-label', 'Reporting to'), h('button.top-date', { type: 'button', title: 'Change the reporting date', onclick: changeRD }, fmtDate(n.RD) || 'not set'),
        Number(n.Today) > 0 && Math.floor(Number(n.Today)) !== realToday() ? h('span.top-label', { title: 'This workbook fixes today at this date, so the demo tells the same story whatever the real date is. Overdue and due-soon alerts measure against it.' }, `Today: ${fmtDate(n.Today)} (demo)`) : null,
        preview ? h('span.pill-top.pill-preview', 'BROWSER PREVIEW') : null)),
    widthHint(),
    h('div.body', nav, h('div.scrim', { onclick: closeNav }), h('main.main', { id: 'main' })));
  document.body.replaceChildren(app);
}

// When someone edits a sheet directly, re-read the workbook so the panel never shows old values.
// The panel's own writes are ignored (they re-read already), and a half-filled form is never wiped.
let watchTimer = null;
function watchWorkbook() {
  try {
    Excel.run(async (ctx) => {
      ctx.workbook.worksheets.onChanged.add(async () => {
        if (Date.now() - (state.store.lastWrite || 0) < 3000) return;
        clearTimeout(watchTimer);
        watchTimer = setTimeout(async () => {
          if (Date.now() - (state.store.lastWrite || 0) < 3000) return;
          // Screens with their own sheet forms keep what is being typed: they only get a reminder.
          const ownForms = ['report', 'interview', 'invoice', 'setup'].includes(state.screen);
          const editing = ownForms || document.querySelector('.field.dirty, .modal-back');
          if (editing) { toast('The workbook has changed. When you have saved your edits, choose Refresh from the workbook to see the changes.'); return; }
          try { await state.store.refresh(); await render(); } catch (e) { /* the next change or Refresh will try again */ }
        }, 1200);
      });
      await ctx.sync();
    }).catch(() => { /* older Excel: Refresh still works */ });
  } catch (e) { /* not supported */ }
}

function changeRD() { openRDDialog(state.store, () => render()); }

// Office does not let an add-in set the panel's width, so suggest widening it while it is narrow.
function widthHint() {
  let off = false;
  try { off = localStorage.getItem('smohub.wideHint') === 'off'; } catch (e) { /* storage unavailable */ }
  if (off) return null;
  const el = h('div.hint-wide', { role: 'note' },
    h('span', h('b', 'Tip: '), 'drag the left edge of this panel to make it wider. TransitionSuite works best at half the screen or more.'),
    h('button.link-btn', { type: 'button', onclick: () => { el.remove(); try { localStorage.setItem('smohub.wideHint', 'off'); } catch (e) { /* ignore */ } } }, 'Hide'));
  const fit = () => { el.style.display = window.innerWidth < 900 ? '' : 'none'; };
  fit(); window.addEventListener('resize', fit);
  return el;
}

// The TransitionSuite mark (design/brand/transitionsuite-mark.svg): one square cleanly split in two, in its white tile.
function svgMark() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '20'); svg.setAttribute('height', '20'); svg.setAttribute('viewBox', '0 0 48 48'); svg.setAttribute('aria-hidden', 'true');
  for (const [d, fill] of [['M8 6 H25 L17 42 H8 A2 2 0 0 1 6 40 V8 A2 2 0 0 1 8 6 Z', '#003A70'], ['M31 6 H40 A2 2 0 0 1 42 8 V40 A2 2 0 0 1 40 42 H23 Z', '#007BFF']]) {
    const p = document.createElementNS(ns, 'path'); p.setAttribute('d', d); p.setAttribute('fill', fill); svg.appendChild(p);
  }
  return svg;
}

let renderSeq = 0;
// The title bar follows the workbook: the reporting date and names can change on any screen.
function updateTop() {
  const n = state.store.names, el = document.querySelector('.top-date');
  if (el) el.textContent = fmtDate(n.RD) || 'not set';
  const side = n.Perspective === 'Seller' ? `${n.SellerName || 'Seller'} (seller)` : `${n.BuyerName || 'Buyer'} (buyer)`;
  const sub = document.querySelector('.brand-sub');
  if (sub) sub.textContent = `${n.ProgName || ed('Separation programme')} · ${side}`;
}

async function render() {
  const sc = SCREENS[state.screen];
  updateTop();
  document.querySelectorAll('.nav-item').forEach((b) => (b.dataset.k === sc.k ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  const main = document.getElementById('main');
  const seq = ++renderSeq;
  const tables = sc.mod.tables || [];
  if (tables.some((t) => !state.store.has(t) || state.store.stale.has(t))) main.replaceChildren(loading('Reading the workbook…'));
  try {
    await state.store.need(tables);
    if (seq !== renderSeq) return;
    const ctx = { store: state.store, go, arg: state.arg, rerender: render, changeRD, preview: state.store.src.kind === 'preview' };
    updateTop();
    main.replaceChildren(sc.mod.render(ctx));
  } catch (e) {
    console.error(e);
    main.replaceChildren(h('div.banner.warn', `Could not read the workbook: ${e.message || e}`));
  }
}

async function refresh() {
  try { await state.store.refresh(); shell(); await render(); toast('Refreshed from the workbook'); }
  catch (e) { toast('Refresh failed: ' + (e.message || e), true); }
}

function loading(msg) { return h('div.loading', h('div.spinner'), msg); }

async function start(inExcel) {
  document.body.replaceChildren(loading('Opening TransitionSuite…'));
  try {
    const schema = await (await fetch('data/schema.json?v=0.11.1.20261112220436')).json();
    let src;
    if (inExcel) src = new ExcelSource();
    else {
      // Preview only: ?edition=US shows the US demo (US spelling and dates, in dollars).
      const us = /^us$/i.test(new URLSearchParams(location.search).get('edition') || '');
      const res = await fetch(us ? 'data/demo-data-US.json' : 'data/demo-data.json');
      if (!res.ok) throw new Error('TransitionSuite runs inside Excel. Open your TransitionSuite Hub workbook in Excel and choose TransitionSuite on the Home tab.');
      src = new PreviewSource(await res.json());
    }
    const store = new Store(src, schema);
    await store.init();
    if (inExcel && !store.names.ProgName && !store.names.RD) throw new Error('This workbook does not look like a TransitionSuite Hub. Open the Hub workbook, then open TransitionSuite again.');
    setEdition(store.names.Edition);
    if (inExcel) {
      // Open this panel automatically whenever this workbook is opened (the flag is saved inside the workbook).
      try {
        const st = Office.context.document.settings;
        if (st.get('Office.AutoShowTaskpaneWithDocument') !== true) { st.set('Office.AutoShowTaskpaneWithDocument', true); st.saveAsync(() => {}); }
      } catch (e) { /* not supported: ignore */ }
    }
    state.store = store;
    if (inExcel) { watchWorkbook(); tidyTabs(store).catch((e) => console.warn('tidy tabs', e)); }
    installSelectFix(new URLSearchParams(location.search).get('pick') === '1');   // Windows Excel; ?pick=1 tries it in a browser
    try { const k = localStorage.getItem('smohub.screen'); if (SCREENS[k]) state.screen = k; } catch (e) { /* ignore */ }
    // Until the required set-up questions are answered, the panel opens on the set-up wizard (Tim, 6 Nov 2026)
    if (Number(store.names.QReq) && (Number(store.names.QDone) || 0) < Number(store.names.QReq)) state.screen = 'setup';
    shell();
    await render();
  } catch (e) {
    console.error(e);
    document.body.replaceChildren(h('div', { style: { padding: '24px' } }, h('h1', 'TransitionSuite'), h('p.banner.warn', e.message || String(e))));
  }
}

if (window.Office && Office.onReady) {
  Office.onReady((info) => start(info && info.host === Office.HostType.Excel));
} else {
  start(false);
}
