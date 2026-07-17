/* sw.js - Service Worker for QuickPOS PWA
   Handles caching of app shell for offline use and offline-first strategy.
*/
const CACHE_NAME = 'quickpos-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './api.js',
  './receipt.js',
  './storage.js',
  './settings.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install: pre-cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first for app shell, network-first for Apps Script API calls
self.addEventListener('fetch', (event) => {
  const url = event.request.url;
  // Never cache Apps Script API requests - always try network, fall back to failure (handled by storage.js queue)
  if (url.includes('script.google.com')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ offline: true }), { headers: { 'Content-Type': 'application/json' } }))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
