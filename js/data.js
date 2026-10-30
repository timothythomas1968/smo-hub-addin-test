// Data layer. The workbook is the database: every screen reads Excel tables and named cells,
// and every edit is written straight back to the cell it came from.
// Two sources share one interface:
//   ExcelSource   - inside Excel, through Office.js
//   PreviewSource - in a plain browser, from a snapshot of the demo workbook (edits kept in memory only)

const SCALAR_NAMES = ['ProgName', 'BuyerName', 'SellerName', 'Perspective', 'HubOwner', 'SignDate', 'CloseDate', 'RepCcy', 'CcySym', 'Edition',
  'RD', 'RP', 'LongStop', 'FEE_Start', 'InvC2S', 'InvC2B', 'PayTerms', 'DQ_Errors', 'DQ_Warnings', 'FeeCap', 'FEE_FwdFcTot', 'FEE_FwdActTot', 'FEE_Headroom', 'Use_D1', 'Use_F100', 'Use_XR', 'Use_OBL'];
const LIST_NAMES = ['WS_Code', 'WS_Name', 'WS_Active', 'L_People', 'TSA_ID'];
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
      ws.activate(); ws.getRange(addr).select();
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
  async writeCells(sheet, list) {
    this.snap.cells = this.snap.cells || {};
    const cells = this.snap.cells[sheet] = this.snap.cells[sheet] || {};
    list.forEach((c) => { cells[c.addr] = c.value; });
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
    const lists = new Set(LIST_NAMES);
    Object.values(this.schema).forEach((t) => t.cols.forEach((c) => { if (c.dv && c.dv.name) lists.add(c.dv.name); }));
    this.names = await this.src.readNames([...SCALAR_NAMES, ...lists]);
    this.file = await this.src.fileName();
  }

  /** Make sure these tables are loaded and fresh. */
  async need(names) {
    const todo = names.filter((n) => !this.t[n] || this.stale.has(n));
    if (!todo.length) return;
    const got = await this.src.readTables(todo);
    for (const [n, t] of Object.entries(got)) {
      const s = this.schema[n] || {};
      t.idx = Object.fromEntries(t.headers.map((hd, i) => [hd, i]));
      t.live = s.live && t.idx[s.live] != null ? t.idx[s.live] : null;
      t.cols = Object.fromEntries((s.cols || []).map((c) => [c.h, c]));
      this.t[n] = t; this.stale.delete(n);
    }
  }

  async refresh() {
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
    if (col.dv.list) return col.dv.list;
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
    await this.src.write(name, rowIndex, writes, opts.unhide);
    // Re-read so formulas that depend on the change (scores, ratings, IDs) come back recalculated.
    this.stale.add(name);
    Object.keys(this.t).forEach((n) => this.stale.add(n));
    await this.need([name]);
    return writes.length;
  }

  /** Add a record in the first empty row of the table. Returns the row index. */
  async add(name, values) {
    const t = this.t[name];
    const empty = t.rows.find((r) => r.v[t.live] === '');
    if (!empty) throw new Error('This register is full. Ask the Hub owner to extend it.');
    const vals = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== '' && v != null));
    await this.save(name, empty.i, vals, { unhide: true, force: true });
    return empty.i;
  }

  show(name, row) { return this.src.show(name, row); }

  readRange(sheet, addr) { return this.src.readRange(sheet, addr); }
  async writeCells(sheet, cells) {
    await this.src.writeCells(sheet, cells);
    Object.keys(this.t).forEach((n) => this.stale.add(n));   // formulas elsewhere depend on these cells
  }
  showRange(sheet, addr) { return this.src.showRange(sheet, addr); }
}
