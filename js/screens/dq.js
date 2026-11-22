// Data quality: the Hub's own checks (the Data Quality sheet, rows from 12: B check, C severity, D count, E what it looks for,
// F where to look), in the panel. Checks that find something come first, errors before warnings. Fixing happens on the sheets
// (or the panel screen for that register); this screen says what to fix and opens the check's row on the sheet.
import { h, toast, plural } from '../util.js?v=0.12.8.20261122225802';

const SHEET = 'Data Quality', FIRST = 12, LAST = 80;
const ui = { all: false };

export default {
  tables: [],
  render(ctx) {
    // the counts are formulas on the sheet: read them each time the screen opens
    const box = h('div', h('div.loading', h('div.spinner'), 'Reading the checks…'));
    ctx.store.readRange(SHEET, `B${FIRST}:F${LAST}`).then((rows) => { ui.rows = rows; box.replaceChildren(draw(ctx)); })
      .catch(() => box.replaceChildren(h('div.page', h('div.banner.warn', 'This Hub has no Data Quality sheet the panel can read.'))));
    return box;
  }
};

function draw(ctx) {
    const { store } = ctx, n = store.names;
    const checks = ui.rows.map((r, i) => ({ row: FIRST + i, id: String(r[0] || ''), sev: String(r[1] || ''), count: Number(r[2]) || 0, what: String(r[3] || ''), where: String(r[4] || '') }))
      .filter((c) => /^DQ-/.test(c.id));
    const found = checks.filter((c) => c.count > 0).sort((a, b) => (a.sev === 'Error' ? 0 : 1) - (b.sev === 'Error' ? 0 : 1) || b.count - a.count);
    const errs = Number(n.DQ_Errors) || found.filter((c) => c.sev === 'Error').reduce((a, c) => a + c.count, 0);
    const warns = Number(n.DQ_Warnings) || found.filter((c) => c.sev !== 'Error').reduce((a, c) => a + c.count, 0);
    const open = (c) => store.showRange(SHEET, `F${c.row}`).catch((e) => toast(e.message || String(e), true));
    const card = (c) => h('div.card', { style: { padding: '10px 12px', borderLeft: `4px solid var(--${c.count ? (c.sev === 'Error' ? 'r' : 'a') : 'g'}-bar)`, minWidth: 0 } },
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' } },
        h('b', c.id), h('span.pill', { class: c.count ? (c.sev === 'Error' ? 'red' : 'amber') : 'green' }, c.count ? `${c.count} ${c.sev === 'Error' ? (c.count === 1 ? 'error' : 'errors') : (c.count === 1 ? 'warning' : 'warnings')}` : 'clear'),
        h('span', c.what)),
      c.count ? h('div.small.muted', { style: { marginTop: '4px' } }, 'Where to look: ', c.where) : null,
      c.count ? h('button.link-btn', { type: 'button', onclick: () => open(c), style: { marginTop: '4px' } }, 'Open this check on the sheet ›') : null);
    return h('div.page',
      h('div.page-head', h('div', h('h1', 'Data quality'),
        h('p.lede', 'The Hub checks its own data: missing answers, broken links between registers, dates that do not add up. Fix the errors before the packs, so the numbers in them are right. Warnings are worth a look.'))),
      h('div.tiles', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap' } },
        h('div.tile', { class: errs ? 'red' : null }, h('span.tile-label', 'Errors'), h('span.tile-value', String(errs)), h('span.tile-sub', errs ? 'fix before the packs' : 'none')),
        h('div.tile', { class: warns ? 'amber' : null }, h('span.tile-label', 'Warnings'), h('span.tile-value', String(warns)), h('span.tile-sub', `${plural(found.length, 'check')} finding something`)),
        h('div.tile', h('span.tile-label', 'Checks run'), h('span.tile-value', String(checks.length)), h('span.tile-sub', 'recalculated as you work'))),
      h('section', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' } },
        found.length ? found.map(card) : h('div.banner.info', 'Every check is clear.'),
        h('button.link-btn', { type: 'button', onclick: () => { ui.all = !ui.all; ctx.rerender(); } }, ui.all ? 'Hide the clear checks' : `Show the ${checks.length - found.length} clear checks`),
        ui.all ? checks.filter((c) => !c.count).map(card) : null));
}
