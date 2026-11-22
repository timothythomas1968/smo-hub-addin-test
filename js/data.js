// Data layer. The workbook is the database: every screen reads Excel tables and named cells,
// and every edit is written straight back to the cell it came from.
// Two sources share one interface:
//   ExcelSource   - inside Excel, through Office.js
//   PreviewSource - in a plain browser, from a snapshot of the demo workbook (edits kept in memory only)
// The screens always use the UK column names from schema.json. In a US workbook a few names are spelt
// the US way (e.g. "Organization"), so need() also files each column under its UK name.
import { ed, isUS, setTeam, setCycle } from './util.js?v=0.12.8.20261122225802';

const SCALAR_NAMES = ['Today', 'RepFreq', 'RepDay', 'PlanXWS', 'PlanMSCR', 'RevPt1', 'RevPt2', 'RevPt3', 'RevPt4',
  // this month's workflow ticks, shared with Home on the sheet (workbook v0.11)
  'QDone', 'QReq',   // set-up progress, the same cells Start Here shows
  'WF_Mark', 'WF_ToDo', 'WF_cal', 'WF_start', 'WF_cost', 'WF_inv', 'WF_ourinv', 'WF_cons', 'WF_pack', 'ConsentCap', 'TPC_OurTotal', 'ProgName', 'TeamName', 'TeamShort', 'BuyerName', 'SellerName', 'Perspective', 'HubOwner', 'SignDate', 'CloseDate', 'RepCcy', 'CcySym', 'Edition',
  'RD', 'RP', 'LongStop', 'FEE_Start', 'MkPct1', 'MkCum1', 'InvC2S', 'InvC2B', 'PayTerms', 'DQ_Errors', 'DQ_Warnings', 'FeeCap', 'FEE_FwdFcTot', 'FEE_FwdActTot', 'FEE_Headroom', 'Use_D1', 'Use_F100', 'Use_XR', 'Use_OBL', 'Use_SP', 'Use_TPC', 'Use_DR', 'Use_WO', 'Use_INV', 'Use_SLA', 'Use_REG', 'Use_CL', 'Mod_CR', 'SpanEnd', 'SpanMonths', 'WR_Period'];
const LIST_NAMES = ['WS_Code', 'WS_Name', 'WS_Active', 'L_People', 'TSA_ID', 'WRS_WS', 'WRS_Sum', 'TSA_NoTax', 'DCR_Key', 'DCR_Rule', 'MV_Forum', 'MV_From', 'MV_To'];
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
      // only a Hub with the v0.11 tab layout (it has a Contents sheet) is tidied: in an older Hub "Calendar" is the hidden event list
      if (!sheets.items.some((w) => w.name === 'Contents')) return;
      const want = (w) => !never.includes(w.name) && (!show || show.has(w.name));
      // show first, then hide, so the workbook always has a visible sheet; the active one is never hidden
      sheets.items.forEach((w) => { if (w.visibility !== 'VeryHidden' && want(w) && w.visibility !== 'Visible') w.visibility = Excel.SheetVisibility.visible; });
      await ctx.sync();
      sheets.items.forEach((w) => { if (w.visibility !== 'VeryHidden' && !want(w) && w.name !== active.name && w.visibility === 'Visible') w.visibility = Excel.SheetVisibility.hidden; });
      await ctx.sync();
    });
  }

  /** The months after the programme's span (Tim, 20 Nov 2026): hide the columns whose month header (in each named header row) is after `end`,
   *  and show the rest. A protected sheet that refuses is left as it is: the workbook greys those months anyway. */
  async hideMonthsAfter(names, end) {
    if (!end) return;
    for (const nm of names) {
      try {
        await Excel.run(async (ctx) => {
          const it = ctx.workbook.names.getItemOrNullObject(nm); await ctx.sync();
          if (it.isNullObject) return;
          const r = it.getRange(); r.load('values'); await ctx.sync();
          (r.values[0] || []).forEach((v, i) => { r.getColumn(i).columnHidden = typeof v === 'number' && v > end; });
          await ctx.sync();
        });
      } catch (e) { console.warn('hide months', nm, e); }
    }
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
    const p = this.snap.tables.tblPeople;   // in the workbook L_People is the People sheet's Name column: follow edits made in the preview
    if (p && p.full && 'L_People' in out) { const c = p.headers.indexOf('Name'); out.L_People = p.full.map((r) => r.v[c]).filter((v) => v !== ''); }
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

/** The Connected level (build waves P8): the same screens on the snapshot the Hub publishes to the programme's SharePoint site
 *  ("TransitionSuite published"), read live after sign-in and never kept on the web host. It reads like PreviewSource. It writes
 *  nothing back to the Hub: a change request saved by the screens (a row added to TSA Changes) becomes one item on the
 *  "TransitionSuite submissions" list, which the programme office takes in from the panel. Reports are sent by sendReport().
 *  `client` is the Graph client (graph.js) or, for tests and demos, any object with listAdd(list, title, payload). */
export class GraphSource extends PreviewSource {
  constructor(snapshot, client, who) { super(snapshot); this.kind = 'graph'; this.client = client; this.who = who || ''; this.sent = []; }
  async submit(kind, title, body) {
    const payload = JSON.stringify(Object.assign({ kind, v: 1, by: this.who, at: new Date().toISOString(), hub: this.snap.file || '' }, body));
    await this.client.listAdd('TransitionSuite submissions', title, payload);
    this.sent.push({ kind, title, payload });
  }
  async write(name, row, writes) {
    if (name === 'tblChangeLog') return;   // the Hub keeps its own change log when the request is taken in
    if (name !== 'tblChange') throw new Error('Read-only here: changes are made in the Hub. Use Request a change, or send your report.');
    const t = this.snap.tables[name];
    const record = {};
    for (const w of writes) record[t.headers[w.col]] = w.value;
    await super.write(name, row, writes);   // so the screen shows it straight away
    await this.submit('cr', `change request ${record['Request type'] || ''} ${record['TSA ID'] || record['Item ID'] || ''}`.trim(), { record });
  }
  async writeCells() { throw new Error('Read-only here: changes are made in the Hub.'); }
  async writeNames() { throw new Error('Read-only here: changes are made in the Hub.'); }
  async writeNameItem() { throw new Error('Read-only here: changes are made in the Hub.'); }
}

export class Store {
  constructor(source, schema) {
    this.src = source; this.schema = schema; this.t = {}; this.stale = new Set(); this.names = {};
  }

  async init() {
    await this.reloadNames();
    this.file = await this.src.fileName();
    if (this.schema.tblPeople) await this.need(['tblPeople']);   // for "Name (role)" in every people dropdown
    await this.need(['tblSettings']).catch(() => {});             // the panel's settings, kept in the workbook (Lists, Panel settings)
    this.installSettings();
  }

  /** The panel's settings live in the workbook (v0.11 item 5; build waves P5): the Panel settings table on the Lists sheet, so they
   *  travel with the file and show in Excel's change history. A workbook without that table (before v0.12.4) keeps using Office's
   *  document settings, and a setting not yet in the table is read from there too, so nothing is lost when a Hub is upgraded.
   *  The logo stays in the document settings: a picture is too large for a cell. */
  installSettings() {
    if (this.settingsInstalled) return;
    this.settingsInstalled = true;
    const src = this.src, get0 = src.getSetting.bind(src), set0 = src.setSetting.bind(src), store = this;
    const inCells = (k) => k !== 'logo' && !String(k).startsWith('Office.');
    const row = (k) => { const t = store.t.tblSettings; return t ? t.rows.find((x) => String(x.v[t.idx.Setting] ?? '') === k) : null; };
    src.getSetting = (k) => {
      const t = store.t.tblSettings, r = inCells(k) ? row(k) : null;
      if (r) { const v = r.v[t.idx.Value]; if (v !== '' && v != null) { try { return JSON.parse(v); } catch (e) { return v; } } }
      return get0(k);
    };
    src.setSetting = async (k, v) => {
      await set0(k, v);
      const t = store.t.tblSettings;
      if (!t || !inCells(k)) return;
      const text = v == null ? '' : JSON.stringify(v);
      if (text.length > 32000) return;   // longer than a cell holds: the document setting keeps it
      try { const r = row(k); if (r) await store.save('tblSettings', r.i, { Value: text }, { force: true }); else if (text) await store.add('tblSettings', { Setting: k, Value: text }); }
      catch (e) { console.warn('panel setting', k, e); }
    };
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
    setTeam(this.names); setCycle(this.names);
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
    const logged = this.logEntries(name, rowIndex, writes);
    this.lastWrite = Date.now();
    await this.src.write(name, rowIndex, writes, opts.unhide);
    this.lastWrite = Date.now();
    await this.writeLog(logged);
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

  /** Several rows at once (People: Paste from Excel). list: [{i, changes}], i null for a new record in the next empty row.
   *  Writes every row, then re-reads once. Returns {added, updated}. */
  async saveMany(name, list) {
    const t = this.t[name];
    const key = t.live != null ? t.live : 0;
    const taken = new Set(list.map((x) => x.i).filter((x) => x != null));
    const free = t.rows.filter((r) => (r.v[key] === '' || r.v[key] == null) && !taken.has(r.i)).map((r) => r.i);
    let added = 0, updated = 0;
    this.lastWrite = Date.now();
    for (const { i, changes } of list) {
      const isNew = i == null, row = isNew ? free.shift() : i;
      if (row == null) throw new Error('This register is full. Ask the Hub owner to extend it.');
      const writes = [];
      for (const [hd, val] of Object.entries(changes)) {
        const col = t.idx[hd];
        if (col == null || (t.cols[hd] && t.cols[hd].t === 'C') || (isNew && (val === '' || val == null))) continue;
        if (!isNew && String(t.rows[row].v[col]) === String(val)) continue;
        writes.push({ col, value: val });
      }
      if (!writes.length) continue;
      const logged = this.logEntries(name, row, writes);
      await this.src.write(name, row, writes, isNew);
      await this.writeLog(logged);
      this.lastWrite = Date.now();
      if (isNew) added++; else updated++;
    }
    Object.keys(this.t).forEach((n) => this.stale.add(n));
    await this.need([name]);
    await this.reloadNames();
    return { added, updated };
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
    const logged = this.logEntries(name, rowIndex, writes);
    this.lastWrite = Date.now();
    await this.src.write(name, rowIndex, writes);
    this.lastWrite = Date.now();
    await this.writeLog(logged);
    Object.keys(this.t).forEach((n) => this.stale.add(n));
    await this.need([name]);
    await this.reloadNames();
    return writes.length;
  }

  // ---------- audit trail (Stage 3b; build waves P6): every change the panel saves is added to the Change Log sheet (tblChangeLog):
  // when, who, where, item, field, old value, new value. Typed changes in the sheets are not seen here (Excel's Show Changes has those).
  /** Who is signed in to Office, where Office says (Microsoft 365 accounts); '' if it doesn't. Asked once. */
  async who() {
    if (this._who != null) return this._who;
    this._who = '';
    try {
      if (window.Office && Office.auth && Office.auth.getAuthContext) {
        const c = await Promise.race([Office.auth.getAuthContext(), new Promise((_, no) => setTimeout(() => no(new Error('no answer')), 2500))]);
        this._who = (c && (c.userPrincipalName || c.displayName)) || '';
      } else if (!(this.src instanceof ExcelSource)) this._who = 'Browser preview';
    } catch (e) { /* not offered */ }
    return this._who;
  }
  /** The log rows for a set of writes to a table, made before the write so the old values are known. */
  logEntries(name, rowIndex, writes) {
    if (name === 'tblChangeLog') return [];
    const t = this.t[name]; if (!t) return [];
    const r = t.rows[rowIndex]; if (!r) return [];
    const live = t.live != null ? t.live : 0, short = (v) => { const x = v == null ? '' : String(v); return x.length > 500 ? x.slice(0, 497) + '…' : x; };
    const item = String(r.v[live] ?? '') || writes.map((w) => (w.col === live ? w.value : null)).find((v) => v != null && v !== '') || `row ${rowIndex + 1}`;
    return writes.map((w) => ({ where: name.replace(/^tbl/, ''), item: short(item), field: t.headers[w.col], from: short(r.v[w.col]), to: short(w.value) }))
      .filter((e) => e.from !== e.to);
  }
  /** Add log rows to the Change Log (the first empty rows). A Hub before 0.12.5 has no log: nothing is written. */
  async writeLog(entries, where) {
    if (!entries || !entries.length) return;
    try {
      // read once, then kept up to date here (only the panel writes the log), so a save doesn't re-read 3,000 rows
      if (!this.t.tblChangeLog) await this.need(['tblChangeLog']).catch(() => {});
      this.stale.delete('tblChangeLog');
      const t = this.t.tblChangeLog; if (!t) return;
      const who = await this.who(), when = Math.round((Date.now() / 864e5 + 25569) * 1e5) / 1e5;   // Excel serial date and time, in UTC
      for (const e of entries) {
        const r = t.rows.find((x) => x.v[0] === '' || x.v[0] == null);
        if (!r) { if (!this._logFull) { this._logFull = true; console.warn('The change log is full.'); } return; }
        const vals = [when, who, e.where || where || '', e.item, e.field, e.from, e.to];
        await this.src.write('tblChangeLog', r.i, vals.map((value, col) => ({ col, value })), true);
        r.v = vals;
      }
    } catch (err) { console.warn('change log', err); }
  }

  /** Write item i of a one-column named range (WS_Active: which workstreams are in use, on Start Here since v0.11). */
  async writeNameItem(name, i, value) {
    this.lastWrite = Date.now();
    const was = Array.isArray(this.names[name]) ? this.names[name][i] : '';
    await this.src.writeNameItem(name, i, value);
    if (String(was ?? '') !== String(value ?? '')) await this.writeLog([{ where: 'Set-up answers', item: `${name} ${i + 1}`, field: name, from: String(was ?? ''), to: String(value ?? '') }]);
    this.lastWrite = Date.now();
    Object.keys(this.t).forEach((n) => this.stale.add(n));
    await this.reloadNames();
  }

  show(name, row) { return this.src.show(name, row); }

  readRange(sheet, addr) { return this.src.readRange(sheet, addr); }
  readNamesNow(list) { return this.src.readNames(list); }
  async writeNames(pairs) {
    this.lastWrite = Date.now();
    const before = pairs.map(([n]) => this.names[n]);
    await this.src.writeNames(pairs);
    this.lastWrite = Date.now();
    await this.writeLog(pairs.map(([n, v], k) => ({ where: 'Set-up answers', item: n, field: n, from: String(before[k] ?? ''), to: String(v ?? '') })).filter((e) => e.from !== e.to));
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
    await this.writeLog(cells.map((c) => ({ where: sheet, item: c.addr, field: 'Cell ' + c.addr, from: '', to: String(c.value ?? '').slice(0, 500) })));
    this.lastWrite = Date.now();
    Object.keys(this.t).forEach((n) => this.stale.add(n));   // formulas elsewhere depend on these cells
    await this.reloadNames();
  }
  showRange(sheet, addr) { return this.src.showRange(sheet, addr); }
}
