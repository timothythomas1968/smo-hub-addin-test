// SMO Hub add-in shell: header, navigation, routing between screens.
import { h, toast, fmtDate, setEdition } from './util.js?v=0.8.1.20261030222244';
import { ExcelSource, PreviewSource, Store } from './data.js?v=0.8.1.20261030222244';
import home from './screens/home.js?v=0.8.1.20261030222244';
import register from './screens/register.js?v=0.8.1.20261030222244';
import raid from './screens/raid.js?v=0.8.1.20261030222244';
import dates from './screens/dates.js?v=0.8.1.20261030222244';
import interview from './screens/interview.js?v=0.8.1.20261030222244';
import report from './screens/report.js?v=0.8.1.20261030222244';
import invoice from './screens/invoice.js?v=0.8.1.20261030222244';
import pack from './screens/pack.js?v=0.8.1.20261030222244';
import plan from './screens/plan.js?v=0.8.1.20261030222244';
import setup from './screens/setup.js?v=0.8.1.20261030222244';
import { day1, f100 } from './screens/checklist.js?v=0.8.1.20261030222244';

export const VERSION = '0.8.1';

const NAV = [
  { group: 'Every month', items: [
    ['home', 'Home', home], ['dates', 'Key dates', dates],
    ['register', 'TSA register', register], ['plan', 'Exit plan', plan],
    ['raid', 'RAID and actions', raid], ['report', 'Workstream report', report],
    ['interview', 'Readiness interviews', interview],
    ['invoice', 'Our invoice', invoice],
    ['pack', 'Governance pack', pack]] },
  { group: 'Closing and after', items: [
    ['day1', 'Day 1 plan', day1],
    ['f100', 'First 100 days', f100]] },
  { group: 'Set-up', items: [['setup', 'Set-up wizard', setup]] }
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
      g.items.map(([k, label, mod]) => h('button.nav-item', { type: 'button', 'data-k': k, onclick: () => go(k) }, label, mod.placeholder ? h('span.nav-soon', 'SOON') : null))]),
    h('div.nav-foot',
      h('button.btn.btn-sm', { type: 'button', onclick: refresh }, 'Refresh from the workbook'),
      h('span', 'Everything is saved in', h('br'), h('b', s.file)),
      h('span', `Add-in ${VERSION}`)));
  const app = h('div.app',
    h('header.top',
      h('button.icon-btn.menu-btn', { type: 'button', 'aria-label': 'Menu', onclick: () => document.querySelector('.nav').classList.toggle('open') }, '☰ Menu'),
      h('div.brand',
        h('div.brand-mark', svgMark()),
        h('div.brand-text', h('span.brand-name', 'SMO Hub'), h('span.brand-sub', `${n.ProgName || 'Separation programme'} · ${side}`))),
      h('div.top-right',
        h('span.top-label', 'Reporting to'), h('span.top-date', fmtDate(n.RD) || 'not set'),
        preview ? h('span.pill-top.pill-preview', 'BROWSER PREVIEW') : null)),
    h('div.body', nav, h('div.scrim', { onclick: closeNav }), h('main.main', { id: 'main' })));
  document.body.replaceChildren(app);
}

function svgMark() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('width', '18'); svg.setAttribute('height', '18'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', 'M4 7h16M4 12h10M4 17h7'); p.setAttribute('stroke', '#003A70'); p.setAttribute('stroke-width', '2.4'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('fill', 'none');
  svg.appendChild(p);
  return svg;
}

let renderSeq = 0;
async function render() {
  const sc = SCREENS[state.screen];
  document.querySelectorAll('.nav-item').forEach((b) => (b.dataset.k === sc.k ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
  const main = document.getElementById('main');
  const seq = ++renderSeq;
  const tables = sc.mod.tables || [];
  if (tables.some((t) => !state.store.has(t) || state.store.stale.has(t))) main.replaceChildren(loading('Reading the workbook…'));
  try {
    await state.store.need(tables);
    if (seq !== renderSeq) return;
    const ctx = { store: state.store, go, arg: state.arg, rerender: render, preview: state.store.src.kind === 'preview' };
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
  document.body.replaceChildren(loading('Opening SMO Hub…'));
  try {
    const schema = await (await fetch('data/schema.json?v=0.8.1.20261030222244')).json();
    let src;
    if (inExcel) src = new ExcelSource();
    else {
      const res = await fetch('data/demo-data.json?v=0.8.1.20261030222244');
      if (!res.ok) throw new Error('SMO Hub runs inside Excel. Open your SMO Hub workbook in Excel and choose SMO Hub on the Home tab.');
      src = new PreviewSource(await res.json());
    }
    const store = new Store(src, schema);
    await store.init();
    if (inExcel && !store.names.ProgName && !store.names.RD) throw new Error('This workbook does not look like an SMO Hub. Open the SMO Hub workbook, then open the add-in again.');
    setEdition(store.names.Edition);
    if (inExcel) {
      // Open this panel automatically whenever this workbook is opened (the flag is saved inside the workbook).
      try {
        const st = Office.context.document.settings;
        if (st.get('Office.AutoShowTaskpaneWithDocument') !== true) { st.set('Office.AutoShowTaskpaneWithDocument', true); st.saveAsync(() => {}); }
      } catch (e) { /* not supported: ignore */ }
    }
    state.store = store;
    try { const k = localStorage.getItem('smohub.screen'); if (SCREENS[k]) state.screen = k; } catch (e) { /* ignore */ }
    shell();
    await render();
  } catch (e) {
    console.error(e);
    document.body.replaceChildren(h('div', { style: { padding: '24px' } }, h('h1', 'SMO Hub'), h('p.banner.warn', e.message || String(e))));
  }
}

if (window.Office && Office.onReady) {
  Office.onReady((info) => start(info && info.host === Office.HostType.Excel));
} else {
  start(false);
}
