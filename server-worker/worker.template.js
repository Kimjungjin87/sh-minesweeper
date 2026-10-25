/*
 * 무한지뢰(Minefinity) 하드코어 랭킹 서버 — Cloudflare Workers + D1 (무료 요금제)
 *
 *  · 무료 한도: 하루 요청 10만 번, D1 읽기 하루 500만 행 — 공개 서비스에 넉넉하다.
 *  · 표는 처음 요청이 올 때 저절로 만들어진다 (콘솔에서 SQL 칠 필요 없음).
 *  · 규칙은 구글 시트 판(server/Code.gs)과 같다: 회차마다 한 사람 한 기록, 더 좋을 때만 갱신,
 *    이름은 한글 8자/영문 16자, 비속어는 * 로.
 *  · 앱은 이 서버와 구글 시트 서버를 똑같이 쓴다 (같은 주소 형식·같은 답).
 *
 * 설치는 server-worker/README.md 참고. 이 파일은 tools/build-worker.js 가 만든 worker.js 를 쓴다.
 */

/*__RANKLIB__*/

const KST = 9 * 3600e3, DAY = 86400e3, RESET_DAYS = [2, 4, 6], RESET_HOUR = 7;
function periodStart(now) {
  const k = new Date(now + KST);
  const today7 = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), RESET_HOUR) - KST;
  for (let i = 0; i < 9; i++) {
    const t = today7 - i * DAY;
    if (t <= now && RESET_DAYS.includes(new Date(t + KST).getUTCDay())) return t;
  }
  return today7;
}
function periodId(t) {
  const k = new Date(t + KST);
  return String(k.getUTCFullYear() * 10000 + (k.getUTCMonth() + 1) * 100 + k.getUTCDate());
}
function acceptablePeriods(now) {
  const cur = periodStart(now), prev = periodStart(cur - 1000);
  const ok = [periodId(cur)];
  if (now - cur < 6 * 3600e3) ok.push(periodId(prev));
  return ok;
}

const SCHEMA = `CREATE TABLE IF NOT EXISTS scores (
  period TEXT NOT NULL, pid TEXT NOT NULL, name TEXT NOT NULL,
  pct REAL NOT NULL, time INTEGER NOT NULL, end TEXT NOT NULL, at INTEGER NOT NULL,
  PRIMARY KEY (period, pid))`;
const INDEX = `CREATE INDEX IF NOT EXISTS scores_rank ON scores (period, pct DESC, time ASC, at ASC)`;
let ready = false;
async function ensure(db) {
  if (ready) return;
  await db.prepare(SCHEMA).run();
  await db.prepare(INDEX).run();
  ready = true;
}

const better = 'pct > ?2 OR (pct = ?2 AND time < ?3) OR (pct = ?2 AND time = ?3 AND at < ?4)';

async function board(db, period, pid, limit) {
  const top = (await db.prepare(
    'SELECT pid, name, pct, time, end FROM scores WHERE period = ?1 ORDER BY pct DESC, time ASC, at ASC LIMIT ?2'
  ).bind(period, limit).all()).results || [];
  const count = (await db.prepare('SELECT COUNT(*) AS n FROM scores WHERE period = ?1').bind(period).first()).n;
  const rows = top.map((r, i) => ({ rank: i + 1, name: r.name, pct: r.pct, time: r.time, end: r.end, me: r.pid === pid }));
  let me = rows.find((r) => r.me) || null;
  if (!me && pid) {
    const mine = await db.prepare('SELECT name, pct, time, end, at FROM scores WHERE period = ?1 AND pid = ?2').bind(period, pid).first();
    if (mine) {
      const ahead = (await db.prepare(`SELECT COUNT(*) AS n FROM scores WHERE period = ?1 AND (${better})`)
        .bind(period, mine.pct, mine.time, mine.at).first()).n;
      me = { rank: ahead + 1, name: mine.name, pct: mine.pct, time: mine.time, end: mine.end, me: true };
    }
  }
  return { top: rows, me, count };
}

async function handleTop(db, p, now) {
  const period = String(p.get('period') || periodId(periodStart(now)));
  if (!/^\d{8}$/.test(period)) return { ok: false, error: 'bad period' };
  const limit = Math.min(100, Math.max(1, Number(p.get('limit')) || 50));
  const res = await board(db, period, String(p.get('pid') || ''), limit);
  return { ...res, ok: true, period };
}

async function handleSubmit(db, b, now) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad body' };
  const period = String(b.period || '');
  if (!acceptablePeriods(now).includes(period)) return { ok: false, error: 'period closed' };
  const pid = String(b.pid || '');
  if (!/^[a-z0-9]{12,40}$/.test(pid)) return { ok: false, error: 'bad pid' };
  const pct = Math.floor(Number(b.pct) * 10) / 10, time = Math.round(Number(b.time));
  const end = String(b.end || '');
  if (!(pct >= 0 && pct <= 100)) return { ok: false, error: 'bad pct' };
  if (!(time >= 1 && time <= 7 * 86400)) return { ok: false, error: 'bad time' };
  if (!['dead', 'clear', 'giveup'].includes(end)) return { ok: false, error: 'bad end' };
  if ((pct >= 100) !== (end === 'clear')) return { ok: false, error: 'bad end' };
  if (time < (pct - 5) * 0.6) return { ok: false, error: 'too fast' };
  const name = RankLib.cleanName(b.name);
  const rec = { pct, time, at: now };

  const mine = await db.prepare('SELECT name, pct, time, at FROM scores WHERE period = ?1 AND pid = ?2').bind(period, pid).first();
  if (mine && now - mine.at < 3000 && !RankLib.isBetter(rec, mine) && !RankLib.isSame(rec, mine)) return { ok: false, error: 'too many requests' };
  let updated = false;
  if (!mine || RankLib.isBetter(rec, mine)) {
    await db.prepare(`INSERT INTO scores (period, pid, name, pct, time, end, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT (period, pid) DO UPDATE SET name = ?3, pct = ?4, time = ?5, end = ?6, at = ?7`)
      .bind(period, pid, name, pct, time, end, now).run();
    updated = true;
  } else if (RankLib.isSame(rec, mine) && mine.name !== name) {
    await db.prepare('UPDATE scores SET name = ?3 WHERE period = ?1 AND pid = ?2').bind(period, pid, name).run();
  }
  const res = await board(db, period, pid, Math.min(100, Number(b.limit) || 50));
  return { ...res, ok: true, updated, name, period };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};
const json = (o, extra) => new Response(JSON.stringify(o), { headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...(extra || {}) } });

const worker = {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const now = (env && env.NOW) ? env.NOW() : Date.now();
    try {
      if (!env || !env.DB) return json({ ok: false, error: 'DB binding missing' });
      await ensure(env.DB);
      const url = new URL(request.url);
      if (request.method === 'GET') {
        if (url.searchParams.get('action') === 'top') return json(await handleTop(env.DB, url.searchParams, now), { 'Cache-Control': 'public, max-age=10' });
        return json({ ok: true, app: 'minefinity-rank', period: periodId(periodStart(now)) });
      }
      if (request.method === 'POST') {
        const text = await request.text();
        if (text.length > 2000) return json({ ok: false, error: 'too large' });
        let body; try { body = JSON.parse(text); } catch (e) { return json({ ok: false, error: 'bad json' }); }
        return json(await handleSubmit(env.DB, body, now));
      }
      return json({ ok: false, error: 'method' });
    } catch (err) {
      return json({ ok: false, error: String(err && err.message || err) });
    }
  },
};
export default worker;
