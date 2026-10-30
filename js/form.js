// Builds an edit form from the workbook's own column definitions (schema.json, generated from the builder).
// Inputs (I) and suggested values (D) are editable; calculated columns (C) are shown read-only.
import { h, fmtDate, fmtMoney, fmtMonth, serialToIso, isoToSerial } from './util.js?v=0.2.4.20261030214432';

export function display(store, col, v) {
  if (v === '' || v == null) return '';
  const f = col ? col.f : 'text';
  if (f === 'date') return fmtDate(v);
  if (f === 'month') return fmtMonth(v);
  if (f === 'money') return fmtMoney(v, store.names.CcySym || '');
  if (f === 'pct') return Math.round(Number(v) * 100) + '%';
  return String(v);
}

let uid = 0;

/**
 * fields: array of headers, or {sec: 'Heading'} entries, or {h, label, full} objects.
 * rec: a store record (or null for a new record).
 * Returns { el, collect() -> {header: value} for the fields the user changed, dirty() }.
 */
export function buildForm(store, table, rec, fields, opts = {}) {
  const inputs = [];
  const root = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  let pair = null;

  for (const f0 of fields) {
    if (f0 && f0.sec) { root.appendChild(h('div.sec', f0.sec)); pair = null; continue; }
    const spec = typeof f0 === 'string' ? { h: f0 } : f0;
    const col = store.colDef(table, spec.h) || { h: spec.h, t: 'I', f: 'text' };
    const label = spec.label || col.h.replace(/ \(key input\)$/, '');
    const raw = rec ? rec.get(spec.h) : (opts.defaults && opts.defaults[spec.h]) || '';
    const pend = opts.pending && spec.h in opts.pending ? opts.pending[spec.h] : undefined;
    const shown = pend !== undefined ? pend : raw;
    const isSugg = rec && col.t === 'D' && rec.sugg(spec.h) && raw !== '';
    const id = 'f' + (++uid);
    const wrap = h('div.field', { class: isSugg ? 'is-sugg' : null });
    const lab = h('label.field-label', { for: id }, label, isSugg ? h('span.hint', 'suggested') : null);
    wrap.appendChild(lab);
    let get = null, el = null;
    const markDirty = () => wrap.classList.add('dirty');

    if (col.t === 'C' || spec.readonly) {
      wrap.replaceChild(h('span.field-label', label), lab);
      wrap.appendChild(h('span.field-calc', display(store, col, raw) || '–'));
    } else {
      const options = store.options(col);
      const isScale = options && options.length === 5 && options.join() === '1,2,3,4,5';
      if (isScale) {
        let cur = shown === '' ? '' : String(shown);
        const seg = h('div.seg', { role: 'group', 'aria-label': label });
        options.forEach((o) => {
          const b = h('button', { type: 'button', 'aria-pressed': String(o === cur) }, o);
          b.addEventListener('click', () => {
            cur = cur === o ? '' : o;
            seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.textContent === cur)));
            markDirty();
          });
          seg.appendChild(b);
        });
        wrap.replaceChild(h('span.field-label', label), lab);
        el = seg; get = () => (cur === '' ? '' : Number(cur));
      } else if (options) {
        const all = shown !== '' && !options.includes(String(shown)) ? [String(shown), ...options] : options;
        el = h('select', { id }, h('option', { value: '' }, ''), all.map((o) => h('option', { value: o }, o)));
        el.value = shown === '' ? '' : String(shown);
        get = () => el.value;
      } else if (col.f === 'date' || (col.dv && col.dv.date)) {
        el = h('input', { id, type: 'date', value: serialToIso(shown) });
        get = () => isoToSerial(el.value);
      } else if (col.f === 'long' || spec.area) {
        el = h('textarea', { id, rows: spec.rows || 3 });
        el.value = shown === '' ? '' : String(shown);
        get = () => el.value;
      } else if (['int', 'money', 'num', 'pct'].includes(col.f)) {
        el = h('input', { id, type: 'number', step: col.f === 'int' ? '1' : 'any', value: shown === '' ? '' : String(shown), inputmode: 'decimal' });
        get = () => (el.value === '' ? '' : Number(el.value));
      } else {
        el = h('input', { id, type: 'text', value: shown === '' ? '' : String(shown) });
        get = () => el.value.trim();
      }
      if (el.tagName !== 'DIV') el.addEventListener('input', markDirty);
      wrap.appendChild(el);
      inputs.push({ h: spec.h, get, raw, wrap });
      if (pend !== undefined) markDirty();
    }
    if (spec.note) wrap.appendChild(h('span.field-note', spec.note));

    if (spec.full || col.f === 'long' || spec.h === fields.find((x) => typeof x === 'string')) {
      root.appendChild(wrap); pair = null;
    } else if (pair && pair.children.length === 1) {
      pair.appendChild(wrap); pair = null;
    } else {
      pair = h('div.grid2', wrap); root.appendChild(pair);
    }
  }

  return {
    el: root,
    collect() {
      const out = {};
      for (const i of inputs) {
        if (!i.wrap.classList.contains('dirty')) continue;
        const v = i.get();
        if (String(v) !== String(i.raw)) out[i.h] = v;
      }
      return out;
    },
    dirty() { return inputs.some((i) => i.wrap.classList.contains('dirty')); }
  };
}
