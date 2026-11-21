// A workstream report as the Hub's paste block (28 rows x 8 columns): the same shape as the standalone report file's Export
// block (A3:H30) and the input block of a section on Workstream Reports (B:I from row s+5). The lead's page at the Connected
// level sends a report in this shape, so the programme office takes it in exactly as Import reports and the Level 1 paste do.
// Layout: workbook/builder/wr_part.py (WR_TEXT, WR_TABLES, WR_FIELDS). Keep the two in step.
export const ROWS = 28, COLS = 8;
export const TEXTS = [['Sum', 'Summary for governance forums'], ['Ach', 'Achievements this month'], ['Next', 'Next month'],
  ['PTG', 'Path to green (if amber or red)'], ['Help', 'Help needed or escalations']];
export const TABLES = {
  risk: { first: 9, n: 6, fields: ['Title', 'Desc', 'TSA', 'L', 'I', 'Owner', 'Resp', 'Status'] },
  iss: { first: 17, n: 6, fields: ['Title', 'Desc', 'TSA', 'Pri', 'Due', 'Owner', 'XP', 'Status'] },
  dec: { first: 25, n: 3, fields: ['Title', 'Desc', 'TSA', 'Due', 'Forum', 'Owner', 'Dec', 'Status'] }
};

/** report: {code, month (date serial), rag, trend, texts: {Sum, Ach, ...}, risk: [{Title, L, ...}], iss: [...], dec: [...]} */
export function toBlock(r) {
  const b = Array.from({ length: ROWS }, () => Array(COLS).fill(''));
  b[0][0] = r.code || ''; b[0][1] = r.rag || ''; b[0][2] = r.month || ''; b[0][3] = 'Trend'; b[0][4] = r.trend || '';
  TEXTS.forEach(([k, label], i) => { b[1 + i][0] = label; b[1 + i][1] = (r.texts && r.texts[k]) || ''; });
  for (const [k, t] of Object.entries(TABLES)) {
    (r[k] || []).filter((x) => String(x.Title || '').trim()).slice(0, t.n).forEach((x, j) => {
      t.fields.forEach((f, c) => { const v = x[f]; b[t.first + j][c] = v == null ? '' : v; });
    });
  }
  return b;
}

/** The other way: a block (from a report file, a submission or a section) as a report object. */
export function fromBlock(b) {
  const r = { code: String(b[0][0] || ''), rag: String(b[0][1] || ''), month: Number(b[0][2]) || 0, trend: String(b[0][4] || ''), texts: {} };
  TEXTS.forEach(([k], i) => { r.texts[k] = String(b[1 + i][1] || ''); });
  for (const [k, t] of Object.entries(TABLES)) {
    r[k] = [];
    for (let j = 0; j < t.n; j++) {
      const row = b[t.first + j] || [];
      if (!String(row[0] || '').trim()) continue;
      r[k].push(Object.fromEntries(t.fields.map((f, c) => [f, row[c] ?? ''])));
    }
  }
  return r;
}
