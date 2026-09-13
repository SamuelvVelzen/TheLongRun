/** GPS course + device compass for map location wedges. */

export function normalizeHeading(deg: unknown): number | null {
	const n = Number(deg);
	if (!Number.isFinite(n) || n < 0) return null;
	return ((n % 360) + 360) % 360;
}

/** Direction of travel from a geolocation fix — best while running. */
export function headingFromCoords(coords: GeolocationCoordinates): number | null {
	const h = normalizeHeading(coords.heading);
	if (h == null) return null;
	const speed = coords.speed;
	if (speed != null && Number.isFinite(speed) && speed >= 0.3) return h;
	if (speed == null || !Number.isFinite(speed)) return h;
	return null;
}

let lastHeading: number | null = null;
let lastGpsCourse: number | null = null;
let lastGpsAt = 0;
let retainCount = 0;
let compassHandler: ((e: DeviceOrientationEvent) => void) | null = null;
const listeners = new Set<(heading: number | null) => void>();

const GPS_COURSE_HOLD_MS = 2500;

function emit(heading: number | null) {
	if (lastHeading === heading) return;
	lastHeading = heading;
	for (const fn of listeners) fn(heading);
}

export function getLastHeading(): number | null {
	return lastHeading;
}

export function subscribeHeading(fn: (heading: number | null) => void): () => void {
	listeners.add(fn);
	fn(lastHeading);
	return () => listeners.delete(fn);
}

/** Feed each watchPosition / getCurrentPosition fix. GPS course wins over compass. */
export function noteGpsHeading(coords: GeolocationCoordinates): number | null {
	const h = headingFromCoords(coords);
	if (h != null) {
		lastGpsCourse = h;
		lastGpsAt = Date.now();
		emit(h);
		return h;
	}
	if (lastGpsCourse != null && Date.now() - lastGpsAt < GPS_COURSE_HOLD_MS) {
		emit(lastGpsCourse);
		return lastGpsCourse;
	}
	return lastHeading;
}

function compassFromEvent(e: DeviceOrientationEvent): number | null {
	const ios = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
	if (Number.isFinite(ios.webkitCompassHeading)) {
		return normalizeHeading(ios.webkitCompassHeading);
	}
	if (e.absolute && Number.isFinite(e.alpha)) {
		return normalizeHeading(360 - (e.alpha ?? 0));
	}
	return null;
}

function gpsCourseFresh(): boolean {
	return lastGpsCourse != null && Date.now() - lastGpsAt < GPS_COURSE_HOLD_MS;
}

function startCompass() {
	if (compassHandler) return;
	compassHandler = (e: DeviceOrientationEvent) => {
		if (gpsCourseFresh()) return;
		const h = compassFromEvent(e);
		if (h != null) emit(h);
	};
	window.addEventListener('deviceorientationabsolute', compassHandler, true);
	window.addEventListener('deviceorientation', compassHandler, true);
}

function stopCompass() {
	if (!compassHandler) return;
	window.removeEventListener('deviceorientationabsolute', compassHandler, true);
	window.removeEventListener('deviceorientation', compassHandler, true);
	compassHandler = null;
}

async function ensureCompassPermission(): Promise<void> {
	const DO = DeviceOrientationEvent as typeof DeviceOrientationEvent & {
		requestPermission?: () => Promise<'granted' | 'denied'>;
	};
	if (typeof DO.requestPermission !== 'function') {
		startCompass();
		return;
	}
	try {
		const state = await DO.requestPermission();
		if (state === 'granted') startCompass();
	} catch {
		/* user declined or unsupported */
	}
}

/** Keep compass listener alive while maps or live share need heading. */
export function retainHeadingTrack(): () => void {
	retainCount += 1;
	if (retainCount === 1) void ensureCompassPermission();
	return () => {
		retainCount = Math.max(0, retainCount - 1);
		if (retainCount === 0) {
			stopCompass();
			lastGpsCourse = null;
			lastGpsAt = 0;
			emit(null);
		}
	};
}

export function applyMarkerHeading(el: HTMLElement | null | undefined, heading: number | null) {
	if (!el) return;
	const shell = el.querySelector('.loc-heading-shell') as HTMLElement | null;
	if (!shell) return;
	if (heading == null) {
		shell.hidden = true;
		return;
	}
	shell.hidden = false;
	shell.style.transform = `rotate(${heading}deg)`;
}
