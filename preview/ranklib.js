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

if (typeof module !== 'undefined' && module.exports) module.exports = RankLib;
