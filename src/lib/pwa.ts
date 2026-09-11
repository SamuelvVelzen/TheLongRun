const BUILD_ID = import.meta.env.VITE_BUILD_ID ?? 'dev';
const CHECK_INTERVAL_MS = 30_000;

let started = false;
let lastCheck = 0;

function parseBuildId(source: string) {
	return source.match(/BUILD_ID = '([^']+)'/)?.[1] ?? null;
}

async function deployedBuildId() {
	const res = await fetch('/sw.js', { cache: 'no-store' });
	if (!res.ok) return null;
	return parseBuildId(await res.text());
}

function reloadOnce(remote: string) {
	try {
		const key = 'tlr-pwa-reload';
		if (sessionStorage.getItem(key) === remote) return;
		sessionStorage.setItem(key, remote);
	} catch {
		// Private mode can block storage; still try to pick up the new build.
	}
	location.reload();
}

async function reloadIfDeployed() {
	if (import.meta.env.DEV) return;
	const remote = await deployedBuildId();
	if (!remote || remote === BUILD_ID || remote === '__SW_BUILD_ID__') return;
	reloadOnce(remote);
}

function checkForUpdate(registration?: ServiceWorkerRegistration | null) {
	const now = Date.now();
	if (now - lastCheck < CHECK_INTERVAL_MS) return;
	lastCheck = now;
	void registration?.update();
	void reloadIfDeployed();
}

export function registerPwa() {
	if (started || typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
	started = true;

	void navigator.serviceWorker
		.register('/sw.js', { updateViaCache: 'none' })
		.then((registration) => {
			const onResume = () => checkForUpdate(registration);
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible') onResume();
			});
			window.addEventListener('pageshow', onResume);
			window.addEventListener('focus', onResume);
			onResume();
		});

	if (import.meta.env.DEV) return;

	let reloading = false;
	const hadController = Boolean(navigator.serviceWorker.controller);
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (!hadController || reloading) return;
		reloading = true;
		location.reload();
	});
}
