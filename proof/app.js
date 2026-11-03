// TransitionSuite outside Excel: the same screens as the mock-ups and the add-in, on a different data source.
// app.html?view=contributor|exec|finance&source=graph|preview&ws=CUS (+ tenant, client, site, folder)
// GraphSource reads the snapshot the Hub publishes (the "TransitionSuite published" list) and adds each
// submission to the "TransitionSuite submissions" list on the programme site. PreviewSource uses the demo snapshot (no sign-in).
// The screens (views/views.js) never know which source they are using.
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const KEY = 'smohub.app';
  let cfg = { folder: 'TransitionSuite proof' };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage blocked */ }
  ['tenant', 'client', 'site', 'folder', 'ws'].forEach((k) => { if (q.get(k)) cfg[k] = q.get(k); });
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* storage blocked */ }
  const view = q.get('view') || 'contributor', srcName = q.get('source') || 'graph';
  const load = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => no(new Error('could not load ' + src)); document.head.append(s); });
  const msg = (title, text) => { document.body.textContent = ''; const m = document.createElement('main'); m.className = 'main'; const c = document.createElement('div'); c.className = 'card'; const hh = document.createElement('h2'); hh.textContent = title; const p = document.createElement('p'); p.textContent = text; c.append(hh, p); m.append(c); document.body.append(m); };

  // ---------- the two data sources (same shape as the add-in's PreviewSource / a future GraphSource) ----------
  const PreviewSource = {
    name: 'demo snapshot', sent: [],
    async load() { await load('views/data.js'); return window.DEMO; },
    async submit(kind, payload) { this.sent.push({ kind, payload }); return { ok: true, where: 'kept in this page (demo)' }; }
  };
  // Connected-level data lives in SharePoint lists (never encrypted by sensitivity labels).
  // &store=files uses JSON files in the Documents library instead (kept for comparison).
  const GraphSource = {
    name: 'Microsoft Graph', client: null,
    async load() {
      if (!cfg.tenant || !cfg.client || !cfg.site) throw new Error('Add tenant, client and site to the address (see the proof note).');
      this.client = window.GraphClient.create(cfg);
      await this.client.start();
      return q.get('store') === 'files' ? this.client.json('Published/hub-snapshot.json') : this.client.readSnapshot();
    },
    async submit(kind, payload) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const body = { kind, sentAt: new Date().toISOString(), from: this.client.host.name, payload };
      if (q.get('store') === 'files') { const f = await this.client.put(`Submissions/${payload.ws || 'WS'} ${kind} ${stamp}.json`, body); return { ok: true, where: f.name }; }
      await this.client.listAdd('TransitionSuite submissions', `${payload.ws || 'WS'} ${kind} ${stamp}`, JSON.stringify(body));
      return { ok: true, where: 'TransitionSuite submissions list' };
    }
  };

  async function boot() {
    const source = srcName === 'preview' ? PreviewSource : GraphSource;
    let data;
    try { data = await source.load(); } catch (e) { msg('Could not open the Hub data', String(e.message || e)); return; }
    if (cfg.ws) data.meta.leadWs = cfg.ws;
    window.DEMO = data;
    document.body.classList.add('dir-b');   // direction B is the house style
    window.SOURCE = source;
    await load('views/kit.js'); await load('views/views.js');
    const { K, V } = window;
    const host = source.client ? source.client.host.name : 'Web page (demo data)';
    const sources = () => K.h('span.top-role', host + (source.client && source.client.method ? ' · ' + source.client.method : ''));
    if (view === 'exec' || view === 'finance') {
      document.body.textContent = '';
      const main = K.h('main.main', { style: { padding: '20px 16px' } });
      document.body.append(main, K.h('div.small.muted', { style: { padding: '0 16px 16px' } }, `Read only · ${host} · data from ${source.name}`));
      (view === 'exec' ? V.execSummary : V.finance)(main, q.get('dir') || 'a');
      return;
    }
    const NAV = [['start', 'Start'], ['report', 'My report', 'Due'], ['raid', 'My RAID'], ['tasks', 'My tasks'], ['services', 'My services']];
    const R = { start: V.leadStart, report: V.leadReport, raid: V.leadRaid, tasks: V.leadTasks, services: V.leadServices };
    const lead = K.ws(data.meta.leadWs) || {};
    K.router(Object.fromEntries(Object.entries(R).map(([k, fn]) => [k, () => {
      const m = K.shell({ mode: 'lead', nav: NAV, cur: k, brand: 'TransitionSuite', sub: `${lead.name || ''} (${lead.code || ''}) · ${lead.lead || ''}`, navTitle: 'Contributor',
        topRight: K.h('div.top-right', sources(), K.h('span.top-period', 'Reporting ' + K.fmonth(data.meta.rd))), foot: `Data from ${source.name}. Same screens as the Excel add-in.` });
      fn(m);
    }])), 'start');
  }
  boot();
})();
