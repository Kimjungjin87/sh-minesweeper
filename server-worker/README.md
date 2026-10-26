# 지뢰 마라톤(Mine Marathon) 랭킹 서버 — Cloudflare Workers (무료, 약 10분)

공개판은 사람이 많이 들어올 수 있어서 구글 시트(하루 처리량이 작음) 대신 Cloudflare 를 쓴다.
무료 요금제: 하루 요청 **10만 번**, 데이터베이스(D1) 읽기 하루 **500만 행**. 카드 등록 없이 쓸 수 있다.

## 1. 가입
https://dash.cloudflare.com/sign-up — 이메일로 가입 (무료)

## 2. 데이터베이스 만들기
1. 왼쪽 메뉴 **Storage & databases → D1 SQL database → Create database**
2. 이름 `mine-marathon-rank` → **Create**
   (표는 서버가 처음 요청을 받을 때 저절로 만든다. SQL 을 칠 필요 없음)

## 3. 서버(Worker) 만들기
1. 왼쪽 메뉴 **Compute (Workers) → Workers & Pages → Create → Create Worker** (“Hello World” 템플릿)
2. 이름 `mine-marathon-rank` → **Deploy**
3. **Edit code** → 왼쪽 `worker.js` 내용을 **전부 지우고**, 이 저장소의
   [`server-worker/worker.js`](https://raw.githubusercontent.com/Kimjungjin87/sh-minesweeper/main/server-worker/worker.js) 전체를 붙여 넣기 → **Deploy**

## 4. 데이터베이스 연결
1. 방금 만든 Worker 화면 → **Settings → Bindings → Add → D1 database**
2. Variable name: **`DB`** (대문자 그대로) · D1 database: `mine-marathon-rank` → **Save / Deploy**

## 5. 확인
Worker 주소(`https://mine-marathon-rank.<내아이디>.workers.dev`)를 열었을 때
```
{"ok":true,"app":"mine-marathon-rank","period":"…"}
```
가 보이면 끝. 이 주소를 Claude 에게 알려 주면 `tools/build-public.js` 의 `PUBLIC_RANK_URL` 에 넣고 다시 빌드한다.
`{"ok":false,"error":"DB binding missing"}` 이 나오면 4번(이름 `DB`)을 다시 확인.

## 운영
- 기록 보기·지우기: D1 → `mine-marathon-rank` → **Console** 에서
  `SELECT * FROM scores ORDER BY at DESC LIMIT 50;` · `DELETE FROM scores WHERE pid = '…';`
- 막는 것: 지난 회차(초기화 후 6시간까지만 받음), 100%가 아닌 '완성', 말이 안 되게 빠른 기록, 이상한 값, 3초 안에 연속 제출, 큰 요청
- 앱 코드가 공개돼 있어 마음먹은 조작을 완전히 막지는 못한다. 이상한 기록은 Console 에서 지우면 된다.
- 나중에 CrazyGames 가 이 게임을 랭킹 초대 대상으로 고르면, CrazyGames 자체 랭킹(주 1회 초기화·국가별·친구별)으로 옮기는 것도 검토할 만하다.
