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
export const isUS = () => US;

// The programme's own name for the team that runs it (SMO, IMO, PMO, Transition Office...), from the
// workbook's set-up answer TeamName (short form TeamShort). Screens say team() + ' lead', 'From the ' + team()...
// A workbook from before v0.11 has no answer; its own text says "SMO", so the panel keeps "SMO" for it.
let TEAM = 'SMO';
export function setTeam(names) {
  const short = String((names && names.TeamShort) || '').trim(), full = String((names && names.TeamName) || '').trim();
  if (short) TEAM = short;
  else if (full) { const m = /\(([^)]+)\)/.exec(full); TEAM = m ? m[1].trim() : full; }
  else TEAM = names && 'TeamName' in names && names.TeamName !== undefined && names.TeamName !== null ? ed('programme office') : 'SMO';
}
export const team = () => TEAM;
/** "the SMO", "the programme office": an abbreviation keeps its capitals; a phrase is lower case after "the". */
export const theTeam = () => (/^[A-Z]{2,5}$/.test(TEAM) ? 'the ' + TEAM : 'the ' + TEAM.charAt(0).toLowerCase() + TEAM.slice(1));

// UK -> US spelling. The same list, in the same order, as GLOSS in workbook/builder/hub3_a.py:
// keep the two in step, because the US workbook's own column names and dropdown values go through it too.
export const GLOSS = [['programme', 'program'], ['Programme', 'Program'], ['organisation', 'organization'], ['Organisation', 'Organization'],
  ['Operationalisation', 'Operationalization'], ['operationalisation', 'operationalization'], ['prioritis', 'prioritiz'],
  ['colour', 'color'], ['Colour', 'Color'], ['behaviour', 'behavior'], ['centre', 'center'], ['licence', 'license'], ['Licence', 'License'],
  ['authoris', 'authoriz'], ['summaris', 'summariz'], ['recognis', 'recogniz'], ['cancelled', 'canceled'], ['Cancelled', 'Canceled'],
  ['judgement', 'judgment'], ['catalogue', 'catalog']];
// Whole words only, so "ticket" and "sticky" are left alone. Same as GLOSS_WORDS in hub3_a.py.
export const GLOSS_WORDS = { tick: 'check', ticks: 'checks', ticked: 'checked', ticking: 'checking', untick: 'uncheck', unticked: 'unchecked',
  grey: 'gray', greyed: 'grayed', greys: 'grays' };
for (const [a, b] of Object.entries(GLOSS_WORDS)) GLOSS_WORDS[a[0].toUpperCase() + a.slice(1)] = b[0].toUpperCase() + b.slice(1);
const WORDS_RE = new RegExp('\\b(' + Object.keys(GLOSS_WORDS).join('|') + ')\\b', 'g');
/** The add-in's own text in the workbook's edition, like ed() in the builder. UK text is returned as it is. */
export function ed(s, us = US) {
  if (!us || typeof s !== 'string' || s.startsWith('=')) return s;
  for (const [a, b] of GLOSS) s = s.split(a).join(b);
  return s.replace(WORDS_RE, (w) => GLOSS_WORDS[w]);
}
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
