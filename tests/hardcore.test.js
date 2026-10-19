// 하드코어 + 랭킹 브라우저 테스트 (모의 랭킹 서버 사용)
// node tests/hardcore.test.js <base-url> <shot-dir> <rank-url>
const { chromium, devices } = require('playwright');
const [base, shots, rankUrl] = process.argv.slice(2);
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'block' });
  await ctx.route('**/config.js', (r) => r.fulfill({ contentType: 'application/javascript', body: `window.RANK_URL = ${JSON.stringify(rankUrl)};` }));
  let page = await ctx.newPage();
  const errors = [];
  const watch = (p) => { p.on('pageerror', (e) => errors.push(e.message)); };
  watch(page);
  const vp = page.viewportSize();

  await page.goto(base); await page.waitForSelector('.world');
  if (await page.isVisible('#giftGo')) await page.click('#giftGo');
  ok(await page.isVisible('.world.hc'), 'hardcore card on home');
  await page.screenshot({ path: shots + '/hc1-home.png' });
  await page.click('.world.hc');
  await page.waitForSelector('#game:not([hidden])');
  ok(await page.isHidden('#btnUndo') && await page.isHidden('#btnMag'), 'no undo / magnifier buttons');
  ok(await page.isVisible('#gPct'), 'completion pill shown');
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  await page.waitForTimeout(1600);
  const st = await page.evaluate(() => ({ pct: __app.game.s.completion, t: __app.game.s.playSeconds, start: __app.game.s.start }));
  ok(st.pct > 0 && st.t > 0.7, `run started (${st.pct}%, ${st.t.toFixed(1)}s)`);
  ok(await page.isVisible('#timer'), 'elapsed timer visible');
  await page.screenshot({ path: shots + '/hc2-start.png' });

  // 새로고침해도 이어진다 (도망칠 수 없다)
  await page.waitForTimeout(400);
  await page.reload(); await page.waitForSelector('.world'); await page.click('.world.hc'); await page.waitForSelector('#game:not([hidden])');
  const st2 = await page.evaluate(() => ({ pct: __app.game.s.completion, t: __app.game.s.playSeconds }));
  ok(st2.pct === st.pct && st2.t >= st.t - 0.3, 'run continues after reload');

  // 그림
  const art = await page.evaluate(() => { const a = __app.hcArt(__app.game.s.period); return { n: a.px.filter(Boolean).length, name: a.name }; });
  ok(art.n > 200, `period picture ready (${art.name}, ${art.n} px)`);

  // 지뢰 밟기 → 결과 카드, 되돌리기 없음
  const mine = await page.evaluate(() => {
    const g = __app.game, s = g.s, M = Mines;
    for (const k of s.revealed) { let f = null; M.neighbors(M.kx(k), M.ky(k), (x, y) => { if (!f && s.field.isMine(x, y)) f = [x, y]; }); if (f) { g.centerOn(f[0], f[1], false); return f; } }
  });
  await page.waitForTimeout(80);
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  await page.waitForSelector('.hcres', { timeout: 4000 });
  ok(!(await page.$('#bUndo')), 'no undo on death');
  ok(await page.evaluate(() => __app.game.s.gameOver && __app.game.s.result.end === 'dead'), 'run over');
  await page.screenshot({ path: shots + '/hc3-dead.png' });
  // 죽은 뒤 새로고침 → 그대로 끝난 상태
  await page.waitForTimeout(400);
  await page.reload(); await page.waitForSelector('.world'); await page.click('.world.hc');
  await page.waitForSelector('.hcres');
  ok(true, 'death persists after reload');

  // 이름 (비속어) → 올리기 → 순위표
  const nameInput = await page.$('#nick');
  ok(!!nameInput, 'name input shown');
  await page.fill('#nick', '선화최고짱짱짱짱짱');  // 9자
  ok((await page.textContent('#nickW')).includes('9/8'), 'width counter over');
  await page.click('#hSend');
  ok((await page.textContent('#hMsg')).includes('8자'), 'too long rejected');
  await page.fill('#nick', '씨발선화');
  await page.click('#hSend');
  await page.waitForSelector('.rkr', { timeout: 8000 });
  const rows = await page.$$eval('.rkr', (els) => els.map((e) => e.textContent));
  ok(rows.length === 1 && rows[0].includes('**선화') && rows[0].includes('🥇'), 'ranked #1 with masked name: ' + rows[0]);
  ok(await page.evaluate(() => __app.profile.nickname === '**선화'), 'nickname stored masked');
  await page.screenshot({ path: shots + '/hc4-rank.png' });

  // 다른 사람 기록 (서버에 직접)
  const fetchJ = (body) => page.evaluate(async ([u, b]) => (await fetch(u, { method: 'POST', body: JSON.stringify(b) })).json(), [rankUrl, body]);
  const per = await page.evaluate(() => __app.game.s.period);
  await fetchJ({ period: per, pid: 'zzzzzzzzzzzzz1', name: '오빠', pct: 88.8, time: 6000, end: 'dead' });
  await fetchJ({ period: per, pid: 'zzzzzzzzzzzzz2', name: '친구', pct: 0.1, time: 50, end: 'dead' });

  // 새로 도전 → 더 나쁜 기록 → 갱신 안 됨
  await page.click('.veil', { position: { x: 20, y: 20 } });
  await page.evaluate(() => __app.closeGame());
  await page.click('.world.hc'); await page.waitForSelector('.hcres');
  await page.click('#hAgain');
  ok(await page.evaluate(() => !__app.game.s.started && !__app.game.s.gameOver), 'new attempt');
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => __app.profile.hcBest[__app.game.s.period]);
  await page.click('#btnMenu'); await page.click('[data-a="giveup"]'); await page.click('#gGo');
  await page.waitForSelector('.hcres');
  const worse = await page.evaluate((b) => { const s = __app.game.s; return s.completion < b.pct || (s.completion === b.pct); }, before);
  if (worse) {
    ok(await page.$('#hRank') && !(await page.$('#hSend')), 'worse run: only "view ranking"');
    ok(await page.evaluate((b) => { const n = __app.profile.hcBest[__app.game.s.period]; return n.pct === b.pct && n.time === b.time; }, before), 'local best unchanged');
  } else console.log('     (second run happened to be better; skip)');

  // 완성 (100%) 시나리오 → 순위 1등
  await page.click('#hAgain');
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  await page.waitForTimeout(150);
  const last = await page.evaluate(() => {
    const s = __app.game.s;
    const left = () => { const r = []; for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) if (!s.field.isMine(x, y) && !s.isRevealed(x, y)) r.push([x, y]); return r; };
    // 끝 칸: 이웃에 0인 칸이 없어서 다른 칸을 열 때 함께 열리지 않는 칸
    const isolated = ([x, y]) => { let ok2 = true; Mines.neighbors(x, y, (a, b) => { if (a >= 0 && b >= 0 && a < 96 && b < 96 && !s.field.isMine(a, b) && s.field.count(a, b) === 0) ok2 = false; }); return ok2; };
    const lastCell = left().find(isolated);
    for (const c of left()) if (c[0] !== lastCell[0] || c[1] !== lastCell[1]) if (!s.isRevealed(...c)) s.reveal(...c);
    s.playSeconds = 5400; __app.game.centerOn(lastCell[0], lastCell[1], false); __app.game.cell = 34; __app.game.centerOn(lastCell[0], lastCell[1], false);
    return lastCell;
  });
  await page.waitForTimeout(100);
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  await page.waitForTimeout(900);
  await page.screenshot({ path: shots + '/hc5-clear-anim.png' });
  await page.waitForSelector('.hcres', { timeout: 5000 });
  ok(await page.evaluate(() => __app.game.s.result.end === 'clear' && __app.game.s.completion === 100), 'clear at 100%');
  ok((await page.textContent('.hcres')).includes('이번 회차 그림'), 'picture name revealed on clear');
  await page.screenshot({ path: shots + '/hc6-clear.png' });
  await page.click('#hSend');
  await page.waitForSelector('.rkr');
  const rows2 = await page.$$eval('.rkr', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ')));
  ok(rows2[0].includes('**선화') && rows2[0].includes('100%') && rows2[1].includes('오빠'), 'clear ranks first: ' + rows2.join(' | '));
  ok(rows2.length === 3, 'one row per person');

  // 이름 바꾸기
  await page.click('#rkName'); await page.fill('#nick2', '선화💖'); await page.click('#rnGo');
  await page.waitForFunction(() => [...document.querySelectorAll('.rkr')].some((e) => e.textContent.includes('선화💖')), null, { timeout: 8000 });
  ok(true, 'rename updates ranking');
  await page.screenshot({ path: shots + '/hc7-rank2.png' });

  // 보드 전체 보기 (그림)
  await page.click('.veil', { position: { x: 20, y: 20 } });
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await browser.close();
  console.log(fail ? `${fail} FAILURES` : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
