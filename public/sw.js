/* Minimal worker so Chromium treats the app as installable.
   Navigations always hit the network — this app is SSR'd and should not go stale.
   BUILD_ID is replaced at build time so each deploy is a new worker. */
const BUILD_ID = '__SW_BUILD_ID__';

let replacing = false;

self.addEventListener('install', (event) => {
	replacing = Boolean(self.registration.active);
	event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			await self.clients.claim();
			if (!replacing) return;
			const windows = await self.clients.matchAll({
				type: 'window',
				includeUncontrolled: true
			});
			await Promise.all(
				windows.map((client) =>
					'navigate' in client ? client.navigate(client.url) : Promise.resolve()
				)
			);
		})()
	);
});

self.addEventListener('fetch', (event) => {
	if (event.request.mode !== 'navigate') return;
	event.respondWith(
		fetch(event.request, { cache: 'no-store' }).catch(
			() =>
				new Response('You are offline.', {
					status: 503,
					headers: { 'Content-Type': 'text/plain; charset=utf-8' }
				})
		)
	);
});

void BUILD_ID;
