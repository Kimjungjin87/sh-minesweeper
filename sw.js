/* 오프라인에서도 열리게 하는 서비스워커.
 *
 * 업데이트가 쉽도록 "인터넷이 되면 늘 새 파일, 안 되면 기기에 담아 둔 파일"로 동작한다.
 * → GitHub 에 고친 파일을 올리기만 하면 다음에 앱을 열 때 자동으로 새 버전이 된다.
 *   (게임 기록은 IndexedDB·localStorage 에 따로 있어서 업데이트와 무관하게 남는다)
 */
const CACHE = 'sh-mines';
const FILES = ['./', './index.html', './engine.js', './pictures.js', './storage.js', './app.js', './manifest.webmanifest',
  './icons/apple-touch-icon.png', './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png'];
const NET_TIMEOUT = 3500;   // 이 시간 안에 안 오면 담아 둔 것으로 연다

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => Promise.all(FILES.map((f) => fetch(f, { cache: 'no-cache' }).then((r) => r.ok && c.put(f, r)).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = () => cache.match(e.request, { ignoreSearch: true });
    try {
      const res = await Promise.race([
        fetch(e.request, { cache: 'no-cache' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), NET_TIMEOUT)),
      ]);
      if (res && res.ok) cache.put(e.request, res.clone());
      return res;
    } catch (err) {
      return (await cached()) || (e.request.mode === 'navigate' ? cache.match('./index.html') : Response.error());
    }
  })());
});
