/* Minimal worker so Chromium treats the app as installable.
   Navigations always hit the network — this app is SSR'd and should not go stale. */
self.addEventListener('install', (event) => {
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
	event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
	if (event.request.mode !== 'navigate') return;
	event.respondWith(fetch(event.request));
});
