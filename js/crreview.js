// The programme office's review of a New change request (P1, Tim 20 Nov 2026): send it to its forum (status Pending) or
// reject it. There is one route for each kind of change: service dates go through Process a date change (datechange.js),
// plan dates through the exit plan change rules (planimpact.js via daterules.js), everything else straight to the forum.
import { h, toast, fmtDate, ed, asOf, team, theTeam } from './util.js?v=0.12.3.20261120063500';
import { openDateChange } from './datechange.js?v=0.12.3.20261120063500';
import { openPlanChange } from './daterules.js?v=0.12.3.20261120063500';
import { findService, findPlanItem, readDate, requestLines, exitOf } from './crform.js?v=0.12.3.20261120063500';

const isNew = (cr) => /^New\b/i.test(String(cr.get('Status') || ''));
export { isNew };

function modal(title, body, actions) {
  document.querySelector('.modal-back')?.remove();
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) back.remove(); } },
    h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: { maxWidth: '600px' } }, h('h2', title), body,
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px', flexWrap: 'wrap' } }, actions)));
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') back.remove(); });
  document.body.appendChild(back);
  return back;
}

/** A mailto link to tell the person who asked (opens their own mail program; nothing is sent by the add-in). */
export function replyLink(cr, outcome) {
  const to = String(cr.get('Requester email') || '').trim();
  if (!to) return null;
  const subj = `Your change request ${cr.get('CR ID') || ''}: ${cr.get('Title') || cr.get('Request type')}`.trim();
  const body = `Hello ${String(cr.get('Requested by') || '').split(' ')[0] || ''},\n\n${outcome}\n\n${team()}`;
  return h('a.small', { href: `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`, target: '_blank', rel: 'noopener' }, `Email ${cr.get('Requested by') || 'the person who asked'}`);
}

/** The route a request takes: 'exit' (Process a date change), 'plan' (the plan change rules) or 'forum'. With what it needs. */
export function routeOf(store, cr) {
  const type = String(cr.get('Request type') || '');
  if (/^(Extend|Early exit)$/.test(type)) {
    const svc = findService(store, cr.get('TSA ID'));
    const to = Number(cr.get('Proposed exit date')) || readDate(cr.get('Change to')) || 0;
    return { kind: 'exit', svc, to, ready: !!(svc && to), missing: !svc ? 'the service (TSA ID)' : !to ? 'the new exit date (Proposed exit date or Change to)' : '' };
  }
  if (type === 'Plan change') {
    const item = findPlanItem(store, cr.get('Item ID'));
    const to = readDate(cr.get('Change to')) || 0;
    if (item && item.get('Type') === 'TSA exit') return { kind: 'exit', svc: findService(store, item.get('TSA ID')), to, ready: !!to, missing: to ? '' : 'the new date (Change to)' };
    return { kind: 'plan', item, to, ready: !!(item && to), missing: !item ? 'the plan item (Item ID)' : !to ? 'the new date (Change to)' : '' };
  }
  return { kind: 'forum', ready: true };
}

/** Review a New request: send it on, or reject it. */
export function openReview(ctx, cr) {
  const { store } = ctx;
  const route = routeOf(store, cr);
  const forums = store.options({ h: 'Approval forum', t: 'I', dv: { name: 'L_Forum' } }) || [];
  const forum = h('select', { 'aria-label': 'Forum' }, forums.map((f) => h('option', { value: f }, f)));
  if (cr.get('Approval forum') && forums.includes(cr.get('Approval forum'))) forum.value = cr.get('Approval forum');
  const note = h('textarea', { rows: 2, placeholder: 'Your note: for a rejection, say why (the person who asked sees it if you email them)' });
  const lines = requestLines(cr);
  const where = [cr.get('TSA ID') ? `Service ${cr.get('TSA ID')}${route.svc ? ` ${route.svc.get('Service name')}` : ''}` : null, cr.get('Item ID') ? `plan item ${cr.get('Item ID')}${route.item ? ` ${route.item.get('Activity')}` : ''}` : null].filter(Boolean).join(', ');
  const done = (msg) => { back.remove(); toast(msg); ctx.rerender(); };
  const reject = async () => {
    if (!note.value.trim()) { toast('Say why it is rejected', true); note.focus(); return; }
    try {
      const d = asOf(store.names);
      await store.save('tblChange', cr.i, { Status: 'Rejected', Decision: `Rejected by ${team()} at review: ${note.value.trim()}`, 'Decision date': d });
      done(`${cr.get('CR ID') || 'The request'} is rejected.`);
    } catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  const sendOn = async () => {
    try {
      const ch = { Status: 'Pending', 'Approval forum': forum.value };
      if (note.value.trim()) ch['Impact summary'] = [String(cr.get('Impact summary') || '').trim(), `${team()}: ${note.value.trim()}`].filter(Boolean).join(' ');
      await store.save('tblChange', cr.i, ch);
      done(`${cr.get('CR ID') || 'The request'} is now Pending for ${forum.value || 'the forum'}. Record the forum's decision when it is made.`);
    } catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  let next;
  if (route.kind === 'exit') {
    next = route.ready
      ? h('button.btn.btn-primary', { type: 'button', onclick: () => { back.remove(); openDateChange(ctx, route.svc, route.to, { cr }); } }, 'Process a date change ›')
      : null;
  } else if (route.kind === 'plan') {
    next = route.ready
      ? h('button.btn.btn-primary', { type: 'button', onclick: () => { back.remove(); openPlanChange(ctx, route.item.get('Activity ID'), route.to, 0, { cr }); } }, 'Check against the plan rules ›')
      : null;
  } else next = h('button.btn.btn-primary', { type: 'button', onclick: sendOn }, 'Send to the forum');
  const howTo = route.kind === 'exit'
    ? (route.ready ? `A service date: it goes through Process a date change, which works out the impact (${route.svc.get('TSA ID')} now exits ${fmtDate(exitOf(route.svc))}; asked for ${fmtDate(route.to)}). The request becomes Pending for the forum you pick there.` : null)
    : route.kind === 'plan'
      ? (route.ready ? `A plan date: it goes through the exit plan change rules (${fmtDate(route.item.get('Planned finish'))} → ${fmtDate(route.to)}). If the rules allow it, the dates move and the request closes; if not, it becomes a Pending plan change for the change forum.` : null)
      : `Pick the forum that decides and send it on: the request becomes Pending, and shows in that forum's governance pack.`;
  const back = modal(`Review ${cr.get('CR ID') || 'the new request'}`,
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
      h('p', { style: { margin: 0, fontWeight: 600 } }, cr.get('Title') || cr.get('Request type')),
      h('p.small.muted', { style: { margin: 0 } }, `${cr.get('Request type')}${where ? ' · ' + where : ''}${cr.get('Raised on') ? ` · asked on ${fmtDate(cr.get('Raised on'))}` : ''}`),
      h('div.card', { style: { padding: '10px 12px', background: 'var(--page)' } }, lines.length ? lines.map((l) => h('div.small', l)) : h('div.small.muted', 'No details from a request form.')),
      route.ready ? h('div.banner.info', { style: { margin: 0 } }, ed(howTo)) : h('div.banner.warn', { style: { margin: 0 } }, `To send it on, this request needs ${route.missing}. Fill it in on the right (Save), then review it again. Or reject it.`),
      route.kind === 'forum' ? h('div.field', h('label.field-label', 'Forum that decides'), forum) : null,
      h('div.field', h('label.field-label', 'Note'), note),
      h('p.small.muted', { style: { margin: 0 } }, ed(`Only ${theTeam()} reviews requests. Nothing is sent to the person who asked: use the email link to tell them.`)),
      replyLink(cr, 'Thank you for your change request. We have reviewed it and will let you know the forum\'s decision.')),
    [h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'), h('button.btn', { type: 'button', onclick: reject }, 'Reject'), next].filter(Boolean));
  return back;
}
