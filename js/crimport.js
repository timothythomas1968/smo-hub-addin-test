// Import change requests (P1, Tim 20 Nov 2026): the standalone change request form file, sent to the programme office by
// people without the Hub (Levels 1 and 2). Read in the browser with xlsxread.js, nothing leaves the computer, then saved into
// TSA Changes as New through the same model as the panel's form (crform.js). Several files can be picked at once.
// The cells read are the form's Export sheet (workbook/builder/cr_file_part.py): keep the two in step.
import { h, toast, ed, plural, fmtDate, theTeam } from './util.js?v=0.12.6.20261120074927';
import { open as openBook } from './xlsxread.js?v=0.12.6.20261120074927';
import { checkRequest, requestRecord, readDate } from './crform.js?v=0.12.6.20261120074927';

const MARK = 'TransitionSuite change request';

/** Read one form file. Returns {req} or {error}. */
export async function readForm(file) {
  if (!/\.xlsx$/i.test(file.name)) return { error: 'not an .xlsx file' };
  let book;
  try { book = await openBook(file); } catch (e) { return { error: e.message || String(e) }; }
  const sheet = book.sheets.find((s) => s === 'Export') || book.sheets.find((s) => /export/i.test(s));
  if (!sheet || !String(await book.cell(sheet, 'B10')).startsWith(MARK)) return { error: 'not a TransitionSuite change request form (its Export sheet is missing)' };
  const c = (a) => book.cell(sheet, a);
  const v = await Promise.all(['A4', 'B4', 'C4', 'D4', 'E4', 'F4', 'G4', 'H4', 'I4', 'A8', 'B8', 'C8', 'D8', 'B11'].map(c));
  const [item, name, email, what, from, to, why, impact, via, , service, raised, proposed, kind] = v;
  if (!name && !what && !kind) return { error: 'the form is empty (no name, kind of change or details). If it was filled in, open it in Excel, save it and try again' };
  const toDate = typeof proposed === 'number' && proposed > 20000 ? proposed : to;
  return { req: { name: String(name || ''), email: String(email || ''), kind: String(kind || ''), service: String(service || ''), item: String(item || ''),
    what: String(what || ''), from, to: toDate, why: String(why || ''), impact: String(impact || ''), via: String(via || 'Form file'),
    raised: readDate(raised) || '' } };
}

/** Already in TSA Changes? The same person, wording and date. */
function already(store, req) {
  const key = (a, b, c) => [a, b, c].map((x) => String(x || '').trim().toLowerCase()).join('|');
  const k = key(req.name, req.what, req.raised);
  return store.records('tblChange').some((r) => key(r.get('Requested by'), r.get('What should change'), r.get('Raised on')) === k);
}

export function openCRImport(ctx) {
  const { store } = ctx;
  document.querySelector('.modal-back')?.remove();
  const input = h('input', { type: 'file', accept: '.xlsx', multiple: true, 'aria-label': 'Change request files' });
  const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '48vh', overflowY: 'auto' } });
  const go = h('button.btn.btn-primary', { type: 'button', disabled: true }, 'Add as New');
  let ready = [];
  input.addEventListener('change', async () => {
    await store.need(['tblChange', 'tblTSA', 'tblPlan']);
    ready = [];
    list.replaceChildren(h('p.small.muted', 'Reading…'));
    const out = [];
    for (const f of input.files) {
      const r = await readForm(f);
      if (r.error) { out.push(h('div.banner.warn', { style: { margin: 0 } }, h('b', f.name + ': '), r.error + '.')); continue; }
      const chk = checkRequest(store, r.req);
      const dup = already(store, r.req);
      const ok = !chk.errors.length && !dup;
      if (ok) ready.push({ req: r.req, chk });
      const rec = requestRecord(store, r.req, chk);
      out.push(h('div.card', { style: { padding: '10px 12px', borderLeft: `4px solid var(--${ok ? 'g' : 'a'}-bar)` } },
        h('div', { style: { fontWeight: 600 } }, rec.Title),
        h('div.small.muted', `${f.name} · ${r.req.name || 'no name'}${r.req.raised ? ` · ${fmtDate(r.req.raised)}` : ''} · ${rec['Request type']}${rec['TSA ID'] ? ' · ' + rec['TSA ID'] : ''}`),
        dup ? h('div.small', { style: { color: 'var(--a-fg)' } }, 'Already in TSA Changes (the same person, wording and date): skipped.') : null,
        chk.errors.map((e) => h('div.small', { style: { color: 'var(--r-fg)' } }, e)),
        chk.warnings.map((w) => h('div.small', { style: { color: 'var(--a-fg)' } }, w)),
        chk.errors.length ? h('div.small.muted', 'Not added. Ask the person to complete the form and send it again, or add the request yourself on Request a change.') : null));
    }
    list.replaceChildren(...out);
    go.disabled = !ready.length;
    go.textContent = ready.length ? `Add ${plural(ready.length, 'request')} as New` : 'Add as New';
  });
  go.addEventListener('click', async () => {
    go.disabled = true;
    try {
      for (const { req, chk } of ready) await store.add('tblChange', requestRecord(store, req, chk));
      back.remove();
      toast(`${plural(ready.length, 'change request')} added to TSA Changes as New. Review each one to send it to its forum.`);
      ctx.go ? ctx.go('changes', { filter: 's:New' }) : ctx.rerender();
    } catch (e) { go.disabled = false; toast('Could not add them: ' + (e.message || e), true); }
  });
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) back.remove(); } },
    h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Import change requests', style: { maxWidth: '640px' } },
      h('h2', 'Import change requests'),
      h('p.small.muted', { style: { marginTop: 0 } }, ed(`Pick one or more change request form files (TransitionSuite Change Request …xlsx) that people sent to ${theTeam()}. Each is checked, then added to TSA Changes as New for you to review. The files are read on this computer and are not sent anywhere.`)),
      input, list,
      h('p.small.muted', 'On a Mac, this needs macOS 13.3 or later.'),
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' } },
        h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'), go)));
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') back.remove(); });
  document.body.appendChild(back);
}
