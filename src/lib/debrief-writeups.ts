const KEY = 'coach-debrief-writeups';

/** Draft debrief write-ups keyed by activity slug — survives refresh and revisits. */
export function readDebriefWriteups(): Record<string, string> {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(parsed)) {
			if (typeof v === 'string' && v) out[k] = v;
		}
		return out;
	} catch {
		return {};
	}
}

export function writeDebriefWriteups(next: Record<string, string>) {
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		/* ignore quota / private mode */
	}
}

export function clearDebriefWriteups(
	slugs: string[],
	prev: Record<string, string>
): Record<string, string> {
	if (!slugs.length) return prev;
	const next = { ...prev };
	for (const slug of slugs) delete next[slug];
	writeDebriefWriteups(next);
	return next;
}
