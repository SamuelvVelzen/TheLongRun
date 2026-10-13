/**
 * zod schema for coach-notes AI import replies.
 */
import { compactCoachNotes, MAX_COACH_NOTES } from '$lib/body-notes';
import { z } from 'zod';

const textField = z
	.string()
	.max(MAX_COACH_NOTES, `coach notes must be under ${MAX_COACH_NOTES} characters`)
	.transform((s) => compactCoachNotes(s));

const replySchema = z.union([
	z.object({ text: textField }),
	z.object({ coach_notes: textField }),
	z.object({ notes: textField })
]);

export function parseCoachNotesReply(input: unknown): string {
	const parsed = replySchema.safeParse(input);
	if (!parsed.success) {
		throw new Error('Need JSON with a "text" or "coach_notes" field.');
	}
	const data = parsed.data;
	if ('text' in data) return data.text;
	if ('coach_notes' in data) return data.coach_notes;
	return data.notes;
}

export function parseCoachNotesReplyText(text: string): string {
	const t = text.trim();
	const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const body = fenced ?? t.slice(Math.max(0, t.search(/[{]/)));
	let json: unknown;
	try {
		json = JSON.parse(body.trim());
	} catch {
		const plain = compactCoachNotes(t);
		if (plain) return plain;
		throw new Error('That is not valid JSON — paste the JSON block from the reply.');
	}
	if (typeof json === 'string') return compactCoachNotes(json);
	return parseCoachNotesReply(json);
}
