// Microsoft Graph for TransitionSuite. Libraries: only Microsoft's own, bundled with our files (Tim's named exceptions):
// MSAL (msal-browser) for silent sign-in, and the Teams library inside Teams.
// Sign-in order: 1) silent, through Nested App Authentication (reuses the Office or Teams sign-in);
// 2) a sign-in window: an Office dialog in Excel, the Teams sign-in window in Teams, a pop-up in a browser
//    (our own authorisation code + PKCE in auth.html, no library).
// window.GraphClient.create(cfg) -> { host, method, start(), signIn(), call(), siteId(), json(), put(), list helpers }
// Connected-level data is kept in SharePoint lists (sensitivity labels never encrypt list items):
//   "TransitionSuite published"   the snapshot the Hub publishes, split into parts (Title, Payload)
//   "TransitionSuite submissions" one item per report, risk or date request (Title, Payload)
(function () {
  'use strict';
  const GRAPH = 'https://graph.microsoft.com/v1.0';
  const SCOPES = ['User.Read', 'Sites.Selected'];
  const PART = 40000;   // characters per list item (a multi-line text column holds far more; this keeps items small)

  async function detectHost() {
    if (window.Office && Office.context && Office.context.diagnostics) {
      const d = Office.context.diagnostics;
      return { kind: 'office', name: `Excel add-in (${d.platform} ${d.version})`, naa: Office.context.requirements.isSetSupported('NestedAppAuth', '1.1') };
    }
    if (window.microsoftTeams) {
      try {
        await Promise.race([microsoftTeams.app.initialize(), new Promise((_, no) => setTimeout(() => no(new Error('not in Teams')), 1500))]);
        const c = await microsoftTeams.app.getContext();
        return { kind: 'teams', name: `Teams tab (${c.app.host.clientType})`, naa: !!(microsoftTeams.nestedAppAuth && microsoftTeams.nestedAppAuth.isNAAChannelRecommended && microsoftTeams.nestedAppAuth.isNAAChannelRecommended()) };
      } catch (e) { /* not in Teams */ }
    }
    return { kind: 'web', name: 'Web page', naa: false };
  }

  function create(cfg) {
    let tok = null, site = null, host = { kind: 'web', name: 'Web page', naa: false }, pca = null;
    const state = { method: '', silentError: '' };
    const authUrl = () => { const u = new URL('auth.html', cfg.base || location.href); u.search = new URLSearchParams({ tenant: cfg.tenant, client: cfg.client, teams: host.kind === 'teams' ? '1' : '0' }); return u.href; };

    async function silent() {
      if (!host.naa || !window.msal || cfg.signin === 'window') return false;
      try {
        if (!pca) pca = await msal.createNestablePublicClientApplication({ auth: { clientId: cfg.client, authority: 'https://login.microsoftonline.com/' + cfg.tenant } });
        const r = await pca.acquireTokenSilent({ scopes: SCOPES });
        tok = { access: r.accessToken, until: (r.expiresOn ? r.expiresOn.getTime() : Date.now() + 3000e3) - 120e3 };
        state.method = 'silent (Nested App Authentication)';
        return true;
      } catch (e) { state.silentError = String(e && (e.errorCode || e.message) || e); return false; }
    }
    async function windowSignIn() {
      const text = await new Promise((ok, no) => {
        if (host.kind === 'teams') {
          state.method = 'Teams sign-in window';
          return microsoftTeams.authentication.authenticate({ url: authUrl(), width: 480, height: 640 }).then(ok, (e) => no(new Error('Teams sign-in window: ' + String(e && e.message || e))));
        }
        if (host.kind === 'office') {
          state.method = 'Office dialog';
          return Office.context.ui.displayDialogAsync(authUrl(), { height: 60, width: 30, promptBeforeOpen: false }, (res) => {
            if (res.status !== Office.AsyncResultStatus.Succeeded) return no(new Error(`Office dialog could not open (${res.error.code}: ${res.error.message})`));
            const d = res.value;
            d.addEventHandler(Office.EventType.DialogMessageReceived, (a) => { d.close(); ok(a.message); });
            d.addEventHandler(Office.EventType.DialogEventReceived, (a) => no(new Error(a.error === 12006 ? 'the sign-in window was closed' : 'Office dialog event ' + a.error)));
          });
        }
        state.method = 'browser pop-up';
        const w = window.open(authUrl(), 'smohub-auth', 'width=480,height=640');
        if (!w) return no(new Error('the pop-up was blocked: allow pop-ups for this site'));
        const on = (ev) => { if (ev.origin !== location.origin) return; removeEventListener('message', on); w.close(); ok(ev.data); };
        addEventListener('message', on);
      });
      const m = JSON.parse(text);
      if (!m.ok) throw new Error(m.error);
      tok = { access: m.access_token, until: Date.now() + (m.expires_in - 120) * 1000 };
    }
    async function signIn() { if (!(await silent())) await windowSignIn(); }
    async function call(path, opts = {}) {
      if (!tok || Date.now() > tok.until) await signIn();
      const r = await fetch(path.startsWith('http') ? path : GRAPH + path, Object.assign({}, opts, { headers: Object.assign({ Authorization: 'Bearer ' + tok.access }, opts.headers || {}) }));
      const type = r.headers.get('content-type') || '';
      const body = type.includes('json') ? await r.json() : await r.text();
      if (!r.ok) { const e = new Error(`${r.status} ${body && body.error ? body.error.code + ': ' + body.error.message : ''}`.trim()); e.status = r.status; throw e; }
      return body;
    }
    const enc = (p) => p.split('/').map(encodeURIComponent).join('/');
    async function siteId() { if (!site) { const u = new URL(cfg.site); site = await call(`/sites/${u.hostname}:${u.pathname.replace(/\/$/, '')}`); } return site.id; }
    const inFolder = (p) => enc((cfg.folder ? cfg.folder + '/' : '') + p);
    const lists = {};
    async function listId(name) {
      if (lists[name]) return lists[name];
      const r = await call(`/sites/${await siteId()}/lists?$select=id,displayName&$filter=displayName eq '${name.replace(/'/g, "''")}'`);
      if (!r.value || !r.value[0]) {
        if (name.startsWith('TransitionSuite ')) { const old = 'SMO Hub ' + name.slice(16); try { return (lists[name] = await listId(old)); } catch (e) { /* neither */ } }   // lists made before the rename
        const e = new Error(`there is no list called "${name}" on the site`); e.status = 404; throw e;
      }
      return (lists[name] = r.value[0].id);
    }
    async function listItems(name, filterTitlePrefix) {
      const id = await listId(name);
      let url = `/sites/${await siteId()}/lists/${id}/items?$expand=fields($select=Title,Payload)&$top=200`, out = [];
      while (url) { const r = await call(url); out = out.concat(r.value || []); url = r['@odata.nextLink'] || null; }
      return out.map((x) => x.fields).filter((f) => !filterTitlePrefix || String(f.Title).startsWith(filterTitlePrefix));
    }
    async function listAdd(name, title, payload) {
      const id = await listId(name);
      return call(`/sites/${await siteId()}/lists/${id}/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { Title: title, Payload: payload } }) });
    }
    return {
      get host() { return host; }, get method() { return state.method; }, get silentError() { return state.silentError; },
      async start() { host = await detectHost(); return host; },
      signIn, call, siteId, listId, listItems, listAdd,
      async json(path) { const sid = await siteId(); const t = await call(`/sites/${sid}/drive/root:/${inFolder(path)}:/content`); return typeof t === 'string' ? JSON.parse(t) : t; },
      async put(path, obj) { const sid = await siteId(); return call(`/sites/${sid}/drive/root:/${inFolder(path)}:/content`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj, null, 2) }); },
      /** The Hub publishes a snapshot as numbered parts of one JSON text. */
      async publishSnapshot(obj, list = 'TransitionSuite published') {
        const text = JSON.stringify(obj), stamp = new Date().toISOString(), n = Math.ceil(text.length / PART);
        for (let i = 0; i < n; i++) await listAdd(list, `snapshot ${stamp} part ${String(i + 1).padStart(3, '0')} of ${String(n).padStart(3, '0')}`, text.slice(i * PART, (i + 1) * PART));
        return { parts: n, chars: text.length, stamp };
      },
      async readSnapshot(list = 'TransitionSuite published') {
        const items = await listItems(list, 'snapshot ');
        if (!items.length) throw new Error(`nothing published yet in "${list}"`);
        const latest = items.map((f) => f.Title.split(' ')[1]).sort().pop();
        const parts = items.filter((f) => f.Title.split(' ')[1] === latest).sort((a, b) => a.Title.localeCompare(b.Title));
        const total = Number(parts[0].Title.split(' of ')[1]);
        if (parts.length !== total) throw new Error(`the latest snapshot is incomplete (${parts.length} of ${total} parts)`);
        return JSON.parse(parts.map((f) => f.Payload).join(''));
      }
    };
  }
  window.GraphClient = { create, detectHost, SCOPES };
})();
