// Tidy tabs (Tim, 11 and 12 Nov 2026; implementation plan, Stage 2b). The workbook on its own keeps every sheet visible,
// because Excel cannot follow a link to a hidden sheet. With the panel, the tabs are tidied when the workbook opens:
//  - Home, Contents and the ten main sheets stay;
//  - Day 1 and First 100 Days stay before closing and for 120 days after it, and later only while they still have open items;
//  - Start Here stays while set-up questions are unanswered;
//  - parts switched off in set-up are hidden, and so is everything else (the registers and logs, the dividers).
// The panel's Contents screen opens any sheet, hidden or not (ExcelSource.showRange shows a hidden sheet first).
// Users can turn tidying off there (setting 'tidy-tabs' = 'off'); the workbook's own Contents sheet lists everything.
import { ed, asOf } from './util.js?v=0.11.2.20261112223532';

export const MAIN = ['Home', 'Contents', 'Calendar', 'TSA Register', 'TSA Cost Tracker', 'One-off Costs', 'Consolidated WS Reporting', 'RAID Summary',
  'Actions', 'Plan & Gantt', 'Readiness Interview'];
// The sheets each set-up switch turns off (the Use_ answers on Start Here)
const SWITCH = { 'Plan & Gantt': 'Use_SP', 'Readiness Interview': 'Use_XR', 'Exit Readiness': 'Use_XR', 'One-off Costs': 'Use_CL', 'Day 1': 'Use_D1',
  'First 100 Days': 'Use_F100', 'SLA': 'Use_SLA', 'Invoices Log': 'Use_INV', 'Our Invoice': 'Use_INV', 'Third Parties': 'Use_TPC', 'Obligations': 'Use_OBL',
  'Regulatory': 'Use_REG', 'Data Requests': 'Use_DR', 'Work Orders': 'Use_WO' };
const ALWAYS_HIDDEN = ['Governance dates', 'Fees Summary'];   // the Hub's own working sheets: never shown by tidying

/** Which sheets to show, from the workbook's names and the Day 1 and First 100 Days tables. */
export function tabsToShow(store) {
  const n = store.names, T = asOf(n), close = Number(n.CloseDate) || 0;
  const off = (s) => SWITCH[s] && n[SWITCH[s]] === 'N';
  const show = new Set(MAIN.filter((s) => !off(s)).map(ed));
  const nearClosing = !close || T <= close + 120;
  const open = (t, done) => store.has(t) && store.records(t).some((r) => !done(r));
  if (!off('Day 1') && (nearClosing || open('tblDay1', (r) => /^(Complete|Not required)$/.test(r.get('Status'))))) show.add(ed('Day 1'));
  if (!off('First 100 Days') && (nearClosing || open('tblFirst100', (r) => /^(Complete|Not required|Suggested|Remove)$/.test(r.get('Status'))))) show.add(ed('First 100 Days'));
  if (Number(n.QReq) && (Number(n.QDone) || 0) < Number(n.QReq)) show.add('Start Here');
  return show;
}

export async function tidyTabs(store) {
  if (!store.src.setVisibleSheets) return;   // the preview has no tabs
  if (store.src.getSetting('tidy-tabs') === 'off') return;
  await store.need(['tblDay1', 'tblFirst100']).catch(() => {});
  await store.src.setVisibleSheets(tabsToShow(store), ALWAYS_HIDDEN.map(ed));
}

// The panel's Contents: the same groups and wording as the workbook's Contents sheet (polish_part.py, PURPOSE)
export const GROUPS = [
  ['Main sheets', [['Home', 'Where the programme office starts each day: this month\'s workflow, the health check and what is coming up.'],
    ['Calendar', 'Every date in one calendar: exits, notice deadlines, forums, actions, decisions and interviews.'],
    ['TSA Register', 'Every service: owners, fees, exit dates, notice deadlines and RAG.'],
    ['TSA Cost Tracker', 'TSA fees by month, forecast and actual, against the fee cap.'],
    ['One-off Costs', 'The one-off separation budget, actuals and forecast.'],
    ['Consolidated WS Reporting', 'This month\'s status for every workstream, built from the reports; the history of past months.'],
    ['RAID Summary', 'Risks, issues, decisions, assumptions and actions on one page.'],
    ['Actions', 'Every action, its owner and due date.'],
    ['Plan & Gantt', 'The exit plan: activities, milestones and the Gantt.'],
    ['Readiness Interview', 'The readiness interview for each service before it exits: script and record.']]],
  ['Around closing', [['Day 1', 'The Day 1 checklist, before and on closing.'],
    ['First 100 Days', 'Isolation, security and brand tasks for the first 100 days after closing.']]],
  ['Registers and logs', [['Workstream Reports', 'The Hub\'s inbox for each workstream\'s monthly report.'],
    ['TSA Changes', 'Extensions, early exits and other change requests, with their impact and decision.'],
    ['Invoices Log', 'Invoices received and issued, checked against the TSA fees.'],
    ['Our Invoice', 'The invoice for the services we provide, ready to print or save as PDF.'],
    ['Risks', 'The risk log, with the risks raised in this month\'s reports.'],
    ['Issues', 'The issue log, with the issues raised in this month\'s reports.'],
    ['Decisions', 'Decisions needed and made, and the forum that makes them.'],
    ['Assumptions & Dependencies', 'The assumptions the plan rests on and what it depends on.'],
    ['Exit Readiness', 'How ready each service is to exit, from the interviews.'],
    ['Third Parties', 'Third-party contracts and the consents the separation needs.'],
    ['Regulatory', 'Regulatory approvals and filings, by regulator.'],
    ['SLA', 'Monthly service level results for every service.'],
    ['Obligations', 'Contract obligations and entitlements, with their next due date.'],
    ['Data Requests', 'Data requested from the other party, and when it is due.'],
    ['Work Orders', 'Extra work ordered under the TSA, quoted and approved.'],
    ['Links', 'Links between items the registers cannot show.'],
    ['Data Quality', 'Every check on the Hub\'s data: errors first, then warnings.']]],
  ['Set-up', [['Start Here', 'The set-up questions, answered once.'],
    ['Parameters', 'Your set-up answers, on one page.'],
    ['Lists', 'Workstreams, entities, currencies, forums and the other lists the drop-downs use.'],
    ['Library', 'The library of standard TSA services to start from.'],
    ['People', 'Everyone on the programme, with their role and workstream.'],
    ['AI Prompts', 'Prompts for your AI assistant to pull set-up answers out of the deal documents.']]]];
/** Turn tab tidying on or off (the switch on Contents and the line at the foot of Home). */
export async function setTidy(store, on) {
  await store.src.setSetting('tidy-tabs', on ? 'on' : 'off');
  if (on) await tidyTabs(store);
  else if (store.src.setVisibleSheets) await store.src.setVisibleSheets(null, ALWAYS_HIDDEN.map(ed));
}
export const isOff = (store, sheet) => !!(SWITCH[sheet] && store.names[SWITCH[sheet]] === 'N');
