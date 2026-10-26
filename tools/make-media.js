// CrazyGames 등록용 커버 이미지·플레이 영상 만들기 (진짜 게임 화면으로 찍는다)
//   1) python3 -m http.server 8765   (minesweeper-web 폴더에서)
//   2) node tools/make-media.js http://localhost:8765/preview/ <출력폴더>
// → cover-landscape-1920x1080.png · cover-portrait-800x1200.png · cover-square-800x800.png
//   video-landscape-1920x1080.mp4 · video-portrait-1080x1620.mp4  (18초, 무음, 첫 장면 = 커버)
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const [base, out] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });

const TITLE = 'Mine Marathon';
const SEED = 20261026;

// 게임을 열고 보기 좋은 판을 만든다 (몇 구역은 그림까지 완성, 깃발 몇 개, 터진 지뢰 하나)
async function stage(page, opts) {
  await page.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('mines-lang', 'en'); } catch (e) {} });
  await page.goto(base + '?home&lang=en');
  await page.waitForSelector('.world');
  await page.addStyleTag({ content: `
    .hud, #timer, #saved, #hint, #toast, #banner, #layer, #aimHint { display: none !important; }
    #coverDim { position: fixed; inset: 0; z-index: 45; pointer-events: none; transition: opacity .5s;
      background: radial-gradient(ellipse at center, rgba(16,40,31,.28) 0%, rgba(16,40,31,.10) 55%, rgba(16,40,31,.32) 100%); }
    #coverTitle { position: fixed; z-index: 50; pointer-events: none; font-family: "Inter Display", Inter, system-ui, sans-serif;
      font-weight: 800; letter-spacing: -0.03em; line-height: .95; color: #fff; text-align: center; white-space: nowrap;
      background: #17382B; border-radius: .22em; padding: .16em .32em .2em;
      box-shadow: 0 .06em 0 #0B1F17, 0 .12em .35em rgba(0,0,0,.35); transition: opacity .5s; }
    #coverTitle span { display: block; }
    #coverTitle .m1 { font-size: .62em; letter-spacing: .14em; color: #fff; padding-left: .14em; }
    #coverTitle .m2 { color: #FFD24A; }
    #tapFx { position: fixed; z-index: 40; width: 70px; height: 70px; margin: -35px 0 0 -35px; border-radius: 50%;
      border: 6px solid rgba(255,255,255,.95); box-shadow: 0 0 0 3px rgba(23,56,43,.35); pointer-events: none; opacity: 0; }
  ` });
  await page.evaluate(async ({ seed, cell, focus }) => {
    await __app.openGame('meadow');
    const g = __app.game, s = g.s, M = Mines;
    s.restart();
    s.field = new M.Field(seed, s.cfg.density, null);
    g.cell = cell;
    // 첫 탭 (안전 보장)
    s.reveal(0, 0);
    // 가운데 구역과 옆 구역 몇 개를 완성해 그림이 보이게
    const solve = (sx, sy) => {
      for (let i = 0; i < 60 && !s.isSolved(sx, sy); i++)
        for (let y = sy * 8; y < sy * 8 + 8; y++) for (let x = sx * 8; x < sx * 8 + 8; x++)
          if (!s.field.isMine(x, y) && !s.isRevealed(x, y)) s.reveal(x, y);
    };
    for (const [sx, sy] of focus.solve) solve(sx, sy);
    // 열린 곳 가장자리에 깃발 몇 개
    let flags = 0;
    for (const k of [...s.revealed]) {
      if (flags >= focus.flags) break;
      M.neighbors(M.kx(k), M.ky(k), (x, y) => {
        if (flags < focus.flags && s.field.isMine(x, y) && !s.isMarked(x, y) && (x + y) % 3 === 0) { s.toggleFlag(x, y); flags++; }
      });
    }
    // 터진 지뢰 하나 (하드코어 분위기)
    if (focus.boom) {
      for (const k of [...s.revealed].reverse()) {
        let f = null;
        M.neighbors(M.kx(k), M.ky(k), (x, y) => { if (!f && s.field.isMine(x, y) && !s.isMarked(x, y) && x > focus.boom[0] && y > focus.boom[1]) f = [x, y]; });
        if (f) { s.exploded = M.key(f[0], f[1]); break; }
      }
    }
    g.fx = [];
    g.centerOn(focus.at[0], focus.at[1], false);
    g.dirty = true;
  }, opts);
  await page.waitForTimeout(250);
}

async function title(page, css) {
  await page.evaluate(({ text, css }) => {
    const [a, b] = text.split(' ');
    const dim = document.createElement('div'); dim.id = 'coverDim'; document.body.appendChild(dim);
    const el = document.createElement('div'); el.id = 'coverTitle';
    el.innerHTML = `<span class="m1">${a.toUpperCase()}</span><span class="m2">${b.toUpperCase()}</span>`;
    for (const [k, v] of Object.entries(css)) el.style.setProperty(k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()), v);
    document.body.appendChild(el);
  }, { text: TITLE, css });
}

const LAYOUTS = {
  landscape: { w: 1920, h: 1080, cell: 66, at: [4, 4], solve: [[0, 0], [1, 0], [-1, 0], [0, 1]], flags: 7, boom: [8, 6],
    title: { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: '150px' } },
  portrait: { w: 800, h: 1200, cell: 50, at: [4, 6], solve: [[0, 0], [0, 1], [-1, 1], [0, -1]], flags: 6, boom: [4, 10],
    title: { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: '96px' } },
  square: { w: 800, h: 800, cell: 46, at: [4, 4], solve: [[0, 0], [1, 0], [0, 1]], flags: 5, boom: [7, 7],
    title: { left: '50%', top: '50%', transform: 'translate(-50%,-50%)', fontSize: '92px' } },
};

async function cover(browser, name) {
  const L = LAYOUTS[name];
  const ctx = await browser.newContext({ viewport: { width: L.w, height: L.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await stage(page, { seed: SEED, cell: L.cell, focus: L });
  await title(page, L.title);
  await page.waitForTimeout(150);
  const file = path.join(out, `cover-${name}-${L.w}x${L.h}.png`);
  await page.screenshot({ path: file });
  await ctx.close();
  return file;
}

// 영상: 시계를 직접 넘기면서 한 장면씩 찍는다 (끊김 없이 30fps)
async function video(browser, name, w, h, cell) {
  const L = { ...LAYOUTS[name], w, h, cell };
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.clock.install();
  await stage(page, { seed: SEED, cell, focus: { ...L, solve: [], flags: 0, boom: null } });
  // 첫 장면 = 커버 이미지 그대로 (CrazyGames 규칙)
  const coverFile = path.join(out, `cover-${name}-${LAYOUTS[name].w}x${LAYOUTS[name].h}.png`);
  const dataUrl = 'data:image/png;base64,' + fs.readFileSync(coverFile).toString('base64');
  await page.evaluate((src) => {
    const img = document.createElement('img'); img.id = 'coverImg'; img.src = src;
    img.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;z-index:60;object-fit:cover;transition:opacity .5s;pointer-events:none';
    document.body.appendChild(img);
  }, dataUrl);
  const dir = path.join(out, `frames-${name}`);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  let n = 0;
  const FPS = 30;
  const shoot = async (ms) => {
    const frames = Math.round((ms / 1000) * FPS);
    for (let i = 0; i < frames; i++) {
      await page.clock.runFor(1000 / FPS);
      await page.screenshot({ path: path.join(dir, `f${String(n++).padStart(5, '0')}.png`) });
    }
  };
  // 이번 판에서 보여 줄 수(手)를 미리 정한다: 안전한 칸은 열고, 지뢰는 깃발
  const plan = await page.evaluate(() => {
    const s = __app.game.s, M = Mines, moves = [];
    const st = s.start || [0, 0];
    const sx0 = Math.floor(st[0] / 8), sy0 = Math.floor(st[1] / 8);
    const order = [[sx0, sy0], [sx0 + 1, sy0], [sx0, sy0 + 1]];
    for (const [sx, sy] of order) {
      const cells = [];
      for (let y = sy * 8; y < sy * 8 + 8; y++) for (let x = sx * 8; x < sx * 8 + 8; x++) cells.push([x, y]);
      cells.sort((a, b) => Math.hypot(a[0] - st[0], a[1] - st[1]) - Math.hypot(b[0] - st[0], b[1] - st[1]));
      for (const [x, y] of cells) moves.push([x, y, s.field.isMine(x, y) ? 'flag' : 'dig']);
    }
    return moves;
  });
  // 0~1초: 커버 그대로
  await shoot(1000);
  // 제목이 사라지고 첫 탭
  await page.evaluate(() => { document.getElementById('coverImg').style.opacity = '0'; });
  await shoot(500);
  const tap = async (x, y, kind) => {
    const done = await page.evaluate(([x, y, kind]) => {
      const g = __app.game, s = g.s;
      if (kind === 'dig' && s.isRevealed(x, y)) return false;
      if (kind === 'flag' && (s.isMarked(x, y))) return false;
      const px = g.ox + (x + .5) * g.cell, py = g.oy + (y + .5) * g.cell;
      if (px < 40 || py < 40 || px > innerWidth - 40 || py > innerHeight - 40) return false;
      g.act(px, py, false, kind === 'flag');
      let fx = document.getElementById('tapFx');
      if (!fx) { fx = document.createElement('div'); fx.id = 'tapFx'; document.body.appendChild(fx); }
      fx.style.left = px + 'px'; fx.style.top = py + 'px';
      fx.animate([{ opacity: 1, transform: 'scale(.5)' }, { opacity: 0, transform: 'scale(1.3)' }], { duration: 380, easing: 'ease-out' });
      return true;
    }, [x, y, kind]);
    return done;
  };
  // 첫 탭: 가운데
  await page.evaluate(() => { const g = __app.game; g.s.restart(); });
  await page.evaluate(([seed]) => { const g = __app.game; g.s.field = new Mines.Field(seed, g.s.cfg.density, null); g.dirty = true; }, [SEED]);
  await tap(0, 0, 'dig');
  await shoot(700);
  let budget = 15.0 * 1000;   // 나머지 시간 (총 ≈ 18초)
  for (const [x, y, kind] of plan) {
    if (budget <= 600) break;
    const did = await tap(x, y, kind);
    if (!did) continue;
    const solvedNow = await page.evaluate(() => __app.game.fx.length > 0);
    const wait = solvedNow ? 1900 : kind === 'flag' ? 260 : 210;
    await shoot(wait); budget -= wait;
  }
  // 끝: 조금 물러나 완성된 그림들 보기
  await page.evaluate(() => { const g = __app.game; g.zoom(0.62); });
  await shoot(Math.max(600, budget));
  await ctx.close();
  const mp4 = path.join(out, `video-${name}-${w}x${h}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, 'f%05d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-preset', 'slow', '-an', '-movflags', '+faststart', mp4]);
  fs.rmSync(dir, { recursive: true, force: true });
  return { mp4, seconds: n / FPS };
}

(async () => {
  const browser = await chromium.launch();
  const which = process.argv[4] || 'all';
  if (which === 'all' || which === 'covers') {
    for (const k of ['landscape', 'portrait', 'square']) console.log('cover', await cover(browser, k));
  }
  if (which === 'all' || which === 'video') {
    console.log('video', await video(browser, 'landscape', 1920, 1080, 66));
    console.log('video', await video(browser, 'portrait', 1080, 1620, 68));
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
