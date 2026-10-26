// 공개판 만들기: 선물판 소스에서 설정만 바꿔 dist/ 에 만든다.
//   node tools/build-public.js
//   → dist/crazygames/        CrazyGames 업로드용 (진짜 광고 SDK)
//   → dist/crazygames.zip
//   → preview/                GitHub Pages 미리보기용 (가짜 광고, 같은 저장소에 올라감)
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const root = path.join(__dirname, '..');

// ✏️ 공개판 이름 (정해지면 여기만 바꾸면 된다)
const NAME = { ko: '지뢰 마라톤', en: 'Mine Marathon' };
// ✏️ 랭킹 서버 (Cloudflare Worker) 주소 — server-worker/README.md 대로 만든 뒤 넣는다. 비어 있으면 랭킹 화면이 안 보인다.
const PUBLIC_RANK_URL = 'https://mine-marathon-rank.suhogumsa.workers.dev/';

const FILES = ['index.html', 'app.js', 'engine.js', 'pictures.js', 'storage.js', 'ranklib.js', 'i18n.js', 'ads.js'];
const ICONS = ['icon-192.png', 'icon-512.png'];

function build(outDir, edition, extraHead) {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(outDir, 'icons'), { recursive: true });
  for (const f of FILES) fs.copyFileSync(path.join(root, f), path.join(outDir, f));
  for (const f of ICONS) fs.copyFileSync(path.join(root, 'icons', f), path.join(outDir, 'icons', f));
  fs.writeFileSync(path.join(outDir, 'config.js'),
    `/* 공개판 설정 — tools/build-public.js 가 만든 파일 (직접 고치지 마세요) */\n` +
    `window.RANK_URL = ${JSON.stringify(PUBLIC_RANK_URL)};\nwindow.EDITION = ${JSON.stringify(edition, null, 2)};\n`);
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${NAME.en}</title>`)
    .replace(/<link rel="manifest"[^>]*>\n?/, '')
    .replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '')
    .replace(/<meta name="apple-mobile-web-app[^>]*>\n?/g, '')
    .replace('<h1 id="appName">SH지뢰찾기</h1>', `<h1 id="appName">${NAME.ko}</h1>`)
    .replace('<script src="config.js"></script>', `${extraHead}<script src="config.js"></script>`);
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
}

const base = { id: 'public', name: NAME, storage: 'pub', gift: false, sw: false, ranking: true };
build(path.join(root, 'dist/crazygames'), { ...base, ads: 'crazygames' },
  '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>\n');
build(path.join(root, 'preview'), { ...base, ads: 'mock' }, '');

try {
  fs.rmSync(path.join(root, 'dist/crazygames.zip'), { force: true });
  execSync('zip -qr ../crazygames.zip .', { cwd: path.join(root, 'dist/crazygames') });
} catch (e) { console.log('zip skipped:', e.message); }
console.log('built dist/crazygames, dist/crazygames.zip, preview/');
