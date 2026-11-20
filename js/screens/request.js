// Request a change (P1, Tim 20 Nov 2026): anyone can ask the programme office for a change to the TSA or the exit plan.
// The request is saved in TSA Changes with status New; the programme office reviews it there (crreview.js).
// The form itself is in crform.js, so the Teams tab and the web page (P8) can use the same one.
import { h, toast, ed, theTeam, plural } from '../util.js?v=0.12.5.20261120071957';
import { requestForm, saveRequest } from '../crform.js?v=0.12.5.20261120071957';
import { openCRImport } from '../crimport.js?v=0.12.5.20261120071957';

const ui = { sent: null };

export default {
  tables: ['tblChange', 'tblTSA', 'tblPlan'],
  render(ctx) {
    const { store, arg } = ctx;
    if (arg && !arg.used) { arg.used = true; ui.sent = null; }
    const fresh = store.records('tblChange').filter((r) => /^New\b/.test(String(r.get('Status')))).length;
    const head = h('div.page-head',
      h('div', h('h1', 'Request a change'),
        h('p.lede', ed(`Ask ${theTeam()} for a change to the TSA or the exit plan: service dates, fees, scope, service levels, a service that was left out, plan dates, or anything else. Your request is saved in TSA Changes as New. ${cap(theTeam())} reviews it and, if it goes ahead, takes it to the forum that decides.`))),
      h('button.btn', { type: 'button', title: 'Change request form files sent in by people without the Hub', onclick: () => openCRImport(ctx) }, 'Import change requests'),
      h('button.btn', { type: 'button', onclick: () => ctx.go('changes', fresh ? { filter: 's:New' } : null) }, fresh ? `${plural(fresh, 'new request')} to review ›` : 'TSA changes ›'));
    if (ui.sent) {
      const s = ui.sent;
      return h('div.page', head,
        h('div.card', { style: { padding: '18px 20px', maxWidth: '760px' } },
          h('h2', { style: { marginTop: 0 } }, `Request ${s.id || ''} sent`),
          h('p', `${s.title}. It is in TSA Changes with status New, waiting for ${theTeam()} to review it.`),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            h('button.btn.btn-primary', { type: 'button', onclick: () => { ui.sent = null; ctx.rerender(); } }, 'Request another change'),
            h('button.btn', { type: 'button', onclick: () => ctx.go('changes', { id: s.id || undefined, filter: 's:New' }) }, 'See it in TSA changes'))));
    }
    const form = requestForm(store, { service: arg && arg.tsa, item: arg && arg.item, kind: arg && arg.kind });
    const send = h('button.btn.btn-primary', { type: 'button' }, 'Send the request');
    send.addEventListener('click', async () => {
      send.disabled = true;
      try {
        const i = await saveRequest(store, form.collect());
        const rec = store.records('tblChange').find((r) => r.i === i);
        ui.sent = { id: rec ? rec.get('CR ID') : '', title: rec ? rec.get('Title') : 'Your request' };
        toast(`Change request ${ui.sent.id || ''} saved as New`.replace('  ', ' '));
        ctx.rerender();
      } catch (e) { send.disabled = false; toast(e.message || String(e), true); }
    });
    return h('div.page', head,
      h('div.card', { style: { padding: '16px 18px', maxWidth: '860px' } },
        form.el,
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' } }, send,
          h('span.small.muted', ed(`People without the Hub can fill in the change request form file (TransitionSuite Change Request …xlsx) and send it to ${theTeam()}, who brings it in with Import change requests.`)))));
  }
};
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
