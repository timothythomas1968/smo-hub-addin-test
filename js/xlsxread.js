// Read .xlsx and .csv files in the browser with no libraries (brought in from the connection proof, proof/src/xlsxread.js):
// a small ZIP reader, the browser's own DecompressionStream for the compressed parts, and DOMParser for the XML.
// Nothing leaves the computer. Used by "Import a plan" (brief 4.7) and, later, the TSA schedule import and Import reports.
// Needs DecompressionStream: Excel for Microsoft 365 on Windows and the web; on the Mac, macOS 13.3 or later.

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

export async function open(src) {
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


/** A sheet as rows of values (row 1 first), trimmed to the used range. Dates stay Excel serial numbers. */
export async function sheetRows(book, sheet) {
  const g = await book.grid(sheet);
  const rows = [];
  for (const [addr, v] of Object.entries(g)) {
    const m = /^([A-Z]+)(\d+)$/.exec(addr);
    if (!m) continue;
    let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64;
    const r = Number(m[2]) - 1;
    (rows[r] = rows[r] || [])[c - 1] = v;
  }
  return trim(Array.from(rows, (r) => Array.from(r || [], (v) => (v == null ? '' : v))));
}
const trim = (rows) => { while (rows.length && rows[rows.length - 1].every((v) => v === '')) rows.pop(); return rows; };

/** A .csv (or tab-separated) file as rows. Quotes, commas and line breaks inside quotes are handled. */
export function csvRows(text) {
  text = String(text || '').replace(/^\uFEFF/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const sep = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur.trim()); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur.trim()); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur.trim()); rows.push(row); }
  return trim(rows);
}

/** Any picked file: { sheets: [names], rows(sheet) -> rows }. A .csv has one sheet. */
export async function readFile(file) {
  if (/\.(csv|txt|tsv)$/i.test(file.name)) {
    const rows = csvRows(await file.text());
    return { sheets: ['(the file)'], rows: async () => rows };
  }
  if (/\.xls$/i.test(file.name)) throw new Error('This is an old-style .xls file. Open it in Excel and save it as .xlsx (or .csv), then import that.');
  const book = await open(file);
  return { sheets: book.sheets, rows: (s) => sheetRows(book, s) };
}
