/* 보상형 광고 — 공개판 전용. 전면 광고는 쓰지 않는다.
 *
 *  provider
 *   'none'        광고 없음 (선물판). 광고 버튼이 아예 안 보인다.
 *   'crazygames'  CrazyGames HTML5 SDK v3. CrazyGames 사이트 밖에서는 자동으로 꺼진다.
 *   'mock'        테스트·미리보기용 가짜 광고 (2초 화면).
 *
 *  Ads.canOffer(slot)  지금 이 자리에서 광고 버튼을 보여도 되는가 (준비됨 + 쿨다운 지남)
 *  Ads.rewarded(slot)  → Promise<'ok' | 'unfilled' | 'adblock' | 'cooldown' | 'error'>
 *                       'ok' 일 때만 보상을 준다.
 */
(function (root) {
  'use strict';
  const ED = root.EDITION || {};
  const provider = ED.ads || 'none';
  // 같은 자리에서 광고를 너무 자주 권하지 않는다 (CrazyGames 광고 가이드)
  const COOLDOWN = { magnifier: 120e3, undo: 180e3, time: 0, default: 90e3 };
  const last = {};
  let ready = false, adblock = false, playing = false, locale = null;
  let hooks = { pause() {}, resume() {} };

  function sdk() { return root.CrazyGames && root.CrazyGames.SDK; }

  async function init() {
    if (provider === 'mock') { ready = true; return; }
    if (provider !== 'crazygames') return;
    try {
      const S = sdk(); if (!S) return;
      await S.init();
      if (S.environment === 'disabled') return;        // CrazyGames 밖(미리보기 주소 등)
      ready = true;
      try { locale = (S.user && S.user.systemInfo && S.user.systemInfo.locale) || null; } catch (e) {}
      try { adblock = !!(await S.ad.hasAdblock()); } catch (e) {}
    } catch (e) { ready = false; }
  }

  function cooldownLeft(slot) {
    const cd = COOLDOWN[slot] ?? COOLDOWN.default;
    return Math.max(0, (last[slot] || 0) + cd - Date.now());
  }

  function canOffer(slot) {
    return ready && !playing && cooldownLeft(slot) === 0;
  }

  function mockAd() {
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.id = 'mockAd';
      el.style.cssText = 'position:fixed;inset:0;z-index:99;background:#111;color:#fff;display:grid;place-items:center;font:700 18px system-ui;text-align:center';
      el.innerHTML = '<div>📺 AD (test)<div id="mockAdT" style="font-size:40px;margin-top:10px">2</div></div>';
      document.body.appendChild(el);
      let n = 2;
      const iv = setInterval(() => {
        n--; const t = document.getElementById('mockAdT'); if (t) t.textContent = n;
        if (n <= 0) { clearInterval(iv); el.remove(); resolve('ok'); }
      }, 1000);
    });
  }

  function cgAd() {
    return new Promise((resolve) => {
      try {
        sdk().ad.requestAd('rewarded', {
          adStarted: () => hooks.pause(),
          adFinished: () => resolve('ok'),
          adError: (err) => {
            const c = (err && err.code) || 'other';
            // Basic Launch(시험 기간)에는 광고가 꺼져 있다 → 광고 버튼을 더 이상 보이지 않는다
            if (c === 'adsDisabledBasicLaunch') { ready = false; resolve('disabled'); return; }
            resolve(c === 'unfilled' ? 'unfilled' : c === 'adblock' ? 'adblock' : c === 'adCooldown' ? 'cooldown' : 'error');
          },
        });
      } catch (e) { resolve('error'); }
    });
  }

  async function rewarded(slot) {
    if (!ready) return 'error';
    if (playing) return 'cooldown';
    if (cooldownLeft(slot) > 0) return 'cooldown';
    playing = true;
    hooks.pause();
    let r;
    try { r = provider === 'mock' ? await mockAd() : await cgAd(); }
    finally { playing = false; hooks.resume(); }
    if (r === 'ok') last[slot] = Date.now();
    if (r === 'adblock') adblock = true;
    return r;
  }

  // 게임 진행 신호 (CrazyGames 가 광고·추천을 조절하는 데 쓴다)
  function gameplay(on) {
    if (provider !== 'crazygames' || !ready) return;
    try { const g = sdk().game; on ? g.gameplayStart() : g.gameplayStop(); } catch (e) {}
  }
  function loading(on) {
    if (provider !== 'crazygames') return;
    try { const g = sdk() && sdk().game; if (g) on ? g.loadingStart() : g.loadingStop(); } catch (e) {}
  }

  /** CrazyGames 에 로그인한 이용자의 이름 (없으면 null) */
  async function username() {
    if (provider !== 'crazygames' || !ready) return null;
    try { const u = await sdk().user.getUser(); return (u && u.username) || null; } catch (e) { return null; }
  }

  root.Ads = {
    username,
    provider, init, canOffer, rewarded, cooldownLeft, gameplay, loading,
    get ready() { return ready; }, get locale() { return locale; }, get adblock() { return adblock; }, get playing() { return playing; },
    setHooks(h) { hooks = { ...hooks, ...h }; },
    _resetCooldowns() { for (const k in last) delete last[k]; },
  };
})(window);
