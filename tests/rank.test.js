// node tests/rank.test.js — 닉네임·비속어·순위·1인 1기록·회차 검증
const R = require('../ranklib.js');
const { load } = require('./mock-rank-server.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

// 닉네임
ok(R.cleanName('선화짱짱최고야요') === '선화짱짱최고야요', '한글 8자 그대로');
ok(R.cleanName('선화짱짱최고야요오오') === '선화짱짱최고야요', '9자부터 잘림');
ok(R.cleanName('abcdefghijklmnopqrs') === 'abcdefghijklmnop', '영문 16자');
ok(R.cleanName('  <b>hi</b>  ') === 'bhi/b', '꺾쇠 제거');
ok(R.cleanName('') === '익명' && R.cleanName('   ') === '익명', '빈 이름은 익명');
// 비속어
ok(R.cleanName('씨발') === '**', '씨발 → **');
ok(R.cleanName('씨 발놈') === '***놈', '띄어 써도 가림');
ok(R.cleanName('씨1발') === '***', '숫자 끼워도 가림');
ok(R.cleanName('병신아') === '**아', '병신아 → **아');
ok(R.cleanName('ㅅㅂ') === '**', '초성도 가림');
ok(R.cleanName('FuckYou') === '****You', '영어 대문자');
ok(R.cleanName('선화') === '선화' && R.cleanName('지뢰왕') === '지뢰왕' && R.cleanName('시바견사랑') !== '시바견사랑', '정상 이름 통과 (시바견은 가려짐)');
// 순위
const s = [{ pct: 50, time: 100 }, { pct: 80, time: 900 }, { pct: 80, time: 500 }, { pct: 100, time: 7000 }].sort(R.compare);
ok(s.map((r) => r.pct + '/' + r.time).join(' ') === '100/7000 80/500 80/900 50/100', '완성도 → 시간 순');

// 서버
const NOW = Date.parse('2026-10-21T12:00:00+09:00');      // 화요일 회차 (20261020)
let now = NOW;
const { api, sheet } = load(() => now);
const sub = (o) => api.handleSubmit_({ period: '20261020', pid: 'aaaaaaaaaaaa1', name: '선화', pct: 40, time: 3000, end: 'dead', ...o }, now);
let r = sub({});
ok(r.ok && r.updated && r.me.rank === 1, '첫 기록 등록');
r = sub({ pct: 30, time: 100 });
ok(r.ok && !r.updated && r.me.pct === 40, '낮은 기록은 갱신 안 됨');
r = sub({ pct: 40, time: 2500 });
ok(r.updated && r.me.time === 2500, '같은 완성도·더 빠른 시간은 갱신');
r = sub({ pct: 40, time: 2500, name: '선화💖' });
ok(!r.updated && r.me.name === '선화💖', '같은 점수면 이름만 바뀜');
r = sub({ pct: 72.36, time: 5000 });
ok(r.updated && r.me.pct === 72.3, '완성도 소수 첫째 자리');
ok(sheet.rows.filter((x) => x[1] === 'aaaaaaaaaaaa1').length === 1, '한 사람 한 줄');
// 다른 사람들
api.handleSubmit_({ period: '20261020', pid: 'bbbbbbbbbbbb2', name: '씨발놈', pct: 100, time: 6500, end: 'clear' }, now);
api.handleSubmit_({ period: '20261020', pid: 'cccccccccccc3', name: '오빠', pct: 72.3, time: 4000, end: 'dead' }, now);
r = api.handleTop_({ period: '20261020', pid: 'aaaaaaaaaaaa1' }, now);
ok(r.top.map((x) => x.name).join(',') === '**놈,오빠,선화', '순위표 + 비속어 가림: ' + r.top.map((x) => x.name).join(','));
ok(r.me.rank === 3 && r.top[2].me, '내 순위 표시');
// 검증
ok(!sub({ period: '20261017' }).ok, '지난 회차는 6시간 지나면 못 냄');
ok(!sub({ pct: 100, end: 'dead' }).ok, '100%인데 dead 는 거부');
ok(!sub({ pct: 90, time: 10 }).ok, '말이 안 되게 빠르면 거부');
ok(!sub({ pid: 'x' }).ok, '이상한 pid 거부');
ok(!sub({ pct: 101 }).ok, '100% 초과 거부');
// 초기화 직후엔 직전 회차도 받는다
now = Date.parse('2026-10-22T08:00:00+09:00');   // 목요일 07:00 이후 → 새 회차 20261022
ok(sub({ pct: 99, time: 7000 }).ok, '초기화 1시간 뒤 직전 회차 기록 받음');
ok(api.handleTop_({ pid: 'aaaaaaaaaaaa1' }, now).period === '20261022' && api.handleTop_({ pid: 'aaaaaaaaaaaa1' }, now).count === 0, '새 회차 순위는 비어 있음');
// doGet/doPost 형식
const g = JSON.parse(api.doGet({ parameter: { action: 'top', period: '20261020' } }).body);
ok(g.ok && g.count === 3, 'doGet top');
const p = JSON.parse(api.doPost({ postData: { contents: 'not json' } }).body);
ok(p.ok === false, 'doPost 잘못된 본문');

console.log(fail ? `${fail} FAILURES` : 'ALL PASS');
process.exit(fail ? 1 : 0);
