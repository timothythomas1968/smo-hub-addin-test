// Read .xlsx files in the browser with no libraries: a small ZIP reader, the browser's own
// DecompressionStream for the compressed parts, and DOMParser for the XML.
// Used by "Import reports": the SMO picks several returned workstream report files at once.
// window.XlsxRead.open(File|ArrayBuffer) -> { sheets: [names], cell(sheet, 'C4') -> value }
// window.XlsxRead.report(book) -> the workstream report in plain fields, with warnings.
(function () {
  'use strict';

  async function inflate(bytes) {
    if (typeof DecompressionStream !== 'function') throw new Error('this version of Office cannot unzip files (DecompressionStream missing)');
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }

  /** The files inside a ZIP: name -> async () => Uint8Array. */
  function unzip(buf) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    // An encrypted Office file (password, or a sensitivity label with encryption) is an OLE container, not a ZIP.
    if (u8.length > 8 && u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0) {
      const e = new Error('this file is encrypted (a sensitivity label or a password). Open it in Excel and import it from there, or ask for a copy without encryption');
      e.encrypted = true; throw e;
    }
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('not an .xlsx file (no ZIP directory found)');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {}, dec = new TextDecoder();
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('damaged ZIP directory');
      const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      files[name] = async () => {
        const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
        const data = u8.subarray(start, start + csize);
        if (method === 0) return data;
        if (method === 8) return inflate(data);
        throw new Error('unsupported compression in ' + name);
      };
      p += 46 + nlen + xlen + clen;
    }
    return files;
  }

  const xml = async (files, name) => {
    if (!files[name]) return null;
    return new DOMParser().parseFromString(new TextDecoder().decode(await files[name]()), 'application/xml');
  };
  const kids = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));

  async function open(src) {
    const buf = src instanceof ArrayBuffer ? src : await src.arrayBuffer();
    const files = unzip(buf);
    const wb = await xml(files, 'xl/workbook.xml');
    if (!wb) throw new Error('not an Excel workbook');
    const rels = await xml(files, 'xl/_rels/workbook.xml.rels');
    const target = {};
    kids(rels, 'Relationship').forEach((r) => { target[r.getAttribute('Id')] = r.getAttribute('Target').replace(/^\/?xl\//, '').replace(/^\//, ''); });
    const sheets = {};
    kids(wb, 'sheet').forEach((s) => { sheets[s.getAttribute('name')] = 'xl/' + target[s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') || s.getAttribute('r:id')]; });
    const sst = await xml(files, 'xl/sharedStrings.xml');
    const strings = sst ? kids(sst, 'si').map((si) => kids(si, 't').map((t) => t.textContent).join('')) : [];
    const cache = {};
    async function grid(name) {
      if (cache[name]) return cache[name];
      const doc = await xml(files, sheets[name]);
      if (!doc) throw new Error('sheet not found: ' + name);
      const g = {};
      kids(doc, 'c').forEach((c) => {
        const t = c.getAttribute('t'), v = kids(c, 'v')[0];
        let val = '';
        if (t === 's') val = strings[Number(v && v.textContent)] || '';
        else if (t === 'inlineStr') val = kids(c, 't').map((x) => x.textContent).join('');
        else if (t === 'str' || t === 'e') val = v ? v.textContent : '';
        else if (t === 'b') val = v && v.textContent === '1';
        else if (v) val = Number(v.textContent);
        g[c.getAttribute('r')] = val;
      });
      return (cache[name] = g);
    }
    return { sheets: Object.keys(sheets), async cell(sheet, addr) { return (await grid(sheet))[addr] ?? ''; }, grid };
  }

  const serialToIso = (n) => (typeof n === 'number' && n > 20000 ? new Date(Date.UTC(1899, 11, 30) + n * 864e5).toISOString().slice(0, 10) : '');

  /** The standalone workstream report file (builder wr_file_part.py), read from its input cells. */
  async function report(book) {
    const sh = book.sheets.find((s) => /^Report$/i.test(s));
    if (!sh) throw new Error('not a workstream report file (no Report sheet)');
    const g = await book.grid(sh);
    const v = (a) => (g[a] == null ? '' : g[a]);
    const txt = (a) => String(v(a)).trim();
    const names = {};
    for (let r = 1; r <= 40; r++) if (v('AD' + r)) names[txt('AD' + r)] = txt('AE' + r);
    const warn = [];
    const wsName = txt('C4'), ws = names[wsName] || (Object.values(names).includes(wsName) ? wsName : '');
    if (!ws) warn.push('no workstream picked in C4');
    const month = serialToIso(v('C5'));
    if (!month) warn.push('no month in C5');
    const rag = txt('C13');
    if (!['Green', 'Amber', 'Red'].includes(rag)) warn.push('overall RAG missing');
    const rows = (from, to, keys) => {
      const out = [];
      for (let r = from; r <= to; r++) {
        const o = {}; let any = false;
        keys.forEach((k, j) => { const c = 'BCDEFGHI'[j] + r; let x = v(c); if (/date|by$/i.test(k) && typeof x === 'number') x = serialToIso(x); o[k] = typeof x === 'string' ? x.trim() : x; if (x !== '' && x != null) any = true; });
        if (any) out.push(o);
      }
      return out;
    };
    return {
      ws, wsName, month, rag, trend: txt('F13'),
      summary: txt('C14'), achievements: txt('C15'), next: txt('C16'), path: txt('C17'), help: txt('C18'),
      risks: rows(22, 26, ['title', 'description', 'tsa', 'likelihood', 'impact', 'owner', 'mitigation', 'status']),
      issues: rows(30, 34, ['title', 'description', 'tsa', 'priority', 'dueDate', 'owner', 'otherParty', 'status']),
      decisions: rows(38, 40, ['title', 'context', 'tsa', 'neededBy', 'decidedBy', 'owner', 'decision', 'status']),
      warnings: warn
    };
  }

  /** Read several files at once; one bad file never stops the others. */
  async function importReports(fileList) {
    const out = [];
    for (const f of Array.from(fileList)) {
      const t0 = performance.now();
      try { out.push({ file: f.name, ok: true, report: await report(await open(f)), ms: Math.round(performance.now() - t0) }); }
      catch (e) { out.push({ file: f.name, ok: false, error: String(e.message || e), ms: Math.round(performance.now() - t0) }); }
    }
    return out;
  }

  window.XlsxRead = { open, report, importReports, unzip };
})();
