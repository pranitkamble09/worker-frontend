// sw.js - Service Worker for Offline Mode
const CACHE_NAME = 'worker-app-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    'https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&display=swap'
];

// Install Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Caching assets...');
                return cache.addAll(ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// Activate Service Worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});
// =========================================================
// FETCH: Assets + Offline Data Support
// =========================================================
self.addEventListener('fetch', event => {
    // Check if it's an API request (data)
    if (event.request.url.includes('/api/') || event.request.method === 'POST') {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    return response;
                })
                .catch(() => {
                    // Offline - store request in cache
                    return caches.open('offline-requests')
                        .then(cache => {
                            // Clone and store the request
                            const requestClone = event.request.clone();
                            cache.put(event.request, requestClone);
                            
                            // Return offline response
                            return new Response(JSON.stringify({
                                status: 'offline',
                                message: 'Saved offline. Will sync when online.',
                                timestamp: new Date().toISOString()
                            }), {
                                headers: { 'Content-Type': 'application/json' }
                            });
                        });
                })
        );
        return;
    }
    
    // Regular asset caching (existing code)
    event.respondWith(
        caches.match(event.request)
            .then(cached => {
                if (cached) return cached;
                return fetch(event.request)
                    .then(response => {
                        if (response && response.status === 200) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME)
                                .then(cache => cache.put(event.request, clone));
                        }
                        return response;
                    })
                    .catch(() => {
                        return new Response('You are offline. Please check your connection.', {
                            status: 503,
                            statusText: 'Service Unavailable'
                        });
                    });
            })
    );
});

// =========================================================
// BACKGROUND SYNC (Auto-send data when internet comes back)
// =========================================================
self.addEventListener('sync', function(event) {
    if (event.tag === 'sync-offline-data') {
        event.waitUntil(syncOfflineData());
    }
});

async function syncOfflineData() {
    const cache = await caches.open('offline-requests');
    const requests = await cache.keys();
    
    for (const request of requests) {
        try {
            const response = await fetch(request);
            if (response.ok) {
                await cache.delete(request);
                console.log('Synced offline request:', request.url);
            }
        } catch (e) {
            console.log('Sync failed, will retry later:', e);
        }
    }
}

// =========================================================
// MESSAGE HANDLER (Trigger sync from main app)
// =========================================================
self.addEventListener('message', function(event) {
    if (event.data === 'sync-data') {
        event.waitUntil(syncOfflineData());
    }
});