// 공개판 (preview/) 테스트: 보상형 광고 3자리 + 영어 화면에 한글이 남는지
// node tests/public.test.js <base-url-of-preview> <shot-dir>
const { chromium, devices } = require('playwright');
const [base, shots, rankUrl] = process.argv.slice(2);
let fail = 0;
const ok = (c, m) => { if (!c) { fail++; console.log('FAIL', m); } else console.log('ok  ', m); };

async function run(lang, rank) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: lang === 'en' ? 'en-US' : 'ko-KR' });
  // 랭킹 서버 주소를 테스트용으로 바꿔 끼운다 (rank 가 비어 있으면 '서버 없음' 상태)
  await ctx.route('**/preview/config.js', async (route) => {
    const res = await route.fetch(); const body = (await res.text()).replace(/window\.RANK_URL = [^;]*;/, `window.RANK_URL = ${JSON.stringify(rank || '')};`);
    route.fulfill({ response: res, body });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const vp = page.viewportSize();
  const leftovers = new Set();
  const scan = async () => {
    if (lang !== 'en') return;
    const found = await page.evaluate(() => {
      const out = [], re = /[ㄱ-ㆎ가-힣]/;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = w.nextNode());) {
        const el = n.parentElement;
        if (!el || el.closest('[hidden]') || el.closest('script,style')) continue;
        if (re.test(n.nodeValue)) out.push(n.nodeValue.trim());
      }
      document.querySelectorAll('input[placeholder]').forEach((i) => { if (re.test(i.placeholder)) out.push('placeholder:' + i.placeholder); });
      return out;
    });
    found.forEach((f) => leftovers.add(f));
  };

  await page.goto(base);
  // 공개판은 바로 게임으로 들어간다
  await page.waitForSelector('#game:not([hidden])', { timeout: 8000 });
  ok(await page.evaluate(() => __app.game.cfg.id === 'trail'), `[${lang}] lands directly in gameplay`);
  ok(!(await page.$('#giftGo')), `[${lang}] no gift card`);
  await scan();
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  await page.waitForTimeout(200);
  await scan();

  // ① 돋보기가 없을 때 → 광고 보고 +1
  await page.evaluate(() => { __app.profile.magnifiers = 0; __app.profile.wallet = 0; });
  await page.click('#btnMag');
  await page.waitForSelector('#mAd');
  await scan();
  await page.screenshot({ path: `${shots}/pub-${lang}-1-mag.png` });
  ok(await page.$eval('#mGem', (b) => b.disabled), `[${lang}] gem option disabled without gems`);
  await page.click('#mAd');
  await page.waitForSelector('#mockAd');
  const pausedDuring = await page.evaluate(() => true);
  await page.waitForSelector('#mockAd', { state: 'detached', timeout: 5000 });
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => __app.profile.magnifiers === 1), `[${lang}] ad rewarded +1 lens`);
  await scan();
  // 쿨다운: 곧바로 다시는 광고 버튼이 안 보임
  await page.evaluate(() => { __app.profile.magnifiers = 0; });
  await page.click('#btnMag'); await page.waitForSelector('#mNo');
  ok(!(await page.$('#mAd')), `[${lang}] ad button hidden during cooldown`);
  await scan();
  await page.click('#mNo');

  // ② 지뢰 → 무료 3번 → 그다음 광고/보석/깃발
  const hitMine = async () => {
    await page.evaluate(() => {
      const g = __app.game, s = g.s, M = Mines;
      for (const k of s.revealed) { let f = null; M.neighbors(M.kx(k), M.ky(k), (x, y) => { if (!f && s.field.isMine(x, y) && !s.isMarked(x, y)) f = [x, y]; }); if (f) { g.centerOn(f[0], f[1], false); return; } }
    });
    await page.waitForTimeout(60);
    await page.touchscreen.tap(vp.width / 2, vp.height / 2);
    await page.waitForSelector('#boomCard');
  };
  for (let i = 3; i >= 1; i--) {
    await hitMine();
    await scan();
    ok((await page.textContent('#bFree')).match(/\d/)[0] === String(i), `[${lang}] free undo ${i} left`);
    await page.click('#bFree');
    await page.waitForTimeout(100);
    ok(await page.evaluate(() => __app.game.s.exploded === null), `[${lang}] free undo works`);
  }
  await hitMine();
  ok(!(await page.$('#bFree')) && !!(await page.$('#bAd')) && !!(await page.$('#bFlag')), `[${lang}] after free undos: ad + flag options`);
  await scan();
  await page.screenshot({ path: `${shots}/pub-${lang}-2-boom.png` });
  const sizes = await page.evaluate(() => ['#bAd', '#bGem', '#bFlag'].map((q) => { const r = document.querySelector(q).getBoundingClientRect(); return Math.round(r.width) + 'x' + Math.round(r.height); }));
  ok(new Set(sizes).size === 1, `[${lang}] options are the same size ${sizes}`);
  await page.click('#bAd');
  await page.waitForSelector('#mockAd', { state: 'detached', timeout: 5000 });
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => __app.game.s.exploded === null), `[${lang}] ad reward undid mine`);
  await scan();
  // 보석으로
  await page.evaluate(() => { __app.profile.wallet = 15; });
  await hitMine();
  ok(!(await page.$('#bAd')), `[${lang}] no ad offer within cooldown`);
  await page.click('#bGem'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => __app.game.s.exploded === null && __app.profile.wallet === 5), `[${lang}] gem undo costs 10`);
  // 깃발 꽂고 계속 → 되돌리기 버튼으로 공짜 우회가 안 되는지
  await hitMine();
  await page.click('#bFlag'); await page.waitForTimeout(100);
  await page.click('#btnUndo');
  ok(!!(await page.$('#undoCard')), `[${lang}] undo button on mine move asks for free/ad/gems`);
  await scan();
  await page.click('#bNo');

  // ③ 타임 어택 → 광고 보고 +30초
  await page.evaluate(() => __app.closeGame());
  await page.waitForSelector('#home:not([hidden])');
  await scan();
  await page.screenshot({ path: `${shots}/pub-${lang}-0-home.png` });
  // 홈 아래쪽 시트들
  for (const id of ['#btnThemes', '#btnAlbum', '#btnSettings']) {
    await page.click(id); await page.waitForSelector('.sheet'); await page.waitForTimeout(150); await scan();
    await page.click('.veil', { position: { x: 20, y: 20 } }); await page.waitForTimeout(100);
  }
  ok(await page.isHidden('#btnGift') && await page.isHidden('#installTip'), `[${lang}] gift-only UI hidden`);
  ok((await page.isHidden('#btnRank')) === !rank, `[${lang}] ranking button ${rank ? 'shown' : 'hidden'} (server ${rank ? 'set' : 'unset'})`);
  await page.evaluate(() => __app.openGame('timed'));
  await page.waitForSelector('#game:not([hidden])');
  await page.touchscreen.tap(vp.width / 2, vp.height / 2);
  await page.waitForTimeout(300);
  await page.evaluate(() => { __app.game.s.timeLeft = 0.2; });
  await page.waitForSelector('#oAd', { timeout: 4000 });
  await scan();
  await page.screenshot({ path: `${shots}/pub-${lang}-3-time.png` });
  await page.click('#oAd');
  await page.waitForSelector('#mockAd', { state: 'detached', timeout: 5000 });
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => !__app.game.s.gameOver && __app.game.s.timeLeft > 25 && __app.game.s.continued), `[${lang}] +30s continue`);
  await page.evaluate(() => { __app.game.s.timeLeft = 0.2; });
  await page.waitForSelector('#oAgain', { timeout: 4000 });
  ok(!(await page.$('#oAd')), `[${lang}] continue only once per run`);
  await page.click('#oAgain');

  // 하드코어: 광고 없음
  await page.evaluate(() => __app.closeGame());
  await page.evaluate(() => __app.openGame('hardcore'));
  await page.waitForSelector('#game.hc');
  await page.touchscreen.tap(vp.width / 2, vp.height / 2); await page.waitForTimeout(200);
  await scan();
  await page.click('#btnMenu'); await page.waitForSelector('.sheet'); await scan();
  ok(!!(await page.$('[data-a="rank"]')) === !!rank, `[${lang}] hardcore ranking menu only with server`);
  await page.click('[data-a="giveup"]'); await page.click('#gGo');
  await page.waitForSelector('.hcres'); await page.waitForTimeout(100); await scan();
  ok(!(await page.$('#oAd')), `[${lang}] hardcore result: no ads`);
  if (!rank) ok(!(await page.$('#hSend')), `[${lang}] no submit without server`);
  else {
    ok(!!(await page.$('#hSend')), `[${lang}] submit with server`);
    await page.screenshot({ path: `${shots}/pub-${lang}-4-hc.png` });
    await page.fill('#nick', 'Sunny fuck'); await page.click('#hSend');
    await page.waitForSelector('.rkr', { timeout: 8000 }); await page.waitForTimeout(150); await scan();
    const rows = await page.$$eval('.rkr', (els) => els.map((e) => e.textContent));
    ok(rows.some((r) => r.includes('Sunny ****')), `[${lang}] ranked with masked name: ${rows[0]}`);
    await page.screenshot({ path: `${shots}/pub-${lang}-6-rank.png` });
    await page.click('#rkName'); await page.waitForSelector('#nick2'); await scan();
    await page.fill('#nick2', 'Sunny'); await page.click('#rnGo');
    await page.waitForFunction(() => [...document.querySelectorAll('.rkr')].some((e) => e.textContent.includes('Sunny') && !e.textContent.includes('*')), null, { timeout: 8000 });
    await scan();
    await page.click('.tab:not(.on)'); await page.waitForSelector('.rkmsg'); await page.waitForTimeout(400); await scan();
  }

  // 저장 공간이 선물판과 분리돼 있는가
  const ns = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('im:')).length);
  ok(ns === 0, `[${lang}] uses separate storage from gift edition`);

  ok(errors.length === 0, `[${lang}] no page errors ` + JSON.stringify(errors));
  if (lang === 'en') {
    const list = [...leftovers].filter(Boolean);
    ok(list.length === 0, `[en] no Korean left on screen (${list.length})`);
    if (list.length) console.log(list.map((x) => '   · ' + JSON.stringify(x)).join('\n'));
  }
  await browser.close();
}

(async () => {
  await run('en', rankUrl);
  await run('ko', null);
  console.log(fail ? `${fail} FAILURES` : 'ALL PASS');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
