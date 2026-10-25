/* 무한 지뢰찾기 — 게임 규칙 (화면과 무관, node 에서 단독 테스트 가능)
 *
 * 지뢰는 저장하지 않는다. 씨앗(seed) + 좌표 해시로 늘 같은 답이 나온다.
 * 그래서 보드가 아무리 넓어져도 저장 용량은 "열어 본 칸"만큼만 든다.
 */
(function (root) {
  'use strict';

  const SECTOR = 8;           // 구역 한 변 (원작과 같은 8×8)
  const SAFE_R = 2;           // 첫 탭 주변 5×5 는 지뢰 없음
  const FLOOD_CAP = 6000;
  const UNDO_LIMIT = 300;
  const SAVE_UNDO = 120;      // 저장할 때 같이 남기는 되돌리기 기록 수

  // ── 하드코어 ──
  // 96×96 칸 (12×12 구역, 지뢰 16%) — 안전한 칸 약 7,700개. 보통 속도(초당 1칸 남짓)로 2시간 안팎.
  const HC_SIZE = 96;
  const KST = 9 * 3600e3, DAY = 86400e3;
  const RESET_DAYS = [2, 4, 6];   // 화·목·토 (일=0)
  const RESET_HOUR = 7;           // 오전 7시 (한국 시간)
  /** 지금이 속한 회차의 시작 시각 (UTC ms) */
  function periodStart(now = Date.now()) {
    const k = new Date(now + KST);
    const today7 = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), RESET_HOUR) - KST;
    for (let i = 0; i < 9; i++) {
      const t = today7 - i * DAY;
      if (t <= now && RESET_DAYS.includes(new Date(t + KST).getUTCDay())) return t;
    }
    return today7;
  }
  function nextReset(now = Date.now()) {
    const st = periodStart(now);
    for (let i = 1; i < 9; i++) { const t = st + i * DAY; if (RESET_DAYS.includes(new Date(t + KST).getUTCDay())) return t; }
    return st + 2 * DAY;
  }
  /** 회차 이름: "20261020" (그 회차가 시작된 날, 한국 날짜) */
  function periodId(t = periodStart()) {
    const k = new Date(t + KST);
    return String(k.getUTCFullYear() * 10000 + (k.getUTCMonth() + 1) * 100 + k.getUTCDate());
  }
  /** 회차 번호 (그림 고르기용 — 이어지는 두 회차는 늘 다른 번호) */
  function periodIndex(t = periodStart()) {
    const day = Math.floor((t + KST) / DAY), wd = new Date(t + KST).getUTCDay();
    return ((day - wd - 3) / 7) * 3 + Math.max(0, RESET_DAYS.indexOf(wd));
  }

  // 좌표 ↔ 정수 키 (±100만 칸까지)
  const OFF = 1048576, MUL = 2097152;
  const key = (x, y) => (x + OFF) * MUL + (y + OFF);
  const kx = (k) => Math.floor(k / MUL) - OFF;
  const ky = (k) => (k % MUL) - OFF;
  const fdiv = (a, b) => Math.floor(a / b);

  function fmix(h) {
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }
  function hash(seed, x, y, salt) {
    let h = fmix((seed ^ 0x9e3779b9) >>> 0);
    h = fmix((h ^ Math.imul(x | 0, 0x27d4eb2f)) >>> 0);
    h = fmix((h ^ Math.imul(y | 0, 0x165667b1)) >>> 0);
    h = fmix((h ^ Math.imul(salt, 0x61c88647)) >>> 0);
    return h;
  }

  const WORLDS = [
    { id: 'meadow', name: '들판 산책', emoji: '🌿', sub: '지뢰가 드문 편안한 보드', density: 0.13, kind: 'endless' },
    { id: 'trail',  name: '오솔길',    emoji: '🌸', sub: '원작과 비슷한 기본 난이도', density: 0.16, kind: 'endless' },
    { id: 'forest', name: '깊은 숲',   emoji: '🌲', sub: '생각을 조금 더 해야 하는 보드', density: 0.19, kind: 'endless' },
    { id: 'abyss',  name: '심연',      emoji: '🌋', sub: '지뢰가 빽빽한 도전 보드', density: 0.22, kind: 'endless' },
    { id: 'daily',  name: '오늘의 보드', emoji: '📅', sub: '매일 자정에 새 지도가 열려요', density: 0.16, kind: 'daily' },
    { id: 'hardcore', name: '하드코어', emoji: '🔥', sub: '되돌리기·아이템 없음 · 지뢰 한 번이면 끝', density: 0.16, kind: 'hardcore', size: HC_SIZE },
    { id: 'timed',  name: '타임 어택', emoji: '⏱️', sub: '3분 시작 · 구역을 완성하면 +20초', density: 0.16, kind: 'timed', start: 180, bonus: 20 },
  ];
  const world = (id) => WORLDS.find((w) => w.id === id);

  function todayStamp(d = new Date()) {
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  function freshSeed(cfg, today) {
    if (cfg.kind === 'daily') return fmix((today * 2654435761) >>> 0) || 1;
    return (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
  }

  class Field {
    constructor(seed, density, safe, size) {
      this.size = size || 0;
      this.seed = seed >>> 0;
      this.density = density;
      this.safe = safe || null;   // [x, y]
      this.threshold = density * 4294967296;
    }
    isMine(x, y) {
      if (this.size && (x < 0 || y < 0 || x >= this.size || y >= this.size)) return false;
      const s = this.safe;
      if (s && Math.abs(x - s[0]) <= SAFE_R && Math.abs(y - s[1]) <= SAFE_R) return false;
      return hash(this.seed, x, y, 1) < this.threshold;
    }
    count(x, y) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          if ((dx || dy) && this.isMine(x + dx, y + dy)) n++;
      return n;
    }
    /** 구역마다 보석 하나가 있을 수 있다. 드물게 하트(💖, 보석 5개 값어치) */
    gem(sx, sy) {
      const h = hash(this.seed, sx, sy, 7);
      const roll = h % 100;
      if (roll >= 32) return null;
      const x = sx * SECTOR + ((h >>> 8) % SECTOR);
      const y = sy * SECTOR + ((h >>> 16) % SECTOR);
      if (this.isMine(x, y)) return null;
      return { x, y, value: roll < 4 ? 5 : 1 };
    }
    gemAt(x, y) {
      const g = this.gem(fdiv(x, SECTOR), fdiv(y, SECTOR));
      return g && g.x === x && g.y === y ? g.value : 0;
    }
  }

  function neighbors(x, y, fn) {
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        if (dx || dy) fn(x + dx, y + dy);
  }

  class Session {
    constructor(cfg, save) {
      this.cfg = cfg;
      const today = todayStamp();
      if (save && cfg.kind === 'daily' && save.day !== today) save = null;
      if (save && cfg.kind === 'hardcore' && save.period !== periodId()) save = null;   // 회차가 바뀌면 새 판
      if (save && save.v === 1) this._load(save);
      else this._fresh(today);
    }

    _fresh(today) {
      const c = this.cfg;
      this.field = new Field(freshSeed(c, today), c.density, null, c.size);
      this.start = null;
      this.period = c.kind === 'hardcore' ? periodId() : null;
      this.result = null;     // 하드코어: { end: 'dead' | 'clear' | 'giveup' }
      this.continued = false; // 타임 어택: 이번 판에 이어하기를 이미 썼는가
      this.revealed = new Set();
      this.flagged = new Set();
      this.solved = new Set();
      this.rewarded = new Set();   // 돋보기를 이미 준 구역 (되돌렸다 다시 풀어도 두 번 주지 않는다)
      this.gems = 0;
      this.mistakes = 0;
      this.exploded = null;
      this.undoStack = [];
      this.timeLeft = c.kind === 'timed' ? c.start : 0;
      this.best = this.best || 0;
      this.playSeconds = 0;
      this.gameOver = false;
      this.day = c.kind === 'daily' ? today : null;
      this.camera = null;
    }

    _load(s) {
      this.field = new Field(s.seed, this.cfg.density, s.start, this.cfg.size);
      this.period = s.period ?? null;
      this.result = s.result ?? null;
      this.continued = !!s.continued;
      this.start = s.start || null;
      this.solved = new Set(s.solved || []);
      this.rewarded = new Set(s.rewarded || s.solved || []);
      this.revealed = new Set(s.revealed || []);
      // 압축 형식: 완성된 구역은 "지뢰 아닌 칸 전부"라 다시 계산하고, 덜 된 구역은 64비트 마스크
      for (const sk of this.solved) {
        const sx = kx(sk), sy = ky(sk);
        for (let i = 0; i < 64; i++) {
          const x = sx * SECTOR + (i & 7), y = sy * SECTOR + (i >> 3);
          if (!this.field.isMine(x, y)) this.revealed.add(key(x, y));
        }
      }
      if (s.open) for (const [skStr, lo, hi] of s.open) {
        const sk = +skStr, sx = kx(sk), sy = ky(sk);
        for (let i = 0; i < 64; i++) {
          const bit = i < 32 ? (lo >>> i) & 1 : (hi >>> (i - 32)) & 1;
          if (bit) this.revealed.add(key(sx * SECTOR + (i & 7), sy * SECTOR + (i >> 3)));
        }
      }
      this.flagged = new Set(s.flagged || []);
      this.gems = s.gems | 0;
      this.mistakes = s.mistakes | 0;
      this.exploded = s.exploded ?? null;
      this.undoStack = Array.isArray(s.undo) ? s.undo : [];
      this.timeLeft = +s.timeLeft || 0;
      this.best = s.best | 0;
      this.playSeconds = +s.playSeconds || 0;
      this.gameOver = !!s.gameOver;
      this.day = s.day ?? null;
      this.camera = s.camera || null;
    }

    toSave() {
      // 덜 된 구역의 열린 칸만 마스크로 (완성 구역은 불러올 때 다시 계산)
      const masks = new Map();
      for (const k of this.revealed) {
        const x = kx(k), y = ky(k);
        const sx = fdiv(x, SECTOR), sy = fdiv(y, SECTOR), sk = key(sx, sy);
        if (this.solved.has(sk)) continue;
        const i = (y - sy * SECTOR) * 8 + (x - sx * SECTOR);
        let m = masks.get(sk); if (!m) { m = [0, 0]; masks.set(sk, m); }
        if (i < 32) m[0] = (m[0] | (1 << i)) >>> 0; else m[1] = (m[1] | (1 << (i - 32))) >>> 0;
      }
      // 되돌리기 기록은 칸 수 합계가 너무 커지지 않게 뒤에서부터 자른다
      const undo = []; let cells = 0;
      for (let i = this.undoStack.length - 1; i >= 0 && undo.length < SAVE_UNDO; i--) {
        cells += this.undoStack[i].r.length; if (cells > 30000) break;
        undo.unshift(this.undoStack[i]);
      }
      return {
        v: 1, world: this.cfg.id, savedAt: Date.now(),
        seed: this.field.seed, start: this.start,
        open: [...masks].map(([sk, m]) => [sk, m[0], m[1]]),
        flagged: [...this.flagged], solved: [...this.solved],
        rewarded: [...this.rewarded],
        gems: this.gems, mistakes: this.mistakes, exploded: this.exploded,
        undo,
        timeLeft: this.timeLeft, best: this.best, playSeconds: this.playSeconds,
        gameOver: this.gameOver, day: this.day, camera: this.camera,
        period: this.period, result: this.result, continued: this.continued,
      };
    }

    get started() { return !!this.start; }
    get hardcore() { return this.cfg.kind === 'hardcore'; }
    get canUndo() { return !this.hardcore && !this.gameOver && this.undoStack.length > 0; }
    inBounds(x, y) { const n = this.cfg.size; return !n || (x >= 0 && y >= 0 && x < n && y < n); }
    /** 하드코어: 안전한 칸 전체 수 (한 번 세어 둔다) */
    get totalSafe() {
      if (this._totalSafe && this._totalSafeSeed === this.field.seed && this._totalSafeStart === this.start) return this._totalSafe;
      const n = this.cfg.size; let t = 0;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!this.field.isMine(x, y)) t++;
      this._totalSafe = t; this._totalSafeSeed = this.field.seed; this._totalSafeStart = this.start;
      return t;
    }
    /** 하드코어: 완성도 % (소수 첫째 자리) */
    get completion() {
      if (!this.hardcore || !this.start) return 0;
      return Math.floor((this.revealed.size / this.totalSafe) * 1000) / 10;
    }
    /** 하드코어: 포기 — 지금까지의 완성도로 끝낸다 */
    giveUp() {
      if (!this.hardcore || this.gameOver || !this.start) return false;
      this.gameOver = true; this.result = { end: 'giveup' }; this.undoStack = [];
      return true;
    }
    isRevealed(x, y) { return this.revealed.has(key(x, y)); }
    isFlagged(x, y) { return this.flagged.has(key(x, y)); }
    isSolved(sx, sy) { return this.solved.has(key(sx, sy)); }
    /** 완성된 구역 안의 칸인가 (그 구역의 지뢰는 자동 깃발로 친다) */
    inSolved(x, y) { return this.solved.has(key(fdiv(x, SECTOR), fdiv(y, SECTOR))); }
    /** 깃발로 칠 칸: 직접 꽂은 깃발 + 완성 구역의 지뢰 */
    isMarked(x, y) { return this.flagged.has(key(x, y)) || (this.inSolved(x, y) && !this.revealed.has(key(x, y))); }

    /** 돋보기: (cx, cy) 를 가운데로 한 3×3 에서 아직 안 열린 칸들의 지뢰 여부 */
    peek(cx, cy) {
      const cells = [];
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let x = cx - 1; x <= cx + 1; x++)
          if (!this.revealed.has(key(x, y))) cells.push({ x, y, mine: this.field.isMine(x, y) });
      return cells;
    }

    /** 파기. 이미 열린 숫자 칸이면 깃발 수가 맞을 때 주변을 한꺼번에 연다. */
    reveal(x, y) {
      const out = { changed: false, exploded: false, solved: 0, gems: 0, rewards: 0, firstSolved: [] };
      if (this.gameOver || this.exploded !== null || !this.inBounds(x, y)) return out;
      const k = key(x, y);
      if (this.flagged.has(k)) return out;
      if (!this.revealed.has(k) && this.inSolved(x, y)) return out;   // 완성 구역의 지뢰(자동 깃발)는 눌러도 안 터진다
      if (!this.start) { this.start = [x, y]; this.field.safe = this.start; }

      const move = { r: [], fa: [], fr: [], s: [], g: 0, t: 0, e: null };
      const f = this.field;
      if (this.revealed.has(k)) {
        const n = f.count(x, y);
        const targets = [];
        let flags = 0;
        neighbors(x, y, (nx, ny) => {
          if (!this.inBounds(nx, ny)) return;
          const nk = key(nx, ny);
          if (this.isMarked(nx, ny)) flags++;
          else if (!this.revealed.has(nk)) targets.push([nx, ny]);
        });
        if (!targets.length || !(n === 0 || flags === n)) return out;
        let mine = null;
        for (const [tx, ty] of targets) {
          if (f.isMine(tx, ty)) { if (mine === null) mine = key(tx, ty); }
          else this._flood(tx, ty, move);
        }
        move.e = mine;
      } else if (f.isMine(x, y)) {
        move.e = k;
      } else {
        this._flood(x, y, move);
      }
      return this._commit(move, out);
    }

    toggleFlag(x, y) {
      const out = { changed: false, exploded: false, solved: 0, gems: 0, rewards: 0, firstSolved: [] };
      if (!this.start || this.gameOver || this.exploded !== null || !this.inBounds(x, y)) return out;
      const k = key(x, y);
      if (this.revealed.has(k) || this.inSolved(x, y)) return out;
      const move = { r: [], fa: [], fr: [], s: [], g: 0, t: 0, e: null };
      if (this.flagged.has(k)) { this.flagged.delete(k); move.fr.push(k); }
      else { this.flagged.add(k); move.fa.push(k); }
      return this._commit(move, out);
    }

    /** 되돌리기 — 광고 없이, 횟수 제한 없이. 실수 횟수는 줄지 않는다. */
    undo() {
      if (this.hardcore || this.gameOver || !this.undoStack.length) return false;
      const m = this.undoStack.pop();
      for (const k of m.r) this.revealed.delete(k);
      for (const k of m.fa) this.flagged.delete(k);
      for (const k of m.fr) this.flagged.add(k);
      for (const k of m.s) this.solved.delete(k);
      this.gems -= m.g;
      this.timeLeft -= m.t;
      this.exploded = null;
      return m;
    }

    /** 되돌리지 않고, 밟은 지뢰에 깃발을 꽂고 이어 간다 */
    flagExplosion() {
      if (this.exploded === null) return;
      const e = this.exploded;
      this.exploded = null;
      this.flagged.add(e);
      const last = this.undoStack[this.undoStack.length - 1];
      if (last) last.fa.push(e);
    }

    /** 반환: 이번 틱에 시간이 다 됐는가 */
    tick(dt) {
      if (!this.start || this.gameOver || this.exploded !== null) return false;
      this.playSeconds += dt;
      if (this.hardcore) return false;
      if (this.cfg.kind !== 'timed') return false;
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.gameOver = true;
        this.best = Math.max(this.best, this.solved.size);
        this.undoStack = [];
        return true;
      }
      return false;
    }

    /** 타임 어택: 시간이 끝난 판을 secs 초 더 이어 간다 (보상형 광고 보상) */
    extendTime(secs) {
      if (this.cfg.kind !== 'timed' || !this.gameOver || this.continued) return false;
      this.gameOver = false; this.timeLeft = secs; this.continued = true;
      return true;
    }

    restart() {
      const best = this.best;
      this._fresh(todayStamp());
      this.best = best;
    }

    _flood(x, y, move) {
      const f = this.field;
      const stack = [x, y];
      while (stack.length) {
        const cy = stack.pop(), cx = stack.pop();
        if (!this.inBounds(cx, cy)) continue;
        const k = key(cx, cy);
        if (this.revealed.has(k) || this.flagged.has(k)) continue;
        if (f.isMine(cx, cy)) continue;
        this.revealed.add(k);
        move.r.push(k);
        if (!this.cfg.size && move.r.length >= FLOOD_CAP) break;
        if (f.count(cx, cy) === 0) neighbors(cx, cy, (nx, ny) => stack.push(nx, ny));
      }
    }

    _commit(move, out) {
      const f = this.field;
      const touched = new Set();
      for (const k of move.r) {
        const x = kx(k), y = ky(k);
        if (!this.hardcore) move.g += f.gemAt(x, y);
        touched.add(key(fdiv(x, SECTOR), fdiv(y, SECTOR)));
      }
      for (const sk of touched) {
        if (this.solved.has(sk)) continue;
        if (this.sectorClear(kx(sk), ky(sk))) {
          this.solved.add(sk); move.s.push(sk);
          if (!this.hardcore && !this.rewarded.has(sk)) { this.rewarded.add(sk); out.rewards++; out.firstSolved.push(sk); }
        }
      }
      this.gems += move.g;
      if (this.cfg.kind === 'timed') {
        move.t = move.s.length * this.cfg.bonus;
        this.timeLeft += move.t;
      }
      if (move.e !== null) {
        this.exploded = move.e;
        this.mistakes++;
        out.exploded = true;
        if (this.hardcore) { this.gameOver = true; this.result = { end: 'dead' }; out.ended = 'dead'; }
      }
      if (this.hardcore && !this.gameOver && this.start && this.revealed.size >= this.totalSafe) {
        this.gameOver = true; this.result = { end: 'clear' }; out.ended = 'clear';
      }
      if (!move.r.length && !move.fa.length && !move.fr.length && move.e === null) return out;
      out.solvedKeys = move.s;
      if (this.hardcore) { out.changed = true; out.solved = move.s.length; return out; }   // 되돌리기 기록 없음
      this.undoStack.push(move);
      if (this.undoStack.length > UNDO_LIMIT) this.undoStack.splice(0, this.undoStack.length - UNDO_LIMIT);
      out.changed = true;
      out.solved = move.s.length;
      out.gems = move.g;
      return out;
    }

    sectorClear(sx, sy) {
      const f = this.field;
      for (let y = sy * SECTOR; y < (sy + 1) * SECTOR; y++)
        for (let x = sx * SECTOR; x < (sx + 1) * SECTOR; x++)
          if (!f.isMine(x, y) && !this.revealed.has(key(x, y))) return false;
      return true;
    }
  }

  const api = { HC_SIZE, periodStart, nextReset, periodId, periodIndex, SECTOR, SAFE_R, FLOOD_CAP, WORLDS, world, key, kx, ky, fdiv, hash, Field, Session, todayStamp, neighbors };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Mines = api;
})(typeof window !== 'undefined' ? window : globalThis);
