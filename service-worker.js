/**
 * Service Worker - ครูพร้อมสอน Admin PWA (v1.4.0)
 * - App shell (HTML/ไอคอน/manifest): Cache-First
 * - การเรียก Apps Script: Network-only (ข้อมูลสดเสมอ)
 */
const CACHE_VERSION = 'krupromsorn-v1.4.0';   // v1.4.0: manifest เปลี่ยนเป็น network-first แก้ปัญหา start_url ค้างแคช
const CACHE_NAME = `${CACHE_VERSION}-cache`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Precache failed:', err))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
            .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') return;

  // Apps Script ต้องเป็นข้อมูลสดเสมอ — ไม่แตะ cache
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) {
    return;
  }

  // หน้า HTML ใช้ network-first เสมอ → อัปเดตเวอร์ชันใหม่แล้วเห็นทันที (ออฟไลน์ค่อยใช้ cache)
  if (request.mode === 'navigate' ||
      request.destination === 'document' ||
      url.pathname.endsWith('.html')) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (request.destination === 'image' ||
      request.destination === 'font' ||
      request.destination === 'style' ||
      request.destination === 'script') {
    event.respondWith(cacheFirst(request));
    return;
  }
  // .json (โดยเฉพาะ manifest.json) ใช้ network-first — กัน start_url เก่าค้างแคชตอนติดตั้งแอป
  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    if (request.destination === 'document') return caches.match('./index.html');
    throw err;
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.destination === 'document') return caches.match('./index.html');
    throw err;
  }
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.map(key => caches.delete(key))))
        .then(() => { event.ports[0] && event.ports[0].postMessage({ success: true }); })
    );
  }
});
