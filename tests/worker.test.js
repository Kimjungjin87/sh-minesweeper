// node tests/worker.test.js — Cloudflare 랭킹 서버를 진짜 SQLite 위에서 돌려 본다
// 또 node tests/worker.test.js serve 8798 → 앱 테스트용 로컬 서버
const { DatabaseSync } = require('node:sqlite');
const http = require('http'), path = require('path'), fs = require('fs');

// D1 흉내 (prepare → bind → all/first/run)
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  const conv = (sql) => sql.replace(/\?(\d+)/g, (m, n) => '?' + n);
  return {
    prepare(sql) {
      let args = [];
      const st = { bind: (...a) => { args = a; return st; },
        all: async () => ({ results: db.prepare(conv(sql)).all(...args) }),
        first: async () => db.prepare(conv(sql)).get(...args) || null,
        run: async () => { db.prepare(conv(sql)).run(...args); return { success: true }; } };
      return st;
    },
    raw: db,
  };
}

async function loadWorker() {
  const src = fs.readFileSync(path.join(__dirname, '../server-worker/worker.js'), 'utf8');
  const tmp = path.join(__dirname, '.worker-under-test.mjs');
  fs.writeFileSync(tmp, src);
  const mod = await import(tmp + '?t=' + Date.now());
  fs.unlinkSync(tmp);
  return mod.default;
}

async function tests() {
  let fail = 0;
  const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };
  const W = await loadWorker();
  let now = Date.parse('2026-10-21T12:00:00+09:00');
  const env = { DB: fakeD1(), NOW: () => now };
  const call = async (method, q, body) => {
    const r = await W.fetch(new Request('https://x.workers.dev/' + (q || ''), { method, body: body ? JSON.stringify(body) : undefined }), env, {});
    return { status: r.status, cors: r.headers.get('access-control-allow-origin'), j: method === 'OPTIONS' ? null : await r.json() };
  };
  const sub = (o) => call('POST', '', { period: '20261020', pid: 'aaaaaaaaaaaa1', name: '선화', pct: 40, time: 3000, end: 'dead', ...o });

  let r = await call('GET', '');
  ok(r.j.ok && r.j.app === 'minefinity-rank' && r.j.period === '20261020' && r.cors === '*', 'health + CORS');
  ok((await call('OPTIONS', '')).status === 204, 'preflight');
  r = await sub({}); ok(r.j.ok && r.j.updated && r.j.me.rank === 1, 'first record');
  now += 5000;
  r = await sub({ pct: 30, time: 100 }); ok(r.j.ok && !r.j.updated && r.j.me.pct === 40, 'worse not stored');
  now += 5000;
  r = await sub({ pct: 40, time: 2500 }); ok(r.j.updated && r.j.me.time === 2500, 'same pct faster → update');
  now += 5000;
  r = await sub({ pct: 40, time: 2500, name: 'Sunny' }); ok(!r.j.updated && r.j.me.name === 'Sunny', 'same score renames');
  r = await sub({ pct: 41, time: 2600, name: 'Sunny' }); ok(r.j.updated, 'better within 3s still allowed');
  r = await sub({ pct: 1, time: 2600 }); ok(!r.j.ok && r.j.error === 'too many requests', 'spam guard');
  now += 5000;
  for (let i = 0; i < 120; i++) await call('POST', '', { period: '20261020', pid: 'p' + String(i).padStart(12, '0'), name: 'fuck' + i, pct: (i % 50) + 0.5, time: 4000 + i, end: 'dead' });
  r = await call('GET', '?action=top&period=20261020&pid=aaaaaaaaaaaa1&limit=50');
  ok(r.j.top.length === 50 && r.j.count === 121, `top 50 of ${r.j.count}`);
  ok(r.j.top[0].pct === 49.5 && r.j.top.every((x, i) => i === 0 || x.pct < r.j.top[i - 1].pct || (x.pct === r.j.top[i - 1].pct && x.time >= r.j.top[i - 1].time)), 'sorted pct desc, time asc');
  ok(r.j.top.every((x) => !/fuck/i.test(x.name)), 'profanity masked: ' + r.j.top[0].name);
  ok(r.j.me && r.j.top[r.j.me.rank - 1].me && r.j.me.pct === 41, `my rank inside top (${r.j.me && r.j.me.rank})`);
  const r2 = await call('GET', '?action=top&period=20261020&pid=aaaaaaaaaaaa1&limit=10');
  ok(r2.j.top.length === 10 && r2.j.me.rank === r.j.me.rank && !r2.j.top.some((x) => x.me), 'my rank outside top shown separately');
  ok(!(await sub({ period: '20261017' })).j.ok, 'old period rejected');
  ok(!(await sub({ pct: 100, end: 'dead' })).j.ok, '100% must be clear');
  ok(!(await sub({ pct: 90, time: 10 })).j.ok, 'too fast rejected');
  ok(!(await sub({ pid: 'BAD' })).j.ok, 'bad pid rejected');
  r = await W.fetch(new Request('https://x/', { method: 'POST', body: 'x'.repeat(3000) }), env, {});
  ok((await r.json()).error === 'too large', 'body size limit');
  now = Date.parse('2026-10-22T08:00:00+09:00');
  ok((await sub({ pct: 99, time: 7000, end: 'dead' })).j.ok, 'grace period after reset');
  r = await call('GET', '?action=top&pid=aaaaaaaaaaaa1');
  ok(r.j.period === '20261022' && r.j.count === 0, 'new round empty');
  console.log(fail ? `${fail} FAILURES` : 'ALL PASS');
  process.exit(fail ? 1 : 0);
}

async function serve(port) {
  const W = await loadWorker();
  const env = { DB: fakeD1() };
  http.createServer(async (req, res) => {
    let body = ''; req.on('data', (d) => (body += d));
    req.on('end', async () => {
      const r = await W.fetch(new Request('http://localhost' + req.url, { method: req.method, body: ['GET', 'OPTIONS'].includes(req.method) ? undefined : body }), env, {});
      res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text());
    });
  }).listen(port, () => console.log('worker on', port));
}

if (process.argv[2] === 'serve') serve(+process.argv[3] || 8798); else tests();
