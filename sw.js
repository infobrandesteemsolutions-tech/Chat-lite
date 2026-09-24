const CACHE_NAME = 'chatlite-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './chatlist.html',
    './chatroom.html',
    './register.html',
    './supabase.js',
    './image1-bg.jpg',
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,700&display=swap',
    'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvXDXbtM.woff2'
];

// 1. Install Event: Cache all core app assets and external CDNs safely
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[Service Worker] Caching app shell & dependencies');
            return Promise.allSettled(
                ASSETS_TO_CACHE.map(path => cache.add(path).catch(err => console.warn('Failed to cache:', path, err)))
            );
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

// 3. Fetch Event: Serve from cache when offline, fallback to network and update cache
self.addEventListener('fetch', (event) => {
    // Allow Supabase API calls and other cross-origin requests to pass through normally when online,
    // but handle static assets and CDN styles via cache fallback.
    const url = new URL(event.request.url);
    
    // Skip non-GET requests (like Supabase POST/PUT/DELETE database writes)
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached version immediately, but fetch a fresh one in the background if online
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
            return fetch(event.request).then((networkResponse) => {
                // Cache dynamically fetched static assets on the fly
                if (networkResponse && networkResponse.status === 200 && (url.origin === self.location.origin || url.hostname.includes('tailwindcss') || url.hostname.includes('jsdelivr') || url.hostname.includes('googleapis') || url.hostname.includes('gstatic'))) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // If it's a page navigation request and offline, fallback to index.html
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
