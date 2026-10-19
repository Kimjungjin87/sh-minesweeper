// 진짜 server/Code.gs 를 가짜 스프레드시트 위에서 돌리는 로컬 랭킹 서버 (테스트용)
// node tests/mock-rank-server.js [port]  →  http://localhost:PORT/exec
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http');

function makeSheetApp() {
  const rows = [];
  const sheet = {
    rows,
    getLastRow: () => rows.length,
    appendRow: (r) => { rows.push(r.slice()); },
    getRange: (r, c, nr = 1, nc = 1) => ({
      getValues: () => rows.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc)),
      setValues: (v) => { v.forEach((vr, i) => vr.forEach((x, j) => { rows[r - 1 + i][c - 1 + j] = x; })); },
      setValue: (x) => { rows[r - 1][c - 1] = x; },
    }),
  };
  return {
    sheet,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => sheet, insertSheet: () => sheet }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType() { return { body: s }; } }) },
  };
}

function load(nowFn) {
  const env = makeSheetApp();
  const code = fs.readFileSync(path.join(__dirname, '../server/Code.gs'), 'utf8');
  const ctx = { ...env, console, module: { exports: {} }, Date: nowFn ? class extends Date { static now() { return nowFn(); } } : Date };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return { api: ctx.module.exports, sheet: env.sheet };
}

if (require.main === module) {
  const { api } = load();
  const port = +process.argv[2] || 8799;
  http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (out) => { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }); res.end(out.body); };
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }); return res.end(); }
    if (req.method === 'GET') return send(api.doGet({ parameter: Object.fromEntries(u.searchParams) }));
    let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => send(api.doPost({ postData: { contents: b } })));
  }).listen(port, () => console.log('mock rank server on', port));
}

module.exports = { load };
