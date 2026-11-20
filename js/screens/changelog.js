// Change log (audit trail, Stage 3b; build waves P6): every change saved through the panel, from the Change Log sheet
// (tblChangeLog): when, who, where, item, field, old value and new value. Newest first; search by item, field or person.
// Changes typed straight into the sheets are not here: Excel's own Review › Show Changes records those for a Hub in OneDrive or SharePoint.
import { h, fmtDate, plural } from '../util.js?v=0.12.6.20261120074927';

const ui = { q: '', where: '', limit: 200 };
const when = (v) => { const n = Number(v); if (!n) return String(v || ''); const d = new Date(Math.round((n - 25569) * 864e5)); return `${fmtDate(Math.floor(n), true)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`; };

export default {
  tables: ['tblChangeLog'],
  render(ctx) {
    const { store } = ctx;
    const page = h('div.page');
    const head = h('div.page-head', h('div', h('h1', 'Change log'), h('p.lede', 'Every change saved through this panel: when, who, what, and the value before and after.')));
    if (!store.has('tblChangeLog')) {
      return h('div.page', head, h('div.banner.info', 'This Hub has no Change Log sheet yet: it came from a version before 0.12.5. Changes saved through the panel are logged in Hubs built from v0.11 (release candidate, 20 Nov 2026) onwards.'));
    }
    const all = store.records('tblChangeLog').filter((r) => r.get('When') !== '').reverse();
    const places = [...new Set(all.map((r) => r.get('Where')).filter(Boolean))].sort();
    const q = ui.q.trim().toLowerCase();
    const rows = all.filter((r) => (!ui.where || r.get('Where') === ui.where) && (!q || ['Who', 'Item', 'Field', 'Old value', 'New value'].some((c) => String(r.get(c)).toLowerCase().includes(q))));
    const rerender = () => ctx.rerender();
    const search = h('input.search', { type: 'search', placeholder: 'Search by item, field, person or value', value: ui.q, 'aria-label': 'Search the change log' });
    search.addEventListener('input', () => { ui.q = search.value; const pos = search.selectionStart; rerender(); setTimeout(() => { const n = document.querySelector('.page input.search'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }); });
    const where = h('select.search', { 'aria-label': 'Where', style: { flex: '0 1 220px' }, onchange: (e) => { ui.where = e.target.value; rerender(); } },
      h('option', { value: '' }, 'Everywhere'), places.map((p) => h('option', { value: p, selected: p === ui.where || null }, p)));
    const cell = (v, wide) => h('td', { style: { maxWidth: wide ? '260px' : '160px', overflowWrap: 'anywhere', verticalAlign: 'top' } }, String(v ?? ''));
    page.append(head,
      h('div.filters', search, where),
      h('p.small.muted', `${plural(rows.length, 'change')}${rows.length > ui.limit ? `, the newest ${ui.limit} shown` : ''}. Changes typed straight into the sheets are not listed: keep the Hub in OneDrive or SharePoint and use Excel's Review › Show Changes for those.`),
      rows.length ? h('div', { style: { overflowX: 'auto' } }, h('table.data',
        h('thead', h('tr', ['When', 'Who', 'Where', 'Item', 'Field', 'Before', 'After'].map((c) => h('th', c)))),
        h('tbody', rows.slice(0, ui.limit).map((r) => h('tr', cell(when(r.get('When'))), cell(r.get('Who') || '–'), cell(r.get('Where')), cell(r.get('Item')), cell(r.get('Field')), cell(r.get('Old value'), true), cell(r.get('New value'), true))))))
        : h('p.muted', all.length ? 'Nothing matches.' : 'No changes logged yet. They appear here as you save through the panel.'),
      rows.length > ui.limit ? h('button.btn', { type: 'button', onclick: () => { ui.limit += 300; rerender(); } }, 'Show more') : null);
    return page;
  }
};
