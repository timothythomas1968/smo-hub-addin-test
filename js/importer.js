// A general import, step by step (brief 4.7; written so the TSA schedule import, Stage 3a, can reuse it):
//   1. pick the file (.xlsx or .csv) and the sheet;  2. match the columns (suggested from the headings);
//   3. checks before writing, with matching of workstreams and people;  4. how to write (replace, add, update);
//   5. a summary of what will be written, then write it and show the result.
// The file is read in the browser (xlsxread.js) and never leaves the computer.
import { h, toast, fmtDate, ed, isUS, plural } from './util.js?v=0.12.3.20261120063500';
import { readFile } from './xlsxread.js?v=0.12.3.20261120063500';

const MON = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const serial = (y, m, d) => { const t = Date.UTC(y, m, d); const x = new Date(t); return x.getUTCMonth() === m && x.getUTCDate() === d ? Math.round(t / 864e5) + 25569 : null; };

/** A date as an Excel serial number: Excel's own dates, 2026-03-01, 1/3/2026 (UK) or 3/1/2026 (US), 1 Mar 2026, Mar 1, 2026. Null if unreadable. */
export function parseDate(v, us = isUS()) {
  if (v === '' || v == null) return null;
  if (typeof v === 'number') return v > 20000 && v < 80000 ? Math.floor(v) : null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return n > 20000 && n < 80000 ? Math.floor(n) : null; }
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return serial(+m[1], +m[2] - 1, +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; const [d, mo] = us ? [+m[2], +m[1]] : [+m[1], +m[2]]; return serial(y, mo - 1, d); }
  m = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(s);
  if (m && MON[m[2].slice(0, 3).toLowerCase()] != null) return serial(+m[3], MON[m[2].slice(0, 3).toLowerCase()], +m[1]);
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(s);
  if (m && MON[m[1].slice(0, 3).toLowerCase()] != null) return serial(+m[3], MON[m[1].slice(0, 3).toLowerCase()], +m[2]);
  return null;
}

/** Which column holds each field, from the headings. fields: [{key, label, syn: RegExp}]. Returns {key: column index or -1}. */
export function matchColumns(headers, fields) {
  const used = new Set(), map = {};
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();
  fields.forEach((f) => {
    let i = headers.findIndex((hd, j) => !used.has(j) && norm(hd) === norm(f.label));
    if (i < 0 && f.syn) i = headers.findIndex((hd, j) => !used.has(j) && f.syn.test(norm(hd)));
    map[f.key] = i; if (i >= 0) used.add(i);
  });
  return map;
}

/** The closest of `options` to `v` (exact, then ignoring case and punctuation, then by shared words), or ''. */
export function closest(v, options) {
  const n = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const s = n(v);
  if (!s) return '';
  let best = options.find((o) => n(o) === s) || options.find((o) => n(o).startsWith(s) || s.startsWith(n(o)));
  if (best) return best;
  const words = new Set(s.split(' ').filter((w) => w.length > 2));
  let score = 0;
  options.forEach((o) => { const k = n(o).split(' ').filter((w) => words.has(w)).length; if (k > score) { score = k; best = o; } });
  return score ? best : '';
}

/** Download rows as a .csv file (the import template). */
export function downloadCsv(name, rows) {
  const esc = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n')], { type: 'text/csv' }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** The wizard. cfg: { title, intro, fields, template: {name, rows}, prompt, modes: [[key, label, help]],
 *   analyse(rows, map, choices) -> { items, errors: [text], warnings: [text], lists: [{key, title, values: [src], options: [opt], add: label}] },
 *   summary(items, mode, choices) -> [text], write(items, mode, choices) -> Promise<text> } */
export function importWizard(ctx, cfg) {
  const st = { step: 1, file: null, book: null, sheet: '', rows: [], head: 0, map: {}, choices: {}, mode: cfg.modes[0][0], result: null, busy: false };
  const back = h('div.modal-back.imp', { onclick: (e) => { if (e.target === back && !st.busy) close(); } });
  const box = h('div.modal.modal-wide.imp-box', { role: 'dialog', 'aria-modal': 'true', 'aria-label': cfg.title });
  back.appendChild(box);
  const esc = (e) => { if (e.key === 'Escape' && !st.busy) close(); };
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
  document.addEventListener('keydown', esc);
  const steps = ['File', 'Columns', 'Checks', 'How', 'Write'];
  const nav = (...btns) => h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px', flexWrap: 'wrap' } }, h('button.btn', { type: 'button', onclick: close }, st.result ? 'Close' : 'Cancel'), ...btns);
  const btn = (label, fn, primary = true, disabled = false) => h(primary ? 'button.btn.btn-primary' : 'button.btn', { type: 'button', disabled: disabled || null, onclick: fn }, label);
  const headers = () => (st.rows[st.head] || []).map((x, i) => String(x || `Column ${i + 1}`));
  const data = () => st.rows.slice(st.head + 1).filter((r) => r.some((v) => v !== '' && v != null));
  let analysis = null;
  const analyse = () => { analysis = cfg.analyse(data(), st.map, st.choices); return analysis; };

  const render = () => {
    const head = h('div', h('h2', cfg.title),
      h('div.imp-steps', steps.map((s, i) => h('span', { class: i + 1 === st.step ? 'on' : i + 1 < st.step ? 'done' : null }, `${i + 1}. ${s}`))));
    let body;
    if (st.step === 1) {
      const inp = h('input', { type: 'file', accept: '.xlsx,.csv,.txt', 'aria-label': 'Pick the file' });
      inp.addEventListener('change', async () => {
        const f = inp.files[0]; if (!f) return;
        try { st.file = f; st.book = await readFile(f); st.sheet = st.book.sheets[0]; await loadSheet(); render(); }
        catch (e) { toast('Could not read the file: ' + (e.message || e), true); }
      });
      const pick = st.book && st.book.sheets.length > 1 ? h('select', { 'aria-label': 'Sheet', onchange: async (e) => { st.sheet = e.target.value; await loadSheet(); render(); } },
        st.book.sheets.map((s) => h('option', { value: s, selected: s === st.sheet || null }, s))) : null;
      body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
        h('p.small', { style: { margin: 0 } }, cfg.intro),
        h('div.field', h('label.field-label', 'Your file (.xlsx or .csv)'), inp),
        pick ? h('div.field', h('label.field-label', 'Sheet'), pick) : null,
        st.rows.length ? h('p.small.muted', { style: { margin: 0 } }, `${st.file.name}: ${plural(data().length, 'row')} under the headings in row ${st.head + 1}.`) : null,
        h('div.small', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' } },
          h('button.link-btn', { type: 'button', onclick: () => downloadCsv(cfg.template.name, cfg.template.rows) }, 'Download the template (.csv)'),
          cfg.prompt ? h('button.link-btn', { type: 'button', onclick: () => { st.showPrompt = !st.showPrompt; render(); } }, cfg.promptLabel || 'Plan in Word, PDF or MS Project?') : null),
        st.showPrompt ? h('div.banner.info', { style: { margin: 0, whiteSpace: 'pre-wrap' } }, cfg.prompt) : null);
      return box.replaceChildren(head, body, nav(btn('Next: columns', () => { st.step = 2; render(); }, true, !st.rows.length)));
    }
    if (st.step === 2) {
      const hd = headers();
      body = h('div', h('p.small', { style: { marginTop: 0 } }, 'Check which of your columns holds each field. They are suggested from your headings; leave a field as "Not in my file" if you don\'t have it.'),
        h('div.imp-map', cfg.fields.map((f) => {
          const sel = h('select', { 'aria-label': f.label, onchange: (e) => { st.map[f.key] = Number(e.target.value); } },
            h('option', { value: '-1' }, f.required ? 'Choose a column' : 'Not in my file'), hd.map((x, i) => h('option', { value: String(i) }, x)));
          sel.value = String(st.map[f.key] ?? -1);
          const eg = st.map[f.key] >= 0 ? data().slice(0, 2).map((r) => r[st.map[f.key]]).filter((v) => v !== '').map((v) => (typeof v === 'number' && v > 20000 && v < 80000 ? fmtDate(v) : String(v))).join(' · ') : '';
          return h('div.imp-row', h('span', h('b', f.label), f.required ? ' (needed)' : '', f.help ? h('div.small.muted', f.help) : null), sel, h('span.small.muted', eg));
        })));
      const missing = cfg.fields.filter((f) => f.required && !(st.map[f.key] >= 0));
      return box.replaceChildren(head, body, nav(btn('Back', () => { st.step = 1; render(); }, false),
        btn(missing.length ? `Choose a column for ${missing[0].label}` : 'Next: checks', () => { if (cfg.onHeaders) cfg.onHeaders(headers(), st.map); st.step = 3; render(); }, true, missing.length > 0)));
    }
    if (st.step === 3) {
      const a = analyse();
      const lists = a.lists.map((l) => h('div', { style: { marginTop: '10px' } }, h('div.sec', l.title),
        h('div.imp-map', l.values.map((v) => {
          const key = `${l.key}:${v}`;
          const cur = st.choices[key] ?? l.suggest(v);
          const sel = h('select', { 'aria-label': `${l.title}: ${v}`, onchange: (e) => { st.choices[key] = e.target.value; render(); } },
            h('option', { value: '' }, 'Leave blank'), l.add ? h('option', { value: '+add' }, l.add) : null, l.options.map((o) => h('option', { value: o }, l.label ? l.label(o) : o)));
          sel.value = cur;
          return h('div.imp-row', h('b', String(v)), h('span.small.muted', '→'), sel);
        }))));
      body = h('div', h('div.banner', { class: a.errors.length ? 'warn' : 'info', style: { margin: 0 } },
        a.errors.length ? `${plural(a.errors.length, 'problem')} to fix in your file before importing:` : `${plural(a.items.length, 'row')} ready to import.${a.warnings.length ? ` ${plural(a.warnings.length, 'warning')} to look at.` : ''}`),
      a.errors.length ? h('ul.small', a.errors.slice(0, 30).map((t) => h('li', t)), a.errors.length > 30 ? h('li', `and ${a.errors.length - 30} more`) : null) : null,
      a.warnings.length ? h('ul.small.muted', a.warnings.slice(0, 30).map((t) => h('li', t)), a.warnings.length > 30 ? h('li', `and ${a.warnings.length - 30} more`) : null) : null,
      lists);
      return box.replaceChildren(head, body, nav(btn('Back', () => { st.step = 2; render(); }, false), btn('Next: how to import', () => { st.step = 4; render(); }, true, a.errors.length > 0)));
    }
    if (st.step === 4) {
      body = h('div', cfg.modes.map(([k, label, help]) => h('label.imp-mode', { class: st.mode === k ? 'on' : null },
        h('input', { type: 'radio', name: 'imp-mode', value: k, checked: st.mode === k || null, onchange: () => { st.mode = k; render(); } }),
        h('span', h('b', label), h('div.small.muted', help)))));
      return box.replaceChildren(head, body, nav(btn('Back', () => { st.step = 3; render(); }, false), btn('Next: summary', () => { st.step = 5; render(); })));
    }
    // step 5
    const a = analysis || analyse();
    const lines = st.result ? [st.result] : cfg.summary(a.items, st.mode, st.choices);
    body = h('div', h('ul', lines.map((t) => h('li', t))));
    const go = btn('Import', async () => {
      st.busy = true; go.disabled = true; go.textContent = 'Writing…';
      try { if (cfg.onHeaders) cfg.onHeaders(headers(), st.map); st.result = await cfg.write(a.items, st.mode, st.choices, { map: st.map, headers: headers(), file: st.file ? st.file.name : '', analysis: a }); st.busy = false; render(); ctx.rerender(); toast('Imported'); }
      catch (e) { st.busy = false; go.disabled = false; go.textContent = 'Import'; toast('Could not import: ' + (e.message || e), true); }
    });
    return box.replaceChildren(head, body, st.result ? nav() : nav(btn('Back', () => { st.step = 4; render(); }, false), go));
  };
  const loadSheet = async () => {
    st.rows = await st.book.rows(st.sheet);
    // the headings are the first row that names at least two of the fields (else the first non-empty row)
    let best = 0, bestScore = -1;
    for (let r = 0; r < Math.min(15, st.rows.length); r++) {
      const m = matchColumns((st.rows[r] || []).map(String), cfg.fields);
      const sc = Object.values(m).filter((x) => x >= 0).length;
      if (sc > bestScore) { bestScore = sc; best = r; }
    }
    st.head = best; st.map = matchColumns(headers(), cfg.fields); st.choices = {};
    // a mapping saved from the last import of this kind wins, where the same heading is in the file
    if (cfg.saved) Object.entries(cfg.saved).forEach(([k, hd]) => { const i = headers().indexOf(hd); if (i >= 0) st.map[k] = i; });
    if (cfg.onHeaders) cfg.onHeaders(headers(), st.map);
  };
  render();
  document.body.appendChild(back);
}
