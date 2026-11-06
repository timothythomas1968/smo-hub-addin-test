// A small PowerPoint (.pptx) writer, with no libraries (Tim, 3 Nov 2026: packs as fully editable slides).
// Everything it writes is native PowerPoint: text boxes, shapes, tables, pictures and charts whose data is embedded
// as a little workbook, so a client can change a word, a number or a chart (right-click, Edit Data) before publishing.
// The files are stored in the ZIP without compression, which PowerPoint reads like any other .pptx.

const EMU = 360000;                       // per centimetre
export const cm = (v) => Math.round(v * EMU);
export const W = 33.867, H = 19.05;       // 16:9 slide, in cm

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_C = 'http://schemas.openxmlformats.org/drawingml/2006/chart';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG = 'http://schemas.openxmlformats.org/package/2006/relationships';
const FONT = 'Aptos';

// ---------------------------------------------------------------- ZIP (stored)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
export function zip(files) {   // files: [[path, string | Uint8Array]]
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  for (const [name, data] of files) {
    const nb = enc.encode(name), body = typeof data === 'string' ? enc.encode(data) : data, crc = crc32(body);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 0x21, true); lh.setUint32(14, crc, true); lh.setUint32(18, body.length, true); lh.setUint32(22, body.length, true);
    lh.setUint16(26, nb.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nb, body);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true); ch.setUint16(14, 0x21, true); ch.setUint32(16, crc, true); ch.setUint32(20, body.length, true); ch.setUint32(24, body.length, true);
    ch.setUint16(28, nb.length, true); ch.setUint32(42, off, true);
    central.push(new Uint8Array(ch.buffer), nb);
    off += 30 + nb.length + body.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0; for (const b of all) { out.set(b, p); p += b.length; }
  return out;
}

// ---------------------------------------------------------------- text runs
// s: a string, or an array of paragraphs; a paragraph is a string or an array of [text, {size, bold, color}] runs.
function paras(s, o) {
  const lines = Array.isArray(s) ? s : String(s == null ? '' : s).split('\n');
  return lines.map((ln) => {
    const runs = Array.isArray(ln) ? ln : [[ln, {}]];
    const algn = o.align === 'r' ? ' algn="r"' : o.align === 'ctr' ? ' algn="ctr"' : '';
    const body = runs.map(([t, ro = {}]) => {
      const r = { ...o, ...ro };
      return `<a:r><a:rPr lang="en-GB" sz="${Math.round((r.size || 12) * 100)}" b="${r.bold ? 1 : 0}"${r.italic ? ' i="1"' : ''} dirty="0"><a:solidFill><a:srgbClr val="${r.color || '212529'}"/></a:solidFill><a:latin typeface="${FONT}"/><a:cs typeface="${FONT}"/></a:rPr><a:t>${esc(t)}</a:t></a:r>`;
    }).join('');
    return `<a:p><a:pPr${algn}/>${body}<a:endParaRPr lang="en-GB" sz="${Math.round((o.size || 12) * 100)}" dirty="0"/></a:p>`;
  }).join('');
}

// ---------------------------------------------------------------- a slide
class Slide {
  constructor(deck) { this.deck = deck; this.items = []; this.rels = []; this.id = 2; }
  rel(type, target) { const id = 'rId' + (this.rels.length + 2); this.rels.push(`<Relationship Id="${id}" Type="${type}" Target="${target}"/>`); return id; }
  xfrm(x, y, w, h) { return `<a:xfrm><a:off x="${cm(x)}" y="${cm(y)}"/><a:ext cx="${cm(w)}" cy="${cm(h)}"/></a:xfrm>`; }
  /** A rectangle (or rounded rectangle). fill and line are hex colours, or null for none. */
  rect(x, y, w, h, { fill = 'FFFFFF', line = 'D5DCE5', round = false } = {}) {
    const id = this.id++;
    this.items.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${this.xfrm(x, y, w, h)}<a:prstGeom prst="${round ? 'roundRect' : 'rect'}"><a:avLst>${round ? '<a:gd name="adj" fmla="val 5000"/>' : ''}</a:avLst></a:prstGeom>`
      + (fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>') + (line ? `<a:ln w="9525"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>` : '<a:ln><a:noFill/></a:ln>')
      + '</p:spPr><p:txBody><a:bodyPr rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="en-GB" dirty="0"/></a:p></p:txBody></p:sp>');
    return this;
  }
  /** A text box. o: size, bold, color, align ('l' | 'ctr' | 'r'), anchor ('t' | 'ctr' | 'b'), fill. */
  text(x, y, w, h, s, o = {}) {
    const id = this.id++;
    this.items.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${this.xfrm(x, y, w, h)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`
      + (o.fill ? `<a:solidFill><a:srgbClr val="${o.fill}"/></a:solidFill>` : '<a:noFill/>') + '</p:spPr>'
      + `<p:txBody><a:bodyPr wrap="square" lIns="36000" tIns="18000" rIns="36000" bIns="18000" rtlCol="0" anchor="${o.anchor || 't'}"><a:normAutofit/></a:bodyPr><a:lstStyle/>${paras(s, o)}</p:txBody></p:sp>`);
    return this;
  }
  /** A native table. cols: widths in cm. rows: arrays of cells; a cell is text or {t, bold, color, fill, align}. The first row is the header. */
  table(x, y, cols, rows, { size = 10, rowH = 0.8, head = '003A70' } = {}) {
    const id = this.id++, w = cols.reduce((a, b) => a + b, 0);
    const border = (side, c) => `<a:${side} w="6350"><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></a:${side}>`;
    const trs = rows.map((r, ri) => `<a:tr h="${cm(rowH)}">` + r.map((c0, ci) => {
      const c = c0 && typeof c0 === 'object' ? c0 : { t: c0 };
      const hdr = ri === 0;
      const fill = hdr ? head : c.fill || null;
      const txt = paras(String(c.t == null ? '' : c.t).split('\n').map((ln) => [[ln, {}]]), { size: hdr ? size - 1 : size, bold: hdr || c.bold, color: hdr ? 'FFFFFF' : c.color || '212529', align: c.align });
      return `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/>${txt}</a:txBody><a:tcPr marL="72000" marR="72000" marT="36000" marB="36000" anchor="${hdr ? 'ctr' : 't'}">`
        + border('lnL', 'FFFFFF') + border('lnR', 'FFFFFF') + border('lnT', hdr ? head : 'ECEFF3') + border('lnB', hdr ? head : 'D5DCE5')
        + (fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : '<a:noFill/>') + '</a:tcPr></a:tc>';
    }).join('') + '</a:tr>').join('');
    this.items.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Table ${id}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>`
      + `<p:xfrm><a:off x="${cm(x)}" y="${cm(y)}"/><a:ext cx="${cm(w)}" cy="${cm(rowH * rows.length)}"/></p:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table">`
      + `<a:tbl><a:tblPr firstRow="1" bandRow="0"/><a:tblGrid>${cols.map((c) => `<a:gridCol w="${cm(c)}"/>`).join('')}</a:tblGrid>${trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`);
    return this;
  }
  /** A picture from a data URL (png or jpeg), fitted inside the box. */
  image(x, y, w, h, dataUrl, natural) {
    const m = /^data:image\/(png|jpe?g);base64,(.*)$/i.exec(dataUrl || '');
    if (!m) return this;
    const ext = m[1].toLowerCase() === 'png' ? 'png' : 'jpeg';
    const bin = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const name = `image${this.deck.media.length + 1}.${ext}`;
    this.deck.media.push([`ppt/media/${name}`, bin]);
    let iw = w, ih = h;
    if (natural && natural.w && natural.h) { const k = Math.min(w / natural.w, h / natural.h); iw = natural.w * k; ih = natural.h * k; }
    const rid = this.rel(`${REL}/image`, `../media/${name}`), id = this.id++;
    this.items.push(`<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>`
      + `<p:spPr>${this.xfrm(x + w - iw, y, iw, ih)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`);
    return this;
  }
  /** A native column chart with its data embedded. spec: {cats, series: [{name, values, color}], title, stacked, numFmt}. */
  chart(x, y, w, h, spec) {
    const n = this.deck.charts.length + 1;
    this.deck.charts.push(chartParts(n, spec));
    const rid = this.rel(`${REL}/chart`, `../charts/chart${n}.xml`), id = this.id++;
    this.items.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="Chart ${id}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>`
      + `<p:xfrm><a:off x="${cm(x)}" y="${cm(y)}"/><a:ext cx="${cm(w)}" cy="${cm(h)}"/></p:xfrm><a:graphic><a:graphicData uri="${NS_C}"><c:chart xmlns:c="${NS_C}" r:id="${rid}"/></a:graphicData></a:graphic></p:graphicFrame>`);
    return this;
  }
  xml() {
    return XML + `<p:sld xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>`
      + '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
      + this.items.join('') + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }
  relsXml() {
    return XML + `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${this.rels.join('')}</Relationships>`;
  }
}

// ---------------------------------------------------------------- charts, with an embedded workbook for Edit Data
const colName = (i) => String.fromCharCode(65 + i);
function chartParts(n, { cats, series, stacked = false, numFmt = '#,##0' }) {
  const last = cats.length + 1;
  const ser = series.map((s, i) => {
    const col = colName(i + 1);
    return `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>Sheet1!$${col}$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${esc(s.name)}</c:v></c:pt></c:strCache></c:strRef></c:tx>`
      + `<c:spPr><a:solidFill><a:srgbClr val="${s.color || '003A70'}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>`
      + `<c:cat><c:strRef><c:f>Sheet1!$A$2:$A$${last}</c:f><c:strCache><c:ptCount val="${cats.length}"/>${cats.map((c, k) => `<c:pt idx="${k}"><c:v>${esc(c)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat>`
      + `<c:val><c:numRef><c:f>Sheet1!$${col}$2:$${col}$${last}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${cats.length}"/>${s.values.map((v, k) => `<c:pt idx="${k}"><c:v>${Number(v) || 0}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val></c:ser>`;
  }).join('');
  const txPr = (sz) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"><a:solidFill><a:srgbClr val="5A6573"/></a:solidFill><a:latin typeface="${FONT}"/></a:defRPr></a:pPr><a:endParaRPr lang="en-GB"/></a:p></c:txPr>`;
  const chart = XML + `<c:chartSpace xmlns:c="${NS_C}" xmlns:a="${NS_A}" xmlns:r="${NS_R}"><c:roundedCorners val="0"/><c:chart><c:autoTitleDeleted val="1"/><c:plotArea><c:layout/>`
    + `<c:barChart><c:barDir val="col"/><c:grouping val="${stacked ? 'stacked' : 'clustered'}"/><c:varyColors val="0"/>${ser}<c:gapWidth val="60"/>${stacked ? '<c:overlap val="100"/>' : ''}<c:axId val="1001"/><c:axId val="1002"/></c:barChart>`
    + `<c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="AAB8C9"/></a:solidFill></a:ln></c:spPr>${txPr(900)}<c:crossAx val="1002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
    + `<c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="ECEFF3"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${esc(numFmt)}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:spPr><a:ln><a:noFill/></a:ln></c:spPr>${txPr(900)}<c:crossAx val="1001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`
    + `</c:plotArea><c:legend><c:legendPos val="t"/><c:overlay val="0"/>${txPr(900)}</c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`
    + `<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr><c:externalData r:id="rId1"><c:autoUpdate val="0"/></c:externalData></c:chartSpace>`;
  const rels = XML + `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/package" Target="../embeddings/Microsoft_Excel_Worksheet${n}.xlsx"/></Relationships>`;
  return { n, chart, rels, xlsx: chartWorkbook(cats, series) };
}
function chartWorkbook(cats, series) {
  const cell = (ref, v) => (typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`);
  const rows = [`<row r="1">${cell('A1', ' ')}${series.map((s, i) => cell(colName(i + 1) + '1', s.name)).join('')}</row>`]
    .concat(cats.map((c, k) => `<row r="${k + 2}">${cell('A' + (k + 2), String(c))}${series.map((s, i) => cell(colName(i + 1) + (k + 2), Number(s.values[k]) || 0)).join('')}</row>`));
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  return zip([
    ['[Content_Types].xml', XML + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', XML + `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', XML + `<workbook xmlns="${NS}" xmlns:r="${NS_R}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', XML + `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', XML + `<styleSheet xmlns="${NS}"><fonts count="1"><font><sz val="11"/><name val="${FONT}"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`],
    ['xl/worksheets/sheet1.xml', XML + `<worksheet xmlns="${NS}"><sheetData>${rows.join('')}</sheetData></worksheet>`]
  ]);
}

// ---------------------------------------------------------------- the deck
const THEME = XML + `<a:theme xmlns:a="${NS_A}" name="TransitionSuite"><a:themeElements><a:clrScheme name="TransitionSuite">`
  + '<a:dk1><a:srgbClr val="212529"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="003A70"/></a:dk2><a:lt2><a:srgbClr val="F3F4F6"/></a:lt2>'
  + '<a:accent1><a:srgbClr val="003A70"/></a:accent1><a:accent2><a:srgbClr val="2C6CB0"/></a:accent2><a:accent3><a:srgbClr val="1B9A8B"/></a:accent3><a:accent4><a:srgbClr val="8A63C8"/></a:accent4><a:accent5><a:srgbClr val="B8601F"/></a:accent5><a:accent6><a:srgbClr val="8794A6"/></a:accent6>'
  + '<a:hlink><a:srgbClr val="0062CC"/></a:hlink><a:folHlink><a:srgbClr val="5A6573"/></a:folHlink></a:clrScheme>'
  + `<a:fontScheme name="TransitionSuite"><a:majorFont><a:latin typeface="${FONT}"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="${FONT}"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>`
  + '<a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
  + '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
  + '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
  + '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
const MASTER = XML + `<p:sldMaster xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld>`
  + '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
  + '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle><a:lvl1pPr><a:defRPr sz="2400"/></a:lvl1pPr></p:titleStyle><p:bodyStyle><a:lvl1pPr><a:defRPr sz="1400"/></a:lvl1pPr></p:bodyStyle><p:otherStyle><a:lvl1pPr><a:defRPr sz="1200"/></a:lvl1pPr></p:otherStyle></p:txStyles></p:sldMaster>';
const LAYOUT = XML + `<p:sldLayout xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`;

export class Deck {
  constructor({ title = 'Presentation', author = 'TransitionSuite' } = {}) { this.title = title; this.author = author; this.slides = []; this.media = []; this.charts = []; }
  slide() { const s = new Slide(this); this.slides.push(s); return s; }
  blob() {
    const S = this.slides;
    const files = [];
    const ct = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>',
      '<Default Extension="png" ContentType="image/png"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>',
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>',
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>',
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>',
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>',
      '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>',
      '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>',
      '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>',
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>',
      ...S.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`),
      ...this.charts.map((c) => `<Override PartName="/ppt/charts/chart${c.n}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`)];
    files.push(['[Content_Types].xml', XML + `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${ct.join('')}</Types>`]);
    files.push(['_rels/.rels', XML + `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="${REL}/extended-properties" Target="docProps/app.xml"/></Relationships>`]);
    const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    files.push(['docProps/core.xml', XML + `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(this.title)}</dc:title><dc:creator>${esc(this.author)}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`]);
    files.push(['docProps/app.xml', XML + `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>TransitionSuite</Application><Slides>${S.length}</Slides></Properties>`]);
    files.push(['ppt/presentation.xml', XML + `<p:presentation xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>`
      + `<p:sldIdLst>${S.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 10}"/>`).join('')}</p:sldIdLst><p:sldSz cx="${cm(W)}" cy="${cm(H)}"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle><a:lvl1pPr><a:defRPr lang="en-GB"/></a:lvl1pPr></p:defaultTextStyle></p:presentation>`]);
    files.push(['ppt/_rels/presentation.xml.rels', XML + `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="theme/theme1.xml"/>`
      + `<Relationship Id="rId3" Type="${REL}/presProps" Target="presProps.xml"/><Relationship Id="rId4" Type="${REL}/viewProps" Target="viewProps.xml"/><Relationship Id="rId5" Type="${REL}/tableStyles" Target="tableStyles.xml"/>`
      + S.map((_, i) => `<Relationship Id="rId${i + 10}" Type="${REL}/slide" Target="slides/slide${i + 1}.xml"/>`).join('') + '</Relationships>']);
    files.push(['ppt/presProps.xml', XML + `<p:presentationPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"/>`]);
    files.push(['ppt/viewProps.xml', XML + `<p:viewPr xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`]);
    files.push(['ppt/tableStyles.xml', XML + `<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`]);
    files.push(['ppt/theme/theme1.xml', THEME]);
    files.push(['ppt/slideMasters/slideMaster1.xml', MASTER]);
    files.push(['ppt/slideMasters/_rels/slideMaster1.xml.rels', XML + `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="${REL}/theme" Target="../theme/theme1.xml"/></Relationships>`]);
    files.push(['ppt/slideLayouts/slideLayout1.xml', LAYOUT]);
    files.push(['ppt/slideLayouts/_rels/slideLayout1.xml.rels', XML + `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`]);
    S.forEach((s, i) => { files.push([`ppt/slides/slide${i + 1}.xml`, s.xml()]); files.push([`ppt/slides/_rels/slide${i + 1}.xml.rels`, s.relsXml()]); });
    this.charts.forEach((c) => {
      files.push([`ppt/charts/chart${c.n}.xml`, c.chart]);
      files.push([`ppt/charts/_rels/chart${c.n}.xml.rels`, c.rels]);
      files.push([`ppt/embeddings/Microsoft_Excel_Worksheet${c.n}.xlsx`, c.xlsx]);
    });
    this.media.forEach((m) => files.push(m));
    return new Blob([zip(files)], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' });
  }
}
