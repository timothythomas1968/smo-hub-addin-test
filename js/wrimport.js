// Import reports (Levels 1 and 2; build waves P8): the leads' standalone workstream report files, read in the browser with
// xlsxread.js (nothing leaves the computer) and written into each workstream's paste area on Workstream Reports, exactly as
// the Level 1 copy-and-paste route does. The section's suggestions then read the pasted report, so the RAG, trend, words and
// new risks, issues and decisions appear as they would after a paste. Several files can be picked at once.
// The cells read are the report file's Export block A3:H30 (workbook/builder/wr_file_part.py); the paste area is L:S of each
// section, from row s+5 (wr_part.py PASTE_OFF = 10). Keep the three in step.
import { h, toast, plural, fmtMonth, theTeam } from './util.js?v=0.12.7.20261121230531';
import { open as openBook } from './xlsxread.js?v=0.12.7.20261121230531';

const SHEET = 'Workstream Reports';
const SEC0 = 9, SECH = 35, ROWS = 28, COLS = 'ABCDEFGH';
const CR_MARK = 'TransitionSuite change request';

/** Read one report file. Returns {code, month, block} or {error}. */
export async function readReport(file) {
  if (!/\.xlsx$/i.test(file.name)) return { error: 'not an .xlsx file' };
  let book;
  try { book = await openBook(file); } catch (e) { return { error: e.message || String(e) }; }
  const sheet = book.sheets.find((s) => s === 'Export');
  if (!sheet) return { error: 'not a TransitionSuite workstream report (it has no Export sheet)' };
  if (String(await book.cell(sheet, 'B10')).startsWith(CR_MARK)) return { error: 'this is a change request form: use Import change requests on TSA changes' };
  const g = await book.grid(sheet);
  const block = [];
  for (let i = 0; i < ROWS; i++) block.push([...COLS].map((c) => { const v = g[c + (3 + i)]; return v === undefined || v === false ? '' : v; }));
  const code = String(block[0][0] || '').trim();
  if (!code) {
    const any = block.some((r) => r.some((v) => String(v).trim()));
    return { error: any ? 'the workstream is not filled in on the report' : 'the file has no saved values. Ask the lead to open it in Excel, fill it in and save it, then import it again' };
  }
  return { code, month: Number(block[0][2]) || 0, block };
}

/** Write a report block (28 x 8) into its workstream's paste area. Returns the section's first row, or throws. */
export async function writeBlock(store, code, block) {
  const codes = (store.names.WS_Code || []).map(String);
  const k = codes.indexOf(String(code)) + 1;
  if (!k) throw new Error(`workstream ${code} is not one of the Hub's workstreams`);
  const s = SEC0 + SECH * (k - 1), cells = [];
  block.forEach((row, i) => row.forEach((v, j) => cells.push({ addr: `${'LMNOPQRS'[j]}${s + 5 + i}`, value: v == null ? '' : v })));
  await store.writeCells(SHEET, cells);
  if (store.names.WR_Period !== undefined && Number(store.names.WR_Period) !== Number(store.names.RD)) await store.writeNames([['WR_Period', Number(store.names.RD)]]);
  return s;
}

export function openReportImport(ctx, onDone) {
  const { store } = ctx;
  document.querySelector('.modal-back')?.remove();
  const n = store.names;
  const codes = (n.WS_Code || []).map(String);
  const input = h('input', { type: 'file', accept: '.xlsx', multiple: true, 'aria-label': 'Workstream report files' });
  const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '48vh', overflowY: 'auto' } });
  const go = h('button.btn.btn-primary', { type: 'button', disabled: true }, 'Bring them in');
  let ready = [];
  input.addEventListener('change', async () => {
    list.replaceChildren(h('p.small.muted', 'Reading…'));
    const out = [], seen = {};
    ready = [];
    let pasted = [];
    try { pasted = await store.readRange(SHEET, `L${SEC0}:L${SEC0 + SECH * Math.max(codes.length, 1)}`); } catch (e) { pasted = []; }
    for (const f of input.files) {
      const r = await readReport(f);
      if (r.error) { out.push(h('div.banner.warn', { style: { margin: 0 } }, h('b', f.name + ': '), r.error + '.')); continue; }
      const k = codes.indexOf(r.code) + 1;
      if (!k) { out.push(h('div.banner.warn', { style: { margin: 0 } }, h('b', f.name + ': '), `it is for workstream ${r.code}, which is not one of the Hub's workstreams. Add it on Start Here (Your workstreams) first.`)); continue; }
      const s = SEC0 + SECH * (k - 1);
      const notes = [];
      const RD = Number(n.RD) || 0;
      if (r.month && RD && fmtMonth(r.month) !== fmtMonth(RD)) notes.push(`It is for ${fmtMonth(r.month)}, not the reporting month (${fmtMonth(RD)}).`);
      const had = pasted[s + 5 - SEC0] && String(pasted[s + 5 - SEC0][0] || '').trim();
      if (had) notes.push('It replaces the report already brought in for this workstream.');
      if (seen[r.code]) notes.push(`A second file for ${r.code}: this one is used.`);
      seen[r.code] = true;
      ready = ready.filter((x) => x.code !== r.code).concat([{ code: r.code, s, block: r.block }]);
      const rag = String(r.block[0][1] || '');
      out.push(h('div.card', { style: { padding: '10px 12px', borderLeft: `4px solid var(--${notes.length ? 'a' : 'g'}-bar)` } },
        h('div', { style: { fontWeight: 600 } }, `${r.code} · ${f.name}`),
        h('div.small.muted', `${r.month ? fmtMonth(r.month) : 'No month given'}${rag ? ' · RAG ' + rag : ''}`),
        notes.map((x) => h('div.small', { style: { color: 'var(--a-fg)' } }, x))));
    }
    list.replaceChildren(...(out.length ? out : [h('p.small.muted', 'No files picked.')]));
    go.disabled = !ready.length;
    go.textContent = ready.length ? `Bring in ${plural(ready.length, 'report')}` : 'Bring them in';
  });
  go.addEventListener('click', async () => {
    go.disabled = true;
    try {
      for (const r of ready) await writeBlock(store, r.code, r.block);
      back.remove();
      toast(`${plural(ready.length, 'report')} brought in: ${ready.map((r) => r.code).join(', ')}. New risks, issues and decisions wait in RAID for ${theTeam()} to accept.`);
      if (store.reloadNames) await store.reloadNames();
      if (onDone) onDone();
      ctx.rerender();
    } catch (e) { go.disabled = false; toast('Could not bring them in: ' + (e.message || e), true); }
  });
  const back = h('div.modal-back', { onclick: (e) => { if (e.target === back) back.remove(); } },
    h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Import reports', style: { maxWidth: '620px' } },
      h('h2', 'Import reports'),
      h('p.small.muted', 'Pick the report files the leads sent you (one per workstream; several at once is fine). Each goes into its workstream\'s section on Workstream Reports, as a paste would. The file is read here: nothing leaves this computer.'),
      input, list,
      h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' } },
        h('button.btn', { type: 'button', onclick: () => back.remove() }, 'Cancel'), go)));
  document.body.appendChild(back);
  return back;
}
