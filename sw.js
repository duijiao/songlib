/* 诗歌库 Service Worker
 * 作用：1) 没信号也能打开页面（缓存页面本身和 CDN 库）
 *      2) 谱图优先读「离线歌谱包」里已缓存的图片（缓存由页面里的「离线与备份」下载）
 * 注意：不会拦截 Supabase 的接口请求，数据永远走网络；离线时页面自己读本机缓存。
 */
const VER = 'v6';   // 改了页面文件就把它加一，旧缓存会在 activate 时清掉
const SHELL = 'songlib-shell-' + VER;     // 页面本身（index.html / styles.css / app.js …）
const LIBS = 'songlib-libs-v1';           // CDN 上的库 / 图标字体（版本已锁定，缓存后不再变）
const SCORES = 'songlib-scores-v1';       // 离线歌谱包的图片（由页面写入，这里只读；升级时不能删）
const CDN_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com'];

const TABLER_CSS = 'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.34.0/dist/tabler-icons.min.css';
const PRE_LIBS = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/qrcode@1.4.4/build/qrcode.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.2.0/crypto-js.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',   // 导出 PDF 用，提前存好，离线也能导出
];
const INDEX_KEY = new URL('index.html', self.registration.scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await Promise.allSettled(['./', 'index.html', 'styles.css', 'app.js', 'offline.js', 'export-pdf.js', 'suggest.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'].map(u => shell.add(new Request(u, { cache: 'reload' }))));
    // index.html 也按固定地址存一份，离线时不管从哪个链接进来都能打开
    try { const r = await fetch(INDEX_KEY, { cache: 'reload' }); if (r.ok) await shell.put(INDEX_KEY, r); } catch (_) {}

    const libs = await caches.open(LIBS);
    await Promise.allSettled(PRE_LIBS.map(async (u) => { const r = await fetch(u, { mode: 'no-cors' }); await libs.put(u, r); }));
    // 图标字体：先拿 CSS 文本，找出里面的 woff2 一起缓存，离线时图标才不会变成方块
    try {
      const r = await fetch(TABLER_CSS, { mode: 'cors' });
      if (r.ok) {
        const text = await r.clone().text();
        await libs.put(TABLER_CSS, r);
        const urls = [...text.matchAll(/url\(\s*["']?([^"')]+\.woff2[^"')]*)["']?\s*\)/g)].map(m => new URL(m[1], TABLER_CSS).href);
        await Promise.allSettled([...new Set(urls)].map(async (u) => { const f = await fetch(u, { mode: 'cors' }); if (f.ok) await libs.put(u, f); }));
      }
    } catch (_) {}
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, LIBS, SCORES]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('songlib-shell-') && !keep.has(n)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, err => { clearTimeout(t); reject(err); });
  });
}

// 页面 / 同源静态文件：有网先拿最新的（信号差时 4 秒后改用缓存），拿不到就用缓存
async function networkFirst(req, isNav) {
  const cache = await caches.open(SHELL);
  try {
    const res = await withTimeout(fetch(req), 4000);
    if (res && res.ok) {
      cache.put(isNav ? INDEX_KEY : req, res.clone());
    }
    return res;
  } catch (err) {
    const hit = isNav
      ? (await cache.match(INDEX_KEY)) || (await cache.match(req, { ignoreSearch: true }))
      : (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    throw err;
  }
}

// CDN 库：缓存优先（版本号已锁定，内容不会变）
async function cacheFirstLib(req) {
  const cache = await caches.open(LIBS);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}

// 谱图：离线歌谱包里有就直接用；没有就走网络（不会自动缓存，只有「下载」过的才会存）
async function scoreImage(req) {
  const cache = await caches.open(SCORES);
  const hit = (await cache.match(req)) || (await cache.match(req, { ignoreSearch: true }));
  if (hit) return hit;
  return fetch(req);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;

  if (req.mode === 'navigate' && url.origin === self.location.origin) { e.respondWith(networkFirst(req, true)); return; }
  if (req.destination === 'image' && url.origin === self.location.origin) { e.respondWith(networkFirst(req, false)); return; }   // 本站图标
  if (req.destination === 'image') { e.respondWith(scoreImage(req)); return; }
  if (CDN_HOSTS.includes(url.hostname)) { e.respondWith(cacheFirstLib(req)); return; }
  if (url.origin === self.location.origin && /\.(?:css|js|json|svg|png|ico|webmanifest)$/i.test(url.pathname)) { e.respondWith(networkFirst(req, false)); return; }
  // 其他（Supabase 接口、音频、YouTube 等）一律不拦截
});
