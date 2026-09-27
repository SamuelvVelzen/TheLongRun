/** Keep the screen on while sharing live location (Safari iOS 16.4+ in standalone; needs visible document). */

let held: WakeLockSentinel | null = null;

async function releaseWakeLock() {
	try {
		await held?.release();
	} catch {
		/* already released */
	}
	held = null;
}

export async function setScreenWakeLock(on: boolean): Promise<void> {
	if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
	if (!on) {
		await releaseWakeLock();
		return;
	}
	if (document.visibilityState !== 'visible') return;
	try {
		await releaseWakeLock();
		held = await navigator.wakeLock.request('screen');
		held.addEventListener('release', () => {
			held = null;
		});
	} catch {
		/* denied, low power, or unsupported context */
	}
}
