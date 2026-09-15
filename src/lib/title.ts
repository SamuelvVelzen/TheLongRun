/** Browser tab: `Dashboard | The Long Run` (local adds `| Dev`). */
export function appTitle(...parts: Array<string | null | undefined>): string {
	const bits = parts.map((part) => String(part ?? '').trim()).filter(Boolean);
	bits.push('The Long Run');
	if (import.meta.env.DEV) bits.push('Dev');
	return bits.join(' | ');
}

export function appHead(...parts: Array<string | null | undefined>) {
	return { meta: [{ title: appTitle(...parts) }] };
}
