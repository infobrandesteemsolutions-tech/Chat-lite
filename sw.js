const CACHE_NAME = 'chatlite-v1';
const ASSETS_TO_CACHE = [
    './index.html',
    './chatlist.html',
    './chatroom.html',
    './register.html',
    './supabase.js',
    './image1-bg.jpg',
    // Add any other image paths or CSS files you use here
];

// 1. Install Event: Cache all core app assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching app shell');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// 2. Activate Event: Clean up old caches if any
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(
                keyList.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('[Service Worker] Removing old cache', key);
                        return caches.delete(key);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// 3. Fetch Event: Serve from cache when offline, fallback to network
self.addEventListener('fetch', (event) => {
    // Skip cross-origin requests (like Tailwind CDN or Supabase API calls) from being aggressively asset-cached here,
    // so they don't break dynamic API calls.
    if (!event.request.url.startsWith(self.location.origin) && !event.request.url.includes('jsdelivr.net') && !event.request.url.includes('tailwindcss.com')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached version, but try to fetch a fresh one in the background if online
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse);
                        });
                    }
                }).catch(() => {/* Ignore network errors when offline */});
                
                return cachedResponse;
            }

            // If not in cache, try fetching from network
            return fetch(event.request).catch(() => {
                // If it's a navigation request and offline, fallback to index.html or chatlist.html shell
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
