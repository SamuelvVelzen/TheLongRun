/**
 * zod schema for goal priorities/notes AI import (subset of the full race brief reply).
 */
import { z } from 'zod';

const primaryField = z
	.union([
		z.array(z.string()),
		z.string().transform((s) =>
			s
				.split(/\n|;/)
				.map((line) => line.replace(/^\s*-\s*/, '').trim())
				.filter(Boolean)
		)
	])
	.transform((lines) => lines.map((p) => p.trim()).filter(Boolean));

const replySchema = z
	.object({
		primary: primaryField.optional(),
		notes: z.string().optional()
	})
	.refine((v) => v.primary !== undefined || v.notes !== undefined, {
		message: 'Need at least "primary" or "notes" in that JSON.'
	});

export type GoalCopyImport = {
	primary?: string[];
	notes?: string;
};

export type GoalCopyChange =
	| { key: 'primary'; lines: string[] }
	| { key: 'notes'; text: string };

export function parseGoalCopyReply(input: unknown): GoalCopyImport {
	const parsed = replySchema.safeParse(input);
	if (!parsed.success) {
		const msg = parsed.error.issues[0]?.message ?? 'Could not read that reply.';
		throw new Error(msg);
	}
	const out: GoalCopyImport = {};
	if (parsed.data.primary !== undefined) out.primary = parsed.data.primary;
	if (parsed.data.notes !== undefined) out.notes = parsed.data.notes.trim();
	return out;
}

export function parseGoalCopyReplyText(text: string): GoalCopyImport {
	const t = text.trim();
	const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const body = fenced ?? t.slice(Math.max(0, t.search(/[{]/)));
	let json: unknown;
	try {
		json = JSON.parse(body.trim());
	} catch {
		throw new Error('That is not valid JSON — paste the JSON block from the reply.');
	}
	const obj = (Array.isArray(json) ? json[0] : json) as unknown;
	return parseGoalCopyReply(obj);
}

export function planGoalCopyImport(patch: GoalCopyImport): GoalCopyChange[] {
	const out: GoalCopyChange[] = [];
	if (patch.primary?.length) out.push({ key: 'primary', lines: patch.primary });
	if (patch.notes !== undefined && patch.notes.trim()) out.push({ key: 'notes', text: patch.notes.trim() });
	if (!out.length) throw new Error('That JSON had no priorities or notes to apply.');
	return out;
}
