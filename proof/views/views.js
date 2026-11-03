// Screens for the spokes mock-ups. Each view draws into `main`. dir is 'a' or 'b' (the polish directions).
(function () {
  'use strict';
  const { D, h, C, fdate, fshort, fmonth, ftime, money, mshort, pct, days, ws, tsa, ragClass, spark, ring, donut, ragDots, stackBar, burndown, columns, meter, delta, toast, modal, chip } = window.K;
  const M = D.meta, LEAD = ws(M.leadWs), TSA = tsa();
  const PERIOD = fmonth(M.rd);
  const live = TSA.filter((t) => ['Active', 'Extended'].includes(t.Status));
  const exited = TSA.filter((t) => t.Status === 'Exited');
  const burnNow = D.burn.find((b) => b.m === M.today.slice(0, 8) + '01') || D.burn[0];
  const burnPrev = D.burn[D.burn.indexOf(burnNow) - 1] || burnNow;
  const nextExit = live.map((t) => t['Forecast exit date']).filter((d) => d > M.today).sort()[0];
  const inCount = D.ws.filter((w) => w.submitted).length;
  const dueIn = days(M.today, M.due);
  const state = window.__state || (window.__state = { submitted: false, dcr: null, approved: false, cycle: 'open', arrived: [] });
  const ini = (n) => n.split(' ').map((x) => x[0]).join('').slice(0, 2);
  const svcRag = (r) => ({ g: 'Green', a: 'Amber', r: 'Red' }[ragClass(r)] || r);
  const sim = (t) => h('div.note-sim.no-print', 'Mock-up: ' + t);

  function head(title, lede, actions, dir, eyebrow) {
    if (dir === 'b') return h('div.band', eyebrow ? h('div.eyebrow', eyebrow) : null, h('div.page-head', h('div', h('h1', title), lede ? h('p.lede', lede) : null), actions || null));
    return h('div.page-head', h('div', h('h1', title), lede ? h('p.lede', lede) : null), actions || null);
  }
  function kpi(label, value, sub, trend, cls) {
    return h('div.card.kpi.hov', { class: cls || null }, h('div.kpi-label', label),
      h('div.kpi-row', h('div.kpi-value', value), trend ? spark(trend) : null), sub ? h('div.kpi-sub', sub) : null);
  }

  // ======================================================================
  // SMO: Home (health check with the alerts)
  // ======================================================================
  function smoHome(main, dir = 'a') {
    const reds = TSA.filter((t) => t['Service delivery RAG'] === 'Red' || t['Exit readiness RAG'] === 'Red').length;
    const ambers = TSA.filter((t) => [t['Service delivery RAG'], t['Exit readiness RAG']].includes('Amber')).length;
    const runTrend = D.burn.slice(0, D.burn.indexOf(burnNow) + 1).map((b) => b.fcFee);
    const tasks = D.ws.reduce((a, w) => a + w.tasks, 0), done = D.ws.reduce((a, w) => a + w.done, 0);
    const alerts = h('div.grid', { style: { gap: '10px' } },
      !state.approved ? h('div.alert.bad', h('div.alert-icon', '!'), h('div.alert-body',
        h('div.alert-title', '1 date change needs your approval'),
        h('div.small.muted', `${D.dc.by} (${D.dc.ws}) asks to move "${D.dc.itemName}" by ${D.dc.days / 7} weeks. It moves the ${D.dc.tsaName} exit from ${fdate(D.dc.oldExit)} to ${fdate(D.dc.newExit)}: about ${mshort(D.dc.cost)} more in fees.`)),
        h('a.btn.btn-sm.btn-primary', { href: 'smo.html#approvals' }, 'Review')) : null,
      h('div.alert', h('div.alert-icon', 'i'), h('div.alert-body',
        h('div.alert-title', `${PERIOD} reporting: ${inCount} of ${D.ws.length} reports in`),
        h('div.small.muted', `Due ${fdate(M.due)}, in ${dueIn} days. ${D.ws.length - inCount} leads still to submit.`)),
        h('a.btn.btn-sm', { href: 'smo.html#submissions' }, 'See who')),
      h('div.alert.warn', h('div.alert-icon', '+'), h('div.alert-body',
        h('div.alert-title', '1 new risk raised in a workstream report'),
        h('div.small.muted', 'Reconciliation breaks found in rehearsal 2 (CUS). It is in the Risks register marked New.')),
        h('a.btn.btn-sm', { href: 'smo.html#home' }, 'Open RAID')));
    const kpis = h('div.grid.g4', { class: dir === 'b' ? 'lift' : null },
      kpi('Live services', String(live.length), `${exited.length} exited · next exit ${fshort(nextExit)}`, D.burn.slice(0, D.burn.indexOf(burnNow) + 1).map((b) => b.fcN)),
      kpi('Monthly run-rate', mshort(burnNow.fcFee), null, runTrend),
      h('div.card.kpi.hov', h('div.kpi-label', 'Red or amber services'), h('div.kpi-row', h('div.kpi-value', String(reds + ambers))),
        h('div.row', chip(`${reds} red`, 'r'), chip(`${ambers} amber`, 'a')), delta(reds + ambers, reds + ambers - 2, { good: 'down' })),
      kpi('Plan tasks complete', pct(done / tasks), `${done} of ${tasks}`, [0.05, 0.08, 0.12, 0.16, 0.2, done / tasks]));
    kpis.children[1].append(delta(burnNow.fcFee, burnPrev.fcFee, { good: 'down', fmt: mshort }));
    const reporting = h('div.card',
      h('div.card-head', h('h2', 'Reports in'), h('a.more', { href: 'smo.html#submissions' }, 'Workstream reports →')),
      h('div.row', { style: { gap: '18px', alignItems: 'center' } },
        ring(inCount / D.ws.length, { label: `${inCount}/${D.ws.length}`, sub: 'reports', color: C.c1 }),
        h('div', { style: { flex: '1 1 160px' } },
          h('div.small.muted', `Due ${fdate(M.due)}`),
          h('div.list', D.ws.filter((w) => !w.submitted).map((w) => h('div.li', h('span.avatar', ini(w.lead)), h('div.li-main', h('div.li-title', w.lead), h('div.li-sub', w.code + ' · not yet in')),
            h('button.btn.btn-sm', { onclick: () => toast(`Reminder drafted in Outlook for ${w.lead}`) }, 'Remind')))))));
    const health = h('div.card',
      h('div.card-head', h('h2', 'Workstreams at a glance'), h('span.small.muted', 'RAG for the last six months, latest largest')),
      h('div.mult', D.ws.map((w) => h('div.mini', h('div.mini-top', h('span.mini-code', w.code), chip(w.rag[5])),
        ragDots(w.rag, M.months6), h('div.mini-sub', `${w.done}/${w.tasks} tasks · ${w.live} live`), meter(w.tasks ? w.done / w.tasks : 0, C.c1)))));
    const burn = h('div.card', h('div.card-head', h('h2', 'TSA burn-down'), h('span.small.muted', 'Monthly fees for live services, plan against forecast')), burndown(D.burn, { h: 300 }));
    const mix = h('div.card', h('div.card-head', h('h2', 'Service delivery this month')),
      donut([{ label: 'Green', value: live.filter((t) => t['Service delivery RAG'] === 'Green').length, color: C.g },
        { label: 'Amber', value: live.filter((t) => t['Service delivery RAG'] === 'Amber').length, color: C.a },
        { label: 'Red', value: live.filter((t) => t['Service delivery RAG'] === 'Red').length, color: C.r }], { center: String(live.length), centerSub: 'live' }));
    const due = h('div.card', h('div.card-head', h('h2', 'Due soon')),
      h('div.list',
        h('div.li', chip('5 days', 'a'), h('div.li-main', h('div.li-title', 'Actions due'), h('div.li-sub', '2 open actions, 1 overdue (Sara Lindqvist)'))),
        h('div.li', chip('60 days', 'info'), h('div.li-main', h('div.li-title', 'Obligations due'), h('div.li-sub', '3 obligations; first on 14 Oct'))),
        h('div.li', chip('Consents', 'info'), h('div.li-main', h('div.li-title', 'Third-party consents outstanding'), h('div.li-sub', '4 of 11 still awaited'))),
        h('div.li', chip('Set-up', 'n'), h('div.li-main', h('div.li-title', 'Set-up gaps'), h('div.li-sub', '2 services have no exit plan owner')))));
    main.append(h('div.page', head(dir === 'b' ? `${PERIOD}: the programme at a glance` : 'Home', dir === 'b' ? `${M.programme}. Close was ${fdate(M.close)}; ${exited.length} services have exited.` : `${M.programme} · reporting ${PERIOD}`, null, dir, 'SMO Hub · Home'),
      dir === 'b' ? kpis : null, alerts, dir === 'b' ? null : kpis,
      h('div.grid.g2', burn, reporting), h('div.grid.g3', mix, due, h('div.card', h('div.card-head', h('h2', 'Spend this year')),
        h('div.kpi-value', mshort(D.quarters.filter((q) => q.q.endsWith('2026')).reduce((a, q) => a + q.fc, 0))), h('div.small.muted', 'TSA fees forecast for 2026'),
        h('div', { style: { marginTop: '10px' } }, stackBar([{ label: 'Paid', value: 7.7, color: C.c1 }, { label: 'Still to pay', value: 3.07, color: '#9DBBE0' }], { height: 12 })),
        h('div.legend-inline', { style: { marginTop: '6px' } }, h('span', h('span.sw', { style: { background: C.c1 } }), 'Paid £7.7m'), h('span', h('span.sw', { style: { background: '#9DBBE0' } }), 'Still to pay £3.1m')))),
      health));
  }

  // ======================================================================
  // Contributor: start screen (task-first)
  // ======================================================================
  function leadStart(main, dir = 'a') {
    const myTasks = D.plan.filter((p) => p.type !== 'TSA exit');
    const done = myTasks.filter((p) => p.status === 'Complete').length;
    const thisMonth = myTasks.filter((p) => p.status === 'In progress').length;
    const steps = [
      { done: state.submitted, title: `Write your ${PERIOD} report`, sub: state.submitted ? 'Sent to the SMO. You can still change it until it is approved.' : `Due ${fdate(M.due)} (in ${dueIn} days). Last month's text and this month's facts are filled in.`, href: '#report', go: state.submitted ? 'View' : 'Start' },
      { done: false, title: `Update ${thisMonth} tasks in progress`, sub: 'Status, % complete and a comment. Dates are locked; ask for a change if one moves.', href: '#tasks', go: 'Update' },
      { done: false, title: 'Close 1 overdue action', sub: 'AC-0002 Share revised policy migration plan with seller · due ' + fdate('2026-10-05'), href: '#raid', go: 'Open' }];
    const left = steps.filter((x) => !x.done).length;
    const stepsEl = h('div.steps', steps.map((x, i) => h('a.step', { href: x.href, class: x.done ? 'done' : null },
      h('span.step-n', x.done ? '✓' : String(i + 1)), h('div.step-main', h('div.step-title', x.title), h('div.step-sub', x.sub)), h('span.step-go', x.go + ' →'))));
    const progress = h('div.card', h('div.card-head', h('h2', 'Your progress')),
      h('div.rings',
        h('div.ring-item', ring(state.submitted ? 1 : 0.5, { label: state.submitted ? 'Sent' : '3/6', sub: 'report', color: state.submitted ? C.g : C.c1 }), 'Report sections done'),
        h('div.ring-item', ring(done / myTasks.length, { label: pct(done / myTasks.length), sub: `${done} of ${myTasks.length}`, color: C.c1 }), 'Tasks complete'),
        h('div.ring-item', ring(LEAD.exited / (LEAD.live + LEAD.exited || 1), { label: `${LEAD.exited}/${LEAD.live + LEAD.exited}`, sub: 'exited', color: C.c2 }), 'Services exited')));
    const glance = h('div.card', h('div.card-head', h('h2', 'Your workstream'), h('span.asat', 'From the Hub, as at ' + fdate(M.rd))),
      h('div.kv',
        h('dt', 'RAG, last 6 months'), h('dd', ragDots(LEAD.rag, M.months6)),
        h('dt', 'Live services'), h('dd', `${LEAD.live} · ${mshort(LEAD.runRate)} a month`),
        h('dt', 'Next exit'), h('dd', fdate('2027-03-01') + ' (4 services)'),
        h('dt', 'Open risks'), h('dd', '1 red, 1 New (yours)'),
        h('dt', 'Date changes'), h('dd', state.dcr ? chip('1 awaiting approval', 'a') : 'None pending')));
    const hello = dir === 'b' ? `${left ? left + ' things need you' : 'All done'} this month` : `${left} thing${left === 1 ? '' : 's'} need${left === 1 ? 's' : ''} you this month`;
    main.append(h('div.page', head(hello, `Good morning, ${LEAD.lead.split(' ')[0]}. ${LEAD.name}, ${PERIOD} report.`, null, dir, `Workstream Updates · ${LEAD.code}`),
      dir === 'b' ? h('div.grid.g3.lift', kpi('Report due', fshort(M.due), `in ${dueIn} days`), kpi('Tasks complete', pct(done / myTasks.length), `${done} of ${myTasks.length}`, [0.02, 0.05, 0.1, 0.14, 0.17, done / myTasks.length]), kpi('Run-rate', mshort(LEAD.runRate), `${LEAD.live} live services`)) : null,
      h('div.grid.g2', h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, stepsEl, left ? null : h('div.card.empty', h('div.empty-icon', '✓'), h('div.empty-title', 'Nothing else needs you this month. Well done.'))),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } }, progress, glance))));
  }

  // ======================================================================
  // Contributor: My report
  // ======================================================================
  function leadReport(main) {
    if (state.submitted) return reportSent(main);
    const last = LEAD;
    let rag = 'Amber', trend = 'Stable';
    const seg = (opts, cur, set, cls) => { const e = h('div.seg', { role: 'group' }); opts.forEach((o) => e.append(h('button', { type: 'button', class: cls ? ragClass(o) : null, 'aria-pressed': String(o === cur), onclick: () => { set(o); [...e.children].forEach((b) => b.setAttribute('aria-pressed', String(b.textContent === o))); } }, o))); return e; };
    const vals = {};
    const box = (label, val, note, key) => { const t = h('textarea.input.prefilled', { rows: 3 }); t.value = val; vals[key] = t; t.addEventListener('input', () => t.classList.remove('prefilled'), { once: true }); return h('div.field', h('label', label, note ? h('span.from-hub', { style: { marginLeft: '8px' } }, note) : null), t); };
    const facts = `${LEAD.live} live services, ${LEAD.exited} exited. Next exit: 1 Mar 2027. Plan items late: 0. Open issues: 1. Red or amber services: 0.`;
    const risks = D.raid.risks;
    main.append(h('div.page',
      head(`My report · ${PERIOD}`, 'Grey italics are last month\'s words: keep them or type over them. Facts come from the Hub and fill themselves in.',
        h('div.row', h('span.chip.a', `Due ${fshort(M.due)}`), h('button.btn', { onclick: () => toast('Draft saved in your workbook') }, 'Save draft'))),
      h('div.grid.g2',
        h('div.card', h('div.card-head', h('h2', 'Overall status')),
          h('div.grid', { style: { gap: '12px' } },
            h('div.field', h('span.label', 'RAG'), seg(['Green', 'Amber', 'Red'], rag, (v) => (rag = v), true), h('span.small.muted', 'Last month: Amber')),
            h('div.field', h('span.label', 'Trend'), seg(['Improving', 'Stable', 'Worsening'], trend, (v) => (trend = v))))),
        h('div.card', h('div.card-head', h('h2', 'Facts from the Hub'), h('span.asat', 'as at ' + fdate(M.rd))), h('p', { style: { margin: 0 } }, facts),
          h('div.small.muted', { style: { marginTop: '8px' } }, 'These go into the report as they are. If one looks wrong, tell the SMO.'))),
      h('div.card', h('div.card-head', h('h2', 'Commentary')),
        h('div.grid.g2', box('Summary', last.summary, 'from August', 'summary'), box('Achievements this month', 'Second rehearsal passed with 99.7% of policies reconciled.', 'from August', 'achievements'),
          box('Next steps', 'Rehearsal 3 on 14 Nov; scheme renewals file fix with the seller.', null, 'next'), box('Path to green', last.path, 'from August', 'path'),
          box('Escalations', '', null, 'help'), box('Cost commentary', 'On budget; migration spend tracking the forecast.', null, 'cost'))),
      h('div.card', h('div.card-head', h('h2', 'Risks, issues and decisions to report'), h('span.small.muted', 'Ticked items go into the pack')),
        h('div', { style: { overflowX: 'auto' } }, h('table.t', h('thead', h('tr', h('th', ''), h('th', 'ID'), h('th', 'Title'), h('th', 'Rating or status'), h('th', 'Owner'))),
          h('tbody', risks.map((r) => h('tr', h('td', h('input', { type: 'checkbox', checked: true, 'aria-label': 'Include ' + r.title })), h('td.id', r.id === 'New' ? chip('New', 'new') : r.id), h('td', r.title), h('td', chip(r.rating)), h('td', r.owner))),
            D.raid.issues.map((r) => h('tr', h('td', h('input', { type: 'checkbox', checked: true, 'aria-label': 'Include ' + r.title })), h('td.id', r.id), h('td', r.title), h('td', chip(r.status, 'n')), h('td', r.owner))),
            D.raid.decisions.map((r) => h('tr', h('td', h('input', { type: 'checkbox', 'aria-label': 'Include ' + r.title })), h('td.id', r.id), h('td', r.title), h('td', chip(r.status, 'g')), h('td', r.owner)))))),
        h('div.row', { style: { marginTop: '10px' } }, h('a.btn.btn-sm', { href: '#raid' }, '+ Raise a risk or issue'))),
      h('div.card', { style: { position: 'sticky', bottom: '12px', boxShadow: 'var(--sh28)' } },
        h('div.row', h('div', { style: { flex: '1 1 260px' } }, h('b', 'Ready to send?'), h('div.small.muted', 'Submit sends your report, task updates, new risks and date requests to the SMO in one go.')),
          h('button.btn.btn-primary', { onclick: () => submitDialog(main, () => Object.assign({ ws: LEAD.code, month: M.rd.slice(0, 8) + '01', rag, trend, risks: D.raid.risks.filter((r) => r.status === 'New'), issues: D.raid.issues }, Object.fromEntries(Object.entries(vals).map(([k, t]) => [k, t.value])))) }, 'Submit to the SMO')))));
  }
  function submitDialog(main, payload) {
    modal('Submit your September report?', h('div', h('p', { style: { margin: '0 0 10px' } }, 'This goes to the SMO now:'),
      h('div.list', [['Workstream report', 'RAG Amber, trend Stable, 6 commentary boxes'], ['Task updates', '3 tasks: status and % complete'], ['New risk', 'Reconciliation breaks found in rehearsal 2'],
        ['Date change request', state.dcr ? 'Build and configure cloned system, +6 weeks' : 'None']].map(([a, b]) => h('div.li', h('span.chip.g', '✓'), h('div.li-main', h('div.li-title', a), h('div.li-sub', b))))),
      h('p.small.muted', 'You can still change it until the SMO approves it.')),
    (close) => [h('button.btn', { onclick: close }, 'Not yet'), h('button.btn.btn-primary', { onclick: async (e) => { e.currentTarget.disabled = true; e.currentTarget.textContent = 'Sending…'; try { const r = await K.submit('report', payload()); state.where = r.where; close(); state.submitted = true; main.textContent = ''; reportSent(main); } catch (err) { close(); toast('Could not send: ' + err.message); } } }, 'Submit')]);
  }
  function reportSent(main) {
    main.append(h('div.page', h('div.card.success',
      h('div.success-mark', K.s('svg', { viewBox: '0 0 24 24', width: 34, height: 34 }, K.s('path', { d: 'M5 12.5l4.2 4.2L19 7', fill: 'none', stroke: '#1B5E36', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }))),
      h('h1', 'Sent to the SMO'),
      h('p.lede', { style: { textAlign: 'center' } }, `Your ${PERIOD} report reached the Hub at 14:05 on ${fdate(M.today)}. Maya Okafor sees it on Home now.`), state.where ? h('div.small.muted', 'Saved as: ' + state.where) : null,
      h('div.list', { style: { width: 'min(460px, 100%)', textAlign: 'left' } },
        h('div.li', chip('In', 'g'), h('div.li-main', h('div.li-title', 'Workstream report'), h('div.li-sub', 'Goes into Consolidated WS Reporting when approved'))),
        h('div.li', chip('New', 'new'), h('div.li-main', h('div.li-title', '1 risk added to the RAID log'), h('div.li-sub', 'Marked New until the SMO adopts it'))),
        h('div.li', chip('Waiting', 'a'), h('div.li-main', h('div.li-title', '1 date change awaiting approval'), h('div.li-sub', 'Nothing moves until the SMO approves it')))),
      h('div.row', h('a.btn', { href: '#start' }, 'Back to start'), h('button.btn', { onclick: () => { state.submitted = false; main.textContent = ''; leadReport(main); } }, 'Change my report')))));
  }

  // ======================================================================
  // Contributor: My RAID
  // ======================================================================
  function leadRaid(main) {
    let tab = 'risks';
    const R = D.raid;
    const body = h('div');
    const draw = () => {
      body.textContent = '';
      const rows = { risks: R.risks.map((r) => [r.id === 'New' ? chip('New', 'new') : r.id, r.title, r.tsa, h('span', `${r.l}×${r.i} = ${r.score} `, chip(r.rating)), r.owner, r.status === 'New' ? 'Sent to the SMO' : fdate(r.review)]),
        issues: R.issues.map((r) => [r.id, r.title, r.tsa, chip(r.priority, r.priority === 'High' ? 'a' : 'n'), r.owner, fdate(r.due)]),
        actions: R.actions.map((r) => [r.id, r.title, r.linked, r.due < M.today || r.due === M.today ? chip('Due today', 'r') : chip(r.status, 'n'), r.owner, fdate(r.due)]),
        decisions: R.decisions.map((r) => [r.id, r.title, '', chip(r.status, r.status === 'Made' ? 'g' : 'a'), r.owner, fdate(r.needed)]) }[tab];
      const hd = { risks: ['ID', 'Risk', 'TSA', 'Score', 'Owner', 'Review by'], issues: ['ID', 'Issue', 'TSA', 'Priority', 'Owner', 'Due'], actions: ['ID', 'Action', 'Linked', 'Status', 'Owner', 'Due'], decisions: ['ID', 'Decision needed', '', 'Status', 'Owner', 'Needed by'] }[tab];
      body.append(rows.length ? h('div.tbl-wrap', h('table.t', h('thead', h('tr', hd.map((x) => h('th', x)))), h('tbody', rows.map((r) => h('tr.click', r.map((c, i) => h(i === 0 ? 'td.id' : 'td', c))))))) :
        h('div.card.empty', h('div.empty-icon', '✓'), h('div.empty-title', 'Nothing open here.'), h('div.small', 'Raise one if something new comes up.')));
    };
    const tabs = h('div.tabs', { role: 'tablist' }, [['risks', 'Risks', R.risks.length], ['issues', 'Issues', R.issues.length], ['actions', 'Actions', R.actions.length], ['decisions', 'Decisions', R.decisions.length]].map(([k, l, n]) =>
      h('button.tab', { role: 'tab', 'aria-selected': String(k === tab), onclick: (e) => { tab = k; [...tabs.children].forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget))); draw(); } }, l, h('span.n', String(n)))));
    draw();
    main.append(h('div.page', head('My RAID', `${LEAD.name} only. What you raise or change goes to the SMO as a proposal and shows in the Hub marked New.`,
      h('button.btn.btn-primary', { onclick: () => raiseDialog() }, '+ Raise a risk or issue')),
    h('div.legend-inline', h('span', chip('New', 'new'), 'raised by you, waiting for the SMO'), h('span', chip('Suggested', 'sugg'), 'from the starter library (SMO only)')), tabs, body));
  }
  function raiseDialog() {
    let l = 3, i = 4;
    const score = h('span'), rate = h('span');
    const upd = () => { const s = l * i; score.textContent = String(s); rate.textContent = ''; rate.append(chip(s >= 15 ? 'Red' : s >= 8 ? 'Amber' : 'Green')); };
    const scale = (cur, set) => { const e = h('div.seg'); [1, 2, 3, 4, 5].forEach((n) => e.append(h('button', { type: 'button', 'aria-pressed': String(n === cur), onclick: () => { set(n); [...e.children].forEach((b) => b.setAttribute('aria-pressed', String(+b.textContent === n))); upd(); } }, String(n)))); return e; };
    upd();
    modal('Raise a risk', h('div.grid', { style: { gap: '12px' } },
      h('div.field', h('label', 'Risk'), h('input.input', { value: 'Seller staff leave before knowledge transfer completes' })),
      h('div.field', h('label', 'TSA'), h('select.input', D.tsa.filter((r) => r[3] === LEAD.code).map((r) => h('option', `${r[0]} ${r[1]}`)))),
      h('div.grid.g2', h('div.field', h('span.label', 'Likelihood'), scale(l, (v) => (l = v))), h('div.field', h('span.label', 'Impact'), scale(i, (v) => (i = v)))),
      h('div.row', h('span.label.muted', 'Score'), h('b', score), rate, h('span.small.muted', 'works out as you pick')),
      h('div.field', h('label', 'Mitigation / response'), h('textarea.input', { rows: 2 }))),
    (close) => [h('button.btn', { onclick: close }, 'Cancel'), h('button.btn.btn-primary', { onclick: async () => { try { await K.submit('risk', { ws: LEAD.code, likelihood: l, impact: i, title: document.querySelector('.modal input.input').value }); close(); toast('Risk sent to the SMO. It shows in the Hub marked New.'); } catch (err) { toast('Could not send: ' + err.message); } } }, 'Send to the SMO')]);
  }

  // ======================================================================
  // Contributor: My tasks (dates locked; request a date change)
  // ======================================================================
  function leadTasks(main) {
    let scope = 'exit', sel = state.dcr ? D.dc.item : 'SP-CUS-0044';
    const t0 = '2026-07-01', t1 = '2027-07-31', span = days(t0, t1);
    const pos = (d) => Math.max(0, Math.min(100, (days(t0, d) / span) * 100));
    const wrap = h('div.split'), list = h('div.grow'), panel = h('div.panel');
    const items = () => scope === 'exit' ? D.plan : scope === 'day1' ? D.day1.map((x) => ({ id: x.id, type: 'Task', name: x.name, finish: x.due, start: x.due, status: x.status, pct: x.status === 'Complete' ? 1 : 0, owner: x.owner }))
      : D.f100.map((x) => ({ id: x.id, type: 'Task', name: x.name, finish: x.due, start: x.due, status: x.status, pct: x.status === 'Complete' ? 1 : 0, owner: x.owner }));
    const drawList = () => {
      list.textContent = '';
      const rows = items();
      list.append(h('div.tbl-wrap', h('table.t', h('thead', h('tr', h('th', 'Activity'), h('th', 'Finish 🔒'), h('th', { style: { minWidth: '160px' } }, 'Jul 26 → Jul 27'), h('th', 'Status'), h('th.n', '%'))),
        h('tbody', rows.map((p) => {
          const exit = p.type === 'TSA exit';
          const req = state.dcr && p.id === D.dc.item, moved = state.dcr && D.dc.chain.some((c) => c.id === p.id);
          const track = h('div.bar-track', h('span.today-line', { style: { left: pos(M.today) + '%' } }),
            exit ? null : h('span.bar', { class: p.type !== 'Task' ? 'ms' : null, style: { left: pos(p.start) + '%', width: Math.max(1, pos(p.finish) - pos(p.start)) + '%', background: p.status === 'Complete' ? C.g : C.c1 } }),
            moved ? (() => { const c = D.dc.chain.find((x) => x.id === p.id); return h('span.bar.ghost', { style: { left: pos(p.start) + '%', width: Math.max(1, pos(c.to) - pos(p.start)) + '%' }, 'data-tip': `Proposed finish ${fdate(c.to)}` }); })() : null);
          return h('tr', { class: [exit ? '' : 'click', p.id === sel ? 'sel' : '', moved ? 'moved' : ''].join(' '), onclick: exit ? null : () => { sel = p.id; drawList(); drawPanel(); } },
            h('td', exit ? h('b', p.name) : h('div', { style: { paddingLeft: '10px' } }, p.name, req ? h('div', chip('Date change requested', 'a')) : moved ? h('div.small.muted', 'would move') : null)),
            h('td.num', { style: { whiteSpace: 'nowrap' } }, fshort(p.finish) + ' ' + (p.finish || '').slice(2, 4)), h('td', exit ? null : track),
            h('td', exit ? null : chip(p.status, p.status === 'Complete' ? 'g' : p.status === 'In progress' ? 'info' : 'n')), h('td.n', exit ? '' : pct(p.pct || 0)));
        })))));
    };
    const drawPanel = () => {
      panel.textContent = '';
      const p = items().find((x) => x.id === sel) || items().find((x) => x.type !== 'TSA exit');
      if (!p) return;
      let asking = false;
      const st = h('select.input', ['Not started', 'In progress', 'Complete'].map((o) => h('option', { selected: o === p.status }, o)));
      const pc = h('input.input', { type: 'number', min: 0, max: 100, value: Math.round((p.pct || 0) * 100) });
      const req = h('div');
      const drawReq = () => {
        req.textContent = '';
        if (state.dcr && p.id === D.dc.item) { req.append(h('div.callout', h('b', 'Date change requested'), h('div', `Finish ${fdate(D.dc.from)} → ${fdate(D.dc.to)}. ${D.dc.chain.length - 1} later tasks would move with it. Waiting for the SMO.`))); return; }
        if (!asking) { req.append(h('button.btn', { onclick: () => { asking = true; drawReq(); } }, 'Request a date change')); return; }
        const nd = h('input.input', { type: 'date', value: p.id === D.dc.item ? D.dc.to : '' });
        const why = h('textarea.input', { rows: 3 }); if (p.id === D.dc.item) why.value = D.dc.reason;
        const fx = h('div.small');
        const calc = () => { const n = nd.value ? days(p.finish, nd.value) : 0; fx.textContent = !n ? '' : p.id === D.dc.item ? `+${n} days. This moves ${D.dc.chain.length - 1} later tasks and the cut-over to ${fdate(D.dc.chain[D.dc.chain.length - 1].to)}, after the TSA exit date. The SMO will see the cost before deciding.` : `${n > 0 ? '+' : ''}${n} days.`; };
        nd.addEventListener('input', calc); calc();
        req.append(h('div.card', { style: { boxShadow: 'none', background: 'var(--input)', display: 'flex', flexDirection: 'column', gap: '10px' } },
          h('div.field', h('label', 'Proposed finish date'), nd), fx, h('div.field', h('label', 'Why it needs to move'), why),
          h('div.row', h('button.btn', { onclick: () => { asking = false; drawReq(); } }, 'Cancel'),
            h('button.btn.btn-primary', { onclick: async () => { try { await K.submit('date-change', { ws: LEAD.code, item: p.id, name: p.name, from: p.finish, to: nd.value, reason: why.value }); state.dcr = true; toast('Date change sent to the SMO for approval'); drawList(); drawPanel(); } catch (err) { toast('Could not send: ' + err.message); } } }, 'Send request'))));
      };
      drawReq();
      panel.append(h('div.panel-head', h('div', h('div.small.muted', p.id), h('h2', p.name))),
        h('div.panel-body',
          h('div.grid.g2', h('div.field', h('label', 'Status'), st), h('div.field', h('label', '% complete'), pc)),
          h('div.grid.g2', h('div.field', h('label', 'Start'), h('input.input', { readonly: true, value: fdate(p.start) })), h('div.field', h('label', 'Finish'), h('input.input', { readonly: true, value: fdate(p.finish) }))),
          h('span.lock', '🔒 Dates come from the Hub\'s main plan and update from there. A change needs the SMO\'s approval.'),
          req, h('div.field', h('label', 'Comment'), h('textarea.input', { rows: 2 }))),
        h('div.panel-foot', h('button.btn.btn-primary', { onclick: () => toast('Saved. It goes to the Hub when you submit.') }, 'Save')));
    };
    const seg = h('div.tabs', [['exit', 'Exit plan', D.plan.filter((p) => p.type !== 'TSA exit').length], ['f100', 'First 100 days', D.f100.length], ['day1', 'Day 1', D.day1.length]].map(([k, l, n]) =>
      h('button.tab', { 'aria-selected': String(k === scope), onclick: (e) => { scope = k; [...seg.children].forEach((b) => b.setAttribute('aria-selected', String(b === e.currentTarget))); sel = (items().find((x) => x.type !== 'TSA exit') || {}).id; drawList(); drawPanel(); } }, l, h('span.n', String(n)))));
    drawList(); drawPanel();
    wrap.append(list, panel);
    main.append(h('div.page', head('My tasks', 'Your part of the plan, updated from the Hub. Change status, % complete and comments; dates are locked.', h('span.asat', 'Updated from the Hub ' + fdate(M.today))),
      h('div.callout', `Day 1 (${fdate(M.close)}) and the First 100 days are behind you, so the Exit plan comes first. Earlier lists stay here to look back on.`), seg, wrap));
  }

  // ======================================================================
  // Contributor: My services (whole register, every field)
  // ======================================================================
  function leadServices(main, opts = {}) {
    let wsF = opts.ws || LEAD.code, q = '', sel = null;
    const wsList = [...new Set(TSA.map((t) => t.Workstream))];
    const table = h('div.grow'), panel = h('div.panel');
    const filt = () => TSA.filter((t) => (wsF === 'All' || t.Workstream === wsF) && (!q || (t['TSA ID'] + ' ' + t['Service name'] + ' ' + t['Service description']).toLowerCase().includes(q)));
    const drawTable = () => {
      const rows = filt(); table.textContent = '';
      const total = rows.filter((t) => t.Status !== 'Exited').reduce((a, t) => a + (Number(t['Monthly fee (reporting currency)']) || 0), 0);
      table.append(h('div.tbl-wrap', h('table.t', h('thead', h('tr', ['TSA ID', 'Service', 'WS', 'Direction', 'Status', 'Forecast exit'].map((x) => h('th', x)), h('th.n', 'Monthly fee'))),
        h('tbody', rows.map((t) => h('tr.click', { class: sel === t['TSA ID'] ? 'sel' : null, onclick: () => { sel = t['TSA ID']; drawTable(); drawPanel(); } },
          h('td.id', t['TSA ID']), h('td', t['Service name']), h('td', t.Workstream), h('td', t.Direction), h('td', chip(t.Status, t.Status === 'Exited' ? 'n' : t.Status === 'Extended' ? 'a' : 'g')),
          h('td.num', fdate(t['Forecast exit date'])), h('td.n', t['Monthly fee (reporting currency)'] ? money(t['Monthly fee (reporting currency)']) : '–')))),
        h('tfoot', h('tr', h('td', { colspan: 6 }, `${rows.length} services · live run-rate`), h('td.n', money(total)))))));
    };
    const groups = [['Service', ['Service description', 'Direction', 'Status', 'Sub-function', 'Line of business', 'Critical', 'Schedule ref', 'Service levels', 'Dependent services']],
      ['Dates', ['Service start', 'Initial term (months)', 'Initial end date', 'Planned exit date', 'Forecast exit date', 'Actual exit date', 'Exit notice deadline', 'Extension notice deadline']],
      ['Fees', ['Fee currency', 'Monthly fee (key input)', 'Monthly fee (reporting currency)', 'Charging basis', 'Fee basis note', 'Inside fee cap', 'Mark-up starts', 'Billing stops']],
      ['People', ['Provider service owner', 'Recipient service owner', 'Provider entity', 'Recipient entity']],
      ['Exit', ['Exit route', 'Exit plan status', 'Exit hypothesis', 'Entanglement', 'Exit complexity', 'Service delivery RAG', 'Exit readiness RAG', 'Path to green', 'Latest SLA result']],
      ['Contract terms', ['On-time exit notice (days)', 'Early exit notice (days)', 'Extension notice (days)', 'Extension allowed', 'Maximum extension (months)', 'Partial exit allowed']]];
    const val = (k, v) => v === '' || v == null ? '–' : /date|deadline|start|stops|starts/i.test(k) && /^\d{4}-/.test(v) ? fdate(v) : /fee \(/i.test(k) && typeof v === 'number' ? money(v) : String(v);
    const drawPanel = () => {
      panel.textContent = '';
      const t = TSA.find((x) => x['TSA ID'] === sel);
      if (!t) { panel.append(h('div.panel-body', h('div.empty', h('div.empty-title', 'Pick a service'), h('div.small', 'Every field from the TSA register shows here, including fees.')))); return; }
      panel.append(h('div.panel-head', h('div', h('div.small.muted', t['TSA ID'] + ' · ' + t.Workstream), h('h2', t['Service name']))),
        h('div.panel-body', h('dl.kv', groups.map(([g, ks]) => [h('div.kv-sec', g), ks.map((k) => [h('dt', k), h('dd', val(k, t[k]))])]))),
        h('div.panel-foot', h('span.small.muted', 'Read only. Ask the SMO to change a service.')));
    };
    const wsSel = h('select.input', { style: { width: 'auto' }, 'aria-label': 'Workstream', onchange: (e) => { wsF = e.target.value; sel = null; drawTable(); drawPanel(); } },
      h('option', { value: 'All' }, 'All workstreams'), wsList.map((w) => h('option', { value: w, selected: w === wsF }, `${w}${ws(w) ? ' · ' + ws(w).name : ''}`)));
    drawTable(); drawPanel();
    main.append(h('div.page', head('My services', 'The whole TSA register. It opens on your workstream; pick any other to look across.', h('div.row.no-print', h('span.asat', 'As at ' + fdate(M.rd)), h('button.btn', { onclick: () => print() }, 'Print or save as PDF'))),
      h('div.filters.no-print', wsSel, h('input.search', { type: 'search', placeholder: 'Search services', 'aria-label': 'Search services', oninput: (e) => { q = e.target.value.toLowerCase(); drawTable(); } })),
      h('div.split', table, panel)));
  }

  // ======================================================================
  // SMO: Start reporting cycle
  // ======================================================================
  function smoCycle(main) {
    const box = h('div');
    const draw = () => {
      box.textContent = '';
      if (state.cycle === 'open') {
        box.append(h('div.card', h('div.row', ring(inCount / D.ws.length, { size: 72, label: `${inCount}/${D.ws.length}`, sub: 'in' }),
          h('div', { style: { flex: '1 1 240px' } }, h('h2', `${PERIOD} reporting is open`), h('div.muted', `Opened ${fdate(M.opened)} · due ${fdate(M.due)} · ${D.ws.length - inCount} still to come`)),
          h('a.btn', { href: '#submissions' }, 'See who has submitted'), h('button.btn', { onclick: () => { state.cycle = 'new'; draw(); } }, 'Start next cycle (preview)'))));
        return;
      }
      const leads = D.ws.filter((w) => w.lead);
      box.append(h('div.grid.g2',
        h('div.card', h('div.card-head', h('h2', 'Start the October cycle')),
          h('div.grid', { style: { gap: '12px' } },
            h('div.grid.g2', h('div.field', h('label', 'Reporting date'), h('input.input', { type: 'date', value: '2026-10-31' })), h('div.field', h('label', 'Reports due'), h('input.input', { type: 'date', value: '2026-11-06' }))),
            h('div.field', h('span.label', `Send to ${leads.length} leads`), h('div.list', leads.map((w) => h('label.li', h('input', { type: 'checkbox', checked: true }), h('div.li-main', h('div.li-title', w.lead), h('div.li-sub', `${w.code} · ${w.email || 'email from the People register'}`)))))))),
        h('div.card', h('div.card-head', h('h2', 'The email'), h('span.small.muted', 'One email, everyone in Bcc')),
          h('div.field', h('label', 'Subject'), h('input.input', { value: `${M.programme}: October report due 6 Nov` })),
          h('div.field', { style: { marginTop: '10px' } }, h('label', 'Message'), h('textarea.input', { rows: 9 }, `Hello,\n\nReporting for October is open. Please open your Workstream Updates workbook (link below), check your tasks and submit your report by Friday 6 November.\n\nLast month's words are filled in for you, and the facts come from the Hub.\n\nThank you,\nMaya Okafor, SMO lead`)),
          h('div.row', { style: { marginTop: '12px' } }, h('span.small.muted', { style: { flex: '1 1 200px' } }, 'Opens in Outlook for you to send. The Hub sends no email itself.'),
            h('button.btn.btn-primary', { onclick: () => { state.cycle = 'open'; toast('October cycle started. Email opened in Outlook.'); draw(); } }, 'Start cycle and open email')))));
    };
    draw();
    main.append(h('div.page', head('Reporting cycle', 'Start the month once. Leads get one email; the late ones get their own reminder.'), box));
  }

  // ======================================================================
  // SMO: Workstream reports, submissions arriving
  // ======================================================================
  function smoSubmissions(main, dir = 'a') {
    const feed = h('div.feed'), tbody = h('tbody');
    const arrived = state.arrived;
    const rows = () => D.ws.map((w) => Object.assign({}, w, arrived.includes(w.code) ? { submitted: '2026-10-05T14:05' } : {}));
    const draw = () => {
      tbody.textContent = '';
      rows().forEach((w) => tbody.append(h('tr', { class: arrived.includes(w.code) ? 'arrive' : null },
        h('td.id', w.code), h('td', w.lead, h('div.small.muted', w.name)),
        h('td', w.submitted ? chip('In · ' + ftime(w.submitted), 'g') : chip(`Due ${fshort(M.due)}`, 'n')),
        h('td', ragDots(w.rag, M.months6)),
        h('td', w.submitted ? h('button.btn.btn-sm', { onclick: () => toast(`${w.code} report opened for review`) }, 'Review') : h('button.btn.btn-sm', { onclick: () => toast(`Reminder drafted in Outlook for ${w.lead}`) }, 'Remind')))));
      feed.textContent = '';
      rows().filter((w) => w.submitted).sort((a, b) => b.submitted.localeCompare(a.submitted)).slice(0, 6).forEach((w) => feed.append(
        h('div.feed-item', { class: arrived.includes(w.code) ? 'arrive' : null }, h('span.avatar', ini(w.lead)),
          h('div.li-main', h('div.li-title', `${w.lead} submitted ${w.code}`), h('div.li-sub', `${ftime(w.submitted)} · RAG ${w.rag[5]}${w.code === 'CUS' ? ' · 1 new risk · 1 date change' : ''}`)))));
      count.textContent = `${rows().filter((w) => w.submitted).length} of ${D.ws.length} in`;
    };
    const count = h('span');
    const picker = h('input', { type: 'file', multiple: true, accept: '.xlsx', style: { display: 'none' }, onchange: async (e) => {
      const files = e.target.files; if (!files.length) return;
      const res = await window.XlsxRead.importReports(files); e.target.value = '';
      res.filter((r) => r.ok && r.report.ws && !arrived.includes(r.report.ws)).forEach((r) => arrived.push(r.report.ws));
      draw();
      modal(`Imported ${res.filter((r) => r.ok).length} of ${res.length} files`, h('div.list', res.map((r) => h('div.li',
        r.ok ? chip(r.report.warnings.length ? 'Check' : 'Read', r.report.warnings.length ? 'a' : 'g') : chip('Skipped', 'r'),
        h('div.li-main', h('div.li-title', r.file), h('div.li-sub', r.ok
          ? `${r.report.ws || '?'} · ${K.fmonth(r.report.month)} · RAG ${r.report.rag || '?'} · ${r.report.risks.length} risk(s) and ${r.report.issues.length} issue(s) go to RAID marked New · ${r.report.decisions.length} decision(s)${r.report.warnings.length ? ' · ' + r.report.warnings.join('; ') : ''}`
          : r.error))))),
      (c) => [h('button.btn.btn-primary', { onclick: c }, 'Done')]);
    } });
    const simulate = () => { const next = rows().find((w) => !w.submitted); if (!next) return; arrived.push(next.code === 'CON' ? 'CUS' : next.code); if (!arrived.includes('CUS')) arrived.push('CUS'); draw(); toast(`New submission: ${arrived[arrived.length - 1]}`); };
    draw();
    main.append(h('div.page', head('Workstream reports', `${PERIOD} cycle · due ${fdate(M.due)}`, h('div.row', h('button.btn', { onclick: () => toast(`Reminders drafted for ${rows().filter((w) => !w.submitted).length} leads`) }, 'Remind everyone late'), picker, h('button.btn', { onclick: () => picker.click(), title: 'Read returned workstream report files (.xlsx), several at once' }, 'Import reports'), h('button.btn.btn-primary', { onclick: simulate }, 'Simulate a submission')), dir),
      h('div.grid.g2', { class: dir === 'b' ? 'lift' : null },
        h('div.card', h('div.card-head', h('h2', count), h('span.small.muted', 'Live: reports appear as leads submit')),
          stackBar([{ label: 'In', value: rows().filter((w) => w.submitted).length, color: C.c1 }, { label: 'To come', value: rows().filter((w) => !w.submitted).length, color: C.n }], { height: 12 }),
          h('div', { style: { marginTop: '12px' } }, feed)),
        h('div.card', h('div.card-head', h('h2', 'What happens next')),
          h('div.list', h('div.li', h('span.step-n', '1'), h('div.li-main', h('div.li-title', 'Reports flow into Consolidated WS Reporting'), h('div.li-sub', 'As each arrives; nothing to copy or paste'))),
            h('div.li', h('span.step-n', '2'), h('div.li-main', h('div.li-title', 'New risks and issues land in RAID marked New'), h('div.li-sub', 'You adopt or remove each one'))),
            h('div.li', h('span.step-n', '3'), h('div.li-main', h('div.li-title', 'Date changes wait in Approvals'), h('div.li-sub', 'With their impact worked out'))),
            h('div.li', h('span.step-n', '4'), h('div.li-main', h('div.li-title', 'You approve, add the SMO commentary, and the pack builds itself')))))),
      h('div.tbl-wrap', h('table.t', h('thead', h('tr', h('th', 'WS'), h('th', 'Lead'), h('th', 'This cycle'), h('th', 'RAG, 6 months'), h('th', ''))), tbody))));
  }

  // ======================================================================
  // SMO: Approvals (date change with impact assessment)
  // ======================================================================
  function smoApprovals(main) {
    const dc = D.dc, last = dc.chain[dc.chain.length - 1];
    const t0 = '2027-01-01', t1 = '2027-09-01', span = days(t0, t1), pos = (d) => Math.max(0, Math.min(100, (days(t0, d) / span) * 100));
    const queue = h('div.card', h('div.card-head', h('h2', 'Waiting for you')),
      h('div.list', h('div.li.click', { style: { background: 'var(--row-pick, #F2F7FD)', boxShadow: 'inset 3px 0 0 var(--blue)' } }, h('span.avatar', 'SL'), h('div.li-main', h('div.li-title', `${dc.id} · ${dc.itemName}`), h('div.li-sub', `${dc.by} · ${fshort(dc.raised)} · +${dc.days} days`)), chip(state.approved ? 'Approved' : 'Moves an exit', state.approved ? 'g' : 'r')),
        h('div.li.click', h('span.avatar', 'RM'), h('div.li-main', h('div.li-title', 'DCR-005 · Knowledge articles migrated'), h('div.li-sub', 'Raj Menon · 4 Oct · +5 days')), chip('No knock-on', 'g'))));
    const boxes = h('div.impact',
      h('div.box.warn', h('div.small.muted', 'Tasks and milestones'), h('div.big', String(dc.chain.length)), h('div.small', `move by +${dc.days} days`)),
      h('div.box.bad', h('div.small.muted', 'TSA exit date'), h('div.big', `+${dc.extraMonths} months`), h('div.small', h('span.strike', fdate(dc.oldExit)), ' → ', h('b', fdate(dc.newExit)))),
      h('div.box.bad', h('div.small.muted', 'Extra fees'), h('div.big', mshort(dc.cost)), h('div.small', `${dc.extraMonths} × ${money(dc.fee)} + ${pct(dc.markup)} mark-up`)),
      h('div.box', h('div.small.muted', 'Notice deadline'), h('div.big', fshort(dc.extNotice)), h('div.small', 'Extension notice in time if decided by then')));
    const gantt = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      dc.chain.map((c) => h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(120px, 34%) 1fr', gap: '10px', alignItems: 'center', fontSize: '12px' } },
        h('span', c.name), h('div.bar-track', { style: { background: 'var(--line-soft)', borderRadius: '3px' } },
          h('span.bar', { class: c.type === 'Milestone' ? 'ms' : null, style: { left: pos(c.from) + '%', width: '1.4%', background: C.plan, opacity: 0.6 }, 'data-tip': `Now: ${fdate(c.from)}` }),
          h('span.bar', { class: c.type === 'Milestone' ? 'ms' : null, style: { left: pos(c.to) + '%', width: '1.4%', background: C.r }, 'data-tip': `Proposed: ${fdate(c.to)}` })))),
      h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(120px, 34%) 1fr', gap: '10px', fontSize: '12px' } }, h('b', 'TSA exit'),
        h('div.bar-track', h('span.bar.ms', { style: { left: pos(dc.oldExit) + '%', background: C.plan }, 'data-tip': fdate(dc.oldExit) }), h('span.bar.ms', { style: { left: pos(dc.newExit) + '%', background: C.r }, 'data-tip': fdate(dc.newExit) }))),
      h('div.legend-inline', h('span', h('span.sw', { style: { background: C.plan } }), 'Now'), h('span', h('span.sw', { style: { background: C.r } }), 'If approved'), h('span', 'Jan 2027 → Sep 2027')));
    const detail = h('div.card', { style: { display: 'flex', flexDirection: 'column', gap: '16px' } },
      h('div.row', h('div', { style: { flex: '1 1 300px' } }, h('div.small.muted', `${dc.id} · raised by ${dc.by} (${dc.ws}) on ${fdate(dc.raised)}`), h('h2', { style: { fontSize: '18px' } }, `Move "${dc.itemName}" by ${dc.days / 7} weeks`)),
        state.approved ? chip('Approved · CR ' + dc.cr, 'g') : chip('Needs your approval', 'r')),
      h('div.callout', h('b', 'Reason given: '), dc.reason),
      h('div', h('h2.cap', { style: { marginBottom: '8px' } }, 'Impact, worked out from the plan links'), boxes),
      h('div.grid.g2',
        h('div', h('h2.cap', { style: { marginBottom: '8px' } }, 'What moves'),
          h('div', { style: { overflowX: 'auto' } }, h('table.t', h('thead', h('tr', h('th', 'Item'), h('th', 'Now'), h('th', 'Proposed'))),
            h('tbody', dc.chain.map((c) => h('tr', h('td', c.name, c.id === dc.item ? h('div.small.muted', 'requested') : h('div.small.muted', 'follows on')), h('td.num', fdate(c.from)), h('td.num', h('b', fdate(c.to))))),
              h('tr', h('td', h('b', `TSA exit: ${dc.tsa}`), h('div.small.muted', 'first of the month after cut-over')), h('td.num', fdate(dc.oldExit)), h('td.num', h('b', fdate(dc.newExit)))))))),
        h('div', h('h2.cap', { style: { marginBottom: '8px' } }, 'On the timeline'), gantt,
          h('h2.cap', { style: { margin: '16px 0 8px' } }, 'Also check'),
          h('div.list', h('div.li', chip('Linked', 'a'), h('div.li-main', h('div.li-title', dc.dependent[0]), h('div.li-sub', 'Exits on the same date; it is not linked in the plan, so it does not move by itself'))),
            h('div.li', chip('Contract', 'g'), h('div.li-main', h('div.li-title', `Within the maximum extension (${dc.maxExt} months)`), h('div.li-sub', `Initial end ${fdate(dc.initialEnd)}`)))))),
      h('div.callout', `On approval the Hub records change request ${dc.cr} in TSA Changes (exit ${fdate(dc.oldExit)} → ${fdate(dc.newExit)}, fee impact ${money(dc.cost)}). The new dates apply, and the existing TSA Changes rules update the exit date.`),
      state.approved ? h('div.alert', h('div.alert-icon', '✓'), h('div.alert-body', h('div.alert-title', 'Approved. Dates applied and CR recorded.'), h('div.small.muted', 'Sara Lindqvist sees the new dates in My tasks the next time the Hub publishes.'))) :
        h('div.row', { style: { justifyContent: 'flex-end' } }, h('button.btn.btn-danger', { onclick: () => modal('Reject this date change?', h('div.field', h('label', 'Reason (sent to the lead)'), h('textarea.input', { rows: 3 })), (c) => [h('button.btn', { onclick: c }, 'Cancel'), h('button.btn.btn-primary', { onclick: () => { c(); toast('Rejected. Sara Lindqvist has been told.'); } }, 'Reject')]) }, 'Reject'),
          h('button.btn', { onclick: () => toast('Question drafted in Outlook') }, 'Ask a question'),
          h('button.btn.btn-primary', { onclick: () => { state.approved = true; main.textContent = ''; smoApprovals(main); toast(`Approved. ${dc.cr} recorded in TSA Changes.`); } }, `Approve and raise ${dc.cr}`)));
    main.append(h('div.page', head('Approvals', 'Date changes from leads. Nothing in the plan moves until you approve.'), h('div.split', h('div', { style: { flex: '1 1 260px', maxWidth: '340px' } }, queue), h('div.grow', detail))));
  }

  // ======================================================================
  // Executive summary (one page; also the Teams tab and the PDF)
  // ======================================================================
  function execSummary(main, dir = 'a') {
    const reds = TSA.filter((t) => t['Service delivery RAG'] === 'Red' || t['Exit readiness RAG'] === 'Red');
    const yr = D.quarters.filter((q) => q.q.endsWith('2026')), fc26 = yr.reduce((a, q) => a + q.fc, 0), bud26 = yr.reduce((a, q) => a + q.budget, 0);
    const prog = D.ws.find((w) => w.code === 'GOV');
    const totalSvc = TSA.filter((t) => t.Direction === 'Forward').length;
    const exitedFwd = exited.filter((t) => t.Direction === 'Forward').length;
    const k = (label, value, sub, cls) => h('div.card.kpi', { class: cls || null }, h('div.kpi-label', label), h('div.kpi-value', value), h('div.kpi-sub', sub));
    const sheet = h('div.sheet',
      h('div.masthead', h('div', h('div.eyebrow', `${M.programme} · executive summary · ${PERIOD}`),
        h('h2.headline', 'Exits are on course for mid-2027. Policy administration and the service desk need decisions this quarter.')),
        h('div', { style: { textAlign: 'right' } }, h('div', chip('Overall: Red', 'r')), h('div.small.masthead-sub', { style: { marginTop: '6px' } }, `${M.buyer} · SMO`))),
      h('div.sheet-body',
        h('div.grid.g4', k('Services exited', `${exitedFwd} of ${totalSvc}`, `${live.length} still live · next exits ${fshort(nextExit)}`),
          k('Monthly run-rate', mshort(burnNow.fcFee), `down from ${mshort(D.burn[0].fcFee)} at Close`),
          k('TSA fees 2026', mshort(fc26), `${pct(fc26 / bud26 - 1)} over budget`, 'alert'),
          k('One-off costs', mshort(D.oneoff.fac), `forecast at completion · budget ${mshort(D.oneoff.budget)}`)),
        h('div.grid', { style: { gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)' } },
          h('div.card', h('div.card-head', h('h2', 'TSA burn-down'), h('span.legend-inline', h('span', h('span.ln'), 'Forecast'), h('span', h('span.ln.plan'), 'Contract plan'))), burndown(D.burn, { h: 200 })),
          h('div.card', h('div.card-head', h('h2', 'Workstreams')),
            donut([{ label: 'Green', value: D.ws.filter((w) => w.rag[5] === 'Green').length, color: C.g }, { label: 'Amber', value: D.ws.filter((w) => w.rag[5] === 'Amber').length, color: C.a },
              { label: 'Red', value: D.ws.filter((w) => w.rag[5] === 'Red').length, color: C.r }], { size: 110, center: String(D.ws.length), centerSub: 'streams' }))),
        h('div.grid.g2',
          h('div.card', h('div.card-head', h('h2', 'Decisions needed')),
            h('div.list', h('div.li', chip('Oct', 'r'), h('div.li-main', h('div.li-title', 'Data centre early exit (DEC-002)'), h('div.li-sub', 'Joint separation committee · saves fees if agreed this month'))),
              h('div.li', chip('Nov', 'a'), h('div.li-main', h('div.li-title', 'Policy administration: accept 6-week slip?'), h('div.li-sub', `Moves the exit to ${fdate(D.dc.newExit)}; ${mshort(D.dc.cost)} more in fees`))))),
          h('div.card', h('div.card-head', h('h2', 'Watch list')),
            h('div.list', reds.slice(0, 3).map((t) => h('div.li', chip('Red', 'r'), h('div.li-main', h('div.li-title', `${t['Service name']} (${t['TSA ID']})`), h('div.li-sub', t['Path to green'] || 'Path to green agreed with the seller'))))))),
        h('div.sheet-foot', h('span', `Prepared by the SMO from the SMO Hub · data as at ${fdate(M.rd)}`), h('span', 'Demo data: Fernhallow Mutual and Quillmere Life are fictional'))));
    main.append(h('div.page', { style: { maxWidth: 'none' } }, sheet));
  }

  // ======================================================================
  // Governance pack: status section
  // ======================================================================
  function packStatus(main, dir = 'a') {
    const trendOf = (r) => { const v = { Green: 0, Amber: 1, Red: 2 }; const d = v[r[5]] - v[r[4]]; return d < 0 ? ['▲ Improving', 'g'] : d > 0 ? ['▼ Worsening', 'r'] : ['– Stable', 'n']; };
    const mix = (w) => [{ label: 'Done', value: w.done, color: C.c1 }, { label: 'Late', value: w.late, color: C.r }, { label: 'To do', value: w.tasks - w.done - w.late, color: C.n }];
    const rowsA = D.ws.map((w) => { const [tl, tc] = trendOf(w.rag); return h('tr',
      h('td', h('b', w.code), h('div.small.muted', w.name)), h('td', chip(w.rag[5])), h('td', ragDots(w.rag, M.months6)), h('td', h('span.small', { style: { color: `var(--${tc === 'n' ? 'muted' : tc + '-fg'})` } }, tl)),
      h('td', { style: { minWidth: '120px' } }, stackBar(mix(w), { height: 8 }), h('div.small.muted', `${w.done}/${w.tasks} tasks`)),
      h('td', { style: { maxWidth: '360px' } }, h('div.small', w.summary.length > 140 ? w.summary.slice(0, 140) + '…' : w.summary), w.path ? h('div.small', { style: { color: 'var(--a-fg)', marginTop: '4px' } }, 'Path to green: ' + w.path) : null)); });
    const content = dir === 'b'
      ? h('div.grid.g3', D.ws.map((w) => { const [tl] = trendOf(w.rag); return h('div.card.hov', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('div.row', h('div', { style: { flex: '1 1 auto' } }, h('div.kpi-label', w.code), h('h2', w.name)), chip(w.rag[5])),
        h('div.row', ragDots(w.rag, M.months6), h('span.small.muted', tl)),
        h('div.small', w.summary.length > 150 ? w.summary.slice(0, 150) + '…' : w.summary),
        stackBar(mix(w), { height: 8 }), h('div.small.muted', `${w.done} of ${w.tasks} tasks done · ${w.live} live services`)); }))
      : h('div.tbl-wrap', h('table.t', h('thead', h('tr', h('th', 'Workstream'), h('th', 'RAG'), h('th', 'Last 6 months'), h('th', 'Trend'), h('th', 'Plan'), h('th', 'Commentary'))), h('tbody', rowsA)));
    const counts = ['Green', 'Amber', 'Red'].map((r) => D.ws.filter((w) => w.rag[5] === r).length);
    main.append(h('div.page', head('Workstream status', `Governance pack · Joint separation committee · ${PERIOD}`, h('button.btn.no-print', { onclick: () => print() }, 'Print or save as PDF'), dir, 'Section 2 of 6'),
      h('div.grid.g3', { class: dir === 'b' ? 'lift' : null },
        h('div.card', h('div.kpi-label', 'Workstreams by RAG'), h('div', { style: { marginTop: '8px' } }, stackBar([{ label: 'Green', value: counts[0], color: C.g }, { label: 'Amber', value: counts[1], color: C.a }, { label: 'Red', value: counts[2], color: C.r }], { height: 14 })),
          h('div.legend-inline', { style: { marginTop: '8px' } }, h('span', `${counts[0]} green`), h('span', `${counts[1]} amber`), h('span', `${counts[2]} red`))),
        h('div.card', h('div.kpi-label', 'Moved to amber this month'), h('div.kpi-value', String(D.ws.filter((w) => w.rag[5] === 'Amber' && w.rag[4] === 'Green').length)), h('div.kpi-sub', 'CON, DIS, ACT, CMP, PRO')),
        h('div.card', h('div.kpi-label', 'Programme overall'), h('div.row', { style: { marginTop: '6px' } }, chip('Red', 'r'), h('span.small.muted', 'from Amber in August')))),
      content));
  }

  // ======================================================================
  // Finance (read-only view; also a Teams tab)
  // ======================================================================
  function finance(main) {
    const y = (yr) => D.quarters.filter((q) => q.q.endsWith(yr));
    const sum = (rows, k) => rows.reduce((a, q) => a + q[k], 0);
    const y26 = y('2026'), y27 = y('2027');
    main.append(h('div.page', head('Finance', `TSA fees and one-off costs · ${M.programme} · read only, as at ${fdate(M.rd)}`, h('span.asat', 'Published by the SMO ' + fdate(M.today))),
      h('div.grid.g4',
        kpi('TSA fees 2026 (forecast)', mshort(sum(y26, 'fc')), `budget ${mshort(sum(y26, 'budget'))} · ${pct(sum(y26, 'fc') / sum(y26, 'budget') - 1)} over`),
        kpi('TSA fees 2027 (forecast)', mshort(sum(y27, 'fc')), `contract plan ${mshort(sum(y27, 'plan'))}`),
        kpi('Run-rate now', mshort(burnNow.fcFee), `${burnNow.fcN} live services`, D.burn.slice(0, D.burn.indexOf(burnNow) + 1).map((b) => b.fcFee)),
        kpi('One-off costs', mshort(D.oneoff.fac), `spent ${mshort(D.oneoff.actual)} · budget ${mshort(D.oneoff.budget)}`)),
      h('div.grid.g2',
        h('div.card', h('div.card-head', h('h2', 'TSA fees by quarter')), columns(D.quarters, [{ key: 'budget', label: 'Budget', color: C.c3 }, { key: 'plan', label: 'Contract plan', color: C.c2 }, { key: 'fc', label: 'Forecast', color: C.c1 }])),
        h('div.card', h('div.card-head', h('h2', 'TSA burn-down'), h('span.legend-inline', h('span', h('span.ln'), 'Forecast'), h('span', h('span.ln.plan'), 'Contract plan'))), burndown(D.burn))),
      h('div.tbl-wrap', h('table.t', h('thead', h('tr', h('th', 'Quarter'), h('th.n', 'Budget'), h('th.n', 'Contract plan'), h('th.n', 'Forecast'), h('th.n', 'Forecast less budget'))),
        h('tbody', D.quarters.map((q) => h('tr', h('td', q.q), h('td.n', money(q.budget)), h('td.n', money(q.plan)), h('td.n', money(q.fc)), h('td.n', { style: { color: q.fc - q.budget > 0 ? 'var(--r-fg)' : 'var(--g-fg)' } }, (q.fc - q.budget > 0 ? '+' : '') + money(q.fc - q.budget))))),
        h('tfoot', h('tr', h('td', 'Total'), h('td.n', money(sum(D.quarters, 'budget'))), h('td.n', money(sum(D.quarters, 'plan'))), h('td.n', money(sum(D.quarters, 'fc'))), h('td.n', money(sum(D.quarters, 'fc') - sum(D.quarters, 'budget'))))))),
      h('p.small.muted', 'The full Finance workbook (editable, with sensitivities, pass-through charges and one-off costs by period) is in design/samples.')));
  }

  // ======================================================================
  // Service list for one workstream (print or PDF)
  // ======================================================================
  function servicesPrint(main, code) {
    const w = ws(code) || { code, name: code };
    const list = TSA.filter((t) => t.Workstream === code);
    const liveFee = list.filter((t) => t.Status !== 'Exited').reduce((a, t) => a + (Number(t['Monthly fee (reporting currency)']) || 0), 0);
    const val = (k, v) => v === '' || v == null ? '–' : /date|deadline|start|stops|starts/i.test(k) && /^\d{4}-/.test(v) ? fdate(v) : /fee \(/i.test(k) && typeof v === 'number' ? money(v) : String(v);
    const groups = [['Service', ['Direction', 'Status', 'Sub-function', 'Line of business', 'Critical', 'Schedule ref', 'Service levels']],
      ['Dates', ['Service start', 'Initial end date', 'Planned exit date', 'Forecast exit date', 'Exit notice deadline', 'Extension notice deadline']],
      ['Fees', ['Fee currency', 'Monthly fee (key input)', 'Monthly fee (reporting currency)', 'Charging basis', 'Inside fee cap', 'Mark-up starts']],
      ['Owners and exit', ['Provider service owner', 'Recipient service owner', 'Exit route', 'Exit plan status', 'Service delivery RAG', 'Exit readiness RAG']]];
    main.append(h('div.sheet',
      h('div.masthead', h('div', h('div.eyebrow', `${M.programme} · TSA service list · as at ${fdate(M.rd)}`), h('h2.headline', `${w.name} (${code})`)),
        h('div', { style: { textAlign: 'right' } }, h('div.kpi-value', money(liveFee)), h('div.small.muted', `a month · ${list.filter((t) => t.Status !== 'Exited').length} live of ${list.length}`))),
      h('div.sheet-body',
        h('table.t', h('thead', h('tr', ['TSA ID', 'Service', 'Direction', 'Status', 'Delivery', 'Readiness', 'Forecast exit'].map((x) => h('th', x)), h('th.n', 'Monthly fee'))),
          h('tbody', list.map((t) => h('tr', h('td.id', t['TSA ID']), h('td', t['Service name']), h('td', t.Direction), h('td', t.Status), h('td', chip(t['Service delivery RAG'])), h('td', chip(t['Exit readiness RAG'])),
            h('td.num', fdate(t['Forecast exit date'])), h('td.n', t['Monthly fee (reporting currency)'] ? money(t['Monthly fee (reporting currency)']) : '–'))))),
        list.map((t) => h('div.card', { style: { breakInside: 'avoid' } }, h('div.card-head', h('h2', `${t['TSA ID']} · ${t['Service name']}`)),
          h('p.small', { style: { margin: '0 0 10px' } }, t['Service description']),
          h('div.grid.g4', groups.map(([g, ks]) => h('dl.kv', { style: { gridTemplateColumns: '1fr 1fr', fontSize: '11.5px' } }, h('div.kv-sec', { style: { marginTop: 0, borderTop: 0, paddingTop: 0 } }, g), ks.map((k) => [h('dt', k), h('dd', val(k, t[k]))])))))),
        h('div.sheet-foot', h('span', 'From the SMO Hub TSA register. Fees in reporting currency (GBP) unless stated.'), h('span', 'Demo data: Fernhallow Mutual and Quillmere Life are fictional')))));
  }

  window.V = { servicesPrint, smoHome, leadStart, leadReport, leadRaid, leadTasks, leadServices, smoCycle, smoSubmissions, smoApprovals, execSummary, packStatus, finance, svcRag, sim };
})();
