import type { RunRecord } from '$lib/types';

export function isImportNote(n: string): boolean {
	return /^imported from/i.test(n.trim());
}

export function byDateNewestFirst(a: RunRecord, b: RunRecord) {
	if (a.date !== b.date) return a.date > b.date ? -1 : 1;
	return (a.slug ?? '') > (b.slug ?? '') ? -1 : (a.slug ?? '') < (b.slug ?? '') ? 1 : 0;
}
