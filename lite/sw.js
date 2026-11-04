// FilamentBox Lite v2.0.3 — cache offline
const CACHE = 'filamentbox-lite-2.0.3';
const FILES = ["./","edition.js","icon-180.png","icon-192.png","icon-512.png","index.html","local-api.js","manifest.webmanifest","prismatica/index.html","vendor/bambu-colors.js","vendor/invoice-parser.js","vendor/pdfjs/pdf.min.js","vendor/pdfjs/pdf.worker.min.js","vendor/zxing-browser.min.js"];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((r) => r || fetch(e.request)));
});
