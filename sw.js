const CACHE_NAME = 'chatlite-v3';
const LOCAL_ASSETS = [
    './',
    './index.html',
    './chatlist.html',
    './chatroom.html',
    './register.html',
    './supabase.js',
    './image1-bg.jpg'
];

// 1. Install Event: Cache local core app assets safely
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching local app shell');
            return cache.addAll(LOCAL_ASSETS);
        })
    );
    self.skipWaiting();
});

// 2. Activate Event: Clean up old caches
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

// 3. Fetch Event: Serve from cache, and dynamically cache CDNs/images on the fly when online
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests (like Supabase database writes)
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // If we have it in cache, return it immediately
            if (cachedResponse) {
                // Fetch a fresh copy in the background to update the cache for next time
                fetch(event.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, networkResponse);
                        });
                    }
                }).catch(() => {});
                return cachedResponse;
            }

            // Otherwise, fetch from network and dynamically cache it (including Tailwind, fonts, and images)
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // If offline and it's a page navigation request, fallback to index.html shell
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
