const CACHE_NAME = 'cryptodesk-v1';
const ASSETS = [
  './',
  './index.html',
  './admin.html',
  './css/app.css',
  './css/admin.css',
  './js/db.js',
  './js/settings.js',
  './js/alerts.js',
  './js/notifications.js',
  './js/rss.js',
  './js/app.js',
  './js/admin.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS).catch(err => {
        console.warn('Some assets failed to cache during install:', err);
      });
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
});

self.addEventListener('fetch', event => {
  // Bypass caching for external API / RSS requests to ensure fresh content
  if (event.request.url.includes('allorigins') || event.request.url.includes('rss') || event.request.url.includes('feed')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      return cachedResponse || fetch(event.request);
    })
  );
});
