/* 영어 지원 (공개판). 선물판에서는 아무 일도 하지 않는다.
 *
 * 화면 코드를 고치지 않고, 화면에 나타나는 한국어 글자를 그 자리에서 바꾼다.
 *  - EXACT: 글자 한 덩어리가 통째로 같은 것
 *  - RULES: 숫자 같은 바뀌는 값이 들어간 것 (정규식)
 * 새 문구를 추가했는데 영어로 안 바뀌면 여기에 한 줄 넣으면 된다.
 * (tests/i18n.test.js 가 영어 화면에 한글이 남았는지 찾아 준다)
 */
(function (root) {
  'use strict';
  const ED = root.EDITION || {};
  const enabled = !!ED.id && ED.id !== 'gift';
  const LS = 'mines-lang';

  const EXACT = {
    // 홈
    '광고 없이, 끝없이': 'Endless, relaxing minesweeper', '끝없이 펼쳐지는 지뢰찾기': 'Minesweeper that never ends', '하드코어 지뢰찾기 · 지뢰 한 번이면 끝': 'Hardcore minesweeper · one mine and you\'re out',
    '보석': 'Gems', '완성 구역': 'Sectors', '돋보기': 'Lens', '전체 실수': 'Mistakes',
    '하드코어 랭킹': 'Hardcore ranking', '마라톤 랭킹': 'Marathon ranking', '그림 도감': 'Picture album', '보드 테마': 'Board themes',
    '하는 법': 'How to play',
    '새 지도': 'New map', '이어 하기': 'Continue', '진행 중': 'In progress', '도전 끝': 'Run over', '🏆 완성!': '🏆 Complete!',
    '이번 회차 기록 없음': 'No record this round',
    // 보드 이름
    '들판 산책': 'Meadow Walk', '오솔길': 'Forest Trail', '깊은 숲': 'Deep Woods', '심연': 'The Abyss',
    '오늘의 보드': 'Daily Board', '타임 어택': 'Time Attack', '하드코어': 'Hardcore', '마라톤': 'Marathon', '🏆 마라톤 랭킹': '🏆 Marathon ranking',
    '지뢰가 드문 편안한 보드': 'Relaxed board with few mines',
    '원작과 비슷한 기본 난이도': 'Classic difficulty',
    '생각을 조금 더 해야 하는 보드': 'Takes a bit more thinking',
    '지뢰가 빽빽한 도전 보드': 'Packed with mines',
    '매일 자정에 새 지도가 열려요': 'A new map every midnight',
    '3분 시작 · 구역을 완성하면 +20초': '3 min start · +20s per sector',
    '되돌리기·아이템 없음 · 지뢰 한 번이면 끝': 'No undo, no items · one mine and it\'s over',
    // 테마
    '민트': 'Mint', '벚꽃': 'Cherry Blossom', '밤하늘': 'Night Sky', '라벤더': 'Lavender', '클래식': 'Classic',
    '사용 중': 'In use', '보유 중 · 눌러서 쓰기': 'Owned · tap to use',
    // 그림
    '스마일': 'Smiley', '하트': 'Heart', '별': 'Star', '고양이': 'Cat', '토끼': 'Rabbit', '꽃': 'Flower', '나무': 'Tree',
    '집': 'House', '버섯': 'Mushroom', '물고기': 'Fish', '달': 'Moon', '유령': 'Ghost', '왕관': 'Crown', '음표': 'Music note',
    '우산': 'Umbrella', '네잎클로버': 'Four-leaf clover', '강아지': 'Puppy', '딸기': 'Strawberry', '해바라기': 'Sunflower',
    '판다': 'Panda', '케이크': 'Cake', '여우': 'Fox', '무지개': 'Rainbow', '병아리': 'Chick', '복숭아': 'Peach', '펭귄': 'Penguin',
    '컵케이크': 'Cupcake', '고래': 'Whale', '유니콘': 'Unicorn', '수박': 'Watermelon', '햄스터': 'Hamster', '나비': 'Butterfly',
    '코알라': 'Koala', '체리': 'Cherry', '거북이': 'Turtle', '선물': 'Gift',
    // 게임
    '되돌리기': 'Undo', '메뉴': 'Menu', '파기 모드': 'Dig mode', '깃발 모드': 'Flag mode',
    '길게 누르면 깃발': 'Hold to flag', '길게 누르면 파기': 'Hold to dig', '오른쪽 클릭: 깃발': 'Right-click: flag',
    '아무 칸이나 눌러서 시작하세요': 'Tap any tile to start', '첫 칸 주변에는 지뢰가 없어요': 'No mines around your first tap',
    '🔍 들여다볼 곳을 누르세요': '🔍 Tap where to look',
    '누른 칸 둘레 3×3의 지뢰가 5초간 보여요 · 돋보기를 다시 누르면 취소': 'Mines in the 3×3 around it show for 5s · tap Lens again to cancel',
    '✓ 저장됨': '✓ Saved', '⚠️ 저장 실패': '⚠️ Save failed',
    '🎉 구역 클리어!': '🎉 Sector clear!',
    '💥': '💥', '앗, 지뢰를 밟았어요': 'Oops, you hit a mine', '지뢰를 밟기 전으로 돌아갈까요?': 'Go back to before the mine?',
    '↶ 되돌리기': '↶ Undo', '🚩 깃발 꽂고 그대로 계속': '🚩 Flag it and keep going', '취소': 'Cancel', '닫기': 'Close',
    '📺 광고 보고 되돌리기': '📺 Watch an ad to undo',
    '🔍 돋보기가 없어요': '🔍 You\'re out of lenses',
    '구역을 완성하면 1개씩 받아요. 지금 바로 쓰고 싶다면:': 'You get one per completed sector. To use one now:',
    '📺 광고 보고 돋보기 +1': '📺 Watch an ad for +1 lens',
    '↶ 되돌렸어요': '↶ Undone', '🎁 광고 보상: 되돌렸어요': '🎁 Reward: undone', '🎁 돋보기 +1': '🎁 +1 lens',
    '광고 차단이 켜져 있어 광고를 볼 수 없어요': 'Ads are blocked, so the reward ad can\'t play',
    '잠시 후에 다시 볼 수 있어요': 'Available again in a moment',
    '지금은 볼 수 있는 광고가 없어요. 잠시 후 다시 해 보세요': 'No ad available right now. Please try again later',
    '먼저 첫 칸을 열어 주세요': 'Open your first tile first',
    '🧩 구역을 완성하면 🔍 돋보기를 얻어요': '🧩 Complete a sector to earn a 🔍 lens',
    '🔍 이미 다 열린 곳이에요': '🔍 Already all open here', '🔍 이 근처엔 지뢰가 없어요': '🔍 No mines around here',
    '시간 종료!': 'Time\'s up!', '다시 도전': 'Try again', '나가기': 'Exit',
    '이어하기는 한 판에 한 번만 쓸 수 있어요': 'You can continue once per run',
    // 메뉴·설정
    '시작 지점으로': 'Back to start', '크게 보기': 'Zoom in', '작게 보기': 'Zoom out', '설정 · 백업': 'Settings · Backup',
    '새 지도로 다시 시작': 'Restart with a new map',
    '이 보드의 진행·보석 기록·실수 횟수가 새 지도로 바뀌어요.\n(모은 보석 지갑은 그대로예요)': 'This board\'s progress, gems and mistakes reset with a new map.\n(Your gem wallet stays.)', '처음부터 다시 할까요?': 'Start over?', '새 지도로 시작': 'New map',
    '설정': 'Settings', '개인정보 처리방침': 'Privacy policy', '소리': 'Sound', '진동': 'Vibration', '무음 모드에서도 소리': 'Sound in silent mode',
    '켜면 아이폰 무음 스위치와 상관없이 소리가 나요 (보던 영상 소리는 잠시 멈출 수 있어요)': 'Plays sound even with the iPhone silent switch on (may pause other audio)',
    '백업 파일 내보내기': 'Export backup', '앱을 지우거나 폰을 바꿀 때 이 파일로 이어 할 수 있어요': 'Use it to continue on another device',
    '백업 파일 불러오기': 'Import backup', '지금 기록을 백업 내용으로 바꿔요': 'Replaces your current progress',
    '저장 방식: 한 수마다 자동 저장 (기기 안 두 군데에 같이 보관)': 'Saving: every move, automatically',
    '아직 없음': 'not yet',
    '백업을 불러올까요?': 'Import this backup?', '불러오기': 'Import', '확인': 'OK',
    '파일을 읽지 못했어요': 'Couldn\'t read the file', '백업 파일(.json)이 맞는지 확인해 주세요.': 'Please choose a backup (.json) file.',
    '불러오지 못했어요': 'Import failed', '이 게임의 백업 파일이 아니에요': 'This isn\'t a backup from this game', '백업 파일이 손상됐어요': 'The backup file is damaged',
    '지금 기록을 백업 내용으로 바꿔요': 'Replaces your current progress',
    // 하드코어
    '보드 전체 보기': 'View whole board', '여기서 끝내기': 'End run here', '여기서 끝낼까요?': 'End the run here?',
    '이 판은 더 이어 할 수 없어요.': 'This run can\'t be continued.', '계속 하기': 'Keep playing',
    '되돌리기·돋보기 없음 · 지뢰를 밟으면 그 자리에서 끝나요.': 'No undo or lens · one mine ends the run.',
    '이번 기록': 'This run:', '이번 회차 그림은': 'This round\'s picture was', '였어요!': '!',
    '완성!': 'Complete!', '도전 종료': 'Run ended', '지뢰를 밟았어요': 'You hit a mine',
    '완성도': 'Completion', '걸린 시간': 'Time',
    '✨ 이번 회차 내 최고 기록이에요!': '✨ Your best this round!', '🔁 새로 도전': '🔁 New attempt',
    '더 좋은 기록일 때만 랭킹이 바뀌어요.': 'Only better results replace it.',
    // 랭킹
    '랭킹에 쓸 이름 (한글 8자)': 'Your name for the ranking', '🏆 랭킹에 올리기': '🏆 Submit to ranking',
    '랭킹에는 이 이름과 기록만 저장돼요': 'Only this name and your result are stored',
    '이름을 적어 주세요': 'Please enter a name', '한글 8자(영문 16자)까지 쓸 수 있어요': 'Up to 16 letters',
    '올리는 중…': 'Submitting…', '🏆 다시 올려 보기': '🏆 Try again',
    '랭킹 서버가 아직 연결 전이에요. 기록은 이 기기에 남아 있어요.': 'Ranking server not connected. Your result is kept on this device.',
    '인터넷이 안 돼요. 연결되면 자동으로 올라가요.': 'You\'re offline. It will be submitted when you reconnect.',
    '🏆 랭킹 보기': '🏆 View ranking', '랭킹 보기': 'View ranking', '🏆 하드코어 랭킹': '🏆 Hardcore ranking',
    '끝난 회차': 'Finished round', '불러오는 중…': 'Loading…', '내 최고:': 'My best:', '이번 회차 내 기록 없음': 'No result this round',
    '없음': 'none', '이름 바꾸기': 'Change name', '인터넷 연결을 확인해 주세요': 'Please check your connection',
    '순위를 불러오지 못했어요': 'Couldn\'t load the ranking', '아직 아무도 기록이 없어요.': 'No results yet.', '첫 번째가 되어 보세요!': 'Be the first!',
    '랭킹 서버가 아직 연결 전이에요.': 'Ranking server not connected.', '(설정을 마치면 여기에 순위가 나와요)': '(Rankings appear here once it\'s set up)',
    '랭킹 이름': 'Ranking name', '한글 8자까지': 'Up to 16 letters', '저장': 'Save',
    '여기서 끝내고 기록 내기': 'End run & submit',
    '완성도(%)가 높을수록, 같으면 시간이 짧을수록 높은 순위예요.': 'Higher completion ranks first; ties go to the faster time.',
    // 그림 도감
    '구역을 처음 완성할 때마다 그 자리에 그림이 나타나요. 드문 그림도 숨어 있어요.': 'Each newly completed sector reveals a picture. Some are rare!',
    // 테마
    // 하는 법
    '• 탭: 칸 파기 · 길게 누르기: 깃발': '• Tap: dig · Hold: flag',
    '• 아래 큰 버튼으로 파기 ↔ 깃발 모드를 바꿀 수 있어요': '• Switch dig ↔ flag with the big button',
    '• 숫자 칸을 누르면, 깃발 수가 맞을 때 주변이 한 번에 열려요': '• Tap a number with matching flags to open around it',
    '• 8×8 구역의 안전한 칸을 다 열면 구역 완성 🧩': '• Open every safe tile in an 8×8 sector to complete it 🧩',
    '• 💎 보석과 드문 💖 하트(보석 5개)를 모아 테마를 열어요': '• Collect 💎 gems and rare 💖 hearts (5 gems) to unlock themes',
    '• 구역을 다 풀면 그 자리에 🖼 픽셀 그림이 나타나요 (그림 도감에 모여요)': '• Completed sectors turn into 🖼 pixel pictures (see the album)',
    '• 구역을 완성할 때마다 🔍 돋보기 1개! 누른 칸 둘레 3×3의 지뢰를 5초간 비춰 봐요': '• Each sector gives a 🔍 lens: reveals mines in a 3×3 for 5s',
    '• 지뢰를 밟으면 실수로 세고, 광고 없이 되돌릴 수 있어요': '• Hitting a mine counts as a mistake — you can undo it',
    '• 지뢰를 밟으면 실수로 세고, 하루 3번은 무료로 되돌릴 수 있어요': '• Hitting a mine counts as a mistake — 3 free undos every day',
    '• 한 수마다 자동 저장돼요. 언제 꺼도 그 자리에서 이어져요': '• Saved after every move — pick up right where you left off',
    '• 🔥 하드코어: 되돌리기·돋보기 없이 96×96 보드에 도전! 화·목·토 아침 7시(한국 시간)에 새 그림으로 바뀌고 랭킹에 올라가요': '• 🔥 Hardcore: a 96×96 board with no undo or lens. New picture and ranking every Tue/Thu/Sat (7:00 KST)',
    '• 🔥 하드코어: 되돌리기·돋보기 없이 96×96 보드에 도전! 화·목·토 아침 7시에 새 그림으로 바뀌고 랭킹에 올라가요': '• 🔥 Hardcore: a 96×96 board with no undo or lens — a new picture every Tue/Thu/Sat',
  };

  const W = '일월화수목금토', WE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = (k) => WE[W.indexOf(k)];
  const RULES = [
    [/^보드 테마 · 지금: (.+)$/, (m) => `Board themes · Now: ${t(m[1])}`],
    [/^보드 테마 · 💎 (\d+)개 보유$/, (m) => `Board themes · 💎 ${m[1]}`],
    [/^💎 (\d+)개가 더 필요해요$/, (m) => `Need 💎 ${m[1]} more`],
    [/^지뢰 (\d+)%$/, (m) => `${m[1]}% mines`],
    [/^🏆 최고 (\d+)구역$/, (m) => `🏆 Best ${m[1]} sectors`],
    [/^🏆 내 최고 ([\d.]+)% · (.+)$/, (m) => `🏆 My best ${m[1]}% · ${m[2]}`],
    [/^🔄 ([일월화수목금토]) 07:00 \((.+) 남음\)$/, (m) => `🔄 Resets ${day(m[1])} 7:00 (${dur(m[2])} left)`],
    [/^다음 초기화: ([일월화수목금토]) 07:00 \((.+) 남음\)$/, (m) => `Next reset: ${day(m[1])} 7:00 (${dur(m[2])} left)`],
    [/^🖼 그림 도감 · (\d+)\/(\d+)$/, (m) => `🖼 Picture album · ${m[1]}/${m[2]}`],
    [/^🎉 구역 (\d+)개 클리어!$/, (m) => `🎉 ${m[1]} sectors clear!`],
    [/^✨새 그림 (.+)$/, (m) => `✨New picture: ${t(m[1])}`],
    [/^🖼 (.+)$/, (m) => (EXACT[m[1]] ? `🖼 ${t(m[1])}` : null)],
    [/^📊 완성도 ([\d.]+)% · ⏱ (.+)$/, (m) => `📊 ${m[1]}% complete · ⏱ ${m[2]}`],
    [/^⏱ \+(\d+)초$/, (m) => `⏱ +${m[1]}s`],
    [/^🔍 돋보기 \+(\d+)$/, (m) => `🔍 Lens +${m[1]}`],
    [/^(\d+) \/ (\d+) 구역$/, (m) => `${m[1]} / ${m[2]} sectors`],
    [/^지금까지 (\d+)구역 완성$/, (m) => `${m[1]} sectors completed so far`],
    [/^💖 하트 발견! \+(\d+)$/, (m) => `💖 Heart found! +${m[1]}`],
    [/^🔍 지뢰 (\d+)개가 보여요$/, (m) => `🔍 ${m[1]} mine${m[1] === '1' ? '' : 's'} spotted`],
    [/^이 보드의 (\d+)번째 실수예요\.$/, (m) => `Mistake #${m[1]} on this board.`],
    [/^\(오늘 무료 (\d+)번 남음\)$/, (m) => `(${m[1]} free today)`],
    [/^💎 (\d+)개로 되돌리기$/, (m) => `💎 Undo for ${m[1]} gems`],
    [/^💎 (\d+)개로 돋보기 \+1$/, (m) => `💎 +1 lens for ${m[1]} gems`],
    [/^\(보석 (\d+)개\)$/, (m) => `(you have ${m[1]})`],
    [/^무료 되돌리기는 매일 (\d+)번 다시 채워져요$/, (m) => `Free undos refill to ${m[1]} every day`],
    [/^📺 광고는 (\d+)분 뒤에 다시 볼 수 있어요$/, (m) => `📺 Next ad available in ${m[1]} min`],
    [/^📺 광고는 (\d+)초 뒤에 다시 볼 수 있어요$/, (m) => `📺 Next ad available in ${m[1]}s`],
    [/^📺 광고 보고 \+(\d+)초 이어하기$/, (m) => `📺 Watch an ad for +${m[1]}s`],
    [/^🎁 \+(\d+)초! 이어서 하세요$/, (m) => `🎁 +${m[1]}s! Keep going`],
    [/^이번 기록 $/, () => 'This run: '],
    [/^(\d+)구역$/, (m) => `${m[1]} sectors`],
    [/^\s*최고 기록 (\d+)구역 · 실수 (\d+)번$/, (m) => `\nBest ${m[1]} sectors · ${m[2]} mistakes`],
    [/^마지막 저장: (.+)$/, (m) => `Last saved: ${t(m[1])}`],
    [/^(.+) 에 만든 백업 · 보드 (\d+)개\s*지금 기기의 기록은 이 백업으로 바뀌어요\.$/, (m) => `Backup from ${m[1]} · ${m[2]} boards\nYour current progress will be replaced.`],
    [/^🔥 하드코어 · (.+) 회차$/, (m) => `🔥 Hardcore · round ${fixDay(m[1])}`],
    [/^🔥 마라톤 · (.+) 회차$/, (m) => `🔥 Marathon · round ${fixDay(m[1])}`],
    [/^지금 완성도 ([\d.]+)% · (.+) 로 기록돼요\.\s*이 판은 더 이어 할 수 없어요\.$/, (m) => `Recorded as ${m[1]}% · ${m[2]}.\nThis run can't be continued.`],
    [/^이번 회차 그림은 $/, () => 'This round\'s picture was '],
    [/^ 였어요!$/, () => '!'],
    [/^이번 회차 내 최고: ([\d.]+)% · (.+)\s*더 좋은 기록일 때만 랭킹이 바뀌어요\.$/, (m) => `Your best this round: ${m[1]}% · ${m[2]}`],
    [/^올리지 못했어요: (.+)$/, (m) => `Couldn't submit: ${m[1]}`],
    [/^이번 회차 내 기록 없음 · 이름:$/, () => 'No result this round · Name:'],
    [/^이번 회차 (.+)$/, (m) => `This round ${fixDay(m[1])}`],
    [/^지난 회차 (.+)$/, (m) => `Last round ${fixDay(m[1])}`],
    [/^다음 초기화 ([일월화수목금토]) 07:00 \((.+) 남음\)$/, (m) => `Next reset ${day(m[1])} 7:00 (${dur(m[2])} left)`],
    [/^모두 (\d+)명 도전$/, (m) => `${m[1]} player${m[1] === '1' ? '' : 's'}`],
    [/^·\s*(.+?)\s*·\s*이름:$/, (m) => `· ${m[1]} · Name:`],
    [/^(.+)\/(.+)\((.)\)$/, (m) => (W.includes(m[3]) ? `${m[1]}/${m[2]} (${day(m[3])})` : null)],
  ];
  function fixDay(s) { return s.replace(/\(([일월화수목금토])\)/, (x, d) => ` (${day(d)})`); }
  function dur(s) {
    return s.replace(/(\d+)일/g, '$1d').replace(/(\d+)시간/g, '$1h').replace(/(\d+)분/g, '$1m').replace(/ /g, ' ');
  }

  let lang = 'ko';
  function detect() {
    if (!enabled) return 'ko';
    const q = new URLSearchParams(location.search).get('lang');
    if (q === 'ko' || q === 'en') return q;
    try { const v = localStorage.getItem(LS); if (v === 'ko' || v === 'en') return v; } catch (e) {}
    return /^ko/i.test(navigator.language || '') ? 'ko' : 'en';
  }

  const HANGUL = /[ㄱ-ㆎ가-힣]/;
  function t(s) {
    if (lang !== 'en' || !s || !HANGUL.test(s)) return s;
    if (EXACT[s] !== undefined) return EXACT[s];
    const tr = s.trim();
    if (EXACT[tr] !== undefined) return s.replace(tr, EXACT[tr]);
    for (const [re, fn] of RULES) {
      const m = tr.match(re);
      if (m) { const out = fn(m); if (out != null) return s.replace(tr, out); }
    }
    return s;
  }

  const missing = new Set();
  function walk(node) {
    if (node.nodeType === 3) {
      const v = node.nodeValue;
      if (HANGUL.test(v)) {
        const n = t(v);
        if (n !== v) node.nodeValue = n; else missing.add(v.trim());
      }
      return;
    }
    if (node.nodeType !== 1 || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
    if (node.placeholder && HANGUL.test(node.placeholder)) node.placeholder = t(node.placeholder);
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
  }

  let obs = null;
  function start() {
    if (lang !== 'en' || obs) return;
    document.documentElement.lang = 'en';
    walk(document.body);
    obs = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === 'characterData') walk(m.target);
        else m.addedNodes.forEach(walk);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  lang = detect();
  if (enabled) {
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  }

  let chosen = false;
  try { chosen = !!localStorage.getItem(LS); } catch (e) {}
  root.I18N = {
    get lang() { return lang; },
    get chosen() { return chosen || new URLSearchParams(location.search).has('lang'); },
    t,
    set(l) {
      try { localStorage.setItem(LS, l); } catch (e) {}
      location.reload();
    },
    missing,
  };
})(window);
