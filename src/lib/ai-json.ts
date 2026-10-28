/** Loose AI reply text: raw JSON, a ```json fence, or prose before `{` / `[`. */
export function parseAiJsonText(text: string): unknown {
	const trimmed = text.trim();
	if (!trimmed) throw new Error('Paste the AI response first.');
	const tryParse = (s: string) => {
		try {
			return { ok: true as const, value: JSON.parse(s) as unknown };
		} catch {
			return { ok: false as const };
		}
	};
	const direct = tryParse(trimmed);
	if (direct.ok) return direct.value;
	const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
	if (fence) {
		const parsed = tryParse(fence[1]!.trim());
		if (parsed.ok) return parsed.value;
	}
	const start = trimmed.search(/[[{]/);
	if (start >= 0) {
		const parsed = tryParse(trimmed.slice(start));
		if (parsed.ok) return parsed.value;
	}
	throw new Error('That is not valid JSON — fix it or paste the block from the reply.');
}

export function formatAiJsonText(text: string): string {
	return `${JSON.stringify(parseAiJsonText(text), null, 2)}\n`;
}
