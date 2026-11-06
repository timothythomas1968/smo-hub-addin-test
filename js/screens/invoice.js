// Our invoice: the invoice we send the other party for the services we provide, built by the Our Invoice sheet.
// Settings (month, currency, number, date, tax, payment details) and the other-charges log are edited here;
// the invoice itself is shown as a printable page with the client's logo.
import { h, fmtDate, fmtMonth, toast, printNode, isoToSerial, serialToIso, fromSerial, toSerial, fieldBox, dateBox } from '../util.js?v=0.10.1.20261106220328';

const SHEET = 'Our Invoice';
const OC0 = 20, OC1 = 119;
const ui = { data: null, logAdd: false, taxable: null };

export default {
  tables: [],
  render(ctx) {
    const { store } = ctx;
    const page = h('div.page', h('div.loading', h('div.spinner'), 'Reading the invoice…'));
    load(ctx, page);
    return page;
  }
};

async function load(ctx, page) {
  const { store } = ctx;
  try {
    if (ui.gen !== store.gen) { ui.gen = store.gen; ui.data = null; }
    if (!ui.data) ui.data = await store.readRange(SHEET, `A1:Q${OC1}`);
    page.replaceChildren(...build(ctx).childNodes);
  } catch (e) {
    page.replaceChildren(h('div.banner.warn', 'Could not read the Our Invoice sheet: ' + (e.message || e)));
  }
}

const cellOf = (D, addr) => { const m = /^([A-Q])(\d+)$/.exec(addr); return D[Number(m[2]) - 1]['ABCDEFGHIJKLMNOPQ'.indexOf(m[1])]; };
const money = (v, us) => (v === '' || v == null ? '' : Number(v).toLocaleString(us ? 'en-US' : 'en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function build(ctx) {
  const { store } = ctx;
  const n = store.names, D = ui.data, us = n.Edition === 'US';
  const c = (a) => cellOf(D, a);
  const buyer = n.Perspective !== 'Seller';
  const last = Number(n.InvLastRow) || Number(c('P3')) || 27;
  const lines = [];
  for (let r = 21; r < last && r <= OC1; r++) { const row = D[r - 1]; if (row[1] !== '' && row[2] !== '') lines.push({ n: row[1], ref: row[2], desc: row[3], fee: row[5], mk: row[6], amt: Number(row[7]) || 0 }); }
  const isService = (l) => l.fee !== '' && l.fee != null;
  const taxRate = Number(c('K9')) || 0;
  const taxable = store.src.getSetting('inv-taxable') || {};
  // Services are taxed unless switched off; other charges only when switched on (Tim, 6 Nov 2026: a tax switch for each additional charge).
  const tkey = (l) => (isService(l) ? l.ref : 'oc:' + (l.ref || '') + '|' + (l.desc || ''));
  const isTaxed = (l) => (isService(l) ? taxable[tkey(l)] !== false : taxable[tkey(l)] === true);
  const taxOf = (l) => (taxRate && isTaxed(l) ? l.amt * taxRate : 0);
  const svcTot = lines.filter(isService).reduce((a, l) => a + l.amt, 0);
  const othTot = lines.filter((l) => !isService(l)).reduce((a, l) => a + l.amt, 0);
  const taxTot = lines.reduce((a, l) => a + taxOf(l), 0);
  const ccy = c('H9') || c('K6') || n.RepCcy;
  const office = store.src.getSetting('office-name') || 'Separation Management Office';
  const logo = store.src.getSetting('logo');
  const ours = buyer ? n.BuyerName : n.SellerName, theirs = buyer ? n.SellerName : n.BuyerName;

  // ---------- settings (written to the Our Invoice sheet)
  const months = [];
  const start = fromSerial(n.FEE_Start || n.CloseDate), end = fromSerial(n.RD);
  if (start && end) for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); d <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) months.push(toSerial(d));
  const mSel = h('select', { style: inp() }, months.reverse().map((m) => h('option', { value: String(m) }, fmtMonth(m))));
  mSel.value = String(Number(c('K5')) || '');
  const ccySel = h('select', { style: inp() }, [...new Set([String(c('K6') || ''), ...(store.options({ h: 'c', t: 'I', dv: { name: 'CcyCode' } }) || [n.RepCcy])].filter(Boolean))].map((x) => h('option', { value: x }, x)));
  ccySel.value = String(c('K6') || n.RepCcy);
  const noIn = h('input', { type: 'text', value: String(c('K7') || ''), style: inp() });
  const dateIn = dateBox(c('K8'), { style: inp() });
  const taxIn = h('input', { type: 'number', step: '0.5', min: '0', value: String(Math.round(taxRate * 1000) / 10), style: inp() });
  const payIn = h('textarea', { rows: 3, style: inp() }); payIn.value = String(c('K10') || '');
  const officeIn = h('input', { type: 'text', value: office, style: inp() });
  const saveSettings = async () => {
    const want = [['K5', Number(mSel.value)], ['K6', ccySel.value], ['K7', noIn.value.trim()], ['K8', isoToSerial(dateIn.value)], ['K9', (Number(taxIn.value) || 0) / 100], ['K10', payIn.value]];
    const changed = want.filter(([a, v]) => String(v) !== String(c(a))).map(([addr, value]) => ({ addr, value }));
    try {
      if (officeIn.value.trim() !== office) await store.src.setSetting('office-name', officeIn.value.trim());
      if (changed.length) await store.writeCells(SHEET, changed);
      ui.data = null;
      toast(changed.length ? 'Invoice settings saved to the workbook' : 'Saved');
      ctx.rerender();
    } catch (e) { toast('Could not save: ' + (e.message || e), true); }
  };
  const logoIn = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/svg+xml', style: { fontSize: '12px' } });
  logoIn.addEventListener('change', () => {
    const f = logoIn.files[0];
    if (!f) return;
    if (f.size > 300 * 1024) { toast('Please use a logo under 300 KB', true); return; }
    const rd = new FileReader();
    rd.onload = async () => { await store.src.setSetting('logo', rd.result); toast('Logo saved with the workbook'); ctx.rerender(); };
    rd.readAsDataURL(f);
  });
  const settings = h('aside.panel', { 'aria-label': 'Invoice settings' },
    h('div.panel-head', h('span.panel-id', 'Not printed'), h('h2.panel-title', 'Invoice settings')),
    h('div.panel-body',
      fld('Service month', mSel), h('div.grid2', fld('Invoice currency', ccySel), fld('Tax rate (%)', taxIn)),
      h('span.small.muted', taxRate ? 'Choose which services and other charges are taxed under "Which lines are taxed".' : 'Enter a tax rate, save, and a list appears to choose which services and other charges are taxed.'),
      h('div.grid2', fld('Invoice number', noIn), fld('Invoice date', dateIn)),
      fld('Payment details', payIn),
      h('div.sec', 'Your letterhead'), fld('Office name on the invoice', officeIn),
      h('div.field', h('span.field-label', 'Logo'), logo ? h('img', { src: logo, alt: 'Current logo', style: { maxHeight: '48px', maxWidth: '200px', objectFit: 'contain', alignSelf: 'flex-start' } }) : h('span.small.muted', 'No logo yet'), logoIn,
        logo ? h('button.link-btn', { type: 'button', style: { alignSelf: 'flex-start' }, onclick: async () => { await store.src.setSetting('logo', null); ctx.rerender(); } }, 'Remove logo') : null)),
    h('div.panel-foot', h('button.btn.btn-primary', { type: 'button', onclick: saveSettings }, 'Save settings'),
      h('span.small.muted', { style: { flex: '1 1 100%' } }, 'The logo and office name are kept with the workbook and appear on invoices and packs.')));

  // ---------- the invoice
  const th = (t, right) => h('th', { style: { textAlign: right ? 'right' : 'left', fontSize: '11px', color: 'var(--muted)', padding: '6px 6px', borderBottom: '2px solid var(--navy)' } }, t);
  const td = (t, right, bold) => h('td', { style: { textAlign: right ? 'right' : 'left', padding: '7px 6px', borderBottom: '1px solid var(--line-soft)', fontWeight: bold ? 700 : 400, fontVariantNumeric: 'tabular-nums' } }, t);
  const due = (Number(c('K8')) || 0) + (Number(n.PayTerms) || 30);
  const invoice = h('div.invoice-page', { style: { background: '#fff', border: '1px solid var(--line)', borderRadius: '4px', padding: '36px 40px', boxShadow: '0 2px 10px rgba(0,0,0,.05)', color: 'var(--ink)', fontSize: '13px' } },
    h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-start' } },
      h('div', h('div', { style: { fontSize: '28px', fontWeight: 700, color: 'var(--navy)', letterSpacing: '1px' } }, 'INVOICE'),
        h('div.muted', buyer ? 'Reverse transitional services' : 'Transitional services')),
      h('div', { style: { textAlign: 'right' } },
        logo ? h('img', { src: logo, alt: '', style: { maxHeight: '56px', maxWidth: '220px', objectFit: 'contain', display: 'block', marginLeft: 'auto', marginBottom: '6px' } }) : null,
        h('div', { style: { fontWeight: 700 } }, ours), h('div.small.muted', office))),
    h('div', { style: { display: 'flex', justifyContent: 'space-between', gap: '20px', marginTop: '28px', flexWrap: 'wrap' } },
      h('div', h('div.small', { style: { fontWeight: 700, color: 'var(--muted)', letterSpacing: '.6px' } }, 'BILL TO'), h('div', { style: { fontWeight: 600, fontSize: '15px' } }, theirs),
        h('div.small', { style: { fontWeight: 700, color: 'var(--muted)', letterSpacing: '.6px', marginTop: '12px' } }, 'UNDER'), h('div.small', c('B9'))),
      h('table', { style: { borderCollapse: 'collapse', fontSize: '13px' } },
        [['Invoice number', c('K7')], ['Invoice date', fmtDate(c('K8'))], ['Service month', fmtMonth(c('K5'))], ['Payment due', fmtDate(due)], ['Currency', ccy]]
          .map(([k, v]) => h('tr', h('td.muted', { style: { padding: '2px 14px 2px 0' } }, k), h('td', { style: { fontWeight: 600, textAlign: 'right' } }, v))))),
    h('table', { style: { width: '100%', borderCollapse: 'collapse', marginTop: '26px' } },
      h('thead', h('tr', th('#'), th('Reference'), th('Description'), taxRate ? th('Tax', true) : null, th('Amount', true))),
      h('tbody', lines.map((l) => h('tr', td(l.n), td(l.ref), td(l.desc + (Number(l.mk) ? ` (mark-up ${Math.round(l.mk * 100)}%)` : '')), taxRate ? td(taxOf(l) ? money(taxOf(l), us) : '–', true) : null, td(money(l.amt, us), true))))),
    h('div', { style: { display: 'flex', justifyContent: 'flex-end', marginTop: '14px' } },
      h('table', { style: { borderCollapse: 'collapse', minWidth: '260px' } },
        [['Services', svcTot], ['Other charges', othTot], [taxRate ? `Tax ${Math.round(taxRate * 1000) / 10}%` : 'No tax applies', taxTot]].map(([k, v]) => h('tr', h('td.muted', { style: { padding: '3px 0' } }, k), h('td', { style: { textAlign: 'right' } }, money(v, us)))),
        h('tr', h('td', { style: { padding: '8px 0 0', fontWeight: 700, borderTop: '2px solid var(--navy)' } }, `Total due (${ccy})`), h('td', { style: { textAlign: 'right', fontWeight: 700, fontSize: '16px', padding: '8px 0 0', borderTop: '2px solid var(--navy)' } }, money(svcTot + othTot + taxTot, us))))),
    c('K10') ? h('div', { style: { marginTop: '26px' } }, h('div.small', { style: { fontWeight: 700, color: 'var(--muted)', letterSpacing: '.6px' } }, 'PAYMENT DETAILS'), h('div.small', { style: { whiteSpace: 'pre-wrap' } }, c('K10'))) : null,
    lines.length ? null : h('p.muted', 'No services or charges for this month and currency.'));

  // per-service tax switches
  const taxRow = (l, i) => {
    const id = 'tx-' + i;
    const cb = h('input', { type: 'checkbox', id, checked: isTaxed(l) });
    cb.addEventListener('change', async () => { const t = store.src.getSetting('inv-taxable') || {}; t[tkey(l)] = cb.checked; await store.src.setSetting('inv-taxable', t); ctx.rerender(); });
    return h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0' } }, cb, h('label', { for: id }, [l.ref, l.desc].filter(Boolean).join(' · ')));
  };
  const others = lines.filter((l) => !isService(l));
  const taxBox = taxRate ? h('div.card', h('h2.cap', { style: { marginBottom: '6px' } }, 'Which lines are taxed'),
    h('div.small', { style: { fontWeight: 700, color: 'var(--heading)', marginTop: '4px' } }, 'Services'),
    lines.filter(isService).map(taxRow),
    h('div.small', { style: { fontWeight: 700, color: 'var(--heading)', marginTop: '8px' } }, 'Other charges'),
    others.length ? others.map((l, i) => taxRow(l, 'oc' + i)) : h('p.small.muted', { style: { margin: '2px 0' } }, 'No other charges this month. Add them in the other charges log below; tick each one that is taxed.'))
    : null;

  // ---------- other charges log
  const log = [];
  for (let r = OC0; r <= OC1; r++) { const row = D[r - 1]; if (row[10] !== '' || row[11] !== '') log.push({ r, month: row[9], ref: row[10], desc: row[11], amt: row[12], ccy: row[13] }); }
  const nextRow = (() => { for (let r = OC0; r <= OC1; r++) { const row = D[r - 1]; if (row[9] === '' && row[10] === '' && row[11] === '' && row[12] === '') return r; } return null; })();
  const newVals = { month: Number(c('K5')) || '', ref: '', desc: '', amt: '', ccy: '' };
  const lm = h('select', { style: inp() }, months.map((m) => h('option', { value: String(m) }, fmtMonth(m)))); lm.value = String(newVals.month);
  const lr = h('input', { type: 'text', placeholder: 'e.g. WO-003 or OOP-004', style: inp() });
  const ld = h('input', { type: 'text', placeholder: 'What the charge is for', style: inp() });
  const la = h('input', { type: 'number', step: '0.01', style: inp() });
  const lc = h('input', { type: 'text', placeholder: n.RepCcy, style: inp() });
  const addCharge = async () => {
    if (!ld.value.trim() || !la.value) { toast('Type a description and an amount', true); return; }
    if (!nextRow) { toast('The charges log is full', true); return; }
    try {
      await store.writeCells(SHEET, [{ addr: `J${nextRow}`, value: Number(lm.value) }, { addr: `K${nextRow}`, value: lr.value.trim() }, { addr: `L${nextRow}`, value: ld.value.trim() }, { addr: `M${nextRow}`, value: Number(la.value) }, { addr: `N${nextRow}`, value: lc.value.trim() }]);
      ui.data = null; ui.logAdd = false; toast('Charge added'); ctx.rerender();
    } catch (e) { toast('Could not add: ' + (e.message || e), true); }
  };
  const logCard = h('div.card',
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' } }, h('h2.cap', { style: { flex: '1 1 auto' } }, 'Other charges log'),
      h('button.btn.btn-sm', { type: 'button', onclick: () => { ui.logAdd = !ui.logAdd; ctx.rerender(); } }, ui.logAdd ? 'Cancel' : '+ Add a charge')),
    h('p.small.muted', { style: { margin: '0 0 8px' } }, 'Work orders, pass-through and out-of-pocket charges. Charges for the chosen month and currency become lines on the invoice.'),
    ui.logAdd ? h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '10px' } },
      fld('Service month', lm), fld('Reference', lr), fld('Description', ld), fld('Amount', la), fld('Currency (blank = ' + n.RepCcy + ')', lc),
      h('div', { style: { display: 'flex', alignItems: 'flex-end' } }, h('button.btn.btn-primary', { type: 'button', onclick: addCharge }, 'Add'))) : null,
    log.length ? h('table.grid', h('thead', h('tr', ['Month', 'Reference', 'Description', 'Amount', 'Ccy'].map((x, i) => h('th', { style: i === 3 ? { textAlign: 'right' } : null }, x)))),
      h('tbody', log.map((x) => h('tr', { style: Number(x.month) === Number(c('K5')) ? null : { opacity: 0.6 } },
        h('td.nowrap', fmtMonth(x.month)), h('td', x.ref), h('td', x.desc), h('td.num', money(x.amt, us)), h('td', x.ccy || n.RepCcy)))))
      : h('p.small.muted', 'No charges yet.'));

  const print = () => printNode(invoice, `Invoice ${c('K7') || ''} ${fmtMonth(c('K5')) || ''}`.trim());

  return h('div',
    h('div.page-head',
      h('div', h('h1', 'Our invoice'), h('p.lede', buyer
        ? `The invoice for the reverse services we provide to ${n.SellerName || 'the seller'}, built from the TSA register for the chosen month. Only the lines in use are shown.`
        : `The invoice for the services we provide to ${n.BuyerName || 'the buyer'}, built from the TSA register for the chosen month. Only the lines in use are shown.`)),
      h('button.btn', { type: 'button', onclick: () => store.showRange(SHEET, 'B1:H40').catch((e) => toast(e.message, true)) }, 'Show the invoice sheet'),
      h('button.btn.btn-primary', { type: 'button', onclick: print }, 'Print or save as PDF')),
    h('div.row-wrap', { style: { marginTop: '18px' } },
      h('div', { style: { flex: '999 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: '18px' } }, h('div.print-area', invoice), taxBox, logCard),
      settings));
}

function fld(label, el) { return fieldBox(label, el); }
function inp() { return { border: '1px solid var(--line-strong)', background: 'var(--input)', borderRadius: '6px', padding: '7px 9px', fontSize: '13px', width: '100%', minWidth: 0 }; }
