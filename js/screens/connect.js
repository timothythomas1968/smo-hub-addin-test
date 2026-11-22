// Connected level (build waves P8), the programme office's screen: connect to the programme's SharePoint site, publish the
// Hub for the leads' Teams tab and web page, and take in what they send. Nothing here is needed at Levels 1 and 2.
import { h, toast, plural, theTeam } from '../util.js?v=0.12.8.20261122225802';
import { connectConfig, saveConnectConfig, publish, inbox, takeIn, decline } from '../connected.js?v=0.12.8.20261122225802';

const ui = { subs: null, loading: false, error: '', busy: false };

const pageAddress = (cfg) => {
  const u = new URL('connected.html', location.href);
  u.search = new URLSearchParams({ tenant: cfg.tenant || '', client: cfg.client || '', site: cfg.site || '' });
  return u.href;
};

export default {
  tables: ['tblChange', 'tblWorkstreams'],
  render(ctx) {
    const { store } = ctx;
    const cfg = connectConfig(store);
    const ready = !!(cfg.tenant && cfg.client && cfg.site);
    const last = store.src.getSetting('connected-last');
    const box = (k, label, ph) => h('div.field', h('label.field-label', { for: 'cn-' + k }, label), h('input', { id: 'cn-' + k, type: 'text', value: cfg[k] || '', placeholder: ph }));

    const save = async () => {
      const v = Object.fromEntries(['tenant', 'client', 'site'].map((k) => [k, document.getElementById('cn-' + k).value.trim()]));
      if (v.site && !/^https:\/\/[^/]+\.sharepoint\.com\/sites\//i.test(v.site)) { toast('The site address looks like https://yourcompany.sharepoint.com/sites/YourProgramme', true); return; }
      await saveConnectConfig(store, v); ui.subs = null; toast('Saved'); ctx.rerender();
    };
    const doPublish = async (btn) => {
      btn.disabled = true; btn.textContent = 'Publishing…';
      try { const r = await publish(store); toast(`Published: ${plural(r.parts, 'part')}${r.removed ? `, ${r.removed} older removed` : ''}. Leads see it the next time they open their tab.`); }
      catch (e) { toast('Could not publish: ' + (e.message || e), true); }
      ctx.rerender();
    };
    const check = async () => {
      ui.loading = true; ui.error = ''; ctx.rerender();
      try { ui.subs = await inbox(store); } catch (e) { ui.error = e.message || String(e); ui.subs = null; }
      ui.loading = false; ctx.rerender();
    };
    const take = async (list) => {
      if (ui.busy) return; ui.busy = true;
      const done = [], failed = [];
      for (const s of list) { try { done.push(await takeIn(store, s)); } catch (e) { failed.push(`${s.title}: ${e.message || e}`); } }
      ui.busy = false;
      if (done.length) toast(`Taken in: ${done.join('; ')}.`);
      if (failed.length) toast('Not taken in: ' + failed.join('; '), true);
      ui.subs = null; await check();
    };

    const subsCard = () => {
      if (!ready) return h('p.small.muted', 'Connect to the site first.');
      if (ui.loading) return h('div.loading', h('div.spinner'), 'Reading the submissions…');
      if (ui.error) return h('div.banner.warn', 'Could not read the submissions: ' + ui.error);
      if (!ui.subs) return h('button.btn', { type: 'button', onclick: check }, 'Check for submissions');
      if (!ui.subs.length) return h('div', h('p.small.muted', 'Nothing waiting. Leads\' reports and change requests appear here once they send them.'), h('button.btn', { type: 'button', onclick: check }, 'Check again'));
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } },
        h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          h('button.btn.btn-primary', { type: 'button', onclick: () => take(ui.subs.filter((s) => !s.error)) }, `Take in all ${ui.subs.filter((s) => !s.error).length}`),
          h('button.btn', { type: 'button', onclick: check }, 'Check again')),
        ui.subs.map((s) => h('div.card', { style: { padding: '10px 12px', borderLeft: `4px solid var(--${s.error ? 'r' : s.kind === 'cr' ? 'a' : 'g'}-bar)` } },
          h('div', { style: { fontWeight: 600 } }, s.kind === 'report' ? `Workstream report: ${s.body.code}` : s.kind === 'cr' ? `Change request: ${(s.body.record || {}).Title || s.title}` : s.title),
          h('div.small.muted', `${s.by || 'Someone'}${s.on ? ' · ' + String(s.on).slice(0, 16).replace('T', ' ') : ''}`),
          s.error ? h('div.small', { style: { color: 'var(--r-fg)' } }, s.error) : null,
          h('div', { style: { display: 'flex', gap: '8px', marginTop: '6px' } },
            s.error ? null : h('button.btn.btn-sm', { type: 'button', onclick: () => take([s]) }, s.kind === 'report' ? 'Take into Workstream Reports' : 'Add to TSA Changes as New'),
            h('button.btn.btn-sm', { type: 'button', onclick: async () => { try { await decline(store, s); toast('Declined: it stays on the list, marked Declined.'); } catch (e) { toast(e.message || String(e), true); } ui.subs = null; check(); } }, 'Decline')))));
    };

    return h('div.page',
      h('div.page-head', h('div', h('h1', 'Connected level'),
        h('p.lede', `For programmes on Microsoft 365 with Teams. ${theTeam()} publishes the Hub to the programme's SharePoint site; leads open their Teams tab or the web page to see the executive summary and Finance, send their workstream report and request changes. What they send waits here until you take it in.`))),
      h('div', { style: { display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-start' } },
        h('section.card', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', '1. The programme site'),
          h('p.small.muted', 'Client IT sets these up once (docs/CONNECTED-SETUP.md): an app registration with Sites.Selected, the site, and the two lists. None of them is secret.'),
          box('tenant', 'Tenant ID', 'e.g. 1b2c3d4e-…'), box('client', 'Application (client) ID', 'e.g. 9f8e7d6c-…'), box('site', 'SharePoint site address', 'https://yourcompany.sharepoint.com/sites/Programme'),
          h('button.btn.btn-primary', { type: 'button', onclick: save }, 'Save'),
          ready ? h('div.small', { style: { marginTop: '10px' } }, h('b', 'The leads\' web page: '), h('span', { style: { wordBreak: 'break-all', userSelect: 'all' } }, pageAddress(cfg)),
            h('div.small.muted', 'Send it to the leads, or add the Teams app (tools/build_teams.py), which opens the same page in a tab.')) : null),
        h('section.card', { style: { flex: '1 1 320px', minWidth: 0 } }, h('h2.cap', '2. Publish the Hub'),
          h('p.small.muted', 'Leads see the Hub as it was when you last published. Publish after each reporting cycle, or when something they need has changed.'),
          last && last.at ? h('p.small', `Last published ${String(last.at).slice(0, 16).replace('T', ' ')} (${plural(last.parts || 1, 'part')}).`) : h('p.small', 'Not published yet.'),
          h('button.btn.btn-primary', { type: 'button', disabled: !ready, onclick: (e) => doPublish(e.currentTarget) }, 'Publish now')),
        h('section.card', { style: { flex: '2 1 420px', minWidth: 0 } }, h('h2.cap', '3. What leads have sent'),
          h('p.small.muted', 'Reports go into the workstream\'s section on Workstream Reports, as Import reports does. Change requests go into TSA Changes as New, to review there.'),
          subsCard())));
  }
};
