/* 太鼓スコア記録：電波がなくても画面を開けるようにするためのファイル
   ・通信できるときは常に最新のファイルを取得し、端末に保存し直す（更新はすぐ反映される）
   ・通信できない／4秒以内に応答がないときは、保存しておいたファイルで表示する
   ・サーバー（Google Apps Script）への送信はここでは扱わない（同じサイト内のファイルだけが対象） */
const CACHE = 'taiko-score-v2.19';
const FILES = ['./', './index.html', './common.js', './dan.js', './dan-gauge.js', './dan-view.js', './style.css', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png',
  './fonts/dan-brush.woff2',
  // 段位の条件ゲージの画像
  ...['c-0', 'c-1', 'c-2', 'c-3', 'c-4', 'c-5', 'c-6', 'c-7', 'c-8', 'c-9', 'c-dot', 'c-ge', 'c-lt', 'c-minus', 'c-pct', 'c-plus', 'fail', 'l-bad', 'l-combo', 'l-good', 'l-hit', 'l-ok', 'l-roll', 'l-score', 'l-soul', 's-1', 's-2', 's-3', 'vc-0', 'vc-1', 'vc-2', 'vc-3', 'vc-4', 'vc-5', 'vc-6', 'vc-7', 'vc-8', 'vc-9', 'vc-dot', 'vc-minus', 'vc-plus', 'vd-0', 'vd-1', 'vd-2', 'vd-3', 'vd-4', 'vd-5', 'vd-6', 'vd-7', 'vd-8', 'vd-9', 'vd-dot', 'vd-minus', 'vd-plus', 'vg-0', 'vg-1', 'vg-2', 'vg-3', 'vg-4', 'vg-5', 'vg-6', 'vg-7', 'vg-8', 'vg-9', 'vg-dot', 'vg-minus', 'vg-plus', 'vw-0', 'vw-1', 'vw-2', 'vw-3', 'vw-4', 'vw-5', 'vw-6', 'vw-7', 'vw-8', 'vw-9', 'vw-dot', 'vw-minus', 'vw-plus'].map(n => `./img/gauge/${n}.webp`),
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
