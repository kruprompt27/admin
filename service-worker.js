/**
 * ============================================================
 * Service Worker - ครูพร้อมสอน Admin PWA
 * Version: 1.0.0
 * ============================================================
 *
 * Strategy:
 * - App shell (HTML/CSS/JS): Cache-First
 * - API calls (Apps Script): Network-only (live data)
 * - Images/Icons: Cache-First
 * - Fonts: Cache-First with fallback
 */

const CACHE_VERSION = 'krupromsorn-v1.0.1';
const CACHE_NAME = `${CACHE_VERSION}-cache`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// ไฟล์ที่ต้อง cache ทันทีตอนติดตั้ง
const PRECACHE_URLS = [
  '/admin/',
  '/admin/index.html',
  '/admin/manifest.json',
  '/admin/icon-192.png',
  '/admin/icon-512.png'
];

// Install: ดาวน์โหลด app shell ไว้ใน cache
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version', CACHE_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Precaching app shell');
        return cache.addAll(PRECACHE_URLS);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.error('[SW] Precache failed:', err))
  );
});

// Activate: ลบ cache เวอร์ชันเก่า
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME && key !== RUNTIME_CACHE)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: จัดการ network requests
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ข้าม non-GET requests
  if (request.method !== 'GET') return;

  // ข้าม Google Apps Script URLs (ต้องการ live data)
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com')) {
    return; // ปล่อยให้ browser handle เอง
  }

  // Strategy: Cache-First สำหรับ static assets
  if (request.destination === 'image' ||
      request.destination === 'font' ||
      request.destination === 'style' ||
      request.destination === 'script' ||
      url.pathname.endsWith('.html') ||
      url.pathname.endsWith('.json')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Default: Network-first with cache fallback
  event.respondWith(networkFirst(request));
});

// Cache-First strategy
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
    console.warn('[SW] Cache-first fetch failed:', request.url);
    // ถ้าเป็น HTML → คืนหน้า index.html (offline fallback)
    if (request.destination === 'document') {
      return caches.match('/admin/index.html');
    }
    throw err;
  }
}

// Network-First strategy
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
    if (request.destination === 'document') {
      return caches.match('/admin/index.html');
    }
    throw err;
  }
}

// Message handler: รับคำสั่งจาก app (เช่น skipWaiting, clearCache)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys()
        .then(keys => Promise.all(keys.map(key => caches.delete(key))))
        .then(() => {
          event.ports[0]?.postMessage({ success: true });
        })
    );
  }
});
