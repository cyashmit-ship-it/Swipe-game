// A small in-memory stand-in for the Google services Code.gs uses, so the real
// backend code can be tested on a laptop. Only the calls Code.gs makes exist.
import { readFileSync } from "node:fs";
import vm from "node:vm";

class Range {
  constructor(sheet, row, col, rows = 1, cols = 1) {
    Object.assign(this, { sheet, row, col, rows, cols });
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      const line = [];
      for (let c = 0; c < this.cols; c++) line.push(this.sheet.cell(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }
  getValue() {
    return this.sheet.cell(this.row, this.col);
  }
  setValues(v) {
    v.forEach((line, r) => line.forEach((x, c) => this.sheet.put(this.row + r, this.col + c, x)));
    return this;
  }
  setValue(x) {
    this.sheet.put(this.row, this.col, x);
    return this;
  }
  setFontWeight() {
    return this;
  }
  setNumberFormat(f) {
    if (f === "@") this.sheet.textCols.add(this.col);
    return this;
  }
}

class Sheet {
  constructor(name) {
    this.name = name;
    this.data = [];
    this.textCols = new Set();
    this.frozen = 0;
  }
  // Like Google Sheets: plain-format cells turn numeric text into numbers.
  coerce(col, x) {
    if (typeof x === "string" && !this.textCols.has(col) && /^-?\d+(\.\d+)?(E\d+)?$/i.test(x)) return Number(x);
    return x;
  }
  cell(r, c) {
    return this.data[r - 1]?.[c - 1] ?? "";
  }
  put(r, c, x) {
    while (this.data.length < r) this.data.push([]);
    this.data[r - 1][c - 1] = this.coerce(c, x);
  }
  getName() {
    return this.name;
  }
  setName(n) {
    this.name = n;
  }
  getLastRow() {
    return this.data.length;
  }
  getMaxRows() {
    return 1000;
  }
  getRange(row, col, rows = 1, cols = 1) {
    return new Range(this, row, col, rows, cols);
  }
  getDataRange() {
    const rows = Math.max(1, this.data.length);
    const cols = Math.max(1, ...this.data.map((l) => l.length));
    return new Range(this, 1, 1, rows, cols);
  }
  appendRow(values) {
    const r = this.data.length + 1;
    values.forEach((x, i) => this.put(r, i + 1, x));
  }
  setFrozenRows(n) {
    this.frozen = n;
  }
  // Test helper: rows as objects keyed by header.
  rows() {
    const [head, ...body] = this.data;
    return body.map((l) => Object.fromEntries(head.map((h, i) => [h, l[i] ?? ""])));
  }
}

export function createBackend(file, { pin = "4321" } = {}) {
  const sheets = [new Sheet("Sheet1")];
  const ss = {
    getSheetByName: (n) => sheets.find((s) => s.name === n) ?? null,
    insertSheet: (n) => {
      const s = new Sheet(n);
      sheets.push(s);
      return s;
    },
    getSheets: () => sheets,
  };
  const cache = new Map();
  const logs = [];
  // Sheet menu dialogs: tests queue the typed answers (null = Cancel) and read the alerts.
  const ui = { answers: [], alerts: [], menus: [] };
  const UI = {
    ButtonSet: { OK_CANCEL: "OK_CANCEL" },
    Button: { OK: "OK", CANCEL: "CANCEL" },
    prompt: () => {
      const a = ui.answers.shift();
      return { getSelectedButton: () => (a === null || a === undefined ? "CANCEL" : "OK"), getResponseText: () => a ?? "" };
    },
    alert: (m) => ui.alerts.push(m),
    createMenu: (name) => {
      const menu = { name, items: [] };
      const api = { addItem: (label, fn) => (menu.items.push([label, fn]), api), addToUi: () => ui.menus.push(menu) };
      return api;
    },
  };
  const context = {
    console: { log: (...a) => logs.push(a.join(" ")) },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, getUi: () => UI },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: {
      getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }),
    },
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (s) => ({ setMimeType() { return this; }, getContent: () => s }),
    },
    Utilities: {
      formatDate: (d) => d.toISOString().replace("T", " ").slice(0, 19),
    },
  };
  vm.createContext(context);
  const src = readFileSync(file, "utf8").replace('const VOLUNTEER_PIN = "CHANGE-ME";', `const VOLUNTEER_PIN = ${JSON.stringify(pin)};`);
  vm.runInContext(src + "\n;globalThis.__api = { doPost, doGet, setup, onOpen, menuAllowReplay };", context);
  const api = context.__api;
  return {
    call(body) {
      return JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
    },
    raw(text) {
      return api.doPost({ postData: { contents: text } }).getContent();
    },
    get: () => JSON.parse(api.doGet().getContent()),
    setup: () => api.setup(),
    onOpen: () => api.onOpen(),
    menuReplay: (answers) => {
      ui.answers = [...answers];
      api.menuAllowReplay();
      return ui.alerts[ui.alerts.length - 1];
    },
    ui,
    sheet: (n) => ss.getSheetByName(n),
    sheets,
    logs,
    clearCache: () => cache.clear(),
  };
}
