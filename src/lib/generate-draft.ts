const KEY = 'coach-generate-draft';

export type GenerateDraft = {
	mixNote: string;
	/** Null keeps the canned question for this week vs next week. */
	question: string | null;
	brief: string;
};

const EMPTY: GenerateDraft = { mixNote: '', question: null, brief: '' };

/** Draft week note, question, and prompt — survives tab changes and refresh. */
export function readGenerateDraft(): GenerateDraft {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...EMPTY };
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ...EMPTY };
		const o = parsed as { mixNote?: unknown; question?: unknown; brief?: unknown };
		return {
			mixNote: typeof o.mixNote === 'string' ? o.mixNote : '',
			question: typeof o.question === 'string' ? o.question : null,
			brief: typeof o.brief === 'string' ? o.brief : ''
		};
	} catch {
		return { ...EMPTY };
	}
}

export function writeGenerateDraft(next: GenerateDraft) {
	try {
		if (!next.mixNote && next.question == null && !next.brief) {
			localStorage.removeItem(KEY);
			return;
		}
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		/* ignore quota / private mode */
	}
}
