// People (Tim, 17 Nov 2026; brief 4.2): the list changes often, so it is an editable grid.
// Click a cell and type; Tab moves along, Enter moves down. Each row saves when you leave it (only the cells you changed).
// The empty row at the bottom adds a person. "Paste from Excel" adds or updates several people at once, after a preview.
// The full edit panel (stakeholder analysis, forums) is one click away for the rarely used columns.
import { h, toast, ed } from '../util.js?v=0.12.0.20261120045426';
import { PEOPLE_CFG, editPanel, removeRecord, OWNED } from './registers.js?v=0.12.0.20261120045426';

const T = 'tblPeople';
// [header, label, kind, width]
const COLS = [['Name', 'Name', 'text', 190], ['Role', 'Role', 'list:L_Role', 170], ['Workstream or function', 'Workstream', 'list:L_WSPN', 270],
  ['Organisation', null, 'select', 120], ['Email', 'Email', 'email', 220], ['Phone', 'Phone', 'text', 120]];
const ui = { q: '', f: 'all' };

const norm = (v) => String(v ?? '').trim().toLowerCase();

export default {
  tables: [T, 'tblTSA', 'tblRisks', 'tblIssues', 'tblActions', 'tblDecisions'],
  render(ctx) {
    const { store } = ctx;
    if (!store.has(T)) return h('div.page', h('div.page-head', h('div', h('h1', 'People'))), h('div.banner.info', 'This workbook has no People sheet.'));
    const recs = store.records(T);
    const orgs = store.options(store.colDef(T, 'Organisation')) || [];
    const lists = h('div', { hidden: true },
      ['L_Role', 'L_WSPN'].map((n) => h('datalist', { id: 'dl-' + n }, (store.options({ dv: { name: n } }) || []).map((o) => h('option', { value: o })))));

    const tbody = h('tbody');
    const dupNote = h('div.banner.warn', { hidden: true, role: 'status' });
    const status = h('span.small.muted', { role: 'status', 'aria-live': 'polite' });

    // ---- one row: inputs for each column, saved when focus leaves the row
    const makeRow = (rec) => {
      const tr = h('tr.pgrid-row', { 'data-i': rec ? String(rec.i) : 'new' });
      const cells = {};
      COLS.forEach(([hd, , kind, w]) => {
        const raw = rec ? rec.get(hd) : '';
        const sugg = !!(rec && rec.sugg(hd) && raw !== '');
        let el;
        if (kind === 'select') {
          el = h('select', { 'aria-label': ed(hd) }, h('option', { value: '' }, ''), orgs.map((o) => h('option', { value: o }, o)));
          if (raw !== '' && !orgs.includes(String(raw))) el.appendChild(h('option', { value: String(raw) }, String(raw)));
          el.value = String(raw ?? '');
        } else {
          el = h('input', { type: kind === 'email' ? 'email' : 'text', value: String(raw ?? ''), 'aria-label': ed(hd), autocomplete: 'off',
            list: kind.startsWith('list:') ? 'dl-' + kind.slice(5) : null, placeholder: !rec && hd === 'Name' ? '+ Type a name to add a person' : null });
        }
        el.dataset.h = hd;
        const td = h('td', { class: sugg ? 'sugg' : null, style: { minWidth: w + 'px' } }, el);
        if (sugg) td.title = 'Suggested by the Hub from the role. Type over it to set your own.';
        cells[hd] = { el, td, raw: String(raw ?? ''), dirty: false };
        const mark = () => { cells[hd].dirty = el.value !== cells[hd].raw; td.classList.toggle('dirty', cells[hd].dirty); if (cells[hd].dirty) td.classList.remove('sugg'); checkDups(); };
        el.addEventListener('input', mark); el.addEventListener('change', mark);
        el.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || el.tagName === 'SELECT') return;
          e.preventDefault();
          const rows = [...tbody.querySelectorAll('tr.pgrid-row:not([hidden])')], at = rows.indexOf(tr);
          const next = rows[at + (e.shiftKey ? -1 : 1)];
          const target = next && next.querySelector(`[data-h="${CSS.escape(hd)}"]`);
          if (target) target.focus(); else el.blur();
        });
        td.addEventListener('click', () => el.focus());
      });
      const mark = h('span.pgrid-mark', { 'aria-hidden': 'true' });
      const tools = h('td.pgrid-tools',
        mark,
        rec ? h('button.link-btn', { type: 'button', title: 'Everything about this person: stakeholder analysis, forums and contact', onclick: () => details(rec) }, 'More') : null,
        rec ? h('button.link-btn.pgrid-x', { type: 'button', title: 'Remove from the register', 'aria-label': `Remove ${rec.get('Name') || 'this row'} from the register`, onclick: () => removeRecord(ctx, PEOPLE_CFG, {}, rec) }, '×') : null);
      tr.append(...COLS.map(([hd]) => cells[hd].td), tools);
      tr.cells_ = cells;
      let saving = false;
      tr.addEventListener('focusout', (e) => {
        if (tr.contains(e.relatedTarget)) return;
        setTimeout(() => { if (!tr.contains(document.activeElement) && !saving) saveRow(); }, 0);
      });
      const saveRow = async () => {
        const ch = {};
        Object.entries(cells).forEach(([hd, c]) => { if (c.dirty) ch[hd] = c.el.value.trim(); });
        if (!Object.keys(ch).length) return;
        if (!rec) {
          if (!ch.Name) return;
          if (!ch.Role) { mark.textContent = 'Add a role to keep this person'; mark.className = 'pgrid-mark warn'; return; }
        }
        saving = true; mark.textContent = 'Saving…'; mark.className = 'pgrid-mark';
        try {
          if (rec) {
            await store.save(T, rec.i, ch);
            const fresh = store.records(T).find((r) => r.i === rec.i);
            Object.entries(cells).forEach(([hd, c]) => {
              const v = fresh ? String(fresh.get(hd) ?? '') : '';
              c.raw = v; c.dirty = false; c.td.classList.remove('dirty');
              if (document.activeElement !== c.el) c.el.value = v;
              c.td.classList.toggle('sugg', !!(fresh && fresh.sugg(hd) && v !== ''));
            });
            const was = String(rec.get('Name') || '');
            if (fresh) rec = fresh;
            if ('Name' in ch && was && ch.Name) offerRename(ctx, was, ch.Name);
            mark.textContent = 'Saved ✓'; mark.className = 'pgrid-mark ok';
            setTimeout(() => { if (mark.textContent === 'Saved ✓') mark.textContent = ''; }, 2500);
          } else {
            await store.add(T, ch);
            toast(`${ch.Name} added to the People register`);
            const keep = focusKey();
            await ctx.rerender();
            refocus(keep);
          }
        } catch (e) { mark.textContent = 'Not saved'; mark.className = 'pgrid-mark warn'; toast('Could not save: ' + (e.message || e), true); }
        saving = false;
      };
      return tr;
    };
    const focusKey = () => { const a = document.activeElement; const tr = a && a.closest && a.closest('tr.pgrid-row'); return tr ? { i: tr.dataset.i, h: a.dataset.h } : null; };
    const refocus = (k) => { if (!k) return; const el = document.querySelector(`tr.pgrid-row[data-i="${k.i}"] [data-h="${CSS.escape(k.h)}"]`); if (el) el.focus(); };

    // ---- duplicate names or emails, checked as you type
    const checkDups = () => {
      const seen = { Name: new Map(), Email: new Map() };
      const rows = [...tbody.querySelectorAll('tr.pgrid-row')];
      rows.forEach((tr) => ['Name', 'Email'].forEach((hd) => { const v = norm(tr.cells_[hd].el.value); if (v) seen[hd].set(v, (seen[hd].get(v) || 0) + 1); }));
      const dups = [];
      rows.forEach((tr) => ['Name', 'Email'].forEach((hd) => {
        const v = norm(tr.cells_[hd].el.value), d = !!v && seen[hd].get(v) > 1;
        tr.cells_[hd].td.classList.toggle('dup', d);
        if (d && !dups.includes(tr.cells_[hd].el.value.trim())) dups.push(tr.cells_[hd].el.value.trim());
      }));
      dupNote.hidden = !dups.length;
      dupNote.textContent = dups.length ? `On the register more than once: ${dups.join(', ')}. Check whether they are the same person; if so, remove the extra row.` : '';
    };

    // ---- search and organisation filter (rows are hidden, not re-drawn, so nothing typed is lost)
    const applyFilter = () => {
      const q = norm(ui.q);
      let shown = 0;
      tbody.querySelectorAll('tr.pgrid-row').forEach((tr) => {
        if (tr.dataset.i === 'new') return;
        const vals = Object.values(tr.cells_).map((c) => norm(c.el.value));
        const ok = (!q || vals.some((v) => v.includes(q))) && (ui.f === 'all' || norm(tr.cells_.Organisation.el.value) === norm(ui.f));
        tr.hidden = !ok; if (ok) shown++;
      });
      status.textContent = `${shown} of ${recs.length} shown`;
    };
    const search = h('input.search', { type: 'search', placeholder: 'Search by name, role, workstream, organisation or email', value: ui.q });
    search.addEventListener('input', () => { ui.q = search.value; applyFilter(); });
    const chips = h('span', ['all', ...orgs].map((o) => h('button.fchip', { type: 'button', 'aria-pressed': String(ui.f === o),
      onclick: (e) => { ui.f = o; chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); applyFilter(); } },
    o === 'all' ? 'All' : o, h('span.n', String(o === 'all' ? recs.length : recs.filter((r) => norm(r.get('Organisation')) === norm(o)).length)))));

    recs.forEach((r) => tbody.appendChild(makeRow(r)));
    tbody.appendChild(makeRow(null));

    const details = (rec) => {
      const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) back.remove(); } });
      const ctx2 = { ...ctx, rerender: async () => { back.remove(); await ctx.rerender(); } };
      const panel = editPanel(ctx2, PEOPLE_CFG, {}, rec);
      back.appendChild(h('div.modal.modal-wide', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Person details' },
        h('div', { style: { display: 'flex', justifyContent: 'flex-end' } }, h('button.link-btn', { type: 'button', 'aria-label': 'Close', onclick: () => back.remove() }, '× Close')), panel));
      back.addEventListener('keydown', (e) => { if (e.key === 'Escape') back.remove(); });
      document.body.appendChild(back);
    };

    const page = h('div.page',
      h('div.page-head',
        h('div', h('h1', 'People'), h('p.lede', ed('Everyone on the programme. Click a cell and type: each row saves when you leave it. Type in the last row to add someone.'))),
        h('button.btn', { type: 'button', onclick: () => store.show(T, null).catch((e) => toast(e.message, true)) }, 'Show in the worksheet'),
        h('button.btn.btn-primary', { type: 'button', onclick: () => pasteDialog(ctx) }, 'Paste from Excel')),
      h('div.filters', search, chips),
      dupNote, lists,
      h('div.tbl-wrap.pgrid-wrap',
        h('table.grid.pgrid',
          h('thead', h('tr', COLS.map(([hd, label]) => h('th', label || ed(hd))), h('th', h('span.sr-only', 'Actions')))),
          tbody)),
      h('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '8px' } }, status,
        h('span.small.muted', ed('Grey italic values are suggested by the Hub from the role: type over them to set your own. "More" opens the stakeholder analysis and forums.'))));
    applyFilter(); checkDups();
    return page;
  }
};

// ---------------------------------------------------------------- paste several people from Excel
const HEAD = [['Name', /^(full )?name$|^person$/], ['Role', /^role|job title|title$/], ['Workstream or function', /workstream|function|team/],
  ['Organisation', /^organi[sz]ation$|^org$|^company$|^side$/], ['Email', /e-?mail/], ['Phone', /phone|mobile|tel/]];

/** Read tab-separated rows (as Excel copies them). The first row is used as headings when it looks like headings. */
export function parsePaste(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').filter((l) => l.trim() !== '');
  if (!lines.length) return { map: [], rows: [] };
  const split = (l) => l.split('\t').map((x) => x.trim());
  const first = split(lines[0]).map((x) => x.toLowerCase());
  let map = first.map((c) => (HEAD.find(([, re]) => re.test(c)) || [null])[0]);
  const isHead = map.filter(Boolean).length >= 2 || (map[0] === 'Name' && first.length === 1);
  if (!isHead) map = HEAD.map(([hd]) => hd).slice(0, Math.max(...lines.map((l) => split(l).length)));
  const rows = (isHead ? lines.slice(1) : lines).map((l) => {
    const v = split(l), o = {};
    map.forEach((hd, i) => { if (hd && v[i] != null && v[i] !== '') o[hd] = v[i]; });
    return o;
  });
  return { map, rows, headed: isHead };
}

/** What each pasted row would do: New, Update (with the fields), No change, Duplicate in the paste, or Skipped (and why). */
export function planPaste(recs, rows) {
  const used = new Set(), seenN = new Set(), seenE = new Set();
  return rows.map((o) => {
    const n = norm(o.Name), e = norm(o.Email);
    if (!n) return { o, act: 'skip', why: 'No name' };
    if (seenN.has(n) || (e && seenE.has(e))) return { o, act: 'dup', why: 'Duplicate in what you pasted' };
    seenN.add(n); if (e) seenE.add(e);
    let r = (e && recs.find((x) => norm(x.get('Email')) === e)) || recs.find((x) => norm(x.get('Name')) === n);
    if (r) {
      used.add(r.i);
      const ch = {};
      Object.entries(o).forEach(([hd, v]) => { if (String(r.get(hd) ?? '').trim() !== v) ch[hd] = v; });
      return Object.keys(ch).length ? { o, act: 'update', i: r.i, ch, who: r.get('Name') } : { o, act: 'same', i: r.i };
    }
    // an empty role row of the template (the role is listed, no name yet): fill it in
    r = o.Role && recs.find((x) => !used.has(x.i) && !norm(x.get('Name')) && norm(x.get('Role')) === norm(o.Role) &&
      (!o['Workstream or function'] || norm(x.get('Workstream or function')) === norm(o['Workstream or function'])));
    if (r) { used.add(r.i); return { o, act: 'new', i: r.i, ch: { ...o }, slot: true }; }
    if (!o.Role) return { o, act: 'skip', why: 'No role: add a Role column, or type the role in the grid' };
    return { o, act: 'new', i: null, ch: { ...o } };
  });
}

function pasteDialog(ctx) {
  const { store } = ctx;
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) back.remove(); } });
  const area = h('textarea', { rows: 6, 'aria-label': 'Paste rows here', placeholder: 'Name\tRole\tWorkstream\tOrganisation\tEmail\tPhone' });
  const out = h('div');
  const go = h('button.btn.btn-primary', { type: 'button', disabled: true }, 'Add and update');
  let plan = [];
  const LABEL = { new: 'New', update: 'Update', same: 'No change', dup: 'Duplicate', skip: 'Skipped' };
  const show = () => {
    const p = parsePaste(area.value);
    plan = planPaste(store.records('tblPeople'), p.rows);
    const n = (a) => plan.filter((x) => x.act === a).length;
    go.disabled = !(n('new') + n('update'));
    go.textContent = `Add ${n('new')}, update ${n('update')}`;
    out.replaceChildren(!plan.length ? h('p.small.muted', 'Nothing pasted yet.') : h('div',
      h('p.small', `Columns read as: ${p.map.filter(Boolean).map((x) => ed(x)).join(', ')}${p.headed ? ' (from your headings)' : ' (no headings found: the usual order)'}.`),
      h('div.tbl-wrap', { style: { maxHeight: '260px' } }, h('table.grid',
        h('thead', h('tr', h('th', 'What happens'), h('th', 'Name'), h('th', 'Role'), h('th', 'Detail'))),
        h('tbody', plan.map((x) => h('tr', { class: 'paste-' + x.act },
          h('td', h('span.chip', { class: x.act === 'new' ? 'Green' : x.act === 'update' ? 'Amber' : x.act === 'skip' || x.act === 'dup' ? 'Red' : null }, LABEL[x.act])),
          h('td', x.o.Name || ''), h('td', x.o.Role || ''),
          h('td.small', x.act === 'update' ? `Changes ${Object.keys(x.ch).map((k) => ed(k).toLowerCase()).join(', ')}` : x.slot ? `Fills the empty ${x.o.Role} row` : x.why || ''))))))));
  };
  area.addEventListener('input', show);
  area.addEventListener('paste', () => setTimeout(show, 0));
  go.addEventListener('click', async () => {
    go.disabled = true; go.textContent = 'Saving…';
    const list = plan.filter((x) => x.act === 'new' || x.act === 'update').map((x) => ({ i: x.i, changes: x.ch }));
    try {
      const r = await store.saveMany('tblPeople', list);
      back.remove();
      toast(`${r.added} added, ${r.updated} updated on the People register`);
      ctx.rerender();
    } catch (e) { toast('Could not save: ' + (e.message || e), true); go.disabled = false; }
  });
  back.appendChild(h('div.modal.modal-wide', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paste people from Excel' },
    h('h2', 'Paste people from Excel'),
    h('p.small', 'Copy the rows in Excel (with their headings if you have them) and paste them below. People already on the register are matched by email, then by name, and updated; the rest are added. Nothing is saved until you choose Add.'),
    area, out,
    h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'), go)));
  back.addEventListener('keydown', (e) => { if (e.key === 'Escape') back.remove(); });
  document.body.appendChild(back);
  show(); area.focus();
}

// A renamed person: the items they own carry the name as text, so offer to change those too.
function offerRename(ctx, from, to) {
  const { store } = ctx;
  const hits = OWNED.flatMap(([t, cols, word]) => (store.has(t) ? store.records(t).flatMap((r) => cols.filter((c) => r.get(c) === from).map((c) => ({ t, i: r.i, c, word }))) : []));
  if (!hits.length) return;
  const count = {}; hits.forEach((x) => { count[x.word] = (count[x.word] || 0) + 1; });
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) back.remove(); } });
  const go = async () => {
    try {
      for (const t of [...new Set(hits.map((x) => x.t))]) {
        const byRow = {};
        hits.filter((x) => x.t === t).forEach((x) => { (byRow[x.i] = byRow[x.i] || {})[x.c] = to; });
        await store.saveMany(t, Object.entries(byRow).map(([i, changes]) => ({ i: Number(i), changes })));
      }
      back.remove(); toast(`${hits.length} item${hits.length === 1 ? '' : 's'} now name ${to}`);
    } catch (e) { toast('Could not update: ' + (e.message || e), true); }
  };
  back.appendChild(h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Update the items they own' },
    h('h2', `Update ${from}'s items too?`),
    h('p', `${from} is named on ${Object.entries(count).map(([w, n]) => `${n} ${w}${n === 1 ? '' : 's'}`).join(', ')}. Change them to ${to}?`),
    h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end' } }, h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Leave them'),
      h('button.btn.btn-primary', { type: 'button', onclick: go }, 'Update them'))));
  document.body.appendChild(back);
}
