/* 太鼓スコア記録：電波がなくても画面を開けるようにするためのファイル
   ・通信できるときは常に最新のファイルを取得し、端末に保存し直す（更新はすぐ反映される）
   ・通信できない／4秒以内に応答がないときは、保存しておいたファイルで表示する
   ・サーバー（Google Apps Script）への送信はここでは扱わない（同じサイト内のファイルだけが対象） */
const CACHE = 'taiko-score-v2.9';
const FILES = ['./', './index.html', './common.js', './dan.js', './dan-view.js', './style.css', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './fonts/dan-brush.woff2',
  ...['easy', 'normal', 'hard', 'oni', 'ura'].flatMap(c => [`./img/course-${c}.svg`, `./img/course-${c}-gray.svg`]),
  ...['none', 'clear', 'fc', 'ap'].map(k => `./img/crown-${k}.svg`)];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('taiko-score-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = fetch(req).then(res => { if (res && res.ok) cache.put(req, res.clone()); return res; });
    const timeout = new Promise(r => setTimeout(r, 4000));
    try {
      const res = await Promise.race([net, timeout]);
      if (res) return res;
    } catch (err) { /* オフライン */ }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return net; // 保存されていないファイルは通信の結果を待つ
  })());
});
