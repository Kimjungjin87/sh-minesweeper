// node tests/engine.test.js
const M = require('../engine.js');
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

for (const [x, y] of [[0, 0], [-1, -1], [123456, -98765], [-900000, 7]]) {
  const k = M.key(x, y); ok(M.kx(k) === x && M.ky(k) === y, `key ${x},${y}`);
}

for (const cfg of M.WORLDS) {
  const s = new M.Session(cfg, null);
  const o = cfg.kind === 'hardcore' ? s.reveal(40, 40) : s.reveal(3, -5);
  ok(o.changed && !o.exploded && s.revealed.size >= 9, `${cfg.id} first tap opens ${s.revealed.size}`);
  let bad = 0, open0 = 0;
  for (const k of s.revealed) {
    const x = M.kx(k), y = M.ky(k);
    if (s.field.isMine(x, y)) bad++;
    if (s.field.count(x, y) === 0) M.neighbors(x, y, (nx, ny) => { if (!s.isRevealed(nx, ny)) open0++; });
  }
  ok(bad === 0, `${cfg.id} no mine revealed`);
  ok(open0 === 0 || s.revealed.size >= M.FLOOD_CAP, `${cfg.id} flood closed`);
}

// 지뢰 → 되돌리기
const trail = M.world('trail');
const s = new M.Session(trail, null);
s.reveal(0, 0);
let mine = null;
for (const k of s.revealed) {
  M.neighbors(M.kx(k), M.ky(k), (nx, ny) => { if (!mine && s.field.isMine(nx, ny)) mine = [nx, ny]; });
  if (mine) break;
}
ok(!!mine, 'found adjacent mine');
const before = s.revealed.size, depth = s.undoStack.length;
ok(s.reveal(...mine).exploded && s.mistakes === 1 && s.exploded !== null, 'explode counts mistake');
ok(!s.reveal(100, 100).changed, 'input blocked while exploded');
ok(s.undo() && s.exploded === null && s.revealed.size === before && s.mistakes === 1 && s.undoStack.length === depth, 'undo restores, mistake stays');
s.reveal(...mine); s.flagExplosion();
ok(s.exploded === null && s.isFlagged(...mine) && s.mistakes === 2, 'flag & continue');
ok(s.undo() && !s.isFlagged(...mine), 'undo of flag&continue');
s.toggleFlag(50, 50); ok(s.isFlagged(50, 50), 'flag on'); s.undo(); ok(!s.isFlagged(50, 50), 'flag undo');

// 구역 완성 + 보석
const s2 = new M.Session(trail, null);
s2.reveal(4, 4);
for (let i = 0; i < 100 && !s2.isSolved(0, 0); i++)
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++)
    if (!s2.field.isMine(x, y) && !s2.isRevealed(x, y)) s2.reveal(x, y);
ok(s2.isSolved(0, 0), 'sector solved');
let expect = 0; for (const k of s2.revealed) expect += s2.field.gemAt(M.kx(k), M.ky(k));
ok(s2.gems === expect, `gem tally ${s2.gems}==${expect}`);
while (s2.undo()) {}
ok(s2.revealed.size === 0 && s2.solved.size === 0 && s2.gems === 0, 'full undo to empty');

// 돋보기 보상: 구역마다 한 번만, 되돌려도 회수하지 않고 다시 풀어도 또 주지 않는다
{
  const r = new M.Session(trail, null);
  let rewards = r.reveal(4, 4).rewards;
  const solveSector = () => { for (let i = 0; i < 100 && !r.isSolved(0, 0); i++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (!r.field.isMine(x, y) && !r.isRevealed(x, y)) rewards += r.reveal(x, y).rewards; };
  solveSector();
  ok(rewards >= 1 && r.rewarded.has(M.key(0, 0)), `reward on solve (${rewards})`);
  const first = rewards;
  while (r.isSolved(0, 0)) r.undo();
  solveSector();
  ok(rewards === first, 'no second reward after undo + re-solve');
  const back = new M.Session(trail, JSON.parse(JSON.stringify(r.toSave())));
  ok(back.rewarded.size === r.rewarded.size, 'rewarded persisted');
  r.restart(); ok(r.rewarded.size === 0, 'restart clears rewarded');
  // peek
  const q = new M.Session(M.world('abyss'), null); q.reveal(0, 0);
  const cells = q.peek(10, 10);
  ok(cells.length === 9 && cells.every((c) => c.mine === q.field.isMine(c.x, c.y)), 'peek 3x3 matches field');
  ok(q.peek(0, 0).length === 0, 'peek skips revealed cells');
}

// 완성 구역 옆 숫자칸: 완성 구역의 지뢰를 깃발로 쳐서 주변 열기가 된다 (선화 피드백)
{
  let done = false;
  for (let tries = 0; tries < 30 && !done; tries++) {
    const q = new M.Session(trail, null); q.reveal(4, 4);
    for (let i = 0; i < 100 && !q.isSolved(0, 0); i++) for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) if (!q.field.isMine(x, y) && !q.isRevealed(x, y)) q.reveal(x, y);
    // 오른쪽 이웃 구역의 x=8 칸 중, 이웃 지뢰가 전부 완성 구역(x=7) 안에 있는 숫자칸
    for (let y = 1; y < 7 && !done; y++) {
      const x = 8;
      if (q.field.isMine(x, y) || !q.field.count(x, y)) continue;
      let allLeft = true, hiddenSafe = 0;
      M.neighbors(x, y, (a, b) => { if (q.field.isMine(a, b) && a !== 7) allLeft = false; if (!q.field.isMine(a, b) && !q.isRevealed(a, b) && a > 7) hiddenSafe++; });
      if (!allLeft || !hiddenSafe) continue;
      if (!q.isRevealed(x, y)) { if (q.reveal(x, y).exploded) break; }
      const c = q.revealed.size, o = q.reveal(x, y);
      ok(!o.exploded && q.revealed.size > c, 'chord next to solved sector counts its mines as flags');
      done = true;
    }
    if (q.isSolved(0, 0)) {
      let mineIn = null; for (let y = 0; y < 8 && !mineIn; y++) for (let x = 0; x < 8 && !mineIn; x++) if (q.field.isMine(x, y)) mineIn = [x, y];
      if (mineIn) { ok(!q.reveal(...mineIn).exploded && q.mistakes === 0, 'tapping auto-flag in solved sector is safe'); ok(!q.toggleFlag(...mineIn).changed, 'no manual flag inside solved sector'); }
    }
  }
  ok(done, 'solved-sector chord scenario found');
}

// 숫자칸 열기
const s3 = new M.Session(M.world('abyss'), null);
s3.reveal(0, 0);
let chorded = false;
for (const k of s3.revealed) {
  const x = M.kx(k), y = M.ky(k); if (!s3.field.count(x, y)) continue;
  let hidden = 0; M.neighbors(x, y, (a, b) => { if (!s3.isRevealed(a, b) && !s3.field.isMine(a, b)) hidden++; });
  if (!hidden) continue;
  M.neighbors(x, y, (a, b) => { if (s3.field.isMine(a, b) && !s3.isFlagged(a, b)) s3.toggleFlag(a, b); });
  const c = s3.revealed.size; const o = s3.reveal(x, y);
  ok(!o.exploded && s3.revealed.size > c, 'chord opens'); chorded = true; break;
}
ok(chorded, 'chord tested');

// 저장 ↔ 불러오기 (JSON 왕복, 지뢰 배치·되돌리기·터진 상태까지)
s3.camera = { x: 10, y: 20, cell: 44 };
const json = JSON.stringify(s3.toSave());
const back = new M.Session(s3.cfg, JSON.parse(json));
ok(back.revealed.size === s3.revealed.size && [...s3.revealed].every((k) => back.revealed.has(k)), 'revealed restored');
ok(back.flagged.size === s3.flagged.size && back.gems === s3.gems && back.camera.cell === 44, 'flags/gems/camera restored');
let same = true; for (let y = -30; y <= 30; y++) for (let x = -30; x <= 30; x++) if (back.field.isMine(x, y) !== s3.field.isMine(x, y)) same = false;
ok(same, 'same mines after load');
ok(back.undoStack.length > 0 && back.undo(), 'undo works after reload');
// 터진 채로 저장했다가 열어도 되돌릴 수 있는가
const s4 = new M.Session(trail, null); s4.reveal(0, 0);
let m4 = null; for (const k of s4.revealed) { M.neighbors(M.kx(k), M.ky(k), (a, b) => { if (!m4 && s4.field.isMine(a, b)) m4 = [a, b]; }); if (m4) break; }
s4.reveal(...m4);
const b4 = new M.Session(trail, JSON.parse(JSON.stringify(s4.toSave())));
ok(b4.exploded !== null && b4.mistakes === 1 && b4.undo() && b4.exploded === null, 'exploded state survives reload and undoes');

// 타임 어택
const t = new M.Session(M.world('timed'), null);
ok(t.timeLeft === 180, 'timed 180'); t.tick(5); ok(t.timeLeft === 180, 'clock waits');
t.reveal(0, 0); t.tick(10); ok(Math.abs(t.timeLeft - (170 + t.solved.size * 20)) < 1e-9, 'clock runs');
ok(t.tick(1e6) && t.gameOver && !t.canUndo, 'time over');
const best = t.best; t.restart(); ok(!t.gameOver && t.timeLeft === 180 && !t.started && t.best === best, 'restart keeps best');

// 오늘의 보드
ok(new M.Session(M.world('daily'), null).field.seed === new M.Session(M.world('daily'), null).field.seed, 'daily seed stable');
const oldDaily = new M.Session(M.world('daily'), null).toSave(); oldDaily.day = 20000101;
ok(new M.Session(M.world('daily'), oldDaily).revealed.size === 0, 'stale daily resets');

// 밀도·첫 탭 크기·무늬 치우침
for (const c of M.WORLDS) {
  const f = new M.Field(42, c.density); let n = 0;
  for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) if (f.isMine(x, y)) n++;
  const d = n / 90000; ok(Math.abs(d - c.density) < 0.01, `${c.id} density ${d.toFixed(4)}`);
}
{ // 행/열 치우침이 없는지 (해시 품질)
  const f = new M.Field(7, 0.16); let worst = 0;
  for (let x = 0; x < 64; x++) { let n = 0; for (let y = 0; y < 2000; y++) if (f.isMine(x, y)) n++; worst = Math.max(worst, Math.abs(n / 2000 - 0.16)); }
  ok(worst < 0.03, `column bias ${worst.toFixed(3)}`);
}
for (const id of ['meadow', 'trail', 'abyss']) {
  let mx = 0, sum = 0;
  for (let i = 0; i < 200; i++) { const q = new M.Session(M.world(id), null); q.reveal(0, 0); mx = Math.max(mx, q.revealed.size); sum += q.revealed.size; }
  console.log(`     ${id} first-open avg ${Math.round(sum / 200)} max ${mx}`);
}
// 큰 저장 크기 추정
const big = new M.Session(M.world('meadow'), null); big.reveal(0, 0);
for (let i = 0; i < 40; i++) { const k = [...big.revealed][Math.floor(Math.random() * big.revealed.size)]; for (let d = 1; d < 30; d++) { const x = M.kx(k) + d, y = M.ky(k); if (!big.field.isMine(x, y)) big.reveal(x, y); if (big.exploded !== null) { big.undo(); break; } } }
console.log(`     save size for ${big.revealed.size} cells: ${(JSON.stringify(big.toSave()).length / 1024).toFixed(1)} KB`);

// ── 하드코어 ──
{
  const H = M.world('hardcore');
  // 회차: 화·목·토 07:00 (KST)
  const at = (iso) => Date.parse(iso);
  ok(M.periodId(M.periodStart(at('2026-10-20T06:59:00+09:00'))) === '20261017', 'Tue 06:59 → Sat 회차');
  ok(M.periodId(M.periodStart(at('2026-10-20T07:00:00+09:00'))) === '20261020', 'Tue 07:00 → 새 회차');
  ok(M.periodId(M.periodStart(at('2026-10-21T23:00:00+09:00'))) === '20261020', 'Wed → Tue 회차');
  ok(M.periodId(M.periodStart(at('2026-10-22T07:30:00+09:00'))) === '20261022', 'Thu 07:30');
  ok(M.periodId(M.periodStart(at('2026-10-26T12:00:00+09:00'))) === '20261024', 'Mon → Sat 회차');
  ok(new Date(M.nextReset(at('2026-10-24T08:00:00+09:00'))).toISOString() === '2026-10-26T22:00:00.000Z', 'Sat → 다음은 화 07:00');
  const idx = []; let t0 = at('2026-10-01T00:00:00+09:00');
  for (let i = 0; i < 12; i++) { t0 = M.nextReset(t0); idx.push(M.periodIndex(t0)); }
  ok(idx.every((v, i) => i === 0 || v === idx[i - 1] + 1), 'periodIndex 연속 ' + idx.join(','));

  const h = new M.Session(H, null);
  ok(h.reveal(-1, 5).changed === false, 'outside board ignored');
  const o = h.reveal(48, 48);
  ok(o.changed && h.revealed.size >= 9 && [...h.revealed].every((k) => h.inBounds(M.kx(k), M.ky(k))), `hc opens in bounds (${h.revealed.size})`);
  ok(h.totalSafe > 7000 && h.totalSafe < 8200, `totalSafe ${h.totalSafe}`);
  ok(h.completion > 0 && h.completion < 100, `completion ${h.completion}%`);
  ok(!h.canUndo && h.undo() === false, 'no undo in hardcore');
  ok(h.gems === 0, 'no gems in hardcore');
  h.tick(12.5); ok(Math.abs(h.playSeconds - 12.5) < 1e-9, 'time counts up');
  // 지뢰 → 끝
  let mine = null; for (const k of h.revealed) { M.neighbors(M.kx(k), M.ky(k), (a, b) => { if (!mine && h.field.isMine(a, b)) mine = [a, b]; }); if (mine) break; }
  const pct = h.completion;
  const d = h.reveal(...mine);
  ok(d.exploded && d.ended === 'dead' && h.gameOver && h.result.end === 'dead', 'mine ends run');
  ok(h.completion === pct && !h.reveal(48, 50).changed, 'frozen after death');
  h.tick(100); ok(Math.abs(h.playSeconds - 12.5) < 1e-9, 'clock stops after death');
  const back = new M.Session(H, JSON.parse(JSON.stringify(h.toSave())));
  ok(back.gameOver && back.result.end === 'dead' && back.completion === pct, 'death survives reload (no refresh escape)');
  // 지난 회차 저장본은 버린다
  const old = h.toSave(); old.period = '20200101';
  ok(new M.Session(H, old).revealed.size === 0, 'stale period resets');
  // 끝까지 다 풀기
  const c = new M.Session(H, null); c.reveal(10, 10);
  let end = null;
  for (let y = 0; y < 96 && !end; y++) for (let x = 0; x < 96 && !end; x++)
    if (!c.field.isMine(x, y) && !c.isRevealed(x, y)) { const r = c.reveal(x, y); if (r.ended) end = r.ended; }
  ok(end === 'clear' && c.completion === 100 && c.result.end === 'clear', 'clear at 100%');
  ok(c.solved.size === 144, `all 144 sectors solved (${c.solved.size})`);
  // 포기
  const g = new M.Session(H, null); g.reveal(5, 5);
  ok(g.giveUp() && g.gameOver && g.result.end === 'giveup', 'give up');
}

console.log(fail ? `${fail} FAILURES` : 'ALL PASS');
process.exit(fail ? 1 : 0);
