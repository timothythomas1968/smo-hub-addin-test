// Full window (Stage 2d, a proof first; Tim, 12 Nov 2026). Office does not let a panel make itself wider, but an add-in can open
// the same page in a large Office dialog. A dialog cannot reach the workbook (only the panel can), so the panel stays open
// and relays every read and write: the dialog's RelaySource sends a request, the panel runs it on its ExcelSource and sends the answer back.
// The screens do not know the difference. Messages are strings, so large answers (tables, the logo) are sent in parts.
// Needs Office's DialogApi 1.2 (messageChild): Excel for Microsoft 365 on Windows, Mac and the web.

const PART = 30000;   // characters per message part (well inside every platform's limit)
const SETTINGS = ['tidy-tabs', 'ri-waive', 'ri-others', 'inv-taxable', 'office-name', 'logo', 'pack-sections', 'pack-comm'];
// what the dialog may ask the panel to do: exactly the ExcelSource calls the screens use
const CALLS = ['fileName', 'readNames', 'readTables', 'write', 'readRange', 'writeNames', 'writeNameItem', 'writeCells', 'showRange', 'setVisibleSheets', 'setSetting', 'show'];

export const MODE = (() => { try { return new URLSearchParams(location.search).get('mode') || ''; } catch (e) { return ''; } })();
export const inWindow = MODE === 'window';

export function canOpenWindow() {
  try { return !inWindow && !!(Office.context.requirements && Office.context.requirements.isSetSupported('DialogApi', '1.2')); } catch (e) { return false; }
}

// ---------------------------------------------------------------- sending and receiving in parts
let seq = 0;
function sendParts(send, obj) {
  const s = JSON.stringify(obj), id = `${Date.now().toString(36)}-${++seq}`, n = Math.max(1, Math.ceil(s.length / PART));
  for (let i = 0; i < n; i++) send(JSON.stringify({ c: id, i, n, p: s.slice(i * PART, (i + 1) * PART) }));
}
function receiver(onMessage) {
  const open = new Map();
  return (raw) => {
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || m.c == null) return;
    const got = open.get(m.c) || []; got[m.i] = m.p; open.set(m.c, got);
    if (got.filter((x) => x != null).length < m.n) return;
    open.delete(m.c);
    try { onMessage(JSON.parse(got.join(''))); } catch (e) { console.error(e); }
  };
}

// ---------------------------------------------------------------- the panel's side: open the window and answer it
let dialog = null;
export const windowOpen = () => !!dialog;

/** Open the full window. onOpen() runs once it is open; onClosed() when the user closes it. */
export function openFullWindow(src, { onOpen, onClosed, onError }) {
  const url = new URL('taskpane.html?mode=window', location.href).href;
  Office.context.ui.displayDialogAsync(url, { height: 92, width: 92, promptBeforeOpen: false }, (res) => {
    if (res.status !== Office.AsyncResultStatus.Succeeded) { onError && onError(res.error); return; }
    dialog = res.value;
    const send = (obj) => { if (dialog) sendParts((s) => dialog.messageChild(s), obj); };
    dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg) => receive(arg.message));
    dialog.addEventHandler(Office.EventType.DialogEventReceived, () => { dialog = null; onClosed && onClosed(); });   // closed (12006) or failed
    const receive = receiver(async (msg) => {
      if (msg.t === 'hello') {   // the window has loaded: give it the workbook's settings it reads without waiting
        const settings = {}; SETTINGS.forEach((k) => { settings[k] = src.getSetting(k); });
        send({ t: 'welcome', settings });
        return;
      }
      if (msg.t === 'close') { try { dialog.close(); } catch (e) { /* already closed */ } dialog = null; onClosed && onClosed(); return; }
      if (msg.t !== 'call') return;
      if (!CALLS.includes(msg.m) || typeof src[msg.m] !== 'function') { send({ t: 'reply', id: msg.id, ok: false, e: `The panel cannot do "${msg.m}".` }); return; }
      const t0 = performance.now();
      try {
        const v = await src[msg.m](...(msg.a || []).map((a) => (a && a.__set ? new Set(a.__set) : a)));
        send({ t: 'reply', id: msg.id, ok: true, v, ms: Math.round(performance.now() - t0) });
      } catch (e) { send({ t: 'reply', id: msg.id, ok: false, e: (e && e.message) || String(e) }); }
    });
    onOpen && onOpen();
  });
}
/** Tell the window the workbook changed (the panel's worksheet watcher). */
export function notifyWindow(obj) { if (dialog) sendParts((s) => dialog.messageChild(s), obj); }
export function closeFullWindow() { if (dialog) { try { dialog.close(); } catch (e) { /* closed */ } dialog = null; } }

// ---------------------------------------------------------------- the window's side: the same calls as ExcelSource, through the panel
export class RelaySource {
  constructor() { this.kind = 'excel'; this.pending = new Map(); this.settings = {}; this.n = 0; this.onEvent = null; this.calls = []; }
  connect() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The full window could not reach the panel. Close this window and open it again from the panel.')), 15000);
      const receive = receiver((msg) => {
        if (msg.t === 'welcome') { this.settings = msg.settings || {}; clearTimeout(timer); resolve(); return; }
        if (msg.t === 'reply') {
          const p = this.pending.get(msg.id); if (!p) return;
          this.pending.delete(msg.id);
          this.calls.push({ m: p.m, total: Math.round(performance.now() - p.t0), excel: msg.ms || 0 });
          if (msg.ok) p.res(msg.v); else p.rej(new Error(msg.e));
          return;
        }
        if (this.onEvent) this.onEvent(msg);
      });
      Office.context.ui.addHandlerAsync(Office.EventType.DialogParentMessageReceived, (arg) => receive(arg.message));
      this.send({ t: 'hello' });
    });
  }
  send(obj) { sendParts((s) => Office.context.ui.messageParent(s), obj); }
  call(m, ...a) {
    return new Promise((res, rej) => {
      const id = ++this.n;
      this.pending.set(id, { res, rej, m, t0: performance.now() });
      this.send({ t: 'call', id, m, a: a.map((x) => (x instanceof Set ? { __set: [...x] } : x)) });
    });
  }
  close() { this.send({ t: 'close' }); }
  fileName() { return this.call('fileName'); }
  readNames(wanted) { return this.call('readNames', wanted); }
  readTables(names) { return this.call('readTables', names); }
  write(name, row, writes, unhide) { return this.call('write', name, row, writes, unhide); }
  readRange(sheet, addr) { return this.call('readRange', sheet, addr); }
  writeNames(pairs) { return this.call('writeNames', pairs); }
  writeNameItem(name, i, value) { return this.call('writeNameItem', name, i, value); }
  writeCells(sheet, cells) { return this.call('writeCells', sheet, cells); }
  showRange(sheet, addr) { return this.call('showRange', sheet, addr); }
  setVisibleSheets(show, never) { return this.call('setVisibleSheets', show, never); }
  show(name, row) { return this.call('show', name, row); }
  getSetting(k) { return this.settings[k] ?? null; }
  async setSetting(k, v) { this.settings[k] = v; await this.call('setSetting', k, v); }
}
