// TransitionSuite outside Excel (the Connected level; build waves P8): a Teams tab or web page for leads and executives.
// connected.html?tenant=&client=&site=&view=report|request|exec|finance&ws=CUS   (&source=preview: the demo, no sign-in)
// It reads the snapshot the Hub publishes to the programme's SharePoint site and runs the panel's own screens on it
// (GraphSource in data.js). Leads send their workstream report and change requests back as items on the submissions list;
// nothing is written to the Hub from here, and nothing is kept on the web host.
import { h, toast, fmtDate, setEdition, ed, theTeam } from './util.js?v=0.12.7.20261121230531';
import { GraphSource, Store } from './data.js?v=0.12.7.20261121230531';
import myreport from './screens/myreport.js?v=0.12.7.20261121230531';
import request from './screens/request.js?v=0.12.7.20261121230531';
import execSummary from './screens/exec.js?v=0.12.7.20261121230531';
import finance from './screens/finance.js?v=0.12.7.20261121230531';
import { PUBLISHED } from './connected.js?v=0.12.7.20261121230531';

const VIEWS = { report: ['My workstream report', myreport], request: ['Request a change', request], exec: ['Executive summary', execSummary], finance: ['Finance', finance] };
const q = new URLSearchParams(location.search);
const KEY = 'transitionsuite.connected';
let cfg = {};
try { cfg = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { cfg = {}; }
['tenant', 'client', 'site'].forEach((k) => { if (q.get(k)) cfg[k] = q.get(k); });
try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* storage blocked */ }
const state = { view: VIEWS[q.get('view')] ? q.get('view') : 'report', store: null, arg: null };

const page = (...kids) => { document.body.replaceChildren(h('main', { style: { padding: '24px max(16px, env(safe-area-inset-left, 0px))', maxWidth: '720px', margin: '0 auto' } }, h('h1', 'TransitionSuite'), ...kids)); };
const say = (text) => page(h('div.loading', h('div.spinner'), text));

async function client() {
  if (window.__graphStandIn) return window.__graphStandIn;   // tests: stand-in Microsoft services
  if (q.get('source') === 'preview') {
    return { sent: [], async listAdd(list, title, payload) { this.sent.push({ list, title, payload }); window.__sent = this.sent; return { id: String(this.sent.length) }; },
      async readSnapshot() { const r = await fetch(/^us$/i.test(q.get('edition') || '') ? 'data/demo-data-US.json' : 'data/demo-data.json'); return r.json(); },
      async call() { return { displayName: 'Demo lead' }; } };
  }
  if (!cfg.tenant || !cfg.client || !cfg.site) throw Object.assign(new Error('settings'), { settings: true });
  const g = window.GraphClient.create({ tenant: cfg.tenant, client: cfg.client, site: cfg.site, base: location.href });
  await g.start();
  return g;
}

function askSettings() {
  const box = (k, label) => h('div.field', h('label.field-label', { for: 'c-' + k }, label), h('input', { id: 'c-' + k, type: 'text', value: cfg[k] || '' }));
  page(h('section.card', h('h2', 'Connect to the programme site'),
    h('p.small.muted', `Your ${theTeam()} sends you a link with these filled in. They are kept on this device only, and none of them is secret.`),
    box('tenant', 'Tenant ID'), box('client', 'Application (client) ID'), box('site', 'SharePoint site address'),
    h('button.btn.btn-primary', { type: 'button', onclick: () => {
      ['tenant', 'client', 'site'].forEach((k) => { cfg[k] = document.getElementById('c-' + k).value.trim(); });
      try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* storage blocked */ }
      start();
    } }, 'Connect')));
}

async function start() {
  say('Opening TransitionSuite…');
  try {
    const schema = await (await fetch('data/schema.json?v=0.12.7.20261121230531')).json();
    const g = await client();
    // A browser blocks a sign-in pop-up that a page opens by itself: in a web page, sign in from a button click.
    if (g.host && g.host.kind === 'web' && !g.signedIn) {
      await new Promise((ok) => page(h('section.card', h('p', 'Sign in with your work account to see the programme.'),
        h('button.btn.btn-primary', { type: 'button', onclick: async () => { try { await g.signIn(); g.signedIn = true; ok(); } catch (e) { toast('Could not sign in: ' + (e.message || e), true); } } }, 'Sign in with Microsoft 365'))));
    }
    say('Reading the programme…');
    const snap = await g.readSnapshot(PUBLISHED);
    let who = '';
    try { who = (await g.call('/me')).displayName || ''; } catch (e) { /* the name only labels what is sent */ }
    const store = new Store(new GraphSource(snap, g, who), schema);
    await store.init();
    setEdition(store.names.Edition);
    state.store = store;
    render();
  } catch (e) {
    if (e.settings) return askSettings();
    console.error(e);
    page(h('div.banner.warn', /nothing published/.test(e.message || '') ? `The programme has not been published yet. Ask ${theTeam()} to publish it from the TransitionSuite panel (Connected level).` : 'Could not open the programme: ' + (e.message || e)),
      h('button.btn', { type: 'button', onclick: start }, 'Try again'));
  }
}

function go(k, arg) {
  if (!VIEWS[k]) { toast('That part is in the Hub itself. Ask ' + theTeam() + '.'); return; }
  state.view = k; state.arg = arg || null; render();
}

async function render() {
  const s = state.store, n = s.names, [label, mod] = VIEWS[state.view];
  const main = h('main.main', { id: 'main' }, h('div.loading', h('div.spinner'), 'Reading…'));
  document.body.replaceChildren(h('div.app.app-connected',
    h('header.top', h('div.brand', h('div.brand-text', h('span.brand-name', h('b', 'Transition'), h('span.brand-suite', 'Suite')), h('span.brand-sub', `${n.ProgName || ed('Separation programme')}`))),
      h('div.top-right', h('span.top-label', 'Published'), h('span.top-date', s.src.snap.published ? fmtDate(Date.parse(s.src.snap.published) / 864e5 + 25569) : 'not dated'),
        s.src.who ? h('span.top-label', s.src.who) : null)),
    h('nav', { 'aria-label': 'Views', style: { display: 'flex', gap: '6px', flexWrap: 'wrap', padding: '10px max(16px, env(safe-area-inset-left, 0px))' } },
      Object.entries(VIEWS).map(([k, [l]]) => h('button.fchip', { type: 'button', 'data-k': k, 'aria-pressed': String(k === state.view), onclick: () => go(k) }, l))),
    main));
  try {
    await s.need(mod.tables || []);
    const ctx = { store: s, go, arg: state.arg, rerender: render, changeRD: () => toast(`The reporting date is set by ${theTeam()} in the Hub.`), preview: false, connected: true };
    main.replaceChildren(mod.render(ctx));
    document.title = `${label} · TransitionSuite`;
  } catch (e) { console.error(e); main.replaceChildren(h('div.banner.warn', 'Could not show this: ' + (e.message || e))); }
}

start();
