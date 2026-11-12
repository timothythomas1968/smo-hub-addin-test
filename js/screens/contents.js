// Contents: every sheet in the Hub, opened from here even when the panel has tidied it away (Stage 2b), and the tidy-tabs switch.
import { h, toast, ed } from '../util.js?v=0.11.1.20261112214706';
import { GROUPS, isOff, setTidy as applyTidy } from '../tabs.js?v=0.11.1.20261112214706';

export default {
  tables: [],
  render(ctx) {
    const { store } = ctx;
    const inExcel = !!store.src.setVisibleSheets;
    const tidy = store.src.getSetting('tidy-tabs') !== 'off';
    const open = (sheet) => store.showRange(ed(sheet), 'A1').then(() => toast(`${ed(sheet)} is open in the workbook.`)).catch((e) => toast(e.message, true));
    const setTidy = async (on) => {
      await applyTidy(store, on).catch((e) => toast(e.message, true));
      toast(on ? 'Tabs tidied: only the main sheets show.' : 'Every tab shows again.');
      ctx.rerender();
    };
    return h('div.page',
      h('div.page-head', h('div', h('h1', 'Contents'),
        h('p.lede', 'Every sheet in the Hub. Select one to open it in the workbook, even if its tab is tidied away.'))),
      h('section.card', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' } },
        h('div', h('b', 'Tidy the tabs'),
          h('div.small.muted', 'When the workbook opens, show only the main sheets: Day 1 and First 100 Days around closing or while they have open items, and Start Here until set-up is done.')),
        h('div.seg', { role: 'group', 'aria-label': 'Tidy the tabs' },
          h('button', { type: 'button', 'aria-pressed': String(tidy), disabled: !inExcel || null, onclick: () => setTidy(true) }, 'On'),
          h('button', { type: 'button', 'aria-pressed': String(!tidy), disabled: !inExcel || null, onclick: () => setTidy(false) }, 'Off'))),
      GROUPS.map(([g, items]) => h('section.card',
        h('h2.cap', g),
        h('div', items.map(([sheet, what]) => {
          const off = isOff(store, sheet);
          return h('div', { style: { display: 'flex', gap: '12px', alignItems: 'baseline', padding: '7px 0', borderTop: '1px solid var(--line-soft)' } },
            h('button.drill', { type: 'button', style: { minWidth: '210px', textAlign: 'left' }, onclick: () => open(sheet) }, ed(sheet)),
            h('span.small', { style: { color: off ? 'var(--muted)' : null, flex: '1 1 auto' } }, ed(what)),
            off ? h('span.chip', 'Not in use') : null);
        })))));
  }
};
