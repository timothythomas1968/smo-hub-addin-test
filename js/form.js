// Builds an edit form from the workbook's own column definitions (schema.json, generated from the builder).
// Inputs (I) and suggested values (D) are editable; calculated columns (C) are shown read-only.
// Values the workbook works out (scores, statuses, due dates) update as you type: see live.js.
import { h, fmtDate, fmtMoney, fmtMonth, serialToIso, isoToSerial, ed, dateBox } from './util.js?v=0.9.5.20261106193911';
import { LIVE } from './live.js?v=0.9.5.20261106193911';

export function display(store, col, v) {
  if (v === '' || v == null) return '';
  const f = col ? col.f : 'text';
  if (f === 'date') return fmtDate(v);
  if (f === 'month') return fmtMonth(v);
  if (f === 'money') return fmtMoney(v, store.names.CcySym || '');
  if (f === 'pct') return Math.round(Number(v) * 100) + '%';
  return String(v);
}

/** People in dropdowns show as "Name (role)"; the workbook still stores just the name. */
export function personLabel(store, name) {
  const role = store.roleOf && store.roleOf(name);
  return role ? `${name} (${role})` : name;
}

let uid = 0;

/**
 * fields: array of headers, or {sec: 'Heading'} entries, or {h, label, full} objects.
 * rec: a store record (or null for a new record).
 * Returns { el, collect() -> {header: value} for the fields the user changed, dirty() }.
 */
/** What 1 and 5 mean on the risk scales (Tim, 6 Nov 2026: "not clear whether 5 is highest"). */
export const SCALE_NOTE = { 'Likelihood (1-5)': '1 = very unlikely, 5 = almost certain', 'Impact (1-5)': '1 = very low impact, 5 = very high impact' };
export const SCALE_WORDS = { 'Likelihood (1-5)': ['very unlikely', 'unlikely', 'possible', 'likely', 'almost certain'], 'Impact (1-5)': ['very low', 'low', 'medium', 'high', 'very high'] };

export function buildForm(store, table, rec, fields, opts = {}) {
  const inputs = [];
  const calcs = [];
  const live = LIVE[table] || {};
  const root = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } });
  let pair = null;
  let anyChange = false;

  const byH = {};
  const current = (hd) => {
    const i = byH[hd];
    if (i) return i.get();
    if (rec) return rec.get(hd);
    return (opts.defaults && opts.defaults[hd]) || '';
  };

  // Recalculate the live values after any change.
  const recompute = (changedH) => {
    if (changedH && live.on && live.on[changedH]) {
      live.on[changedH](current(changedH), (hd, v) => { const i = byH[hd]; if (i && String(i.get()) !== String(v)) { i.set(v); i.wrap.classList.add('dirty'); } });
    }
    for (const [hd, fn] of Object.entries(live.sugg || {})) {
      const i = byH[hd];
      if (!i || i.wrap.classList.contains('dirty') || !(i.sugg || i.raw === '')) continue;   // the user's own value is never replaced
      const v = fn(current, store);
      if (v !== undefined && String(i.get()) !== String(v)) { i.set(v); if (v !== '') i.wrap.classList.add('is-sugg'); }
    }
    for (const c of calcs) {
      const fn = (live.calc || {})[c.h];
      const v = fn ? fn(current, store) : undefined;
      if (v !== undefined) { c.span.textContent = display(store, c.col, v) || '–'; c.note.textContent = ''; }
      else if (anyChange) c.note.textContent = 'updates when you save';
    }
  };
  const changed = (hd) => { anyChange = true; recompute(hd); };

  for (const f0 of fields) {
    if (f0 && f0.sec) { root.appendChild(h('div.sec', f0.sec)); pair = null; continue; }
    const spec = typeof f0 === 'string' ? { h: f0 } : f0;
    const col = store.colDef(table, spec.h) || { h: spec.h, t: 'I', f: 'text' };
    const label = spec.label || ed(col.h.replace(/ \(key input\)$/, ''));
    const raw = rec ? rec.get(spec.h) : (opts.defaults && opts.defaults[spec.h]) || '';
    const pend = opts.pending && spec.h in opts.pending ? opts.pending[spec.h] : undefined;
    const shown = pend !== undefined ? pend : raw;
    const isSugg = rec && col.t === 'D' && rec.sugg(spec.h) && raw !== '';
    const id = 'f' + (++uid);
    const wrap = h('div.field', { class: isSugg ? 'is-sugg' : null });
    const lab = h('label.field-label', { for: id }, label, isSugg ? h('span.hint', 'suggested') : null);
    wrap.appendChild(lab);
    let get = null, set = null, el = null;
    const markDirty = () => { wrap.classList.add('dirty'); wrap.classList.remove('is-sugg'); changed(spec.h); };

    if (col.t === 'C' || spec.readonly) {
      wrap.replaceChild(h('span.field-label', label), lab);
      const span = h('span.field-calc', display(store, col, raw) || '–');
      const note = h('span.field-note', '');
      wrap.appendChild(span); wrap.appendChild(note);
      calcs.push({ h: spec.h, col, span, note });
    } else {
      const options = store.options(col);
      const isScale = options && options.length === 5 && options.join() === '1,2,3,4,5';
      if (isScale) {
        let cur = shown === '' ? '' : String(shown);
        const seg = h('div.seg', { role: 'group', 'aria-label': label });
        const paint = () => seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.v === cur)));
        options.forEach((o) => {
          const b = h('button', { type: 'button', 'aria-pressed': String(o === cur), 'data-v': o }, o);
          b.addEventListener('click', () => { cur = cur === o ? '' : o; paint(); markDirty(); });
          seg.appendChild(b);
        });
        wrap.replaceChild(h('span.field-label', label), lab);
        el = seg; get = () => (cur === '' ? '' : Number(cur)); set = (v) => { cur = v === '' || v == null ? '' : String(v); paint(); };
      } else if (options) {
        const people = col.dv && col.dv.name === 'L_People' || (!col.dv && col.h === 'Owner');
        const text = (o) => (people ? personLabel(store, o) : o);
        const all = shown !== '' && !options.includes(String(shown)) ? [String(shown), ...options] : options;
        el = h('select', { id }, h('option', { value: '' }, ''), all.map((o) => h('option', { value: o }, text(o))));
        el.value = shown === '' ? '' : String(shown);
        get = () => el.value;
        set = (v) => {
          const s = v == null ? '' : String(v);
          if (s && ![...el.options].some((o) => o.value === s)) el.appendChild(h('option', { value: s }, text(s)));
          el.value = s;
        };
      } else if (col.f === 'date' || (col.dv && col.dv.date)) {
        el = dateBox(shown, { id });
        get = () => isoToSerial(el.value); set = (v) => { el.value = serialToIso(v); };
      } else if (col.f === 'long' || spec.area) {
        el = h('textarea', { id, rows: spec.rows || 3 });
        el.value = shown === '' ? '' : String(shown);
        get = () => el.value; set = (v) => { el.value = v == null ? '' : String(v); };
      } else if (col.f === 'pct') {
        // Shown as a percentage (90), stored as a fraction (0.9).
        const pct = (v) => (v === '' || v == null ? '' : String(Math.round(Number(v) * 1000) / 10));
        const inp = h('input', { id, type: 'number', step: 'any', min: '0', max: '100', value: pct(shown), inputmode: 'decimal' });
        get = () => (inp.value === '' ? '' : Math.round(Number(inp.value) * 10) / 1000);
        set = (v) => { inp.value = pct(v); };
        inp.addEventListener('input', markDirty);
        el = h('span.pct-box', inp, h('span.pct-sign', '%'));
      } else if (['int', 'money', 'num'].includes(col.f)) {
        el = h('input', { id, type: 'number', step: col.f === 'int' ? '1' : 'any', value: shown === '' ? '' : String(shown), inputmode: 'decimal' });
        get = () => (el.value === '' ? '' : Number(el.value)); set = (v) => { el.value = v == null ? '' : String(v); };
      } else {
        el = h('input', { id, type: 'text', value: shown === '' ? '' : String(shown) });
        get = () => el.value.trim(); set = (v) => { el.value = v == null ? '' : String(v); };
      }
      if ((el.tagName !== 'DIV' && el.tagName !== 'SPAN') || el.classList.contains('date-box')) { el.addEventListener('input', markDirty); el.addEventListener('change', markDirty); }
      wrap.appendChild(el);
      if (isScale) wrap.appendChild(h('span.field-note', SCALE_NOTE[spec.h] || '1 = lowest, 5 = highest'));
      const entry = { h: spec.h, get, set, raw, wrap, sugg: isSugg || (!rec && col.t === 'D') };
      inputs.push(entry); byH[spec.h] = entry;
      if (pend !== undefined) wrap.classList.add('dirty');
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
  recompute();

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
