// Data layer. The workbook is the database: every screen reads Excel tables and named cells,
// and every edit is written straight back to the cell it came from.
// Two sources share one interface:
//   ExcelSource   - inside Excel, through Office.js
//   PreviewSource - in a plain browser, from a snapshot of the demo workbook (edits kept in memory only)
// The screens always use the UK column names from schema.json. In a US workbook a few names are spelt
// the US way (e.g. "Organization"), so need() also files each column under its UK name.
import { ed, isUS, setTeam } from './util.js?v=0.11.0.20261112200344';

const SCALAR_NAMES = ['Today', 'RevPt1', 'RevPt2', 'RevPt3', 'RevPt4',
  // this month's workflow ticks, shared with Home on the sheet (workbook v0.11)
  'QDone', 'QReq',   // set-up progress, the same cells Start Here shows
  'WF_Mark', 'WF_ToDo', 'WF_cal', 'WF_start', 'WF_cost', 'WF_inv', 'WF_ourinv', 'WF_cons', 'WF_pack', 'ConsentCap', 'TPC_OurTotal', 'ProgName', 'TeamName', 'TeamShort', 'BuyerName', 'SellerName', 'Perspective', 'HubOwner', 'SignDate', 'CloseDate', 'RepCcy', 'CcySym', 'Edition',
  'RD', 'RP', 'LongStop', 'FEE_Start', 'MkPct1', 'MkCum1', 'InvC2S', 'InvC2B', 'PayTerms', 'DQ_Errors', 'DQ_Warnings', 'FeeCap', 'FEE_FwdFcTot', 'FEE_FwdActTot', 'FEE_Headroom', 'Use_D1', 'Use_F100', 'Use_XR', 'Use_OBL', 'Use_SP', 'Use_TPC', 'Use_DR', 'Use_WO', 'Use_INV', 'Use_SLA', 'Use_REG', 'Use_CL', 'Mod_CR'];
const LIST_NAMES = ['WS_Code', 'WS_Name', 'WS_Active', 'L_People', 'TSA_ID', 'WRS_WS', 'WRS_Sum', 'TSA_NoTax'];
// Columns that have no dropdown in the workbook but are easier to fill from a list.
const FALLBACK_LISTS = { Workstream: 'WS_Code', Owner: 'L_People', 'TSA ID': 'TSA_ID' };

export function colNum(L) { let n = 0; for (const ch of L) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
export function colName(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

export class ExcelSource {
  constructor() { this.kind = 'excel'; }

  async fileName() {
    try {
      const url = Office.context.document.url || '';
      return decodeURIComponent(url.split(/[\\/]/).pop() || '') || 'this workbook';
    } catch (e) { return 'this workbook'; }
  }

  async readNames(wanted) {
    return Excel.run(async (ctx) => {
      const coll = ctx.workbook.names.load('items/name,items/type');
      await ctx.sync();
      const have = new Set(coll.items.filter((n) => n.type === 'Range').map((n) => n.name));
      const reqs = wanted.filter((n) => have.has(n)).map((n) => ({ n, r: ctx.workbook.names.getItem(n).getRange().load('values') }));
      await ctx.sync();
      const out = {};
      for (const { n, r } of reqs) {
        const v = r.values;
        out[n] = (v.length === 1 && v[0].length === 1) ? v[0][0] : v.map((row) => row[0]);
      }
      return out;
    });
  }

  async readTables(names) {
    return Excel.run(async (ctx) => {
      const coll = ctx.workbook.tables.load('items/name');
      await ctx.sync();
      const have = new Set(coll.items.map((t) => t.name));
      const reqs = names.filter((n) => have.has(n)).map((n) => {
        const t = ctx.workbook.tables.getItem(n);
        return { n, hr: t.getHeaderRowRange().load('values'), body: t.getDataBodyRange().load('values,formulas'), ws: t.worksheet.load('name') };
      });
      await ctx.sync();
      const out = {};
      for (const { n, hr, body, ws } of reqs) {
        out[n] = {
          sheet: ws.name, headers: hr.values[0].map(String),
          rows: body.values.map((v, i) => ({ i, v, f: body.formulas[i].map((x) => typeof x === 'string' && x.startsWith('=')) }))
        };
      }
      return out;
    });
  }

  /** writes: [{col, value}] into data-body row `row` of table `name`. */
  async write(name, row, writes, unhide) {
    return Excel.run(async (ctx) => {
      const body = ctx.workbook.tables.getItem(name).getDataBodyRange();
      for (const w of writes) body.getCell(row, w.col).values = [[w.value]];
      await ctx.sync();
      if (unhide) {
        try { body.getRow(row).rowHidden = false; await ctx.sync(); } catch (e) { /* protected sheet: leave hidden */ }
      }
    });
  }

  /** Values of a plain range, e.g. readRange('Readiness Interview', 'B22:I37'). */
  async readRange(sheet, addr) {
    return Excel.run(async (ctx) => {
      const r = ctx.workbook.worksheets.getItem(sheet).getRange(addr).load('values');
      await ctx.sync();
      return r.values;
    });
  }

  async writeNames(pairs) {
    return Excel.run(async (ctx) => {
      for (const [n, v] of pairs) ctx.workbook.names.getItem(n).getRange().values = [[v]];
      await ctx.sync();
    });
  }

  /** Write item i (0-based) of a one-column named range, e.g. WS_Active. */
  async writeNameItem(name, i, value) {
    return Excel.run(async (ctx) => {
      ctx.workbook.names.getItem(name).getRange().getCell(i, 0).values = [[value]];
      await ctx.sync();
    });
  }

  /** cells: [{addr, value}] on one sheet. */
  async writeCells(sheet, cells) {
    return Excel.run(async (ctx) => {
      const ws = ctx.workbook.worksheets.getItem(sheet);
      for (const c of cells) ws.getRange(c.addr).values = [[c.value]];
      await ctx.sync();
    });
  }

  async showRange(sheet, addr) {
    return Excel.run(async (ctx) => {
      const ws = ctx.workbook.worksheets.getItem(sheet);
      ws.visibility = Excel.SheetVisibility.visible;   // a sheet the panel tidied away comes back when it is opened (tabs.js)
      ws.activate(); ws.getRange(addr).select();
      await ctx.sync();
    });
  }

  /** Tidy tabs (tabs.js): show the sheets in `show` (all when null), hide the rest except very hidden ones; `never` stay hidden. */
  async setVisibleSheets(show, never = []) {
    return Excel.run(async (ctx) => {
      const sheets = ctx.workbook.worksheets; sheets.load('items/name,items/visibility');
      const active = sheets.getActiveWorksheet(); active.load('name');
      await ctx.sync();
      const want = (w) => !never.includes(w.name) && (!show || show.has(w.name));
      // show first, then hide, so the workbook always has a visible sheet; the active one is never hidden
      sheets.items.forEach((w) => { if (w.visibility !== 'VeryHidden' && want(w) && w.visibility !== 'Visible') w.visibility = Excel.SheetVisibility.visible; });
      await ctx.sync();
      sheets.items.forEach((w) => { if (w.visibility !== 'VeryHidden' && !want(w) && w.name !== active.name && w.visibility === 'Visible') w.visibility = Excel.SheetVisibility.hidden; });
      await ctx.sync();
    });
  }

  getSetting(k) { try { return Office.context.document.settings.get(k); } catch (e) { return null; } }
  setSetting(k, v) {
    // Office document settings are saved inside the workbook, so ticks travel with the file.
    return new Promise((res) => { try { Office.context.document.settings.set(k, v); Office.context.document.settings.saveAsync(() => res()); } catch (e) { res(); } });
  }

  async show(name, row) {
    return Excel.run(async (ctx) => {
      const t = ctx.workbook.tables.getItem(name);
      t.worksheet.visibility = Excel.SheetVisibility.visible;
      t.worksheet.activate();
      (row == null ? t.getHeaderRowRange() : t.getDataBodyRange().getRow(row)).select();
      await ctx.sync();
    });
  }
}

export class PreviewSource {
  constructor(snapshot) { this.kind = 'preview'; this.snap = snapshot; }
  async fileName() { return this.snap.file; }
  async readNames(wanted) {
    const out = {};
    wanted.forEach((n) => { if (n in this.snap.names) out[n] = this.snap.names[n]; });
    return out;
  }
  async readTables(names) {
    const out = {};
    for (const n of names) {
      const t = this.snap.tables[n];
      if (!t) continue;
      if (!t.full) {           // expand the sparse snapshot to the table's real size once
        const blank = () => t.headers.map(() => '');
        const rows = Array.from({ length: t.size }, (_, i) => ({ i, v: blank(), f: t.headers.map(() => false) }));
        t.rows.forEach((r) => { rows[r.i] = { i: r.i, v: r.v.slice(), f: [...r.f].map((c) => c === '1') }; });
        t.full = rows;
      }
      out[n] = { sheet: t.sheet, headers: t.headers, rows: t.full.map((r) => ({ i: r.i, v: r.v.slice(), f: r.f.slice() })) };
    }
    return out;
  }
  async write(name, row, writes) {
    const r = this.snap.tables[name].full[row];
    for (const w of writes) { r.v[w.col] = w.value; r.f[w.col] = false; }
  }
  async readRange(sheet, addr) {
    const cells = (this.snap.cells || {})[sheet] || {};
    const [a, b] = addr.split(':');
    const p = (x) => { const m = /^([A-Z]+)(\d+)$/.exec(x); return [colNum(m[1]), Number(m[2])]; };
    const [c1, r1] = p(a), [c2, r2] = p(b || a);
    const out = [];
    for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) { const v = cells[colName(c) + r]; row.push(v == null ? '' : v); } out.push(row); }
    return out;
  }
  async writeNames(pairs) { pairs.forEach(([n, v]) => { this.snap.names[n] = v; }); }
  async writeNameItem(name, i, value) {
    const arr = this.snap.names[name] = [...(this.snap.names[name] || [])]; arr[i] = value;
    if (name === 'WS_Active') {   // the Lists table shows the answer: keep the preview's copy in step
      const t = this.snap.tables.tblWorkstreams, c = t && t.headers.indexOf('Active (Y/N)');
      if (t && c >= 0 && t.full && t.full[i]) t.full[i].v[c] = value;
    }
  }
  async writeCells(sheet, list) {
    this.snap.cells = this.snap.cells || {};
    const cells = this.snap.cells[sheet] = this.snap.cells[sheet] || {};
    list.forEach((c) => { cells[c.addr] = c.value; });
    // Named cells the screens write directly (in Excel the name follows the cell by itself).
    const named = { 'Consolidated WS Reporting!B5': 'RD', 'Home!L1': 'RD' };
    list.forEach((c) => { const n = named[sheet + '!' + c.addr]; if (n) this.snap.names[n] = c.value; });
  }
  async showRange() { throw new Error('Preview only: open the add-in in Excel to jump to the worksheet.'); }
  getSetting(k) { try { return JSON.parse(localStorage.getItem('smohub.' + k)); } catch (e) { return null; } }
  async setSetting(k, v) { try { localStorage.setItem('smohub.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  async show() { throw new Error('Preview only: open the add-in in Excel to jump to the worksheet.'); }
}

export class Store {
  constructor(source, schema) {
    this.src = source; this.schema = schema; this.t = {}; this.stale = new Set(); this.names = {};
  }

  async init() {
    await this.reloadNames();
    this.file = await this.src.fileName();
    if (this.schema.tblPeople) await this.need(['tblPeople']);   // for "Name (role)" in every people dropdown
  }

  /** "Workstream lead, CON" for a person on the People sheet, or '' if not found. */
  roleOf(name) {
    const t = this.t.tblPeople;
    if (!t || !name) return '';
    const r = t.rows.find((x) => x.v[t.idx.Name] === name);
    if (!r) return '';
    const role = r.v[t.idx.Role] || '', ws = t.idx['Workstream code'] != null ? r.v[t.idx['Workstream code']] : '';
    const prog = ['Programme', 'Program', 'PRG', ''];
    return [role, prog.includes(String(ws)) ? '' : ws].filter(Boolean).join(', ');
  }

  /** Re-read the named cells and dropdown lists (people, IDs, workstreams), which change when tables change. */
  async reloadNames() {
    const lists = new Set(LIST_NAMES);
    Object.values(this.schema).forEach((t) => t.cols.forEach((c) => { if (c.dv && c.dv.name) lists.add(c.dv.name); }));
    this.names = await this.src.readNames([...SCALAR_NAMES, ...lists]);
    setTeam(this.names);
  }

  /** Make sure these tables are loaded and fresh. */
  async need(names) {
    const todo = names.filter((n) => !this.t[n] || this.stale.has(n));
    if (!todo.length) return;
    const got = await this.src.readTables(todo);
    for (const [n, t] of Object.entries(got)) {
      const s = this.schema[n] || {};
      t.idx = Object.fromEntries(t.headers.map((hd, i) => [hd, i]));
      (s.cols || []).forEach((c) => { if (t.idx[c.h] == null && t.idx[ed(c.h, true)] != null) t.idx[c.h] = t.idx[ed(c.h, true)]; });
      t.live = s.live && t.idx[s.live] != null ? t.idx[s.live] : null;
      t.cols = Object.fromEntries((s.cols || []).map((c) => [c.h, c]));
      this.t[n] = t; this.stale.delete(n);
    }
  }

  async refresh() {
    this.gen = (this.gen || 0) + 1;   // screens that cache plain-sheet ranges read them again
    Object.keys(this.t).forEach((n) => this.stale.add(n));
    this.names = {};
    await this.init();
  }

  has(name) { return !!this.t[name]; }

  /** Rows that hold a record (the column that makes a row live is filled in). Each row: {i, get(h), sugg(h)}. */
  records(name) {
    const t = this.t[name];
    if (!t) return [];
    return t.rows.filter((r) => (t.live == null ? r.v.some((x) => x !== '') : r.v[t.live] !== '')).map((r) => this.wrap(t, r));
  }

  wrap(t, r) {
    return { i: r.i, get: (hd) => (t.idx[hd] == null ? '' : r.v[t.idx[hd]]), sugg: (hd) => (t.idx[hd] == null ? false : r.f[t.idx[hd]]) };
  }

  colDef(name, header) { return (this.t[name] && this.t[name].cols[header]) || null; }

  options(col) {
    if (col && !col.dv && col.t === 'I' && FALLBACK_LISTS[col.h]) col = { ...col, dv: { name: FALLBACK_LISTS[col.h] } };
    if (!col || !col.dv) return null;
    if (col.dv.list) return isUS() ? col.dv.list.map((x) => ed(x)) : col.dv.list;
    if (col.dv.name) {
      const v = this.names[col.dv.name];
      return Array.isArray(v) ? [...new Set(v.filter((x) => x !== '' && x != null).map(String))] : null;
    }
    return null;
  }

  /** changes: {header: value}. Only cells whose value differs are written (a suggestion is overwritten only if you change it). */
  async save(name, rowIndex, changes, opts = {}) {
    const t = this.t[name];
    const writes = [];
    for (const [hd, val] of Object.entries(changes)) {
      const col = t.idx[hd];
      if (col == null) throw new Error(`Column "${hd}" not found in ${name}.`);
      const def = t.cols[hd];
      if (def && def.t === 'C') continue;   // calculated: never written
      if (String(t.rows[rowIndex].v[col]) === String(val) && !opts.force) continue;
      writes.push({ col, value: val });
    }
    if (!writes.length) return 0;
    this.lastWrite = Date.now();
    await this.src.write(name, rowIndex, writes, opts.unhide);
    this.lastWrite = Date.now();
    // Re-read so formulas that depend on the change (scores, ratings, IDs) come back recalculated.
    this.stale.add(name);
    Object.keys(this.t).forEach((n) => this.stale.add(n));
    await this.need([name]);
    await this.reloadNames();   // a new or renamed person, service or workstream must show in every dropdown at once
    return writes.length;
  }

  /** Add a record in the first empty row of the table. Returns the row index. */
  async add(name, values) {
    const t = this.t[name];
    const key = t.live != null ? t.live : 0;   // lists without a register definition (Workstreams, Currencies): the first column
    const empty = t.rows.find((r) => r.v[key] === '' || r.v[key] == null);
    if (!empty) throw new Error('This register is full. Ask the Hub owner to extend it.');
    const vals = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v != null));
    await this.save(name, empty.i, vals, { unhide: true, force: true });
    return empty.i;
  }

  /** Take a record off its register: clear every value typed on the row (calculated and suggestion formulas stay),
   *  so the row is empty again and the next Add can reuse it. */
  async clearRow(name, rowIndex) {
    const t = this.t[name], r = t.rows[rowIndex];
    const writes = [];
    t.headers.forEach((hd, col) => {
      const def = t.cols[hd];
      if (def && def.t === 'C') return;
      if (r.f[col]) return;                        // a formula: leave it
      if (r.v[col] === '' || r.v[col] == null) return;
      writes.push({ col, value: '' });
    });
    if (!writes.length) return 0;
    this.lastWrite = Date.now();
    await this.src.write(name, rowIndex, writes);
    this.lastWrite = Date.now();
    Object.keys(this.t).forEach((n) => this.stale.add(n));
    await this.need([name]);
    await this.reloadNames();
    return writes.length;
  }

  /** Write item i of a one-column named range (WS_Active: which workstreams are in use, on Start Here since v0.11). */
  async writeNameItem(name, i, value) {
    this.lastWrite = Date.now();
    await this.src.writeNameItem(name, i, value);
    this.lastWrite = Date.now();
    Object.keys(this.t).forEach((n) => this.stale.add(n));
    await this.reloadNames();
  }

  show(name, row) { return this.src.show(name, row); }

  readRange(sheet, addr) { return this.src.readRange(sheet, addr); }
  readNamesNow(list) { return this.src.readNames(list); }
  async writeNames(pairs) {
    this.lastWrite = Date.now();
    await this.src.writeNames(pairs);
    this.lastWrite = Date.now();
    pairs.forEach(([n, v]) => { this.names[n] = v; });
    Object.keys(this.t).forEach((t) => this.stale.add(t));
    if (pairs.some(([n]) => n === 'TeamName')) {   // the short form is worked out in the workbook from the answer
      if (this.src instanceof ExcelSource) await this.reloadNames();
      else { this.names.TeamShort = ''; setTeam(this.names); }
    }
  }
  async writeCells(sheet, cells) {
    this.lastWrite = Date.now();
    await this.src.writeCells(sheet, cells);
    this.lastWrite = Date.now();
    Object.keys(this.t).forEach((n) => this.stale.add(n));   // formulas elsewhere depend on these cells
    await this.reloadNames();
  }
  showRange(sheet, addr) { return this.src.showRange(sheet, addr); }
}
