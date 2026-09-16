/** GPS course + device compass for map location wedges. */

export function normalizeHeading(deg: unknown): number | null {
	const n = Number(deg);
	if (!Number.isFinite(n)) return null;
	return ((n % 360) + 360) % 360;
}

/** Touch phones/tablets — desktops have no compass and iOS would still prompt for motion. */
export function isPhoneDevice(): boolean {
	return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

/** Direction of travel from a geolocation fix — only while actually moving. */
export function headingFromCoords(coords: GeolocationCoordinates): number | null {
	const h = normalizeHeading(coords.heading);
	if (h == null) return null;
	const speed = coords.speed;
	if (speed != null && Number.isFinite(speed) && speed >= 0.3) return h;
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

/** Feed each watchPosition / getCurrentPosition fix. GPS course wins over compass while moving. */
export function noteGpsHeading(coords: GeolocationCoordinates): number | null {
	const h = headingFromCoords(coords);
	if (h != null) {
		lastGpsCourse = h;
		lastGpsAt = Date.now();
		emit(h);
		return h;
	}
	if (compassHandler) {
		lastGpsCourse = null;
		lastGpsAt = 0;
		return lastHeading;
	}
	if (lastGpsCourse != null && Date.now() - lastGpsAt < GPS_COURSE_HOLD_MS) {
		emit(lastGpsCourse);
		return lastGpsCourse;
	}
	return lastHeading;
}

function screenAngle(): number {
	const o = window.screen?.orientation?.angle;
	if (typeof o === 'number' && Number.isFinite(o)) return o;
	const legacy = (window as Window & { orientation?: number }).orientation;
	if (typeof legacy === 'number' && Number.isFinite(legacy)) return legacy;
	return 0;
}

function compassFromEvent(e: DeviceOrientationEvent): number | null {
	const ios = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
	if (typeof ios.webkitCompassHeading === 'number' && Number.isFinite(ios.webkitCompassHeading)) {
		return normalizeHeading(ios.webkitCompassHeading);
	}
	if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
		return normalizeHeading(360 - e.alpha + screenAngle());
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

type OrientationPermission = {
	requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** Must run in the same tap as My location so iOS can show the motion prompt. */
function requestCompassAccess() {
	if (compassHandler || !isPhoneDevice()) return;
	const DO = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & OrientationPermission) | undefined;
	const DM = window.DeviceMotionEvent as (typeof DeviceMotionEvent & OrientationPermission) | undefined;
	let asked = false;
	const onGrant = (state: string) => {
		if (state === 'granted') startCompass();
	};
	try {
		if (typeof DM?.requestPermission === 'function') {
			asked = true;
			void DM.requestPermission().then(onGrant).catch(() => {});
		}
		if (typeof DO?.requestPermission === 'function') {
			asked = true;
			void DO.requestPermission().then(onGrant).catch(() => {});
		}
	} catch {
		/* user declined or unsupported */
	}
	if (!asked) startCompass();
}

/** Compass only while a phone map is showing My location. */
export function retainHeadingTrack(): () => void {
	if (!isPhoneDevice()) return () => {};
	retainCount += 1;
	if (retainCount === 1) requestCompassAccess();
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
