const CACHE_NAME = 'pharma-inventory-v2';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('SW: Pre-caching assets');
            const localAssets = ASSETS_TO_CACHE.filter(url => !url.startsWith('http'));
            const externalAssets = ASSETS_TO_CACHE.filter(url => url.startsWith('http'));

            const cacheLocal = cache.addAll(localAssets);

            // CDN en cache individuel (mode no-cors = opaque) sans bloquer l'install
            const cacheExternal = Promise.all(
                externalAssets.map(url =>
                    fetch(url, { mode: 'no-cors' })
                        .then(res => cache.put(url, res))
                        .catch(err => console.warn('SW: Cache CDN echoue:', url, err))
                )
            );

            return Promise.all([cacheLocal, cacheExternal]);
        }).then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames =>
            Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log('SW: Suppression ancien cache:', cache);
                        return caches.delete(cache);
                    }
                })
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;
    // Ne pas intercepter les appels vers Google Apps Script
    if (event.request.url.includes('script.google.com')) return;

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then(networkResponse => {
                // Mettre en cache les reponses valides ET les reponses opaque (CDN)
                if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                }
                return networkResponse;
            }).catch(() => {
                // Fallback hors ligne : renvoyer index.html pour la navigation
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
