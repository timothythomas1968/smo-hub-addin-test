// Small helpers: element builder, formatting, toasts. No libraries.

/** h('div.card', {onclick}, child, 'text', [more]) builds DOM safely (text is never parsed as HTML). */
export function h(sel, attrs, ...kids) {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (cls.length) el.className = cls.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const EPOCH = Date.UTC(1899, 11, 30);

/** Excel serial date -> JS Date (UTC midnight). */
export function fromSerial(n) {
  if (n === '' || n == null || isNaN(n)) return null;
  return new Date(EPOCH + Math.round(Number(n)) * 86400000);
}
export function toSerial(d) { return Math.round((d.getTime() - EPOCH) / 86400000); }
export function isoToSerial(s) { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(s || ''); return m ? toSerial(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))) : ''; }
export function serialToIso(n) { const d = fromSerial(n); return d ? d.toISOString().slice(0, 10) : ''; }

let US = false;
export function setEdition(e) { US = e === 'US'; }
export function fmtDate(n, short) {
  const d = fromSerial(n);
  if (!d) return '';
  const day = d.getUTCDate(), mon = MONTHS[d.getUTCMonth()], yr = d.getUTCFullYear();
  if (short) return US ? `${mon} ${day}` : `${day} ${mon}`;
  return US ? `${mon} ${day}, ${yr}` : `${day} ${mon} ${yr}`;
}
export function fmtMonth(n) { const d = fromSerial(n); return d ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : ''; }
export function fmtMoney(n, sym) {
  if (n === '' || n == null || isNaN(n)) return '';
  const v = Number(n);
  return (v < 0 ? '−' : '') + (sym || '') + Math.abs(Math.round(v)).toLocaleString(US ? 'en-US' : 'en-GB');
}
export function fmtNum(n) { return n === '' || n == null ? '' : Number(n).toLocaleString(US ? 'en-US' : 'en-GB'); }
export const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;

let toastTimer;
export function toast(msg, err) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = h('div.toast', { role: 'status', class: err ? 'err' : null }, msg);
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), err ? 6000 : 2600);
}

/** Print just this element (also how users save a PDF: choose "Microsoft Print to PDF" or "Save as PDF"). */
export function printNode(node) {
  document.getElementById('print-root')?.remove();
  const root = document.createElement('div');
  root.id = 'print-root';
  root.appendChild(node.cloneNode(true));
  document.body.appendChild(root);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); root.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } catch (e) { done(); toast('Printing is not available here. Use the worksheet and print from Excel.', true); }
}
