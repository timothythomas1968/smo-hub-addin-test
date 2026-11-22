// The Connected level, the programme office's side (build waves P8). From the panel the programme office:
//  - publishes a snapshot of the Hub to the programme's SharePoint site ("TransitionSuite published"), which the leads' Teams tab
//    and web page read after they sign in;
//  - takes in what leads send from there ("TransitionSuite submissions"): workstream reports go into the workstream's paste area
//    on Workstream Reports (as Import reports does), change requests into TSA Changes as New (as the panel's own form does).
// The Graph calls go only to the programme's site (Sites.Selected), through graph.js; nothing is sent anywhere else, and the
// web host never sees the data. The site's address and the app registration's IDs are kept in the panel's settings.
import { writeBlock } from './wrimport.js?v=0.12.8.20261122225802';

export const PUBLISHED = 'TransitionSuite published', SUBMISSIONS = 'TransitionSuite submissions';
const KEY = 'connected';
const SHEET = 'Workstream Reports';

/** {tenant, client, site}: kept in the panel's settings (the Panel settings table), so they travel with the Hub. */
export function connectConfig(store) { const c = store.src.getSetting(KEY); return c && typeof c === 'object' ? c : {}; }
export async function saveConnectConfig(store, cfg) { await store.src.setSetting(KEY, cfg); }

let client = null, clientKey = '';
/** The Graph client for these settings (graph.js is loaded as a plain script: window.GraphClient). */
export async function graphClient(cfg) {
  if (window.__graphStandIn) return window.__graphStandIn;   // tests: a stand-in with the same methods
  // Microsoft's sign-in library and our Graph helper are loaded only when the Connected level is used
  const load = (src) => new Promise((ok, no) => { const el = document.createElement('script'); el.src = src; el.onload = ok; el.onerror = () => no(new Error('could not load ' + src)); document.head.append(el); });
  if (!window.msal) await load('vendor/msal-browser.min.js').catch(() => {});
  if (!window.GraphClient) await load('js/graph.js');
  if (!window.GraphClient) throw new Error('the Microsoft 365 connection could not be loaded');
  const k = [cfg.tenant, cfg.client, cfg.site].join('|');
  if (!client || clientKey !== k) { client = window.GraphClient.create({ tenant: cfg.tenant, client: cfg.client, site: cfg.site, base: location.href }); clientKey = k; await client.start(); }
  return client;
}

/** The Hub as one snapshot, in the same shape as the demo snapshot (data/demo-data.json), so the leads' page runs the same screens. */
export async function buildSnapshot(store) {
  // the registers (schema.json) and the Lists tables the screens read (workstreams, forums, currencies and the like);
  // not the service library or the plan templates, which only the set-up wizard uses
  const LISTS = ['tblWorkstreams', 'tblForums', 'tblCurrencies', 'tblEntities', 'tblReqTypes', 'tblRoles', 'tblSettings', 'tblMeetingMoves',
    'tblAgreements', 'tblCountries', 'tblDateRules', 'tblRoutes', 'tblRegulators', 'tblChangeLog'];
  const names = [...Object.keys(store.schema), ...LISTS];
  for (const n of names) { try { await store.need([n]); } catch (e) { /* a Hub without that table */ } }
  const tables = {};
  for (const n of names) {
    const t = store.t[n];
    if (!t) continue;
    tables[n] = { sheet: t.sheet, headers: t.headers, size: t.rows.length,
      rows: t.rows.filter((r) => r.v.some((x) => x !== '' && x != null)).map((r) => ({ i: r.i, v: r.v, f: r.f.map((x) => (x ? '1' : '0')).join('') })) };
  }
  // the workstream report sections (B:I), so a lead's page can start from what is already on the sheet
  const cells = {};
  try {
    const n = Math.max((store.names.WS_Code || []).length, 1), last = 9 + 35 * n;
    const v = await store.readRange(SHEET, `B9:I${last}`);
    const c = cells[SHEET] = {};
    v.forEach((row, i) => row.forEach((x, j) => { if (x !== '' && x != null) c['BCDEFGHI'[j] + (9 + i)] = x; }));
  } catch (e) { /* a Hub without the sheet */ }
  return { file: store.file || '', published: new Date().toISOString(), names: store.names, tables, cells };
}

export async function publish(store) {
  const cfg = connectConfig(store);
  const g = await graphClient(cfg);
  const snap = await buildSnapshot(store);
  const r = await g.publishSnapshot(snap, PUBLISHED);
  await store.src.setSetting('connected-last', { at: r.stamp || snap.published, parts: r.parts, chars: r.chars });
  return r;
}

/** Submissions not yet taken in, newest first: [{id, title, by, on, kind, body, error}]. */
export async function inbox(store) {
  const g = await graphClient(connectConfig(store));
  const items = await g.listItems(SUBMISSIONS, '', 'Title,Payload,Status');
  return items.filter((f) => !/^Taken in|^Declined/.test(String(f.Status || ''))).map((f) => {
    let body = null, error = '';
    try { body = JSON.parse(f.Payload || ''); } catch (e) { error = 'the submission could not be read'; }
    return { id: f._id, title: f.Title, by: (body && body.by) || f._by || '', on: (body && body.at) || f._on || '', kind: body && body.kind, body, error };
  }).sort((a, b) => String(b.on).localeCompare(String(a.on)));
}

/** Take one submission into the Hub, then mark it taken in on the list. Returns a line for the toast. */
export async function takeIn(store, sub) {
  if (sub.error || !sub.body) throw new Error(sub.error || 'empty submission');
  let line;
  if (sub.kind === 'report') {
    await writeBlock(store, sub.body.code, sub.body.block);
    line = `${sub.body.code} report`;
  } else if (sub.kind === 'cr') {
    await store.need(['tblChange']);
    const rec = Object.assign({}, sub.body.record, { Status: 'New' });
    if (store.t.tblChange.idx['Received through'] != null) rec['Received through'] = 'Teams or web page';
    const key = (r) => [r['Requested by'], r['What should change'], r['Raised on']].map((x) => String(x || '').trim().toLowerCase()).join('|');
    const dup = store.records('tblChange').some((r) => key({ 'Requested by': r.get('Requested by'), 'What should change': r.get('What should change'), 'Raised on': r.get('Raised on') }) === key(rec));
    if (!dup) await store.add('tblChange', Object.fromEntries(Object.entries(rec).filter(([k]) => store.t.tblChange.idx[k] != null && !(store.t.tblChange.cols[k] && store.t.tblChange.cols[k].t === 'C'))));
    line = dup ? 'a change request already in TSA Changes' : `change request from ${sub.by || 'a lead'}`;
  } else throw new Error('a kind of submission this version does not know');
  const g = await graphClient(connectConfig(store));
  await g.listUpdate(SUBMISSIONS, sub.id, { Status: 'Taken in ' + new Date().toISOString().slice(0, 10) });
  return line;
}

export async function decline(store, sub) {
  const g = await graphClient(connectConfig(store));
  await g.listUpdate(SUBMISSIONS, sub.id, { Status: 'Declined ' + new Date().toISOString().slice(0, 10) });
}
