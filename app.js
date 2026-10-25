/* 무한 지뢰찾기 — 화면 */
(function () {
  'use strict';

  // ✏️ 선물 받는 사람에게 보여 줄 말. 원하는 대로 고쳐 쓰세요.
  const GIFT = {
    title: 'SH지뢰찾기',
    message: '선화를 위한 무한 지뢰!!\n조금씩해유~\n업데이트는 무료',
    from: '— 오빠가~',
  };

  // 에디션: 'gift'(선화 선물판, 기본) / 'public'(공개판: 보상형 광고·영어·바로 시작)
  const ED = Object.assign({ id: 'gift', name: GIFT.title, ads: 'none', gift: true, sw: true, ranking: true }, window.EDITION || {});
  const PUBLIC = ED.id !== 'gift';
  const ADS = PUBLIC && ED.ads !== 'none';
  const FREE_UNDO = 3;        // 공개판: 지뢰 되돌리기 하루 무료 횟수
  const UNDO_GEMS = 10;       // 공개판: 보석으로 되돌리기
  const MAG_GEMS = 20;        // 공개판: 보석으로 돋보기 사기
  const TIME_BONUS = 30;      // 공개판: 타임 어택 이어하기 초
  const tr = (t) => (window.I18N ? window.I18N.t(t) : t);

  const { WORLDS, world, key, kx, ky, fdiv, SECTOR, Session, todayStamp } = Mines;
  const PEEK_MS = 5000;
  const RIPPLE_MS = 55;   // 그림이 가운데서부터 한 칸씩 번져 나가는 간격
  const picOf = (field, sx, sy) => Pictures.pick(Mines.hash(field.seed, sx, sy, 11));

  // ─────────────────────────── 하드코어: 회차 그림 ───────────────────────────
  // 회차마다 그림 하나. 96×96 보드 전체가 48×48 그림이 되고(그림 한 점 = 2×2 칸),
  // 구역을 풀 때마다 그 자리의 조각이 드러난다.
  const HC_PICS = [
    ['🐱', '고양이'], ['🌸', '벚꽃'], ['🐶', '강아지'], ['🍓', '딸기'], ['🐰', '토끼'], ['🌻', '해바라기'],
    ['🐼', '판다'], ['🍰', '케이크'], ['🦊', '여우'], ['🌈', '무지개'], ['🐥', '병아리'], ['🍑', '복숭아'],
    ['🐧', '펭귄'], ['🧁', '컵케이크'], ['🐳', '고래'], ['🍀', '네잎클로버'], ['🦄', '유니콘'], ['🍉', '수박'],
    ['🐹', '햄스터'], ['🦋', '나비'], ['🐨', '코알라'], ['🍒', '체리'], ['🐢', '거북이'], ['💝', '선물'],
  ];
  const hcPic = (pStart) => HC_PICS[((Mines.periodIndex(pStart) % HC_PICS.length) + HC_PICS.length) % HC_PICS.length];
  const hcCache = {};
  function hcArt(periodId) {
    if (hcCache[periodId]) return hcCache[periodId];
    const [y, m, d] = [periodId.slice(0, 4), periodId.slice(4, 6), periodId.slice(6, 8)];
    const start = Date.parse(`${y}-${m}-${d}T07:00:00+09:00`);
    const [emoji, name] = hcPic(start);
    const N = 48, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c2 = cv.getContext('2d', { willReadFrequently: true });
    c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.font = `${N * 0.86}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
    c2.fillText(emoji, N / 2, N / 2 + N * 0.04);
    const px = new Array(N * N).fill(null);
    let filled = 0;
    try {
      const d2 = c2.getImageData(0, 0, N, N).data;
      for (let i = 0; i < N * N; i++) {
        if (d2[i * 4 + 3] > 110) {
          px[i] = `rgb(${d2[i * 4]},${d2[i * 4 + 1]},${d2[i * 4 + 2]})`; filled++;
        }
      }
    } catch (e) {}
    if (filled < N * N * 0.12) {   // 그림 글꼴이 없으면 작은 그림을 크게 확대해 쓴다
      const pic = Pictures.list[Mines.periodIndex(start) % Pictures.list.length];
      for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
        const ch = pic.px[Math.floor(yy / 6)][Math.floor(xx / 6)];
        px[yy * N + xx] = ch === '+' ? pic.c1 : ch === '#' ? pic.c2 : null;
      }
    }
    return (hcCache[periodId] = { emoji, name, px, N });
  }
  const hcColor = (art, x, y) => art.px[(y >> 1) * art.N + (x >> 1)];

  // ─────────────────────────── 랭킹 서버 ───────────────────────────
  const rankOn = () => !!(window.RANK_URL && /^https?:\/\//.test(window.RANK_URL));
  const rankingOn = () => ED.ranking && rankOn();
  async function rankFetch(opts) {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 12000);
    try {
      const res = await fetch(opts.url, { ...opts.init, signal: ctl.signal, redirect: 'follow' });
      return await res.json();
    } finally { clearTimeout(t); }
  }
  function rankTop(period) {
    const u = `${window.RANK_URL}?action=top&period=${period}&pid=${profile.pid}&limit=50`;
    return rankFetch({ url: u, init: { method: 'GET' } });
  }
  function rankSubmit(rec) {
    // text/plain 이라야 브라우저가 사전 요청(CORS preflight)을 하지 않는다 → Apps Script 와 잘 맞는다
    return rankFetch({ url: window.RANK_URL, init: { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(rec) } });
  }
  /** 기록을 낸다. 실패하면 맡겨 두었다가 다음에 다시 낸다. */
  async function submitBest(period) {
    const b = profile.hcBest[period];
    if (!b) return { ok: false, error: 'no record' };
    const rec = { period, pid: profile.pid, name: profile.nickname || '익명', pct: b.pct, time: b.time, end: b.end };
    if (!rankOn()) { profile.hcPending = rec; saveProfile(); return { ok: false, error: 'no server' }; }
    try {
      const r = await rankFetch({ url: window.RANK_URL, init: { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(rec) } });
      if (r && r.ok) {
        profile.hcPending = null; b.submitted = true; b.rank = r.me && r.me.rank;
        if (r.name && r.name !== profile.nickname) profile.nickname = r.name;   // 서버가 가린 이름으로 맞춘다
        saveProfile(); return r;
      }
      if (r && /period closed/.test(r.error || '')) { profile.hcPending = null; saveProfile(); }
      else { profile.hcPending = rec; saveProfile(); }
      return r || { ok: false };
    } catch (e) { profile.hcPending = rec; saveProfile(); return { ok: false, error: 'offline' }; }
  }
  async function flushPending() {
    const p = profile.hcPending;
    if (!p || !rankOn()) return;
    try {
      const r = await rankSubmit({ ...p, name: profile.nickname || p.name });
      if (r && (r.ok || /period closed/.test(r.error || ''))) { profile.hcPending = null; saveProfile(); }
    } catch (e) {}
  }
  function fmtHMS(t) {
    t = Math.max(0, Math.floor(t));
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s2 = t % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(s2).padStart(2, '0');
  }
  function fmtPeriod(pid) {
    const d = new Date(Date.parse(`${pid.slice(0, 4)}-${pid.slice(4, 6)}-${pid.slice(6, 8)}T12:00:00+09:00`));
    return `${+pid.slice(4, 6)}/${+pid.slice(6, 8)}(${'일월화수목금토'[d.getUTCDay()]})`;
  }
  function untilText(ms) {
    const m = Math.max(0, Math.floor(ms / 60000)), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? `${d}일 ${h}시간` : h ? `${h}시간 ${mm}분` : `${mm}분`;
  }
  function nextResetText() {
    const t = Mines.nextReset(), d = new Date(t + 9 * 3600e3);
    return `${'일월화수목금토'[d.getUTCDay()]} 07:00 (${untilText(t - Date.now())} 남음)`;
  }
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);
  const layer = $('layer');

  // ─────────────────────────── 테마 ───────────────────────────
  const NUMS = ['#3D7DD8', '#2E9E5B', '#E0533D', '#6A4BC4', '#B5651D', '#1E9AA8', '#333333', '#888888'];
  const THEMES = [
    { id: 'mint', name: '민트', price: 0, dark: false, bg: '#E6F2EC', hidA: '#7CC6A4', hidB: '#6CBA96', hidSh: '#4C9878',
      openA: '#F8F4E9', openB: '#F1ECDD', solA: '#FFF5D3', solB: '#FBEDC2', line: 'rgba(31,58,48,.16)',
      flag: '#E94F64', pole: '#3A3A3A', nums: NUMS, accent: '#2F9E78', text: '#1F3A30', card: '#FFFFFF' },
    { id: 'sakura', name: '벚꽃', price: 30, dark: false, bg: '#FFEFF3', hidA: '#F4A6B8', hidB: '#EC96AB', hidSh: '#CF7590',
      openA: '#FFFAFB', openB: '#FFF2F5', solA: '#FFEBCF', solB: '#FFE2BD', line: 'rgba(107,42,60,.14)',
      flag: '#D6336C', pole: '#5A3440', nums: NUMS, accent: '#E0567F', text: '#5A2235', card: '#FFFFFF' },
    { id: 'night', name: '밤하늘', price: 60, dark: true, bg: '#0F1529', hidA: '#4C5C9C', hidB: '#45548F', hidSh: '#27305A',
      openA: '#1B2240', openB: '#1F2748', solA: '#2A2D58', solB: '#2F3364', line: 'rgba(255,255,255,.10)',
      flag: '#FF6B8A', pole: '#DDE3FF',
      nums: ['#7FB2FF', '#6EE0A0', '#FF8A7A', '#C3A6FF', '#FFC27A', '#6FE3F0', '#F0F0F0', '#A8A8B8'],
      accent: '#8FA8FF', text: '#E7ECFF', card: '#1B2342' },
    { id: 'lavender', name: '라벤더', price: 100, dark: false, bg: '#F2EEFB', hidA: '#A78BDA', hidB: '#9B7ED1', hidSh: '#7A5FB2',
      openA: '#FCFAFF', openB: '#F5F0FF', solA: '#E9F6E6', solB: '#DFF1DB', line: 'rgba(60,42,102,.14)',
      flag: '#E2557A', pole: '#3C2A66', nums: NUMS, accent: '#7C5CCF', text: '#33264F', card: '#FFFFFF' },
    { id: 'classic', name: '클래식', price: 150, dark: false, bg: '#BDBDBD', hidA: '#C6C6C6', hidB: '#BFBFBF', hidSh: '#7B7B7B',
      openA: '#DADADA', openB: '#D4D4D4', solA: '#E2ECDD', solB: '#DAE6D4', line: 'rgba(0,0,0,.18)',
      flag: '#E02020', pole: '#111111',
      nums: ['#0000F0', '#007B00', '#F00000', '#00007B', '#7B0000', '#007B7B', '#000000', '#7B7B7B'],
      accent: '#2B5DB8', text: '#1A1A1A', card: '#EDEDED' },
  ];
  const themeOf = (id) => THEMES.find((t) => t.id === id) || THEMES[0];

  // ─────────────────────────── 상태 ───────────────────────────
  const DEFAULT_PROFILE = { wallet: 0, lifetimeGems: 0, lifetimeMistakes: 0, theme: 'mint', unlocked: ['mint'],
    introSeen: false, flagMode: false, sound: true, soundInSilent: false, haptic: true, magnifiers: 0, pictures: {},
    pid: '', nickname: '', hcBest: {}, hcPending: null, freeUndo: { day: 0, used: 0 }, lastWorld: '', lang: '' };
  let profile = { ...DEFAULT_PROFILE };
  const summaries = {};            // 보드 id → 저장본 (홈 화면 통계용)
  let th = THEMES[0];

  function applyTheme() {
    th = themeOf(profile.theme);
    const r = document.documentElement.style;
    r.setProperty('--bg', th.bg); r.setProperty('--card', th.card); r.setProperty('--text', th.text);
    r.setProperty('--accent', th.accent); r.setProperty('--flag', th.flag);
    document.querySelector('meta[name=theme-color]').setAttribute('content', th.bg);
    document.documentElement.style.colorScheme = th.dark ? 'dark' : 'light';
    $('themeName').textContent = '보드 테마 · 지금: ' + tr(th.name);
    if (game) game.dirty = true;
  }

  let profileTimer = 0;
  function saveProfile(now) {
    clearTimeout(profileTimer);
    if (now) return Storage.save('profile', profile);
    profileTimer = setTimeout(() => Storage.save('profile', profile), 250);
  }

  // ─────────────────────────── 소리 · 진동 ───────────────────────────
  let actx = null, master = null, unlocked = false;
  /** iOS: 무음 스위치를 켜 둬도 소리가 나게 할지 (설정) */
  function applyAudioSession() {
    try {
      if (navigator.audioSession) navigator.audioSession.type = profile.soundInSilent ? 'playback' : 'ambient';
    } catch (e) {}
  }
  function audio() {
    if (!profile.sound) return null;
    if (!actx) {
      try {
        applyAudioSession();
        actx = new (window.AudioContext || window.webkitAudioContext)();
        master = actx.createGain(); master.gain.value = 1.6; master.connect(actx.destination);
      } catch (e) { return null; }
    }
    if (actx.state !== 'running') actx.resume().catch(() => {});
    return actx;
  }
  /** iOS 는 손가락을 '뗄 때'의 동작 안에서만 소리를 켜 준다 → 무음 소리를 한 번 틀어 잠금을 푼다 */
  function unlockAudio() {
    const a = audio(); if (!a) return;
    if (unlocked && a.state === 'running') return;
    try {
      const b = a.createBuffer(1, 1, 22050), src = a.createBufferSource();
      src.buffer = b; src.connect(a.destination); src.start(0);
      a.resume().then(() => { unlocked = a.state === 'running'; }).catch(() => {});
    } catch (e) {}
  }
  ['touchend', 'pointerup', 'click', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && actx) { unlocked = false; } });
  function tone(freq, dur, type = 'sine', vol = 0.12, slide = 0, delay = 0) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master || a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const SFX = {
    dig: () => tone(520, 0.06, 'triangle', 0.08, 0.6),
    open: () => { tone(420, 0.07, 'triangle', 0.08, 0.7); tone(760, 0.08, 'sine', 0.05, 1.1, 0.03); },
    flag: () => tone(880, 0.08, 'square', 0.04, 1.3),
    unflag: () => tone(660, 0.07, 'square', 0.035, 0.7),
    peek: () => { tone(980, 0.25, 'sine', 0.07, 1.5); tone(1470, 0.3, 'sine', 0.04, 1.2, 0.05); },
    gem: () => { tone(1320, 0.12, 'sine', 0.08); tone(1980, 0.16, 'sine', 0.06, 1, 0.06); },
    sector: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, 1, i * 0.07)),
    boom: () => { tone(160, 0.35, 'sawtooth', 0.14, 0.3); tone(90, 0.45, 'sine', 0.2, 0.5); },
    undo: () => tone(600, 0.09, 'sine', 0.07, 0.75),
  };
  function sfx(n) { try { SFX[n](); } catch (e) {} }

  // iOS 18 사파리의 스위치 입력을 눌러 진동을 낸다 (지원 안 되면 조용히 넘어간다)
  let hapticLabel = null;
  function haptic(kind = 'light') {
    if (!profile.haptic) return;
    if (navigator.vibrate) { navigator.vibrate(kind === 'heavy' ? [30, 40, 30] : kind === 'medium' ? 18 : 8); return; }
    try {
      if (!hapticLabel) {
        hapticLabel = document.createElement('label');
        hapticLabel.style.cssText = 'position:fixed;left:-99px;top:-99px;opacity:0;pointer-events:none';
        const inp = document.createElement('input');
        inp.type = 'checkbox'; inp.setAttribute('switch', '');
        hapticLabel.appendChild(inp); document.body.appendChild(hapticLabel);
      }
      hapticLabel.click();
      if (kind === 'heavy') setTimeout(() => hapticLabel.click(), 90);
    } catch (e) {}
  }

  // ─────────────────────────── 보상형 광고 ───────────────────────────
  let adPaused = false;
  if (window.Ads) Ads.setHooks({
    pause() { adPaused = true; if (master) master.gain.value = 0; },
    resume() { adPaused = false; if (master) master.gain.value = 1.6; lastTick = performance.now(); },
  });
  /** 광고를 보고 보상을 받는다. 보상을 받았으면 true */
  async function watchAd(slot) {
    const r = await Ads.rewarded(slot);
    if (r === 'ok') { sfx('gem'); haptic('medium'); return true; }
    toast(r === 'adblock' ? '광고 차단이 켜져 있어 광고를 볼 수 없어요'
      : r === 'cooldown' ? '잠시 후에 다시 볼 수 있어요' : '지금은 볼 수 있는 광고가 없어요. 잠시 후 다시 해 보세요');
    return false;
  }
  function adWaitText(slot) {
    const ms = Ads.cooldownLeft(slot);
    return ms > 60e3 ? `📺 광고는 ${Math.ceil(ms / 60e3)}분 뒤에 다시 볼 수 있어요` : ms > 0 ? `📺 광고는 ${Math.ceil(ms / 1e3)}초 뒤에 다시 볼 수 있어요` : '';
  }
  function freeUndoLeft() {
    const d = todayStamp();
    if (profile.freeUndo.day !== d) profile.freeUndo = { day: d, used: 0 };
    return Math.max(0, FREE_UNDO - profile.freeUndo.used);
  }

  // ─────────────────────────── 홈 ───────────────────────────
  function fmtTime(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); }

  function renderHome() {
    $('tGems').textContent = profile.wallet;
    $('tMistakes').textContent = profile.lifetimeMistakes;
    $('tMag').textContent = profile.magnifiers;
    $('albumCount').textContent = `${Pictures.list.filter((p) => profile.pictures[p.id] > 0).length}/${Pictures.list.length}`;
    $('tSectors').textContent = Object.values(summaries).reduce((n, s) => n + ((s.solved || []).length), 0);
    const today = todayStamp();
    $('worlds').innerHTML = WORLDS.map((w) => {
      const s = summaries[w.id];
      let st = '<div class="st new">새 지도</div>';
      const fresh = s && s.start && (w.kind !== 'daily' || s.day === today);
      if (w.kind === 'hardcore') {
        const per = Mines.periodId(), b = profile.hcBest[per];
        const live = s && s.period === per && s.start;
        const now = live ? (s.gameOver ? (s.result && s.result.end === 'clear' ? '🏆 완성!' : '도전 끝') : '진행 중') : '';
        return `<button class="world hc" data-id="${w.id}">
          <div class="em">${w.emoji}</div>
          <div class="bd"><div class="nm">${tr(w.name)}<span class="chip hcchip">HARDCORE</span></div>
          <div class="sb">${tr(w.sub)}</div>
          <div class="st"><span>🔄 ${nextResetText()}</span></div>
          <div class="st">${b ? `<span>🏆 내 최고 ${b.pct}% · ${fmtHMS(b.time)}</span>` : '<span class="new">이번 회차 기록 없음</span>'}${now ? `<span style="opacity:.7">${now}</span>` : ''}</div></div>
          <div class="go">▶</div></button>`;
      }
      if (w.kind === 'timed' && s && (s.best || fresh)) {
        st = `<div class="st"><span>🏆 최고 ${s.best || 0}구역</span>${fresh ? `<span>❌ ${s.mistakes}</span>` : ''}</div>`;
      } else if (fresh) {
        st = `<div class="st"><span>🧩 ${(s.solved || []).length}</span><span>💎 ${s.gems}</span><span>❌ ${s.mistakes}</span><span style="opacity:.6">이어 하기</span></div>`;
      }
      return `<button class="world" data-id="${w.id}">
        <div class="em">${w.emoji}</div>
        <div class="bd"><div class="nm">${tr(w.name)}<span class="chip">지뢰 ${Math.round(w.density * 100)}%</span></div>
        <div class="sb">${tr(w.sub)}</div>${st}</div>
        <div class="go">▶</div></button>`;
    }).join('');
  }

  $('btnRank') && ($('btnRank').onclick = () => showRanking(Mines.periodId()));
  $('worlds').addEventListener('click', (e) => {
    const b = e.target.closest('.world'); if (b) openGame(b.dataset.id);
  });

  // ─────────────────────────── 시트 · 카드 ───────────────────────────
  function closeLayer() { layer.innerHTML = ''; }
  // 칸을 누른 손가락 아래에 카드가 뜨면, 폰이 뒤따라 보내는 '클릭'이 카드 버튼을 눌러 버린다 → 뜬 직후 잠깐은 무시
  let layerShownAt = 0, layerTouched = false;
  layer.addEventListener('pointerdown', () => { layerTouched = true; }, true);
  layer.addEventListener('click', (e) => {
    if (!layerTouched && performance.now() - layerShownAt < 600) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  function veil(html, onTapOutside) {
    layerShownAt = performance.now(); layerTouched = false;
    layer.innerHTML = `<div class="veil">${html}</div>`;
    const v = layer.firstElementChild;
    if (onTapOutside) v.addEventListener('click', (e) => { if (e.target === v) onTapOutside(); });
    return v;
  }
  function sheet(html) {
    layerShownAt = performance.now(); layerTouched = false;
    layer.innerHTML = `<div class="veil" style="place-items:end;padding:0"></div><div class="sheet"><div class="grab"></div>${html}</div>`;
    layer.querySelector('.veil').addEventListener('click', closeLayer);
    return layer.querySelector('.sheet');
  }

  function showGift() {
    const v = veil(`<div class="card"><div class="big">💝</div><h2>${GIFT.title}</h2><p>${GIFT.message}</p>
      <p style="font-weight:700;margin-top:-4px">${GIFT.from}</p><button class="primary" id="giftGo">시작하기</button></div>`, close);
    v.querySelector('#giftGo').onclick = close;
    function close() {
      closeLayer();
      if (!profile.introSeen) { profile.introSeen = true; saveProfile(true); }
    }
  }

  function showThemes() {
    const cells = [0, 1, 0, 2, 3, 1, 0, 1, 4];
    const html = THEMES.map((t) => {
      const owned = profile.unlocked.includes(t.id), sel = profile.theme === t.id;
      const pv = cells.map((v) => {
        const bg = v === 1 || v === 3 ? t.openA : t.hidA;
        const tx = v === 2 ? '🚩' : v === 3 ? `<span style="color:${t.nums[1]}">2</span>` : v === 4 ? '💎' : '';
        return `<i style="background:${bg}">${tx}</i>`;
      }).join('');
      return `<button class="theme" data-id="${t.id}"><div class="pv" style="background:${t.bg}">${pv}</div>
        <div><div class="nm">${tr(t.name)}</div><div class="pr">${sel ? '사용 중' : owned ? '보유 중 · 눌러서 쓰기' : '💎 ' + t.price}</div></div>
        <div class="sp"></div><div style="font-size:20px">${sel ? '✅' : owned ? '' : '🔒'}</div></button>`;
    }).join('');
    const s = sheet(`<h3>보드 테마 · 💎 ${profile.wallet}개 보유</h3>${html}`);
    s.addEventListener('click', (e) => {
      const b = e.target.closest('.theme'); if (!b) return;
      const t = themeOf(b.dataset.id);
      if (!profile.unlocked.includes(t.id)) {
        if (profile.wallet < t.price) {
          b.querySelector('.pr').textContent = `💎 ${t.price - profile.wallet}개가 더 필요해요`;
          haptic('medium'); return;
        }
        profile.wallet -= t.price; profile.unlocked.push(t.id);
        sfx('gem');
      }
      profile.theme = t.id;
      saveProfile(true); applyTheme(); renderHome(); showThemes();
    });
  }

  async function showSettings() {
    const persisted = await Storage.isPersisted();
    const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    const last = Storage.lastSavedAt ? new Date(Storage.lastSavedAt).toLocaleTimeString(window.I18N && I18N.lang === 'en' ? 'en-US' : 'ko-KR') : '아직 없음';
    const s = sheet(`<h3>설정</h3>
      <button class="item" data-a="sound"><span class="ic">🔊</span>소리<span class="sp"></span><span class="switch ${profile.sound ? 'on' : ''}"></span></button>
      <button class="item" data-a="soundInSilent"><span class="ic">🔕</span><span>무음 모드에서도 소리<div class="note">켜면 아이폰 무음 스위치와 상관없이 소리가 나요 (보던 영상 소리는 잠시 멈출 수 있어요)</div></span><span class="sp"></span><span class="switch ${profile.soundInSilent ? 'on' : ''}"></span></button>
      <button class="item" data-a="haptic"><span class="ic">📳</span>진동<span class="sp"></span><span class="switch ${profile.haptic ? 'on' : ''}"></span></button>
      <button class="item" data-a="export"><span class="ic">💾</span><span>백업 파일 내보내기<div class="note">앱을 지우거나 폰을 바꿀 때 이 파일로 이어 할 수 있어요</div></span></button>
      <button class="item" data-a="import"><span class="ic">📂</span><span>백업 파일 불러오기<div class="note">지금 기록을 백업 내용으로 바꿔요</div></span></button>
      ${ED.gift ? '<button class="item" data-a="gift"><span class="ic">💌</span>처음 메시지 다시 보기</button>' : ''}
      ${PUBLIC ? `<button class="item" data-a="lang"><span class="ic">🌐</span>Language<span class="sp"></span><span class="note">${window.I18N && I18N.lang === 'en' ? 'English' : '한국어'}</span></button>` : ''}
      <div class="status">
        저장 방식: 한 수마다 자동 저장 (기기 안 두 군데에 같이 보관)<br>
        마지막 저장: ${last}${Storage.lastError ? ' · <span class="danger">' + Storage.lastError + '</span>' : ''}<br>
        ${PUBLIC ? '' : `보관 상태: ${persisted ? '✅ 브라우저가 지우지 않도록 고정됨' : standalone ? '홈 화면 앱으로 실행 중' : '⚠️ 홈 화면에 추가하면 더 안전해요'}`}
      </div>`);
    s.addEventListener('click', async (e) => {
      const b = e.target.closest('.item'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'sound' || a === 'haptic' || a === 'soundInSilent') {
        profile[a] = !profile[a]; saveProfile(true);
        b.querySelector('.switch').classList.toggle('on', profile[a]);
        if (a === 'soundInSilent') { applyAudioSession(); if (actx) { try { actx.close(); } catch (e) {} actx = null; master = null; unlocked = false; } unlockAudio(); sfx('gem'); }
        if (a === 'sound' && profile.sound) sfx('gem');
        if (a === 'haptic' && profile.haptic) haptic('medium');
      } else if (a === 'export') exportBackup();
      else if (a === 'import') $('fileIn').click();
      else if (a === 'gift') showGift();
      else if (a === 'lang' && window.I18N) { profile.lang = I18N.lang === 'en' ? 'ko' : 'en'; await saveProfile(true); I18N.set(profile.lang); renderHome(); applyTheme(); if (game) { updateHud(); setMode(game.flagMode); $('gTitle').textContent = `${game.cfg.emoji} ${tr(game.cfg.name)}`; } showSettings(); }
    });
  }

  async function exportBackup() {
    if (game) await game.saveNow();
    await Storage.save('profile', profile);
    const data = await Storage.exportAll(WORLDS.map((w) => w.id));
    const d = new Date();
    const name = `지뢰찾기-백업-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    // 아이폰: 공유 시트로 (파일 앱 저장·카톡·메일 등)
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: '무한 지뢰찾기 백업' });
        return;
      }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  $('fileIn').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch (err) { return alertCard('😢', '파일을 읽지 못했어요', '백업 파일(.json)이 맞는지 확인해 주세요.'); }
    const err = Storage.validateBackup(data);
    if (err) return alertCard('😢', '불러오지 못했어요', err);
    const n = Object.keys(data.worlds || {}).length;
    const when = data.exportedAt ? new Date(data.exportedAt).toLocaleString(window.I18N && I18N.lang === 'en' ? 'en-US' : 'ko-KR') : '';
    const v = veil(`<div class="card"><div class="big">📂</div><h2>백업을 불러올까요?</h2>
      <p>${when} 에 만든 백업 · 보드 ${n}개\n지금 기기의 기록은 이 백업으로 바뀌어요.</p>
      <button class="primary" id="impGo">불러오기</button><button class="secondary" id="impNo">취소</button></div>`, closeLayer);
    v.querySelector('#impNo').onclick = closeLayer;
    v.querySelector('#impGo').onclick = async () => {
      await Storage.importAll(data);
      location.reload();
    };
  });

  function alertCard(icon, title, msg) {
    const v = veil(`<div class="card"><div class="big">${icon}</div><h2>${title}</h2><p>${msg}</p><button class="primary">확인</button></div>`, closeLayer);
    v.querySelector('.primary').onclick = closeLayer;
  }

  $('btnGift').onclick = showGift;
  $('btnThemes').onclick = showThemes;
  $('btnAlbum').onclick = showAlbum;

  function picSvg(p, hidden) {
    let r = '';
    p.px.forEach((row, y) => [...row].forEach((ch, x) => {
      const col = hidden ? (ch === '.' ? '#00000010' : '#0000002e') : (ch === '+' ? p.c1 : ch === '#' ? p.c2 : '#FFF5D3');
      r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${col}"/>`;
    }));
    return `<svg viewBox="0 0 8 8" shape-rendering="crispEdges" width="100%" height="100%">${r}</svg>`;
  }

  function showAlbum() {
    const got = Pictures.list.filter((p) => profile.pictures[p.id] > 0).length;
    const cells = Pictures.list.map((p) => {
      const n = profile.pictures[p.id] || 0;
      return `<div class="pic${n ? '' : ' locked'}"><div class="art">${picSvg(p, !n)}</div>
        <div class="pn">${n ? tr(p.name) : '???'}</div>${n ? `<div class="pc">×${n}</div>` : ''}</div>`;
    }).join('');
    sheet(`<h3>🖼 그림 도감 · ${got}/${Pictures.list.length}</h3>
      <div class="album">${cells}</div>
      <div class="status">구역을 처음 완성할 때마다 그 자리에 그림이 나타나요. 드문 그림도 숨어 있어요.</div>`);
  }
  $('btnSettings').onclick = showSettings;

  // ─────────────────────────── 게임 ───────────────────────────
  let game = null;
  const canvas = $('board');
  const ctx = canvas.getContext('2d');

  class Game {
    constructor(cfg, save) {
      this.cfg = cfg;
      this.s = new Session(cfg, save);
      this.flagMode = false;
      this.dirty = true;
      this.saveTimer = 0;
      this.cell = 40;
      this.ox = 0; this.oy = 0;
      this.placed = false;
      this.anim = null;
      this.aiming = false;
      this.peekState = null;
      this.fx = [];
    }

    // 카메라
    place() {
      const c = this.s.camera;
      if (c && isFinite(c.x) && isFinite(c.y) && c.cell) { this.ox = c.x; this.oy = c.y; this.cell = c.cell; }
      else this.home();
      this.placed = true; this.dirty = true;
    }
    home() {
      const n = this.cfg.size;
      if (n) { this.cell = 34; this.centerOn(n / 2, n / 2, false); }
      else { this.cell = 40; this.centerOn(0, 0, false); }
    }
    /** 하드코어: 보드 전체가 한 화면에 */
    fitAll(animated) {
      const n = this.cfg.size; if (!n) return;
      this.cell = Math.max(3, Math.min(innerWidth - 16, innerHeight - 200) / n);
      this.centerOn(n / 2 - 0.5, n / 2 - 0.5, animated);
    }
    get minCell() { const n = this.cfg.size; return n ? Math.max(3, Math.min(16, (Math.min(innerWidth, innerHeight) - 16) / n)) : 16; }
    centerOn(x, y, animated) {
      const tx = innerWidth / 2 - (x + 0.5) * this.cell, ty = innerHeight / 2 - (y + 0.5) * this.cell;
      if (!animated) { this.ox = tx; this.oy = ty; this.dirty = true; return; }
      this.anim = { fx: this.ox, fy: this.oy, tx, ty, t0: performance.now() };
    }
    zoom(f, px = innerWidth / 2, py = innerHeight / 2) {
      const nc = Math.min(96, Math.max(this.minCell, this.cell * f)), r = nc / this.cell;
      this.ox = px - (px - this.ox) * r; this.oy = py - (py - this.oy) * r;
      this.cell = nc; this.dirty = true; this.cameraMoved();
    }
    pan(dx, dy) { this.ox += dx; this.oy += dy; this.anim = null; this.dirty = true; this.cameraMoved(); }
    cameraMoved() { clearTimeout(this.camTimer); this.camTimer = setTimeout(() => this.scheduleSave(), 600); }
    cellAt(px, py) { return [Math.floor((px - this.ox) / this.cell), Math.floor((py - this.oy) / this.cell)]; }

    // 입력
    act(px, py, long) {
      const [x, y] = this.cellAt(px, py);
      const s = this.s;
      if (this.aiming) { this.usePeek(x, y); return; }
      const wantFlag = (this.flagMode !== long) && s.started && !s.isRevealed(x, y);
      const before = s.gems, wasFlag = s.isFlagged(x, y);
      const out = wantFlag ? s.toggleFlag(x, y) : s.reveal(x, y);
      if (!out.changed && !out.exploded) return;
      const dg = s.gems - before;
      if (dg) addGems(dg);
      if (out.rewards) { profile.magnifiers += out.rewards; saveProfile(); }
      if (out.ended) {
        this.changed();
        this.saveNow();
        hcFinish(this);
        return;
      }
      if (out.exploded) {
        profile.lifetimeMistakes++; saveProfile();
        sfx('boom'); haptic('heavy');
      } else if (out.solved) {
        sfx('sector'); haptic('heavy');
        const keys = out.solvedKeys || [];
        for (const sk of keys) this.celebrate(kx(sk), ky(sk));
        const bits = [];
        const found = [];
        for (const sk of (s.hardcore ? [] : keys)) {
          const pic = picOf(s.field, kx(sk), ky(sk));
          const first = out.firstSolved.includes(sk);
          const isNew = first && !(profile.pictures[pic.id] > 0);
          if (first) profile.pictures[pic.id] = (profile.pictures[pic.id] || 0) + 1;
          found.push((isNew ? '✨새 그림 ' : '🖼 ') + tr(pic.name));
        }
        if (out.firstSolved.length) saveProfile();
        if (found.length) bits.push(found.join(' · '));
        if (s.hardcore) bits.push(`📊 완성도 ${s.completion}% · ⏱ ${fmtHMS(s.playSeconds)}`);
        if (this.cfg.kind === 'timed') bits.push(`⏱ +${out.solved * this.cfg.bonus}초`);
        if (out.rewards) bits.push(`🔍 돋보기 +${out.rewards}`);
        if (out.gems) bits.push(`💎 +${out.gems}`);
        banner(out.solved > 1 ? `🎉 구역 ${out.solved}개 클리어!` : '🎉 구역 클리어!', bits.join('<br>'), s.solved.size, s.hardcore ? 144 : 0);
      } else if (out.gems) {
        sfx('gem'); haptic('medium');
        toast(out.gems >= 5 ? `💖 하트 발견! +${out.gems}` : `💎 +${out.gems}`);
      } else if (wantFlag) {
        sfx(wasFlag ? 'unflag' : 'flag'); haptic('light');
      } else {
        sfx('open'); haptic('light');
      }
      this.changed();
    }
    /** 공개판: 지뢰를 밟은 수를 되돌리려면 무료 횟수·광고·보석 중 하나가 필요하다 */
    undoIsPaid() {
      if (!ADS) return false;
      const m = this.s.undoStack[this.s.undoStack.length - 1];
      return !!(m && m.e !== null && m.e !== undefined);
    }
    undo(paid) {
      if (!paid && this.undoIsPaid()) { showBoom(); return; }
      const before = this.s.gems;
      if (!this.s.undo()) return;
      const dg = this.s.gems - before; if (dg) addGems(dg);
      sfx('undo'); haptic('light');
      this.changed();
    }
    // 구역 완성 연출 (1.6초): 번쩍 → 테두리 퍼짐 → CLEAR 도장 → 꽃가루
    celebrate(sx, sy) {
      const parts = [];
      const cols = ['#FFD54F', '#FF8A80', '#80D8FF', '#B9F6CA', '#EA80FC', '#FFFFFF', th.accent];
      for (let i = 0; i < 34; i++) {
        const a = Math.random() * Math.PI * 2, v = 0.55 + Math.random() * 1.1;
        parts.push({ a, v, vy0: -0.9 - Math.random() * 0.9, c: cols[i % cols.length], r: Math.random() * Math.PI, sz: 0.18 + Math.random() * 0.16 });
      }
      this.fx.push({ sx, sy, t0: performance.now(), parts });
      this.dirty = true;
    }

    // 돋보기 — 3×3 의 지뢰를 5초간 비춰 본다
    toggleAim() {
      const s = this.s;
      if (this.aiming) { this.aiming = false; updateHud(); return; }
      if (!s.started) { toast('먼저 첫 칸을 열어 주세요'); return; }
      if (s.exploded !== null || s.gameOver) return;
      if (profile.magnifiers <= 0) {
        if (ADS) return showMagOffer();
        toast('🧩 구역을 완성하면 🔍 돋보기를 얻어요'); haptic('medium'); return;
      }
      this.aiming = true; haptic('light'); updateHud();
    }
    usePeek(x, y) {
      this.aiming = false;
      if (profile.magnifiers <= 0 || this.s.exploded !== null || this.s.gameOver) { updateHud(); return; }
      const cells = this.s.peek(x, y);
      profile.magnifiers--; saveProfile();
      const mines = cells.filter((c) => c.mine).length;
      this.peekState = { cx: x, cy: y, cells, t0: performance.now(), until: performance.now() + PEEK_MS };
      sfx('peek'); haptic('medium');
      toast(cells.length === 0 ? '🔍 이미 다 열린 곳이에요' : mines ? `🔍 지뢰 ${mines}개가 보여요` : '🔍 이 근처엔 지뢰가 없어요');
      this.dirty = true; updateHud();
    }
    flagExplosion() { this.s.flagExplosion(); sfx('flag'); haptic('medium'); this.changed(); }
    restart() { this.s.restart(); this.home(); this.changed(); this.saveNow(); }
    changed() { this.dirty = true; updateHud(); this.scheduleSave(); }

    // 저장 — 한 수마다 (아주 잠깐 모았다가)
    snapshot() {
      if (this.placed) this.s.camera = { x: this.ox, y: this.oy, cell: this.cell };
      return this.s.toSave();
    }
    scheduleSave() {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => this.saveNow(), 300);
    }
    async saveNow() {
      clearTimeout(this.saveTimer);
      const data = this.snapshot();
      summaries[this.cfg.id] = data;
      const ok = await Storage.save('world:' + this.cfg.id, data);
      flashSaved(ok);
      return ok;
    }
    saveSync() {
      clearTimeout(this.saveTimer);
      const data = this.snapshot();
      summaries[this.cfg.id] = data;
      Storage.saveNow('world:' + this.cfg.id, data);
    }
  }

  function addGems(d) {
    profile.wallet += d;               // 되돌리면 음수가 될 수 있다 (무한 보석 꼼수 방지)
    profile.lifetimeGems += d;
    saveProfile();
  }

  let savedTimer = 0;
  function flashSaved(ok) {
    const el = $('saved');
    el.textContent = ok ? '✓ 저장됨' : '⚠️ 저장 실패';
    el.classList.add('on');
    clearTimeout(savedTimer); savedTimer = setTimeout(() => el.classList.remove('on'), 900);
  }

  let bannerTimer = 0;
  function banner(title, sub, total, of) {
    const el = $('banner');
    el.innerHTML = `<div class="b1">${title}</div>${sub ? `<div class="b2">${sub}</div>` : ''}<div class="b3">${of ? `${total} / ${of} 구역` : `지금까지 ${total}구역 완성`}</div>`;
    el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => el.classList.remove('on'), 2200);
  }

  let toastTimer = 0;
  function toast(t) {
    const el = $('toast'); el.textContent = t; el.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('on'), 1400);
  }

  async function openGame(id) {
    const cfg = world(id);
    const save = await Storage.load('world:' + id);
    game = new Game(cfg, save);
    $('home').hidden = true; $('game').hidden = false;
    $('gTitle').textContent = `${cfg.emoji} ${tr(cfg.name)}`;
    $('game').classList.toggle('hc', cfg.kind === 'hardcore');
    if (cfg.kind === 'hardcore' && !profile.pid) { profile.pid = newPid(); saveProfile(true); }
    resize(); game.place();
    setMode(!!profile.flagMode);   // 마지막에 쓰던 모드 그대로
    updateHud();               // 터진 채로 저장됐으면 여기서 되돌리기 카드가 뜬다
    if (game.s.gameOver) { if (game.s.hardcore) hcResult(game); else showOver(); }
    if (!profile.soundTipShown && profile.sound && !PUBLIC) {
      profile.soundTipShown = true; saveProfile();
      setTimeout(() => toast('🔊 소리가 안 나면 메뉴 → 설정에서 켜 주세요'), 600);
    }
    Storage.requestPersist();
    if (profile.lastWorld !== id) { profile.lastWorld = id; saveProfile(); }
    if (window.Ads) Ads.gameplay(true);
  }

  async function closeGame() {
    if (!game) return;
    if (window.Ads) Ads.gameplay(false);
    await game.saveNow();
    game = null;
    closeLayer();
    $('game').hidden = true; $('home').hidden = false;
    renderHome();
  }

  function setMode(flag) {
    game.flagMode = flag;
    $('mode').classList.toggle('flag', flag);
    $('modeIc').textContent = flag ? '🚩' : '⛏️';
    $('modeT1').textContent = flag ? '깃발 모드' : '파기 모드';
    $('modeT2').textContent = flag ? '길게 누르면 파기' : '길게 누르면 깃발';
  }

  function updateHud() {
    if (!game) return;
    const s = game.s;
    $('gGems').textContent = s.gems;
    $('gSectors').textContent = s.solved.size;
    $('gMistakes').textContent = s.mistakes;
    $('btnUndo').disabled = !s.canUndo;
    $('magN').textContent = profile.magnifiers;
    $('btnMag').classList.toggle('on', game.aiming);
    $('btnMag').classList.toggle('empty', profile.magnifiers <= 0);
    $('aimHint').hidden = !game.aiming;
    $('hint').hidden = s.started;
    const timed = game.cfg.kind === 'timed';
    $('timer').hidden = !((timed || s.hardcore) && s.started);
    if (timed) { $('gTime').textContent = fmtTime(s.timeLeft); $('timer').classList.toggle('low', s.timeLeft < 20); }
    if (s.hardcore) { $('gTime').textContent = fmtHMS(s.playSeconds); $('timer').classList.remove('low'); $('gPct').textContent = s.completion + '%'; }
    if (s.hardcore) return;
    if (s.exploded !== null && game.aiming) { game.aiming = false; $('aimHint').hidden = true; $('btnMag').classList.remove('on'); }
    if (s.exploded !== null && !layer.querySelector('#boomCard')) showBoom();
    if (s.exploded === null && layer.querySelector('#boomCard')) closeLayer();
  }

  function showBoom() {
    if (ADS) return showBoomPublic();
    const s = game.s;
    const v = veil(`<div class="card" id="boomCard"><div class="big">💥</div><h2>앗, 지뢰를 밟았어요</h2>
      <p>이 보드의 ${s.mistakes}번째 실수예요.\n괜찮아요 — 광고 없이 바로 되돌릴 수 있어요.</p>
      <button class="primary" id="bUndo">↶ 되돌리기</button>
      <button class="secondary" id="bFlag">🚩 깃발 꽂고 그대로 계속</button></div>`);
    v.querySelector('#bUndo').onclick = () => { closeLayer(); game.undo(true); };
    v.querySelector('#bFlag').onclick = () => { closeLayer(); game.flagExplosion(); };
  }

  function showBoomPublic() {
    const s = game.s, g = game;
    const free = freeUndoLeft();
    const canAd = Ads.canOffer('undo'), canGem = profile.wallet >= UNDO_GEMS;
    const exploded = s.exploded !== null;
    const opts = free > 0
      ? `<button class="opt primary" id="bFree">↶ 되돌리기 <small>(오늘 무료 ${free}번 남음)</small></button>`
      : `${canAd ? '<button class="opt primary" id="bAd">📺 광고 보고 되돌리기</button>' : ''}
         <button class="opt primary" id="bGem" ${canGem ? '' : 'disabled'}>💎 ${UNDO_GEMS}개로 되돌리기${canGem ? '' : ` <small>(보석 ${profile.wallet}개)</small>`}</button>`;
    const v = veil(`<div class="card" id="${exploded ? 'boomCard' : 'undoCard'}"><div class="big">💥</div><h2>${exploded ? '앗, 지뢰를 밟았어요' : '지뢰를 밟기 전으로 돌아갈까요?'}</h2>
      <p>${exploded ? `이 보드의 ${s.mistakes}번째 실수예요.` : ''}</p>
      ${opts}
      ${exploded ? '<button class="opt primary alt" id="bFlag">🚩 깃발 꽂고 그대로 계속</button>' : '<button class="opt primary alt" id="bNo">취소</button>'}
      ${free <= 0 && !canAd && Ads.ready ? `<div class="small">${adWaitText('undo')}</div>` : ''}
      ${free <= 0 ? `<div class="small">무료 되돌리기는 매일 ${FREE_UNDO}번 다시 채워져요</div>` : ''}</div>`);
    const done = () => { closeLayer(); g.undo(true); toast('↶ 되돌렸어요'); };
    const q = (id) => v.querySelector(id);
    if (q('#bFree')) q('#bFree').onclick = () => { profile.freeUndo.used++; saveProfile(true); done(); };
    if (q('#bAd')) q('#bAd').onclick = async () => { if (await watchAd('undo')) { done(); toast('🎁 광고 보상: 되돌렸어요'); } else showBoomPublic(); };
    if (q('#bGem')) q('#bGem').onclick = () => { if (profile.wallet < UNDO_GEMS) return; addGems(-UNDO_GEMS); profile.lifetimeGems += UNDO_GEMS; done(); };
    if (q('#bFlag')) q('#bFlag').onclick = () => { closeLayer(); g.flagExplosion(); };
    if (q('#bNo')) q('#bNo').onclick = closeLayer;
  }

  function showMagOffer() {
    const canAd = Ads.canOffer('magnifier'), canGem = profile.wallet >= MAG_GEMS;
    const sh = sheet(`<h3>🔍 돋보기가 없어요</h3>
      <div class="status" style="text-align:center;padding:0 0 12px">구역을 완성하면 1개씩 받아요. 지금 바로 쓰고 싶다면:</div>
      ${canAd ? '<button class="opt primary" id="mAd">📺 광고 보고 돋보기 +1</button>' : ''}
      <button class="opt primary" id="mGem" ${canGem ? '' : 'disabled'}>💎 ${MAG_GEMS}개로 돋보기 +1${canGem ? '' : ` <small>(보석 ${profile.wallet}개)</small>`}</button>
      <button class="opt primary alt" id="mNo">닫기</button>
      ${!canAd && Ads.ready ? `<div class="small" style="text-align:center">${adWaitText('magnifier')}</div>` : ''}`);
    const give = () => { profile.magnifiers++; saveProfile(true); closeLayer(); updateHud(); toast('🎁 돋보기 +1'); };
    const q = (id) => sh.querySelector(id);
    if (q('#mAd')) q('#mAd').onclick = async () => { if (await watchAd('magnifier')) give(); else showMagOffer(); };
    q('#mGem').onclick = () => { if (profile.wallet < MAG_GEMS) return; addGems(-MAG_GEMS); profile.lifetimeGems += MAG_GEMS; sfx('gem'); give(); };
    q('#mNo').onclick = closeLayer;
  }

  function showOver() {
    const s = game.s;
    if (ADS && !s.continued && Ads.canOffer('time')) {
      const v = veil(`<div class="card"><div class="big">⏱️</div><h2>시간 종료!</h2>
        <p>이번 기록 <b>${s.solved.size}구역</b>\n최고 기록 ${s.best}구역 · 실수 ${s.mistakes}번</p>
        <button class="opt primary" id="oAd">📺 광고 보고 +${TIME_BONUS}초 이어하기</button>
        <button class="opt primary alt" id="oAgain">다시 도전</button>
        <button class="secondary" id="oOut">나가기</button>
        <div class="small">이어하기는 한 판에 한 번만 쓸 수 있어요</div></div>`);
      v.querySelector('#oAd').onclick = async () => {
        if (await watchAd('time')) {
          if (game.s.extendTime(TIME_BONUS)) { closeLayer(); game.changed(); game.saveNow(); toast(`🎁 +${TIME_BONUS}초! 이어서 하세요`); }
        } else showOver();
      };
      v.querySelector('#oAgain').onclick = () => { closeLayer(); game.restart(); };
      v.querySelector('#oOut').onclick = () => closeGame();
      return;
    }
    const v = veil(`<div class="card"><div class="big">⏱️</div><h2>시간 종료!</h2>
      <p>이번 기록 <b>${s.solved.size}구역</b>\n최고 기록 ${s.best}구역 · 실수 ${s.mistakes}번</p>
      <button class="primary" id="oAgain">다시 도전</button><button class="secondary" id="oOut">나가기</button></div>`);
    v.querySelector('#oAgain').onclick = () => { closeLayer(); game.restart(); };
    v.querySelector('#oOut').onclick = () => closeGame();
  }

  function showMenu() {
    if (game.s.hardcore) return showHcMenu();
    const s = sheet(`<h3>${game.cfg.emoji} ${tr(game.cfg.name)}</h3>
      <button class="item" data-a="center"><span class="ic">🎯</span>시작 지점으로</button>
      <button class="item" data-a="in"><span class="ic">🔍</span>크게 보기</button>
      <button class="item" data-a="out"><span class="ic">🔎</span>작게 보기</button>
      <button class="item" data-a="settings"><span class="ic">⚙️</span>설정 · 백업</button>
      <button class="item danger" data-a="restart"><span class="ic">🔄</span>새 지도로 다시 시작</button>`);
    s.addEventListener('click', (e) => {
      const b = e.target.closest('.item'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'center') { closeLayer(); const st = game.s.start || [0, 0]; game.centerOn(st[0], st[1], true); }
      else if (a === 'in') { game.zoom(1.25); }
      else if (a === 'out') { game.zoom(0.8); }
      else if (a === 'settings') showSettings();
      else if (a === 'restart') {
        const v = veil(`<div class="card"><div class="big">🔄</div><h2>처음부터 다시 할까요?</h2>
          <p>이 보드의 진행·보석 기록·실수 횟수가 새 지도로 바뀌어요.\n(모은 보석 지갑은 그대로예요)</p>
          <button class="primary" style="background:#E0343F" id="rGo">새 지도로 시작</button><button class="secondary" id="rNo">취소</button></div>`, closeLayer);
        v.querySelector('#rNo').onclick = closeLayer;
        v.querySelector('#rGo').onclick = () => { closeLayer(); game.restart(); };
      }
    });
  }

  function showHcMenu() {
    const g = game, s = g.s;
    const sh = sheet(`<h3>🔥 하드코어 · ${fmtPeriod(s.period || Mines.periodId())} 회차</h3>
      <button class="item" data-a="fit"><span class="ic">🗺️</span>보드 전체 보기</button>
      <button class="item" data-a="center"><span class="ic">🎯</span>시작 지점으로</button>
      <button class="item" data-a="in"><span class="ic">🔍</span>크게 보기</button>
      ${rankingOn() ? '<button class="item" data-a="rank"><span class="ic">🏆</span>랭킹 보기</button>' : ''}
      ${s.started && !s.gameOver ? `<button class="item danger" data-a="giveup"><span class="ic">🏳️</span>${rankingOn() ? '여기서 끝내고 기록 내기' : '여기서 끝내기'}</button>` : ''}
      <div class="status">되돌리기·돋보기 없음 · 지뢰를 밟으면 그 자리에서 끝나요.<br>${rankingOn() ? '완성도(%)가 높을수록, 같으면 시간이 짧을수록 높은 순위예요.<br>' : ''}다음 초기화: ${nextResetText()}</div>`);
    sh.addEventListener('click', (e) => {
      const b = e.target.closest('.item'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'fit') { closeLayer(); g.fitAll(true); }
      else if (a === 'center') { closeLayer(); const st = s.start || [48, 48]; g.centerOn(st[0], st[1], true); }
      else if (a === 'in') g.zoom(1.4);
      else if (a === 'rank') showRanking(s.period || Mines.periodId());
      else if (a === 'giveup') {
        const v = veil(`<div class="card"><div class="big">🏳️</div><h2>여기서 끝낼까요?</h2>
          <p>지금 완성도 ${s.completion}% · ${fmtHMS(s.playSeconds)} 로 기록돼요.\n이 판은 더 이어 할 수 없어요.</p>
          <button class="primary" style="background:#E0343F" id="gGo">끝내고 기록 내기</button><button class="secondary" id="gNo">계속 하기</button></div>`, closeLayer);
        v.querySelector('#gNo').onclick = closeLayer;
        v.querySelector('#gGo').onclick = () => { closeLayer(); if (s.giveUp()) { g.changed(); g.saveNow(); hcFinish(g); } };
      }
    });
  }

  // ─────────────────────────── 하드코어: 끝 · 결과 · 랭킹 ───────────────────────────
  function newPid() {
    const a = new Uint8Array(12); (crypto || window.msCrypto).getRandomValues(a);
    return Array.from(a, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20);
  }

  /** 판이 끝난 순간 (지뢰 · 완성 · 포기) */
  function hcFinish(g) {
    const s = g.s, end = s.result.end;
    const per = s.period, rec = { pct: s.completion, time: Math.max(1, Math.round(s.playSeconds)), end };
    const prev = profile.hcBest[per];
    const better = RankLib.isBetter(rec, prev);
    if (better) profile.hcBest[per] = { ...rec, submitted: false };
    saveProfile(true);
    if (end === 'dead') { sfx('boom'); haptic('heavy'); }
    else if (end === 'clear') { sfx('sector'); haptic('heavy'); setTimeout(() => sfx('sector'), 350); g.fitAll(true); }
    else { sfx('undo'); }
    setTimeout(() => hcResult(g, better), end === 'dead' ? 900 : end === 'clear' ? 1600 : 200);
  }

  function hcResult(g, isNewBest) {
    if (!game || game !== g) return;
    const s = g.s, end = (s.result && s.result.end) || 'dead', per = s.period;
    const best = profile.hcBest[per];
    const art = hcArt(per);
    const head = end === 'clear' ? ['🏆', '완성!'] : end === 'giveup' ? ['🏳️', '도전 종료'] : ['💥', '지뢰를 밟았어요'];
    const needName = !profile.nickname;
    const canSend = rankingOn() && best && !best.submitted;
    const v = veil(`<div class="card hcres">
      <div class="big">${head[0]}</div><h2>${head[1]}</h2>
      <div class="hcstat"><div><b>${s.completion}%</b><span>완성도</span></div><div><b>${fmtHMS(s.playSeconds)}</b><span>걸린 시간</span></div></div>
      ${end === 'clear' ? `<p>이번 회차 그림은 <b>${art.emoji} ${tr(art.name)}</b> 였어요!</p>` : ''}
      <p class="small">${isNewBest ? '✨ 이번 회차 내 최고 기록이에요!' : best ? `이번 회차 내 최고: ${best.pct}% · ${fmtHMS(best.time)}\n더 좋은 기록일 때만 랭킹이 바뀌어요.` : ''}</p>
      ${canSend ? `<div class="namebox"><input id="nick" placeholder="랭킹에 쓸 이름 (한글 8자)" value="${esc(profile.nickname)}" autocomplete="off" enterkeyhint="done"><span id="nickW"></span></div>
      ${PUBLIC ? '<div class="small" style="margin-top:-4px">랭킹에는 이 이름과 기록만 저장돼요</div>' : ''}
      <button class="primary" id="hSend">🏆 랭킹에 올리기</button>` : `${rankingOn() ? '<button class="primary" id="hRank">🏆 랭킹 보기</button>' : ''}`}
      <div id="hMsg" class="small"></div>
      <div class="row2"><button class="secondary" id="hAgain">🔁 새로 도전</button><button class="secondary" id="hOut">나가기</button></div>
    </div>`);
    const nick = v.querySelector('#nick');
    if (nick) {
      const upd = () => {
        const w = RankLib.width(nick.value.trim());
        v.querySelector('#nickW').textContent = (window.I18N && I18N.lang === 'en' ? `${w}/16` : `${Math.ceil(w / 2)}/8`);
        v.querySelector('#nickW').classList.toggle('over', w > RankLib.NAME_MAX_WIDTH);
      };
      nick.addEventListener('input', upd); upd();
      if (needName && window.Ads && Ads.username) Ads.username().then((u) => { if (u && !nick.value) { nick.value = RankLib.cleanName(u); upd(); } });
      if (needName) setTimeout(() => nick.focus(), 300);
    }
    const send = v.querySelector('#hSend');
    if (send) send.onclick = async () => {
      const raw = nick.value.trim();
      if (!raw) { v.querySelector('#hMsg').textContent = '이름을 적어 주세요'; nick.focus(); return; }
      if (RankLib.width(raw) > RankLib.NAME_MAX_WIDTH) { v.querySelector('#hMsg').textContent = '한글 8자(영문 16자)까지 쓸 수 있어요'; return; }
      profile.nickname = RankLib.cleanName(raw); saveProfile(true);
      send.disabled = true; send.textContent = '올리는 중…';
      const r = await submitBest(per);
      if (r.ok) { closeLayer(); showRanking(per, r); }
      else {
        send.disabled = false; send.textContent = '🏆 다시 올려 보기';
        v.querySelector('#hMsg').textContent = r.error === 'no server' ? '랭킹 서버가 아직 연결 전이에요. 기록은 이 기기에 남아 있어요.'
          : r.error === 'offline' ? '인터넷이 안 돼요. 연결되면 자동으로 올라가요.' : '올리지 못했어요: ' + (r.error || '알 수 없음');
      }
    };
    const rk = v.querySelector('#hRank'); if (rk) rk.onclick = () => showRanking(per);
    v.querySelector('#hAgain').onclick = () => {
      if (s.period !== Mines.periodId()) { closeLayer(); game.s.restart(); game.home(); game.changed(); game.saveNow(); return; }
      closeLayer(); g.restart();
    };
    v.querySelector('#hOut').onclick = () => closeGame();
  }

  async function showRanking(period, fresh) {
    const cur = Mines.periodId(), prevId = Mines.periodId(Mines.periodStart(Mines.periodStart() - 1000));
    const mine = profile.hcBest[period];
    const tabs = `<div class="tabs"><button class="tab ${period === cur ? 'on' : ''}" data-p="${cur}">이번 회차 ${fmtPeriod(cur)}</button><button class="tab ${period === prevId ? 'on' : ''}" data-p="${prevId}">지난 회차 ${fmtPeriod(prevId)}</button></div>`;
    const sh = sheet(`<h3>🏆 하드코어 랭킹</h3>${tabs}
      <div class="status" style="padding-top:0;text-align:center">${period === cur ? '다음 초기화 ' + nextResetText() : '끝난 회차'}</div>
      <div id="rkList" class="rk"><div class="rkmsg">불러오는 중…</div></div>
      <div class="rkme">${mine ? `내 최고: <b>${mine.pct}%</b> · ${fmtHMS(mine.time)}` : '이번 회차 내 기록 없음'} · 이름: <b>${esc(profile.nickname || '없음')}</b>
        <button class="link" id="rkName">이름 바꾸기</button></div>`);
    sh.querySelectorAll('.tab').forEach((b) => (b.onclick = () => showRanking(b.dataset.p)));
    sh.querySelector('#rkName').onclick = () => renameDialog(period);
    const box = sh.querySelector('#rkList');
    if (!rankOn()) { box.innerHTML = '<div class="rkmsg">랭킹 서버가 아직 연결 전이에요.<br>(설정을 마치면 여기에 순위가 나와요)</div>'; return; }
    let r = fresh;
    if (!r) { try { r = await rankTop(period); } catch (e) { r = { ok: false, error: 'offline' }; } }
    if (!layer.contains(box)) return;
    if (!r || !r.ok) { box.innerHTML = `<div class="rkmsg">${r && r.error === 'offline' ? '인터넷 연결을 확인해 주세요' : '순위를 불러오지 못했어요'}</div>`; return; }
    if (!r.top.length) { box.innerHTML = '<div class="rkmsg">아직 아무도 기록이 없어요.<br>첫 번째가 되어 보세요!</div>'; return; }
    const medal = (n) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : n);
    let html = r.top.map((x) => `<div class="rkr${x.me ? ' me' : ''}"><span class="rn">${medal(x.rank)}</span><span class="nm">${esc(x.name)}${x.end === 'clear' ? ' 🏆' : ''}</span><span class="pc">${x.pct}%</span><span class="tm">${fmtHMS(x.time)}</span></div>`).join('');
    if (r.me && r.me.rank > r.top.length) html += `<div class="rkr me sep"><span class="rn">${r.me.rank}</span><span class="nm">${esc(r.me.name)}</span><span class="pc">${r.me.pct}%</span><span class="tm">${fmtHMS(r.me.time)}</span></div>`;
    box.innerHTML = html + `<div class="rkmsg small">모두 ${r.count}명 도전</div>`;
  }

  function renameDialog(period) {
    const v = veil(`<div class="card"><div class="big">✏️</div><h2>랭킹 이름</h2>
      <div class="namebox"><input id="nick2" value="${esc(profile.nickname)}" placeholder="한글 8자까지" autocomplete="off"><span id="nickW2"></span></div>
      <div id="rnMsg" class="small"></div>
      <button class="primary" id="rnGo">저장</button><button class="secondary" id="rnNo">취소</button></div>`, closeLayer);
    const inp = v.querySelector('#nick2');
    const upd = () => { const w = RankLib.width(inp.value.trim()); v.querySelector('#nickW2').textContent = (window.I18N && I18N.lang === 'en' ? `${w}/16` : `${Math.ceil(w / 2)}/8`); v.querySelector('#nickW2').classList.toggle('over', w > RankLib.NAME_MAX_WIDTH); };
    inp.addEventListener('input', upd); upd(); setTimeout(() => inp.focus(), 200);
    v.querySelector('#rnNo').onclick = () => showRanking(period);
    v.querySelector('#rnGo').onclick = async () => {
      const raw = inp.value.trim();
      if (!raw) { v.querySelector('#rnMsg').textContent = '이름을 적어 주세요'; return; }
      if (RankLib.width(raw) > RankLib.NAME_MAX_WIDTH) { v.querySelector('#rnMsg').textContent = '한글 8자(영문 16자)까지 쓸 수 있어요'; return; }
      profile.nickname = RankLib.cleanName(raw); saveProfile(true);
      // 이미 낸 기록이 있으면 같은 점수로 다시 보내 이름만 바꾼다
      const b = profile.hcBest[period];
      if (b) { b.submitted = false; await submitBest(period); }
      showRanking(period);
    };
  }

  $('btnBack').onclick = closeGame;
  $('btnUndo').onclick = () => game && game.undo(false);
  $('btnMag').onclick = () => game && game.toggleAim();
  $('btnMenu').onclick = () => game && showMenu();
  $('mode').onclick = () => {
    if (!game) return;
    setMode(!game.flagMode); haptic('light');
    profile.flagMode = game.flagMode; saveProfile(true);
  };

  // ─────────────────────────── 그리기 ───────────────────────────
  let dpr = 1;
  function resize() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
    if (game) game.dirty = true;
  }
  window.addEventListener('resize', resize);

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawFlag(x, y, w) {
    const pw = Math.max(1.5, w * 0.07), px = x + w * 0.36;
    ctx.fillStyle = th.pole;
    ctx.fillRect(px, y + w * 0.18, pw, w * 0.58);
    rr(x + w * 0.26, y + w * 0.72, w * 0.42, Math.max(1.5, w * 0.08), w * 0.03); ctx.fill();
    ctx.fillStyle = th.flag;
    ctx.beginPath();
    ctx.moveTo(px + pw, y + w * 0.18); ctx.lineTo(x + w * 0.80, y + w * 0.34); ctx.lineTo(px + pw, y + w * 0.50);
    ctx.closePath(); ctx.fill();
  }

  /** 완성 직후엔 그림이 가운데서부터 번져 나간다 */
  function pictureVisible(g, sx, sy, x, y) {
    if (!g.fx.length) return true;
    const f = g.fx.find((e) => e.sx === sx && e.sy === sy);
    if (!f) return true;
    const d = Math.max(Math.abs(x - sx * SECTOR - 3.5), Math.abs(y - sy * SECTOR - 3.5)) - 0.5;
    return performance.now() - f.t0 > 120 + d * RIPPLE_MS;
  }

  /** 완성 구역의 지뢰 칸: 그림 위에 흰 동그라미 + 빨간 깃발 (어디서나 또렷하게) */
  function drawSolvedFlag(px, py, w) {
    const r = w * 0.36, cx = px + w / 2, cy = py + w / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = Math.max(1, w * 0.05); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
    const fw = r * 1.3, fx = cx - fw * 0.42, fy = cy - fw * 0.5;
    ctx.fillStyle = '#333';
    ctx.fillRect(fx, fy, Math.max(1.2, fw * 0.12), fw);
    ctx.fillStyle = '#E94F64';
    ctx.beginPath(); ctx.moveTo(fx + fw * 0.12, fy); ctx.lineTo(fx + fw * 0.95, fy + fw * 0.28); ctx.lineTo(fx + fw * 0.12, fy + fw * 0.56); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function draw() {
    const g = game, s = g.s, f = s.field, c = g.cell;
    const W = innerWidth, H = innerHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
    let x0 = Math.floor(-g.ox / c), x1 = Math.floor((W - g.ox) / c);
    let y0 = Math.floor(-g.oy / c), y1 = Math.floor((H - g.oy) / c);
    const N = g.cfg.size, art = s.hardcore ? hcArt(s.period) : null;
    if (N) {   // 유한 보드: 바깥은 어둡게, 보드에는 그림자
      ctx.fillStyle = th.dark ? '#070B18' : 'rgba(0,0,0,.18)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = th.bg; ctx.fillRect(g.ox - 4, g.oy - 4, N * c + 8, N * c + 8);
      x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(N - 1, x1); y1 = Math.min(N - 1, y1);
      if (x1 < x0 || y1 < y0) return;
    }
    const tiny = c < 10;   // 아주 작게 볼 때는 둥근 모서리·숫자를 생략해 빠르게
    const gap = Math.max(0.8, c * 0.05), rad = c * 0.18, lift = Math.max(1, c * 0.06);
    const numFont = `800 ${Math.round(c * 0.56)}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    const emoFont = `${Math.round(c * 0.5)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';

    for (let y = y0; y <= y1; y++) {
      const sy = fdiv(y, SECTOR);
      for (let x = x0; x <= x1; x++) {
        const sx = fdiv(x, SECTOR);
        const k = key(x, y);
        const alt = ((sx + sy) & 1) === 0;
        const px = g.ox + x * c + gap / 2, py = g.oy + y * c + gap / 2, w = c - gap;

        if (tiny) {
          let col;
          if (s.exploded === k) col = '#F2545B';
          else if (s.solved.has(key(sx, sy)) && pictureVisible(g, sx, sy, x, y) && !s.revealed.has(k) && c >= 6) col = '#FFFFFF';
          else if (s.solved.has(key(sx, sy)) && pictureVisible(g, sx, sy, x, y)) col = art ? (hcColor(art, x, y) || th.solA) : (() => { const p2 = picOf(f, sx, sy), ch = p2.px[y - sy * SECTOR][x - sx * SECTOR]; return ch === '+' ? p2.c1 : ch === '#' ? p2.c2 : th.solA; })();
          else if (s.revealed.has(k)) col = alt ? th.openA : th.openB;
          else col = s.flagged.has(k) ? th.flag : (alt ? th.hidA : th.hidB);
          ctx.fillStyle = col; ctx.fillRect(g.ox + x * c, g.oy + y * c, c - (c > 5 ? 0.6 : 0), c - (c > 5 ? 0.6 : 0));
          continue;
        }
        if (s.exploded === k) {
          ctx.fillStyle = '#F2545B'; rr(px, py, w, w, rad); ctx.fill();
          ctx.font = emoFont; ctx.fillText('💣', px + w / 2, py + w / 2 + c * 0.03);
        } else if (s.solved.has(key(sx, sy)) && pictureVisible(g, sx, sy, x, y)) {
          // 완성 구역 = 픽셀 그림 한 칸
          let col, ch;
          if (art) { col = hcColor(art, x, y); ch = col ? '+' : '.'; col = col || th.solA; }
          else {
            const pic = picOf(f, sx, sy);
            ch = pic.px[y - sy * SECTOR][x - sx * SECTOR];
            col = ch === '+' ? pic.c1 : ch === '#' ? pic.c2 : th.solA;
          }
          ctx.fillStyle = col; ctx.fillRect(g.ox + x * c + 0.5, g.oy + y * c + 0.5, c - 1, c - 1);
          const mine = !s.revealed.has(k);
          if (mine) { if (c >= 12) drawSolvedFlag(px, py, w); }
          else if (c >= 24) {
            const n = f.count(x, y);
            if (n) {
              ctx.font = numFont; ctx.globalAlpha = 0.38;
              ctx.fillStyle = ch === '.' ? th.nums[n - 1] : '#FFFFFF';
              ctx.fillText(n, px + w / 2, py + w / 2 + c * 0.03); ctx.globalAlpha = 1;
            }
          }
        } else if (s.revealed.has(k)) {
          const sol = s.solved.has(key(sx, sy));
          ctx.fillStyle = sol ? (alt ? th.solA : th.solB) : (alt ? th.openA : th.openB);
          rr(px, py, w, w, rad * 0.5); ctx.fill();
          const n = f.count(x, y);
          if (n) { ctx.font = numFont; ctx.fillStyle = th.nums[n - 1]; ctx.fillText(n, px + w / 2, py + w / 2 + c * 0.03); }
        } else {
          ctx.fillStyle = th.hidSh; rr(px, py, w, w, rad); ctx.fill();
          ctx.fillStyle = alt ? th.hidA : th.hidB; rr(px, py, w, w - lift, rad); ctx.fill();
          if (s.flagged.has(k) || s.solved.has(key(sx, sy))) drawFlag(px, py - lift / 2, w);
          else if (c >= 20 && !s.hardcore) {
            const v = f.gemAt(x, y);
            if (v) { ctx.font = emoFont; ctx.fillText(v >= 5 ? '💖' : '💎', px + w / 2, py + (w - lift) / 2 + c * 0.03); }
          }
        }
      }
    }
    // 돋보기로 비춰 본 3×3
    const pk = g.peekState;
    if (pk) {
      const now = performance.now(), left = pk.until - now;
      const a = Math.min(1, (now - pk.t0) / 180) * Math.min(1, left / 600);   // 스르륵 나타났다 사라진다
      const bx = g.ox + (pk.cx - 1) * c, by = g.oy + (pk.cy - 1) * c;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      rr(bx - 3, by - 3, c * 3 + 6, c * 3 + 6, c * 0.3); ctx.fill();
      ctx.lineWidth = Math.max(2, c * 0.08); ctx.strokeStyle = th.accent; ctx.stroke();
      for (const cell of pk.cells) {
        if (s.revealed.has(key(cell.x, cell.y))) continue;
        const px = g.ox + cell.x * c + gap / 2, py = g.oy + cell.y * c + gap / 2, w = c - gap;
        if (cell.mine) {
          ctx.fillStyle = 'rgba(242,84,91,.42)'; rr(px, py, w, w - lift, rad); ctx.fill();
          ctx.globalAlpha = a * 0.85; ctx.font = emoFont; ctx.fillText('💣', px + w / 2, py + (w - lift) / 2 + c * 0.03);
          ctx.globalAlpha = a;
        } else {
          ctx.fillStyle = 'rgba(255,255,255,.35)'; rr(px, py, w, w - lift, rad); ctx.fill();
        }
      }
      // 남은 시간 막대
      ctx.fillStyle = th.accent;
      ctx.fillRect(bx, by + c * 3 + 6, (c * 3) * Math.max(0, left / PEEK_MS), Math.max(3, c * 0.08));
      ctx.restore();
    }

    // 완성 구역: 금색 테두리 + ✓ 배지
    const GOLD = th.dark ? '#FFD36E' : '#E3A92B';
    const sx0 = fdiv(x0, SECTOR), sx1 = fdiv(x1, SECTOR), sy0 = fdiv(y0, SECTOR), sy1 = fdiv(y1, SECTOR);
    for (let sy = sy0; sy <= sy1; sy++) for (let sx = sx0; sx <= sx1; sx++) {
      if (!s.solved.has(key(sx, sy))) continue;
      if (art && c < 12) continue;   // 하드코어 그림을 멀리서 볼 때는 테두리 없이 그림만
      const bx = g.ox + sx * SECTOR * c, by = g.oy + sy * SECTOR * c, bw = SECTOR * c;
      ctx.lineWidth = Math.max(2, c * 0.1); ctx.strokeStyle = GOLD;
      rr(bx + ctx.lineWidth / 2, by + ctx.lineWidth / 2, bw - ctx.lineWidth, bw - ctx.lineWidth, c * 0.35); ctx.stroke();
      if (c >= 14) {
        const br = Math.max(9, c * 0.42), cx = bx + bw - br * 0.9, cy = by + br * 0.9;
        ctx.fillStyle = GOLD; ctx.beginPath(); ctx.arc(cx, cy, br, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, br * 0.28); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(cx - br * 0.45, cy + br * 0.02); ctx.lineTo(cx - br * 0.1, cy + br * 0.38); ctx.lineTo(cx + br * 0.48, cy - br * 0.34); ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }

    // 구역 경계
    ctx.strokeStyle = th.line; ctx.lineWidth = Math.max(1, c * 0.06);
    ctx.beginPath();
    const ly0 = N ? Math.max(0, g.oy) : 0, ly1 = N ? Math.min(H, g.oy + N * c) : H;
    const lx0 = N ? Math.max(0, g.ox) : 0, lx1 = N ? Math.min(W, g.ox + N * c) : W;
    for (let x = Math.ceil(x0 / SECTOR) * SECTOR; x <= x1 + 1; x += SECTOR) { const p = g.ox + x * c; ctx.moveTo(p, ly0); ctx.lineTo(p, ly1); }
    for (let y = Math.ceil(y0 / SECTOR) * SECTOR; y <= y1 + 1; y += SECTOR) { const p = g.oy + y * c; ctx.moveTo(lx0, p); ctx.lineTo(lx1, p); }
    ctx.stroke();
    if (N) { ctx.strokeStyle = th.dark ? '#FF6B6B' : '#D9483B'; ctx.lineWidth = 3; ctx.strokeRect(g.ox - 2, g.oy - 2, N * c + 4, N * c + 4); }

    drawFx(g, s, c);
  }

  function drawFx(g, s, c) {
    if (!g.fx.length) return;
    const now = performance.now(), DUR = 1800;
    g.fx = g.fx.filter((f) => now - f.t0 < DUR && s.solved.has(key(f.sx, f.sy)));
    if (!g.fx.length) { g.dirty = true; return; }
    const GOLD = th.dark ? '#FFD36E' : '#E3A92B';
    for (const f of g.fx) {
      const t = (now - f.t0) / DUR;
      const bx = g.ox + f.sx * SECTOR * c, by = g.oy + f.sy * SECTOR * c, bw = SECTOR * c;
      const cx = bx + bw / 2, cy = by + bw / 2;
      ctx.save();
      // 번쩍
      if (t < 0.25) { ctx.globalAlpha = (1 - t / 0.25) * 0.75; ctx.fillStyle = '#fff'; rr(bx, by, bw, bw, c * 0.35); ctx.fill(); }
      // 퍼지는 테두리
      const grow = t * c * 2.2;
      ctx.globalAlpha = Math.max(0, 1 - t * 1.3); ctx.strokeStyle = GOLD; ctx.lineWidth = Math.max(3, c * 0.16);
      rr(bx - grow, by - grow, bw + grow * 2, bw + grow * 2, c * 0.35 + grow); ctx.stroke();
      // 꽃가루
      ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 0.55) / 0.45);
      const sec = t * DUR / 1000;
      for (const p of f.parts) {
        const dist = p.v * c * 4.2 * (1 - Math.exp(-sec * 3));
        const px = cx + Math.cos(p.a) * dist;
        const py = cy + Math.sin(p.a) * dist * 0.8 + (p.vy0 * sec + 2.2 * sec * sec) * c * 1.4;
        ctx.save(); ctx.translate(px, py); ctx.rotate(p.r + sec * 7); ctx.fillStyle = p.c;
        ctx.fillRect(-p.sz * c * 0.6, -p.sz * c * 0.3, p.sz * c * 1.2, p.sz * c * 0.6); ctx.restore();
      }
      // CLEAR 도장
      const pop = t < 0.18 ? 1.6 - (t / 0.18) * 0.6 : 1;
      ctx.globalAlpha = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 0.2);
      ctx.translate(cx, cy); ctx.rotate(-0.12); ctx.scale(pop, pop);
      const fs = Math.max(16, Math.min(bw * 0.24, 64));
      ctx.font = `900 ${fs}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const tw = ctx.measureText('CLEAR!').width;
      ctx.fillStyle = 'rgba(255,255,255,.92)'; rr(-tw / 2 - fs * 0.4, -fs * 0.72, tw + fs * 0.8, fs * 1.44, fs * 0.35); ctx.fill();
      ctx.lineWidth = Math.max(3, fs * 0.09); ctx.strokeStyle = GOLD; ctx.stroke();
      ctx.fillStyle = GOLD; ctx.fillText('CLEAR!', 0, fs * 0.04);
      ctx.restore();
    }
  }

  function frame(now) {
    if (game) {
      const a = game.anim;
      if (a) {
        const t = Math.min(1, (now - a.t0) / 350), e = 1 - Math.pow(1 - t, 3);
        game.ox = a.fx + (a.tx - a.fx) * e; game.oy = a.fy + (a.ty - a.fy) * e; game.dirty = true;
        if (t >= 1) { game.anim = null; game.cameraMoved(); }
      }
      if (game.fx.length) game.dirty = true;
      if (game.peekState) {
        if (now >= game.peekState.until) game.peekState = null;
        game.dirty = true;
      }
      if (game.dirty) { game.dirty = false; draw(); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // ─────────────────────────── 손가락 ───────────────────────────
  const pts = new Map();
  let gmode = null, longTimer = 0, longFired = false, sx0 = 0, sy0 = 0, pinch = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (!game) return;
    audio();  // iOS: 첫 터치에서 소리 켜기
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      gmode = 'tap'; longFired = false; sx0 = e.clientX; sy0 = e.clientY;
      clearTimeout(longTimer);
      longTimer = setTimeout(() => {
        if (gmode === 'tap') { longFired = true; game.act(sx0, sy0, true); }
      }, 330);
    } else if (pts.size === 2) {
      clearTimeout(longTimer);
      gmode = 'pinch';
      pinch = pinchInfo();
    }
  });

  function pinchInfo() {
    const [a, b] = [...pts.values()];
    return { mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  }

  canvas.addEventListener('pointermove', (e) => {
    if (!game || !pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    const cur = { x: e.clientX, y: e.clientY };
    pts.set(e.pointerId, cur);
    if (gmode === 'tap' && Math.hypot(cur.x - sx0, cur.y - sy0) > 9) { clearTimeout(longTimer); gmode = 'pan'; }
    if (gmode === 'pan' && pts.size === 1) game.pan(cur.x - prev.x, cur.y - prev.y);
    else if (gmode === 'pinch' && pts.size === 2) {
      const p = pinchInfo();
      game.zoom(p.d / pinch.d, p.mx, p.my);
      game.pan(p.mx - pinch.mx, p.my - pinch.my);
      pinch = p;
    }
  });

  function endPointer(e, cancelled) {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (gmode === 'tap' && !longFired && !cancelled && pts.size === 0) {
      clearTimeout(longTimer);
      game && game.act(e.clientX, e.clientY, false);
    }
    if (pts.size === 0) { gmode = null; clearTimeout(longTimer); }
    else if (gmode === 'pinch' && pts.size === 1) gmode = 'pan';
  }
  canvas.addEventListener('pointerup', (e) => endPointer(e, false));
  canvas.addEventListener('touchend', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });   // 뒤따르는 가짜 클릭 막기
  canvas.addEventListener('pointercancel', (e) => endPointer(e, true));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    if (!game) return; e.preventDefault();
    if (e.ctrlKey) game.zoom(Math.exp(-e.deltaY / 100), e.clientX, e.clientY);
    else game.pan(-e.deltaX, -e.deltaY);
  }, { passive: false });
  // iOS 사파리의 두 손가락 확대·두 번 탭 확대를 막는다
  ['gesturestart', 'gesturechange'].forEach((n) => document.addEventListener(n, (e) => e.preventDefault()));
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

  // ─────────────────────────── 시계 · 꺼질 때 저장 ───────────────────────────
  let lastTick = performance.now(), autosaveAcc = 0;
  setInterval(() => {
    const now = performance.now(), dt = Math.min(1, (now - lastTick) / 1000); lastTick = now;
    if (!game || document.hidden || adPaused) return;
    const ended = game.s.tick(dt);
    if ((game.cfg.kind === 'timed' || game.s.hardcore) && game.s.started && !game.s.gameOver) updateHud();
    if (ended) { sfx('boom'); haptic('heavy'); updateHud(); game.saveNow(); showOver(); return; }
    autosaveAcc += dt;
    if (autosaveAcc > 10 && game.s.started) { autosaveAcc = 0; game.scheduleSave(); }  // 플레이 시간·타이머
  }, 250);

  function flushAll() {
    if (game) game.saveSync();
    clearTimeout(profileTimer);
    Storage.saveNow('profile', profile);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushAll(); else lastTick = performance.now(); });
  window.addEventListener('pagehide', flushAll);
  window.addEventListener('beforeunload', flushAll);

  // ─────────────────────────── 시작 ───────────────────────────
  async function boot() {
    const p = await Storage.load('profile');
    if (p && typeof p === 'object') profile = { ...DEFAULT_PROFILE, ...p, pictures: { ...(p.pictures || {}) }, hcBest: { ...(p.hcBest || {}) } };
    for (const w of WORLDS) {
      const s = await Storage.load('world:' + w.id);
      if (s) summaries[w.id] = s;
    }
    // 그림 도감이 생기기 전에 완성한 구역도 도감에 넣어 준다 (한 번만)
    if (!profile.albumBackfilled) {
      for (const sv of Object.values(summaries)) for (const sk of (sv.rewarded || sv.solved || [])) {
        const pic = picOf({ seed: sv.seed }, kx(sk), ky(sk));
        profile.pictures[pic.id] = (profile.pictures[pic.id] || 0) + 1;
      }
      profile.albumBackfilled = true; saveProfile(true);
    }
    applyTheme();
    renderHome();
    const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
    $('installTip').hidden = standalone || !ios || PUBLIC;
    if (PUBLIC) {
      const nm = typeof ED.name === 'object' ? (ED.name[window.I18N ? I18N.lang : 'ko'] || ED.name.en) : ED.name;
      document.title = nm; $('appName').textContent = nm;
      $('appSub').textContent = '끝없이 펼쳐지는 지뢰찾기';
      $('howto').innerHTML = $('howto').innerHTML
        .replace('• 지뢰를 밟으면 실수로 세고, 광고 없이 되돌릴 수 있어요', `• 지뢰를 밟으면 실수로 세고, 하루 ${FREE_UNDO}번은 무료로 되돌릴 수 있어요`)
        .replace(/• 🔥 하드코어:[^<]*/, '• 🔥 하드코어: 되돌리기·돋보기 없이 96×96 보드에 도전! 화·목·토 아침 7시(한국 시간)에 새 그림으로 바뀌고 랭킹에 올라가요');
      $('btnGift').hidden = true;
      if (!rankingOn()) $('btnRank').hidden = true;
    }
    if (!profile.introSeen && ED.gift) showGift();
    if (ED.sw !== false && 'serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    if (standalone) Storage.requestPersist();
    if (!profile.pid) { profile.pid = newPid(); saveProfile(true); }
    flushPending();
    window.addEventListener('online', flushPending);
    window.__app = { get game() { return game; }, get profile() { return profile; }, Storage, openGame, closeGame, showRanking, hcArt, ED };
    if (window.Ads) { await Ads.init(); Ads.loading(false); }
    // 공개판: 곧바로 게임으로 (처음이면 오솔길, 다음부터는 마지막 보드)
    if (PUBLIC && !new URLSearchParams(location.search).has('home')) openGame(world(profile.lastWorld) ? profile.lastWorld : 'trail');
  }
  if (window.Ads) Ads.loading(true);
  boot();
})();
