// Placeholder for screens that are mocked up but not yet built in the working prototype.
import { h, toast } from '../util.js?v=0.4.0.20261030221339';

export function soon(title, what, table) {
  return {
    placeholder: true,
    tables: [],
    render({ store, go }) {
      return h('div.page.soon',
        h('div.page-head', h('div', h('h1', title), h('p.lede', what))),
        h('div.card', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
          h('span', 'This screen is in the mock-up and comes in the next build of the working prototype. Until then, the worksheet does the job.'),
          h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
            table ? h('button.btn.btn-primary', { type: 'button', onclick: () => store.show(table).catch((e) => toast(e.message, true)) }, 'Open the worksheet') : null,
            h('button.btn', { type: 'button', onclick: () => go('home') }, 'Back to Home'))));
    }
  };
}
