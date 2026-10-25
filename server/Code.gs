/*
 * SH지뢰찾기 하드코어 랭킹 서버 — Google 스프레드시트 + Apps Script (무료)
 *
 * 이 파일 전체를 Apps Script 편집기의 Code.gs 에 붙여 넣고 "웹 앱"으로 배포하세요.
 * 자세한 순서는 server/README.md 에 있습니다.
 *
 * 시트 'scores' 한 장에 회차마다 사람당 한 줄씩 쌓입니다:
 *   period | pid | name | pct | time | end | at
 * 더 좋은 기록일 때만 그 줄을 고칩니다 (같은 점수면 이름만 바뀝니다).
 */

// ─── 공용 규칙 (ranklib.js 에서 그대로 들어옴) ───────────────────────────
/* 랭킹 공용 규칙 — 앱과 서버(Apps Script)가 똑같이 쓴다.
 * 서버 쪽 server/Code.gs 는 이 파일을 그대로 품고 있다 (tools/build-server.js 로 만든다).
 *  · 닉네임: 한글 8자 (= 폭 16, 영문·숫자는 1칸) 까지
 *  · 비속어는 글자 수만큼 * 로 가린다
 *  · 순위: 완성도 높은 순 → 같으면 시간 짧은 순 → 같으면 먼저 낸 순
 */
var RankLib = (function () {
  'use strict';
  var NAME_MAX_WIDTH = 16;

  // 띄어쓰기·기호·숫자를 섞어 써도 걸리도록, 글자만 남겨 비교한다
  var BAD = [
    '씨발', '시발', '씨빨', '씨바', '시바', '쉬발', '슈발', '쓰발', '씌발', '십알', '십새', '씹', '좆', '좃', '존나', '졸라',
    '병신', '븅신', '빙신', '병쉰', '지랄', '개새끼', '개새', '개색', '개쌔', '새끼', '쌔끼', '색히', '개년', '미친년', '미친놈', '미친새',
    '니미', '느금', '니애미', '느그애미', '애미', '애비', '엠창', '썅', '쌍년', '쌍놈', '걸레', '창녀', '보지', '자지', '섹스', '야동',
    '닥쳐', '꺼져', '뒤져', '뒈져', '등신', '또라이', '찐따', '한남', '김치녀', '틀딱',
    'ㅅㅂ', 'ㅆㅂ', 'ㅂㅅ', 'ㅄ', 'ㅈㄹ', 'ㅈㄴ', 'ㄱㅅㄲ', 'ㅅㄲ', 'ㅆㄹㄱ', 'ㅗ',
    'fuck', 'fuk', 'fck', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'cunt', 'nigger', 'nigga', 'sex', 'porn', 'slut', 'whore', 'bastard',
  ];

  function isLetter(ch) {
    var c = ch.charCodeAt(0);
    return (c >= 0xAC00 && c <= 0xD7A3) || (c >= 0x3131 && c <= 0x318E) || (c >= 0x61 && c <= 0x7A) || (c >= 0x41 && c <= 0x5A);
  }

  /** 비속어를 같은 글자 수의 * 로 */
  function mask(s) {
    var chars = Array.from(s), letters = [], pos = [];
    for (var i = 0; i < chars.length; i++) {
      if (isLetter(chars[i])) { letters.push(chars[i].toLowerCase()); pos.push(i); }
    }
    var flat = letters.join(''), hit = new Array(chars.length).fill(false);
    for (var b = 0; b < BAD.length; b++) {
      var w = BAD[b], from = 0, at;
      while ((at = flat.indexOf(w, from)) >= 0) {
        // 처음 글자부터 끝 글자 사이에 끼워 넣은 기호·띄어쓰기까지 함께 가린다
        for (var q = pos[at]; q <= pos[at + w.length - 1]; q++) hit[q] = true;
        from = at + 1;
      }
    }
    var out = '';
    for (var k = 0; k < chars.length; k++) out += hit[k] ? '*' : chars[k];
    return out;
  }

  function charWidth(ch) {
    var c = ch.codePointAt(0);
    if (c < 0x1100) return 1;
    return 2;   // 한글·한자·이모지 등
  }
  function width(s) { var w = 0; Array.from(s).forEach(function (ch) { w += charWidth(ch); }); return w; }

  /** 화면에 올릴 닉네임으로 다듬는다 */
  function cleanName(raw) {
    var s = String(raw == null ? '' : raw)
      .replace(/[\u0000-\u001F\u007F<>"'`\\]/g, '')
      .replace(/\s+/g, ' ').trim();
    var out = '', w = 0, chars = Array.from(s);
    for (var i = 0; i < chars.length; i++) {
      var cw = charWidth(chars[i]);
      if (w + cw > NAME_MAX_WIDTH) break;
      out += chars[i]; w += cw;
    }
    out = mask(out.trim());
    return out || '익명';
  }

  /** a 가 b 보다 앞 순위면 음수 */
  function compare(a, b) {
    if (b.pct !== a.pct) return b.pct - a.pct;
    if (a.time !== b.time) return a.time - b.time;
    return (a.at || 0) - (b.at || 0);
  }
  function isBetter(a, b) { return !b || compare(a, b) < 0; }
  function isSame(a, b) { return !!b && a.pct === b.pct && a.time === b.time; }

  return { NAME_MAX_WIDTH: NAME_MAX_WIDTH, mask: mask, width: width, cleanName: cleanName, compare: compare, isBetter: isBetter, isSame: isSame };
})();

// ─── 회차 (앱과 같은 계산: 화·목·토 07:00 KST) ─────────────────────────
var KST = 9 * 3600e3, DAY = 86400e3, RESET_DAYS = [2, 4, 6], RESET_HOUR = 7;
function periodStart_(now) {
  var k = new Date(now + KST);
  var today7 = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(), RESET_HOUR) - KST;
  for (var i = 0; i < 9; i++) {
    var t = today7 - i * DAY;
    if (t <= now && RESET_DAYS.indexOf(new Date(t + KST).getUTCDay()) >= 0) return t;
  }
  return today7;
}
function periodId_(t) {
  var k = new Date(t + KST);
  return String(k.getUTCFullYear() * 10000 + (k.getUTCMonth() + 1) * 100 + k.getUTCDate());
}
/** 지금 회차와, 막 끝난 직전 회차(초기화 직후 늦게 도착한 기록용)만 받는다 */
function acceptablePeriods_(now) {
  var cur = periodStart_(now);
  var prev = periodStart_(cur - 1000);
  var ok = [periodId_(cur)];
  if (now - cur < 6 * 3600e3) ok.push(periodId_(prev));   // 초기화 후 6시간까지
  return ok;
}

// ─── 시트 ───────────────────────────────────────────────────────────────
var SHEET = 'scores';
var HEAD = ['period', 'pid', 'name', 'pct', 'time', 'end', 'at'];

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  if (sh.getLastRow() === 0) sh.appendRow(HEAD);
  return sh;
}

function rowsOf_(sh, period) {
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, HEAD.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (String(v[0]) !== String(period)) continue;
    out.push({ row: i + 2, period: String(v[0]), pid: String(v[1]), name: String(v[2]), pct: Number(v[3]), time: Number(v[4]), end: String(v[5]), at: Number(v[6]) });
  }
  return out;
}

function board_(rows, pid, limit) {
  rows.sort(RankLib.compare);
  var top = [], me = null;
  for (var i = 0; i < rows.length; i++) {
    var r = { rank: i + 1, name: rows[i].name, pct: rows[i].pct, time: rows[i].time, end: rows[i].end, me: rows[i].pid === pid };
    if (i < limit) top.push(r);
    if (r.me) me = r;
  }
  return { top: top, me: me, count: rows.length };
}

// ─── 요청 ───────────────────────────────────────────────────────────────
function handleTop_(p, now) {
  var period = String(p.period || periodId_(periodStart_(now)));
  if (!/^\d{8}$/.test(period)) return { ok: false, error: 'bad period' };
  var limit = Math.min(100, Math.max(1, Number(p.limit) || 50));
  var res = board_(rowsOf_(sheet_(), period), String(p.pid || ''), limit);
  res.ok = true; res.period = period;
  return res;
}

function handleSubmit_(b, now) {
  if (!b || typeof b !== 'object') return { ok: false, error: 'bad body' };
  var period = String(b.period || '');
  if (acceptablePeriods_(now).indexOf(period) < 0) return { ok: false, error: 'period closed' };
  var pid = String(b.pid || '');
  if (!/^[a-z0-9]{12,40}$/.test(pid)) return { ok: false, error: 'bad pid' };
  var pct = Math.floor(Number(b.pct) * 10) / 10, time = Math.round(Number(b.time));
  var end = String(b.end || '');
  if (!(pct >= 0 && pct <= 100)) return { ok: false, error: 'bad pct' };
  if (!(time >= 1 && time <= 7 * 86400)) return { ok: false, error: 'bad time' };
  if (['dead', 'clear', 'giveup'].indexOf(end) < 0) return { ok: false, error: 'bad end' };
  if ((pct >= 100) !== (end === 'clear')) return { ok: false, error: 'bad end' };
  if (time < (pct - 5) * 0.6) return { ok: false, error: 'too fast' };   // 사람이 낼 수 없는 속도
  var name = RankLib.cleanName(b.name);
  var rec = { pid: pid, name: name, pct: pct, time: time, end: end, at: now };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sh = sheet_();
    var rows = rowsOf_(sh, period);
    var mine = null;
    for (var i = 0; i < rows.length; i++) if (rows[i].pid === pid) { mine = rows[i]; break; }
    var updated = false;
    if (!mine) {
      sh.appendRow([period, pid, name, pct, time, end, now]);
      rows.push({ row: sh.getLastRow(), period: period, pid: pid, name: name, pct: pct, time: time, end: end, at: now });
      updated = true;
    } else if (RankLib.isBetter(rec, mine)) {
      sh.getRange(mine.row, 1, 1, HEAD.length).setValues([[period, pid, name, pct, time, end, now]]);
      mine.name = name; mine.pct = pct; mine.time = time; mine.end = end; mine.at = now;
      updated = true;
    } else if (RankLib.isSame(rec, mine) && mine.name !== name) {
      sh.getRange(mine.row, 3).setValue(name);   // 같은 점수면 이름만 바꾼다
      mine.name = name;
    }
    var res = board_(rows, pid, Math.min(100, Number(b.limit) || 50));
    res.ok = true; res.updated = updated; res.name = name; res.period = period;
    return res;
  } finally {
    lock.releaseLock();
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  try {
    if (p.action === 'top') return json_(handleTop_(p, Date.now()));
    return json_({ ok: true, app: 'sh-minesweeper-rank', period: periodId_(periodStart_(Date.now())) });
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

function doPost(e) {
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return json_(handleSubmit_(body, Date.now()));
  } catch (err) { return json_({ ok: false, error: String(err) }); }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { doGet: doGet, doPost: doPost, handleTop_: handleTop_, handleSubmit_: handleSubmit_, periodId_: periodId_, periodStart_: periodStart_ };
}
