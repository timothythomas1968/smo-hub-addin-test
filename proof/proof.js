// TransitionSuite connection proof. A throwaway panel that checks, step by step, whether the add-in can reach
// the programme's SharePoint site through Microsoft Graph from wherever it is running.
// Libraries: only Microsoft's own sign-in library (MSAL), bundled. Network calls go only to Microsoft:
// login.microsoftonline.com and graph.microsoft.com.
// Text from the network is always shown as text, never as HTML.

const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
  for (const k of kids.flat(Infinity)) if (k != null) e.append(k.nodeType ? k : String(k));
  return e;
};

// ---------- settings (remembered in this browser only) ----------
const FIELDS = [
  ['tenant', 'Tenant (your domain, e.g. whisper-consulting.com, or the tenant ID)', ''],
  ['client', 'Application (client) ID of the app registration', ''],
  ['site', 'SharePoint site address', 'https://example.sharepoint.com/sites/TransitionSuiteProof'],
  ['folder', 'Folder in the site\'s Documents library', 'TransitionSuite proof'],
  ['labelled', 'Labelled (encrypted) copy in Submissions (optional)', 'TransitionSuite Workstream Report - CUS (labelled).xlsx'],
  ['book', 'Returned report file in Submissions', 'TransitionSuite Workstream Report - CUS (Sep 2026).xlsx']
];
const KEY = 'smohub.proof';
let cfg = {};
try { cfg = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { cfg = {}; }
for (const [k, , d] of FIELDS) if (!cfg[k]) cfg[k] = d;
// Settings can also come in the address (?tenant=...&client=...), so a test link can be shared.
for (const [k] of FIELDS) { const v = new URLSearchParams(location.search).get(k); if (v) cfg[k] = v; }
const saveCfg = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* private window */ } };

// ---------- sign-in ----------
// Sign-in and Graph calls come from graph.js: silent sign-in first, then a sign-in window.
let client = null;
const getClient = async () => { if (!client) { client = window.GraphClient.create(Object.assign({}, cfg)); await client.start(); } return client; };
const graph = async (path, opts) => (await getClient()).call(path, opts);
const sitePath = () => { const u = new URL(cfg.site); return `/sites/${u.hostname}:${u.pathname.replace(/\/$/, '')}`; };
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
const siteId = async () => (await getClient()).siteId();
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');

// ---------- the checks ----------
// Each returns a short detail string, or throws. part(...) marks a partial result.
const part = (msg) => { const e = new Error(msg); e.partial = true; return e; };
const S = {};
const CHECKS = [
  ['engine', 'Web engine', async () => {
    if (!window.__engine.modern) throw new Error(window.__engine.name + ': too old for TransitionSuite');
    return window.__engine.name;
  }],
  ['office', 'Office version and features', async () => {
    if (!(window.Office && Office.context && Office.context.diagnostics)) throw part('not running inside Office (browser test)');
    const d = Office.context.diagnostics;
    const sets = [['ExcelApi', '1.7'], ['ExcelApi', '1.12'], ['DialogApi', '1.1'], ['DialogApi', '1.2'], ['NestedAppAuth', '1.1'], ['IdentityAPI', '1.3']]
      .map(([s, v]) => `${s} ${v}: ${Office.context.requirements.isSetSupported(s, v) ? 'yes' : 'no'}`);
    S.office = `${d.host} ${d.platform} ${d.version}`;
    return `${S.office}. ${sets.join(', ')}`;
  }],
  ['doc', 'Where this workbook is saved', async () => {
    const u = window.Office && Office.context && Office.context.document && Office.context.document.url;
    if (!u) throw part('unknown (not in Office, or the workbook is not saved)');
    return u.includes('sharepoint.com') ? 'SharePoint: ' + u : u;
  }],
  ['signin', 'Sign in with Microsoft 365 (silent first)', async () => {
    const c = await getClient(); const t0 = Date.now(); await c.signIn();
    const how = c.method || '?';
    const note = c.host.naa ? (c.silentError ? ` (silent sign-in was tried and failed: ${c.silentError})` : '') : ' (this host does not offer silent sign-in)';
    return `signed in by ${how} in ${((Date.now() - t0) / 1000).toFixed(1)} s${how.startsWith('silent') ? '' : note}`;
  }],
  ['window', 'Sign-in window opens (the Citrix test)', async () => {
    const c = window.GraphClient.create(Object.assign({}, cfg, { signin: 'window' })); await c.start();
    const t0 = Date.now(); await c.signIn();
    return `${c.method} opened and returned a token in ${((Date.now() - t0) / 1000).toFixed(1)} s`;
  }],
  ['me', 'Read my own profile (User.Read)', async () => { const me = await graph('/me?$select=displayName,userPrincipalName'); S.me = me.displayName; return `${me.displayName} (${me.userPrincipalName})`; }],
  ['site', 'Open the programme site (Sites.Selected)', async () => { const s = await graph(sitePath()); return `${s.displayName}: ${s.webUrl}`; }],
  ['fence', 'Other sites stay closed', async () => {
    const host = new URL(cfg.site).hostname;
    try { await graph(`/sites/${host}:/`); } catch (e) { if (e.status === 403 || e.status === 404) return `blocked as expected (${e.status}): the app can only reach the programme site`; throw e; }
    throw part('the root site opened: the app has wider access than Sites.Selected. Check the app registration permissions.');
  }],
  ['write', 'Submit: write a file to the site', async () => {
    const name = `Submissions/CUS ${stamp()}.json`;
    const body = JSON.stringify({ workstream: 'CUS', period: '2026-09-30', rag: 'Amber', by: S.me || '', sentAt: new Date().toISOString(), from: S.office || window.__engine.name }, null, 2);
    const f = await graph(`/sites/${await siteId()}/drive/root:/${enc(cfg.folder + '/' + name)}:/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
    S.file = f; return `${f.name} (${f.size} bytes)`;
  }],
  ['list-folder', 'Hub: see the submissions', async () => {
    const r = await graph(`/sites/${await siteId()}/drive/root:/${enc(cfg.folder + '/Submissions')}:/children?$select=name,lastModifiedDateTime,lastModifiedBy&$top=200`);
    const v = r.value || [];
    return `${v.length} file(s); latest: ${v.map((x) => x.name).sort().pop() || 'none'}`;
  }],
  ['read', 'Hub: read a submission back', async () => {
    if (!S.file) throw part('skipped: the write check did not run');
    const it = await graph(`/sites/${await siteId()}/drive/items/${S.file.id}?$select=id,name&$expand=listItem`);
    const txt = await graph(`/sites/${await siteId()}/drive/items/${it.id}/content`);
    const j = typeof txt === 'string' ? JSON.parse(txt) : txt;
    return `read ${it.name}: workstream ${j.workstream}, RAG ${j.rag}`;
  }],
  ['list-pub', 'Hub: publish the demo snapshot to the "TransitionSuite published" list', async () => {
    const txt = await (await fetch('views/data.js')).text();
    const demo = JSON.parse(txt.slice(txt.indexOf('=') + 1).trim().replace(/;$/, ''));
    const r = await (await getClient()).publishSnapshot(demo);
    return `${r.parts} part(s), ${r.chars.toLocaleString('en-GB')} characters of demo data`;
  }],
  ['list-read', 'Teams and web: read the snapshot back from the list', async () => {
    const d = await (await getClient()).readSnapshot();
    return `${d.ws.length} workstreams and ${d.tsa.length} services read back intact`;
  }],
  ['list-sub', 'Submit: add a report to the "TransitionSuite submissions" list', async () => {
    const c = await getClient();
    await c.listAdd('TransitionSuite submissions', `CUS report ${stamp()}`, JSON.stringify({ kind: 'report', ws: 'CUS', month: '2026-09-01', rag: 'Amber', from: c.host.name }));
    const items = await c.listItems('TransitionSuite submissions', 'CUS report');
    return `added; the list now holds ${items.length} CUS report(s)`;
  }],
  ['site-report', 'Hub: read a returned report file on the site', async () => {
    const name = `Submissions/${cfg.book}`;
    const it = await graph(`/sites/${await siteId()}/drive/root:/${enc(cfg.folder + '/' + name)}`).catch((e) => { throw part(`"${name}" not found (${e.message})`); });
    const r = await graph(`/sites/${await siteId()}/drive/items/${it.id}/workbook/worksheets('Report')/range(address='C4:I18')?$select=values`);
    const v = r.values || [];
    return `workstream "${v[0] && v[0][0]}", RAG ${v[9] && v[9][0]}: read through Graph without downloading the file`;
  }],
  ['labelled', 'Graph and a labelled (encrypted) workbook', async () => {
    const name = `Submissions/${cfg.labelled}`;
    const it = await graph(`/sites/${await siteId()}/drive/root:/${enc(cfg.folder + '/' + name)}`).catch((e) => { throw part(`skipped: "${name}" not found (optional: upload a copy with an encrypting sensitivity label)`); });
    const out = [];
    try { await graph(`/sites/${await siteId()}/drive/items/${it.id}/workbook/worksheets('Report')/range(address='C4')`); out.push('Excel API read it'); }
    catch (e) { out.push(`Excel API refused (${e.message})`); }
    try {
      const r = await fetch((await graph(`/sites/${await siteId()}/drive/items/${it.id}?$select=id,@microsoft.graph.downloadUrl`))['@microsoft.graph.downloadUrl']);
      const b = new Uint8Array(await r.arrayBuffer());
      out.push(b[0] === 0xD0 && b[1] === 0xCF ? 'the download is still encrypted' : 'the download is a normal .xlsx');
    } catch (e) { out.push(`download failed (${e.message})`); }
    throw part(out.join('; ') + '. Lists are never encrypted by labels, which is why Connected-level data lives in lists.');
  }],
  ['ics', 'Download a calendar file (.ics)', async () => {
    const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//TransitionSuite//proof//EN\r\nBEGIN:VEVENT\r\nUID:proof@smohub\r\nDTSTAMP:20261103T090000Z\r\nDTSTART;VALUE=DATE:20261201\r\nSUMMARY:SMO Hub proof: test event\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    const a = el('a', { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })), download: 'smo-hub-proof.ics' });
    document.body.append(a); a.click(); a.remove();
    throw part('started a download of smo-hub-proof.ics: please say whether a file appeared');
  }],
  ['print', 'Print or save as PDF', async () => {
    if (typeof window.print !== 'function') throw new Error('print is not available here');
    window.print();
    throw part('asked to print: please say whether a print dialog appeared');
  }]
];

// ---------- Import reports ----------
let impOut = null;
async function importFiles(files) {
  const t0 = performance.now();
  results.import = { state: 'run', detail: '' };
  let res;
  try { res = await window.XlsxRead.importReports(files); }
  catch (e) { results.import = { state: 'fail', detail: String(e.message || e) }; render(); return; }
  const good = res.filter((r) => r.ok);
  impOut = el('table', {}, res.map((r) => el('tr', {},
    el('td', { class: 'r' }, el('span', { class: 'chip ' + (r.ok ? (r.report.warnings.length ? 'part' : 'pass') : 'fail') }, r.ok ? (r.report.warnings.length ? 'Check' : 'Read') : 'Skipped')),
    el('td', {}, el('div', {}, r.file), el('div', { class: 'detail' }, r.ok
      ? `${r.report.ws || '?'} · ${r.report.month || '?'} · RAG ${r.report.rag || '?'} · ${r.report.risks.length} risk(s), ${r.report.issues.length} issue(s), ${r.report.decisions.length} decision(s)${r.report.warnings.length ? ' · ' + r.report.warnings.join('; ') : ''}`
      : r.error)), el('td', { class: 'ms' }, r.ms + ' ms'))));
  results.import = { state: good.length ? 'pass' : 'fail', detail: `${good.length} of ${res.length} file(s) read: ${res.map((r) => r.file + (r.ok ? ' ✓' : ' ✗')).join(', ')}`, ms: Math.round(performance.now() - t0) };
  render();
}

// ---------- screen ----------
const results = {};
function render() {
  const app = $('#app'); app.textContent = '';
  const form = el('div', { class: 'card' }, el('h2', {}, 'Settings'),
    FIELDS.map(([k, label]) => [el('label', { for: 'c-' + k }, label), el('input', { id: 'c-' + k, value: cfg[k] || '', oninput: (e) => { cfg[k] = e.target.value.trim(); saveCfg(); client = null; } })]),
    el('p', { class: 'note' }, 'These are kept in this browser only. The client ID and tenant are not secret.'));
  const rows = CHECKS.map(([k, label]) => {
    const r = results[k];
    const chip = el('span', { class: 'chip ' + (r ? r.state : '') }, r ? { pass: 'Works', fail: 'Fails', part: 'Check', run: 'Running' }[r.state] : 'Not run');
    return el('tr', {}, el('td', { class: 'r' }, chip), el('td', {}, el('div', {}, label), r ? el('div', { class: 'detail' }, r.detail) : null),
      el('td', { class: 'ms' }, r && r.ms != null ? r.ms + ' ms' : ''), el('td', { class: 'r' }, el('button', { onclick: () => run([k]) }, 'Run')));
  });
  const where = el('input', { id: 'where', placeholder: 'e.g. Windows laptop, Citrix, Excel on the web on my own Mac', value: cfg.where || '', oninput: (e) => { cfg.where = e.target.value; saveCfg(); } });
  const checks = el('div', { class: 'card' }, el('h2', {}, 'Checks'),
    el('label', { for: 'where' }, 'Where are you running this?'), where,
    el('div', { class: 'btns' }, el('button', { class: 'primary', onclick: () => run(CHECKS.map((c) => c[0]).filter((k) => !['print', 'ics', 'window'].includes(k))) }, 'Run all checks'),
      el('button', { onclick: () => { client = null; run(['signin']); } }, 'Sign in again')),
    el('table', {}, rows));
  const report = el('textarea', { readonly: 'readonly', id: 'report' }, reportText());
  const out = el('div', { class: 'card' }, el('h2', {}, 'Report'), el('p', { class: 'note' }, 'Copy this and paste it back to Claude. It holds no data from your workbooks, only the results.'), report,
    el('div', { class: 'btns' }, el('button', { onclick: copy }, 'Copy report')));
  const imp = el('div', { class: 'card' }, el('h2', {}, 'Import reports (no Graph needed)'),
    el('p', { class: 'note' }, 'Pick several returned workstream report files at once. They are read here, in the panel; nothing is uploaded.'),
    el('input', { type: 'file', id: 'files', multiple: 'multiple', accept: '.xlsx', onchange: (e) => importFiles(e.target.files) }),
    el('div', { id: 'imp' }, impOut || ''));
  app.append(form, imp, checks, out);
}
function reportText() {
  const lines = [`TransitionSuite connection proof, ${new Date().toISOString()}`, `Where: ${cfg.where || '(not given)'}`, `Engine: ${window.__engine.name}`, `User agent: ${window.__engine.ua}`];
  if (results.import) lines.push(`${results.import.state.toUpperCase()}  Import reports: ${results.import.detail}`);
  for (const [k, label] of CHECKS) { const r = results[k]; lines.push(`${r ? r.state.toUpperCase() : 'NOT RUN'}  ${label}${r ? ': ' + r.detail : ''}${r && r.ms != null ? ` (${r.ms} ms)` : ''}`); }
  return lines.join('\n');
}
async function copy() {
  const t = $('#report'); t.value = reportText();
  try { await navigator.clipboard.writeText(t.value); } catch (e) { t.select(); document.execCommand('copy'); }
  t.select();
}
async function run(keys) {
  for (const k of keys) {
    const fn = CHECKS.find((c) => c[0] === k)[2];
    results[k] = { state: 'run', detail: '' }; render();
    const t0 = performance.now();
    try { results[k] = { state: 'pass', detail: await fn() }; }
    catch (e) { results[k] = { state: e.partial ? 'part' : 'fail', detail: String(e.message || e) }; }
    results[k].ms = Math.round(performance.now() - t0);
    render();
  }
}

const start = () => { render(); run(['engine', 'office', 'doc']); };
if (window.Office && Office.onReady) Office.onReady(start); else start();
// Office.js never calls onReady outside Office in some builds; make sure the screen shows.
setTimeout(() => { if (!$('#app').children.length) start(); }, 3000);
