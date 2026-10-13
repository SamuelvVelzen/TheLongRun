/**
 * zod schemas for profile body-note AI import replies.
 */
import { z } from 'zod';
import {
	BODY_NOTE_STATUSES,
	MAX_BODY_AREA,
	MAX_BODY_TEXT,
	mergeBodySuggestions,
	type BodyNoteStatus,
	type BodyNotes,
	type BodySuggestion
} from '$lib/body-notes';

const STATUS_ALIASES: Record<string, BodyNoteStatus> = {
	active: 'active',
	new: 'active',
	worse: 'active',
	sore: 'active',
	monitoring: 'monitoring',
	monitor: 'monitoring',
	better: 'monitoring',
	settled: 'monitoring',
	resolved: 'resolved',
	gone: 'resolved',
	cleared: 'resolved',
	fine: 'resolved'
};

function aliasKey(v: unknown): string {
	return String(v ?? '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z]/g, '');
}

const areaField = z
	.string()
	.min(1, 'area is required')
	.max(MAX_BODY_AREA, 'area is too long')
	.transform((s) => s.trim().replace(/\s+/g, ' '));

const itemSchema = z.object({
	area: areaField,
	status: z
		.preprocess(
			(v) => STATUS_ALIASES[aliasKey(v)] ?? v,
			z.enum(BODY_NOTE_STATUSES as [BodyNoteStatus, ...BodyNoteStatus[]])
		)
		.optional()
		.default('monitoring'),
	trigger: z
		.string()
		.max(MAX_BODY_TEXT)
		.optional()
		.default('')
		.transform((s) => s.trim().replace(/\s+/g, ' ')),
	helps: z
		.string()
		.max(MAX_BODY_TEXT)
		.optional()
		.default('')
		.transform((s) => s.trim().replace(/\s+/g, ' '))
});

export type BodyNoteImportItem = z.infer<typeof itemSchema>;

function itemList(input: unknown): unknown[] | null {
	if (Array.isArray(input)) return input;
	if (!input || typeof input !== 'object') return null;
	const o = input as Record<string, unknown>;
	if (Array.isArray(o.body)) return o.body;
	if (Array.isArray(o.notes)) return o.notes;
	if (Array.isArray(o.items)) return o.items;
	if ('area' in o) return [o];
	return null;
}

function formatIssues(error: z.ZodError, list: unknown[], max = 8): string {
	const lines = error.issues.slice(0, max).map((issue) => {
		const path = [...issue.path];
		const idx = path[0];
		const where = typeof idx === 'number' ? `Note ${idx + 1}` : 'Body';
		if (typeof idx === 'number') path.shift();
		const field = path.map(String).join('.');
		return `- ${[where, field].filter(Boolean).join(' · ')}: ${issue.message}`;
	});
	const more = error.issues.length > max ? `\n- …and ${error.issues.length - max} more` : '';
	return `That body JSON has problems:\n${lines.join('\n')}${more}`;
}

export function parseBodyNotesReply(input: unknown): BodyNoteImportItem[] {
	const list = itemList(input);
	if (!list || !list.length) throw new Error('No body notes found in that JSON.');
	const parsed = z.array(itemSchema).safeParse(list);
	if (!parsed.success) throw new Error(formatIssues(parsed.error, list));
	return parsed.data;
}

export function parseBodyNotesReplyText(text: string): BodyNoteImportItem[] {
	const t = text.trim();
	const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const body = fenced ?? t.slice(Math.max(0, t.search(/[[{]/)));
	let json: unknown;
	try {
		json = JSON.parse(body.trim());
	} catch {
		throw new Error('That is not valid JSON — paste the JSON block from the reply.');
	}
	return parseBodyNotesReply(json);
}

/** Same merge rules as debrief body suggestions — ready for the confirm checklist. */
export function planBodyNotesImport(
	body: BodyNotes,
	items: BodyNoteImportItem[]
): BodySuggestion[] {
	return mergeBodySuggestions(body, items);
}
