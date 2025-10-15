/* public/sw.js – Mylasa Offline SW (sağlam ve güvenli)
   - App shell önbelleği (index.html ve temel statikler)
   - JS/CSS/IMG için stale-while-revalidate
   - Navigations: network-first; offline'da cache'teki index.html
   - Google Maps / Firebase / 3rd-party ve HTTP(S) dışı şemalar BYPASS (özellikle chrome-extension:// hatasını önler)
*/

const CACHE_NAME = 'mylasa-cache-v1-' + (self.registration?.scope || 'root');
const CORE_ASSETS = [
  '/',                // app shell
  '/index.html',
  '/manifest.json',
  '/mylasa-192.png',
  '/mylasa-512.png',
  '/mylasa-fix.css?v=9',
  '/mylasa-layout.js?v=3',
  '/mylasa-fitwatch.js?v=2'
];

// Hangi istekler kesinlikle önbelleğe dahil edilmeyecek?
function shouldBypass(request) {
  try {
    const url = new URL(request.url);

    // Yalnızca http/https destekle — chrome-extension:// vb. şemalarda HİÇ dokunma
    if (!/^https?:$/.test(url.protocol)) return true;

    // Yalnızca GET önbelleğe alınır
    if (request.method !== 'GET') return true;

    // Farklı origin'leri tamamen BYPASS et (Maps, Firebase, 3rd party)
    if (url.origin !== self.location.origin) return true;

    // No-cors opaque istekleri es geç
    if (request.mode === 'no-cors') return true;

    return false;
  } catch {
    // URL parse edilemezse BYPASS et
    return true;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('mylasa-cache-v1-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Navigation isteklerinde: network-first; offline'da index.html
async function handleNavigate(event) {
  try {
    const preload = event.preloadResponse;
    if (preload) return preload;
  } catch {}
  try {
    const net = await fetch(event.request);
    const cache = await caches.open(CACHE_NAME);
    cache.put('/index.html', net.clone());
    return net;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match('/index.html');
    if (cached) return cached;
    return new Response('<h1>Offline</h1>', {
      headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      status: 200
    });
  }
}

// Statik dosyalar (js/css/img/font): stale-while-revalidate
async function handleStatic(event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(event.request);
  const netPromise = fetch(event.request)
    .then((resp) => {
      if (resp && resp.ok) cache.put(event.request, resp.clone());
      return resp;
    })
    .catch(() => undefined);
  return cached || netPromise || Response.error();
}

// Diğer GET istekleri: network-first, offline'da cache
async function handleGenericGet(event) {
  try {
    const net = await fetch(event.request);
    const cache = await caches.open(CACHE_NAME);
    if (net && net.ok) cache.put(event.request, net.clone());
    return net;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(event.request);
    if (cached) return cached;
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (shouldBypass(request)) return; // dışarıyı ve desteklenmeyenleri BYPASS

  const url = new URL(request.url);

  // SPA navigations (adres çubuğu/yenileme)
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(event));
    return;
  }

  // Aynı origin statik dosyalar (js, css, img, font)
  if (/\.(?:js|css|png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf)$/.test(url.pathname)) {
    event.respondWith(handleStatic(event));
    return;
  }

  // Geri kalan aynı-origin GET istekleri
  event.respondWith(handleGenericGet(event));
});

// Opsiyonel: navigation preload (Chrome)
self.addEventListener('activate', (event) => {
  if (self.registration.navigationPreload) {
    event.waitUntil(self.registration.navigationPreload.enable());
  }
});

// İsteğe bağlı güncelleme tetikleme (uygulama isterse)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
