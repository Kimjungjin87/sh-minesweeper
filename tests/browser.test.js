// 아이폰 크기 브라우저로 실제 플레이 → 새로고침 → 복원 → 오프라인까지 확인
// node tests/browser.test.js <base-url> <shot-dir>
const { chromium, devices } = require('playwright');
const base = process.argv[2], shots = process.argv[3];
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], serviceWorkers: 'allow' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(base);
  await page.waitForSelector('.world');
  ok(await page.isVisible('#giftGo'), 'gift card on first launch');
  await page.screenshot({ path: shots + '/1-gift.png' });
  await page.click('#giftGo');
  await page.screenshot({ path: shots + '/2-home.png', fullPage: false });

  // 오솔길 열기
  await page.click('.world[data-id="trail"]');
  await page.waitForSelector('#game:not([hidden])');
  ok(await page.isVisible('#hint'), 'start hint shown');
  const vp = page.viewportSize();
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  await page.waitForTimeout(150);
  const open1 = await page.evaluate(() => __app.game.s.revealed.size);
  ok(open1 >= 9, `first tap opened ${open1}`);
  ok(await page.isHidden('#hint'), 'hint hidden after start');

  // 화면 위에서 숨은 칸 하나를 골라 길게 눌러 깃발
  const target = await page.evaluate(() => {
    const g = __app.game, s = g.s, M = Mines;
    for (const k of s.revealed) {
      let found = null;
      M.neighbors(M.kx(k), M.ky(k), (x, y) => { if (!found && !s.isRevealed(x, y)) found = [x, y]; });
      if (found) { const [x, y] = found; g.centerOn(x, y, false); return { x, y, px: g.ox + (x + 0.5) * g.cell, py: g.oy + (y + 0.5) * g.cell, mine: s.field.isMine(x, y) }; }
    }
  });
  // 길게 누르기: 마우스로 흉내 (pointer 이벤트)
  await page.mouse.move(target.px, target.py); await page.mouse.down(); await page.waitForTimeout(450); await page.mouse.up();
  ok(await page.evaluate(([x, y]) => __app.game.s.isFlagged(x, y), [target.x, target.y]), 'long-press places flag');
  await page.screenshot({ path: shots + '/3-board.png' });

  // 깃발 모드를 켜고 껐다 켜도 그대로인가 (선화 피드백)
  await page.click('#mode');
  ok(await page.evaluate(() => __app.game.flagMode), 'flag mode on');
  await page.waitForTimeout(300);
  await page.reload(); await page.waitForSelector('.world'); await page.click('.world[data-id="trail"]'); await page.waitForSelector('#game:not([hidden])');
  ok(await page.evaluate(() => __app.game.flagMode) && (await page.textContent('#modeT1')).includes('깃발'), 'flag mode remembered after reopen');
  await page.click('#mode');
  ok(await page.evaluate(() => !__app.game.flagMode && !__app.profile.flagMode), 'back to dig mode');
  await page.evaluate(() => __app.game.centerOn(...__app.game.s.start, false));
  await page.waitForTimeout(50);

  // 끌어서 이동
  const ox0 = await page.evaluate(() => __app.game.ox);
  await page.mouse.move(200, 400); await page.mouse.down(); await page.mouse.move(150, 380, { steps: 5 }); await page.mouse.up();
  const ox1 = await page.evaluate(() => __app.game.ox);
  ok(Math.abs(ox1 - ox0 + 50) < 2, `drag pans (${(ox1 - ox0).toFixed(1)})`);
  const flagsAfterDrag = await page.evaluate(() => __app.game.s.flagged.size);
  ok(flagsAfterDrag === 1, 'drag did not tap');

  // 지뢰 밟기 → 카드 → 되돌리기
  const mine = await page.evaluate(() => {
    const g = __app.game, s = g.s, M = Mines;
    for (const k of s.revealed) {
      let found = null;
      M.neighbors(M.kx(k), M.ky(k), (x, y) => { if (!found && s.field.isMine(x, y) && !s.isFlagged(x, y)) found = [x, y]; });
      if (found) { const [x, y] = found; g.centerOn(x, y, false); return { x, y }; }
    }
  });
  await page.waitForTimeout(50);
  const mp = await page.evaluate(({ x, y }) => { const g = __app.game; return { px: g.ox + (x + 0.5) * g.cell, py: g.oy + (y + 0.5) * g.cell }; }, mine);
  const before = await page.evaluate(() => __app.game.s.revealed.size);
  await page.touchscreen.tap(mp.px, mp.py);
  await page.waitForSelector('#boomCard');
  ok(await page.evaluate(() => __app.game.s.mistakes === 1 && __app.profile.lifetimeMistakes === 1), 'mistake counted (board + lifetime)');
  await page.screenshot({ path: shots + '/4-boom.png' });

  // 터진 상태로 새로고침 → 복원되는가
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForSelector('.world');
  await page.click('.world[data-id="trail"]');
  await page.waitForSelector('#boomCard');
  ok(true, 'exploded state restored after reload');
  await page.click('#bUndo');
  await page.waitForTimeout(100);
  ok(await page.evaluate((b) => __app.game.s.exploded === null && __app.game.s.revealed.size === b && __app.game.s.mistakes === 1, before), 'undo after reload restores board, mistake stays');
  ok(await page.evaluate(([x, y]) => __app.game.s.isFlagged(x, y), [target.x, target.y]), 'flag survived reload');

  // 많이 플레이 → 나가기 → 홈 통계
  await page.evaluate(() => {
    const s = __app.game.s, M = Mines;
    for (let i = 0; i < 400; i++) {
      for (const k of [...s.revealed]) {
        let hit = null;
        M.neighbors(M.kx(k), M.ky(k), (x, y) => { if (!hit && !s.isRevealed(x, y) && !s.field.isMine(x, y) && !s.isFlagged(x, y)) hit = [x, y]; });
        if (hit) { __app.game.act(__app.game.ox + (hit[0] + .5) * __app.game.cell, __app.game.oy + (hit[1] + .5) * __app.game.cell, false); break; }
      }
    }
  });
  const st = await page.evaluate(() => ({ r: __app.game.s.revealed.size, sol: __app.game.s.solved.size, gems: __app.game.s.gems, wallet: __app.profile.wallet }));
  console.log('     after play', st);
  ok(st.gems === st.wallet, 'wallet tracks gems');
  // 돋보기: 완성한 구역 수만큼 받았는가 → 쓰기 → 5초 뒤 사라지는가
  const mag0 = await page.evaluate(() => __app.profile.magnifiers);
  ok(mag0 === st.sol, `magnifiers earned ${mag0} == sectors ${st.sol}`);
  ok(+(await page.textContent('#magN')) === mag0, 'badge shows count');
  const spot = await page.evaluate(() => {
    const g = __app.game, s = g.s, M = Mines;
    for (const k of s.revealed) { let f = null; M.neighbors(M.kx(k), M.ky(k), (x, y) => { if (!f && !s.isRevealed(x, y)) f = [x, y]; }); if (f) { g.centerOn(f[0], f[1], false); return f; } }
  });
  await page.click('#btnMag');
  ok(await page.isVisible('#aimHint'), 'aim hint visible');
  await page.waitForTimeout(60);
  const rb = await page.evaluate(() => __app.game.s.revealed.size);
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  await page.waitForTimeout(400);
  const pk = await page.evaluate(() => { const p = __app.game.peekState; return p && { n: p.cells.length, mines: p.cells.filter((c) => c.mine).length, ok: p.cells.every((c) => c.mine === __app.game.s.field.isMine(c.x, c.y)) }; });
  ok(pk && pk.ok && pk.n > 0, `peek shows 3x3 (${pk && pk.n} cells, ${pk && pk.mines} mines)`);
  ok(await page.evaluate((b) => __app.game.s.revealed.size === b && __app.game.s.exploded === null, rb), 'peek tap did not dig');
  ok(await page.evaluate((m) => __app.profile.magnifiers === m - 1, mag0), 'one magnifier used');
  ok(await page.isHidden('#aimHint'), 'aim ends after use');
  await page.screenshot({ path: shots + '/10-peek.png' });
  await page.waitForTimeout(5000);
  ok(await page.evaluate(() => __app.game.peekState === null), 'peek fades after 5s');
  // 다 쓰면 안내만
  await page.evaluate(() => { __app.profile.magnifiers = 0; });
  await page.click('#btnMag');
  ok(await page.isHidden('#aimHint'), 'no aim with 0 magnifiers');
  await page.evaluate(() => __app.game.zoom(0.6));
  await page.waitForTimeout(100);
  await page.screenshot({ path: shots + '/5-played.png' });
  await page.click('#btnBack');
  await page.waitForSelector('#home:not([hidden])');
  const homeSectors = await page.textContent('#tSectors');
  ok(+homeSectors === st.sol, `home shows sectors ${homeSectors}`);
  await page.screenshot({ path: shots + '/6-home-after.png' });

  // 앱을 완전히 닫았다 연다 (새 페이지) → 그대로인가
  await page.close();
  const p2 = await ctx.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(base);
  await p2.waitForSelector('.world');
  ok(!(await p2.isVisible('#giftGo')), 'gift not shown again');
  await p2.click('.world[data-id="trail"]');
  await p2.waitForSelector('#game:not([hidden])');
  await p2.waitForTimeout(100);
  const st2 = await p2.evaluate(() => ({ r: __app.game.s.revealed.size, sol: __app.game.s.solved.size, gems: __app.game.s.gems, cell: __app.game.cell }));
  ok(st2.r === st.r && st2.sol === st.sol && st2.gems === st.gems, `progress restored ${JSON.stringify(st2)}`);
  ok(await p2.evaluate(() => __app.profile.magnifiers === 0 && __app.game.s.rewarded.size === __app.game.s.solved.size), 'magnifier count + rewarded persisted');
  ok(Math.abs(st2.cell - 24) < 1, 'zoom/camera restored');

  // 저장소 두 군데에 다 있는가
  const both = await p2.evaluate(async () => {
    const ls = !!localStorage.getItem('im:world:trail');
    const db = await new Promise((res) => { const r = indexedDB.open('infinite-mines', 1); r.onsuccess = () => { const g = r.result.transaction('kv').objectStore('kv').get('world:trail'); g.onsuccess = () => res(!!g.result); }; });
    return { ls, db };
  });
  ok(both.ls && both.db, 'saved in both IndexedDB and localStorage');

  // localStorage 를 지워도 IndexedDB 로 살아나는가
  await p2.evaluate(() => localStorage.clear());
  await p2.reload(); await p2.waitForSelector('.world');
  ok(+(await p2.textContent('#tSectors')) === st.sol, 'recovers from IndexedDB when localStorage wiped');

  // 백업 내보내기 → 기록 지우기 → 불러오기
  const backup = await p2.evaluate(async () => JSON.stringify(await __app.Storage.exportAll(Mines.WORLDS.map((w) => w.id))));
  ok(backup.length > 100, `backup size ${(backup.length / 1024).toFixed(1)}KB`);
  await p2.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('infinite-mines'); q.onsuccess = q.onerror = q.onblocked = r; }); });
  const fs = require('fs'); const bpath = shots + '/backup.json'; fs.writeFileSync(bpath, backup);
  await p2.reload(); await p2.waitForSelector('.world');
  if (await p2.isVisible('#giftGo')) await p2.click('#giftGo');
  ok(+(await p2.textContent('#tSectors')) === 0, 'wiped');
  await p2.setInputFiles('#fileIn', bpath);
  await p2.waitForSelector('#impGo');
  await Promise.all([p2.waitForNavigation(), p2.click('#impGo')]);
  await p2.waitForSelector('.world');
  ok(+(await p2.textContent('#tSectors')) === st.sol, 'backup import restores');

  // 타임 어택
  await p2.click('.world[data-id="timed"]');
  await p2.waitForSelector('#game:not([hidden])');
  await p2.touchscreen.tap(vp.width / 2, vp.height / 2);
  await p2.waitForTimeout(1300);
  const tl = await p2.evaluate(() => __app.game.s.timeLeft);
  ok(tl < 180 && tl > 170, `timer runs ${tl.toFixed(1)}`);
  ok(await p2.isVisible('#timer'), 'timer visible');
  await p2.evaluate(() => { __app.game.s.timeLeft = 0.3; });
  await p2.waitForSelector('#oAgain', { timeout: 3000 });
  await p2.screenshot({ path: shots + '/7-timeover.png' });
  await p2.click('#oAgain');
  ok(await p2.evaluate(() => !__app.game.s.gameOver && !__app.game.s.started), 'retry');
  await p2.click('#btnBack');

  // 테마 + 설정 화면
  await p2.evaluate(() => { __app.profile.wallet = 200; });
  await p2.click('#btnThemes'); await p2.click('.theme[data-id="night"]');
  ok(await p2.evaluate(() => __app.profile.theme === 'night' && __app.profile.wallet === 140), 'buy theme');
  await p2.click('.veil', { position: { x: 30, y: 30 } });
  await p2.click('#btnSettings'); await p2.waitForSelector('.sheet');
  await p2.screenshot({ path: shots + '/8-settings-night.png' });
  await p2.click('.veil', { position: { x: 30, y: 30 } });
  await p2.click('.world[data-id="meadow"]'); await p2.waitForSelector('#game:not([hidden])');
  await p2.touchscreen.tap(vp.width / 2, vp.height / 2); await p2.waitForTimeout(150);
  await p2.screenshot({ path: shots + '/9-night-board.png' });
  await p2.click('#btnBack');

  // 오프라인으로 다시 열기 (서비스워커)
  await p2.waitForTimeout(800);
  const swReady = await p2.evaluate(async () => !!(await navigator.serviceWorker.ready));
  ok(swReady, 'service worker active');
  await ctx.setOffline(true);
  await p2.reload();
  await p2.waitForSelector('.world', { timeout: 5000 });
  ok(+(await p2.textContent('#tSectors')) >= st.sol, 'opens offline with progress');
  await ctx.setOffline(false);

  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await browser.close();
  console.log(fail ? `${fail} FAILURES` : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
