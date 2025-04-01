/**
 * Sports Analytics Pro - Service Worker
 * Enables offline functionality and faster loading
 */

const CACHE_NAME = 'sports-analytics-v1';
const OFFLINE_URL = '/offline.html';

// Assets to cache for offline use
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/js/main.js',
  '/js/api-integration.js',
  '/offline.html',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// Install event - cache core assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Caching essential assets');
        return cache.addAll(CACHE_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - network first with cache fallback
self.addEventListener('fetch', event => {
  // Skip non-GET requests and browser extensions
  if (event.request.method !== 'GET' || event.request.url.startsWith('chrome-extension://')) {
    return;
  }
  
  // Skip third-party requests (except fonts and icons we specifically cache)
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCachedThirdParty = event.request.url.includes('fonts.googleapis.com') || 
                          event.request.url.includes('cdnjs.cloudflare.com') ||
                          event.request.url.includes('thesportsdb.com');
  
  if (!isSameOrigin && !isCachedThirdParty) {
    return;
  }

  // Stale-While-Revalidate for most assets
  event.respondWith(
    caches.open(CACHE_NAME).then(cache => {
      return cache.match(event.request).then(cachedResponse => {
        const fetchPromise = fetch(event.request)
          .then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          })
          .catch(error => {
            console.error('Fetch failed:', error);
            // Fall back to cached response if network fetch fails
            return cachedResponse;
          });
        
        return cachedResponse || fetchPromise;
      });
    })
  );
});
