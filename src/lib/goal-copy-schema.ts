/**
 * zod schema for the goal "Import with AI" reply (the race brief JSON).
 */
import {
	activityLabel,
	activityTypeSchema,
	normalizeActivityType,
	type ActivityType
} from '$lib/activity';
import { formatHorizonLabel, normalizeGoalUrl, shiftPlanStartWithRaceDate } from '$lib/goals';
import { mondayIso } from '$lib/plan';
import { z } from 'zod';

export const GOAL_EXTRA_TOKEN = '<<<GOAL_EXTRA>>>';

export function injectGoalExtra(template: string, extra: string): string {
	return template.split(GOAL_EXTRA_TOKEN).join(extra.trim() || '(nothing extra.)');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_HORIZON = /^\d{4}-\d{2}$/;
const RUN_ALIASES = /^(run|running|jog|jogging|trailrun|trailrunning|roadrun|roadrunning)$/;

function isBlank(v: unknown): boolean {
	return v == null || (typeof v === 'string' && !v.trim());
}

function isCalendarDate(s: string): boolean {
	const [y, m, d] = s.split('-').map(Number);
	const dt = new Date(Date.UTC(y!, m! - 1, d!));
	return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === s;
}

/** "" / null mean "leave as is"; an invalid value is dropped instead of failing the reply. */
function optionalField<T extends z.ZodType>(schema: T) {
	return z.preprocess((v) => (isBlank(v) ? undefined : v), schema.optional()).catch(undefined);
}

const textField = z.string().trim().min(1);

const isoDateField = z
	.string()
	.transform((s) => s.trim().slice(0, 10))
	.pipe(z.string().regex(ISO_DATE).refine(isCalendarDate));

const horizonField = z
	.string()
	.transform((s) => s.trim().slice(0, 7))
	.pipe(z.string().regex(ISO_HORIZON));

const distanceField = z
	.union([z.number(), z.string().transform((s) => Number(s.trim().replace(',', '.')))])
	.pipe(z.number().finite().positive());

const sportField = z
	.string()
	.refine((s) => {
		const raw = s
			.trim()
			.toLowerCase()
			.replace(/[\s_-]/g, '');
		return normalizeActivityType(raw) !== 'run' || RUN_ALIASES.test(raw);
	})
	.transform((s): ActivityType => normalizeActivityType(s))
	.pipe(activityTypeSchema);

const urlField = z.string().transform(normalizeGoalUrl).pipe(z.string().min(1));

const primaryField = z
	.union([
		z
			.array(z.unknown())
			.transform((items) => items.map((p) => (typeof p === 'string' ? p : String(p ?? '')))),
		z.string().transform((s) => s.split(/\n|;/))
	])
	.transform((lines) => lines.map((p) => p.replace(/^\s*-\s*/, '').trim()).filter(Boolean))
	.pipe(z.array(z.string()).min(1));

const replySchema = z.preprocess(
	(v) => {
		if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
		const o = v as Record<string, unknown>;
		return {
			...o,
			date: isBlank(o.date) ? o.race_date : o.date,
			distance_km: isBlank(o.distance_km) ? o.race_distance_km : o.distance_km
		};
	},
	z.object(
		{
			name: optionalField(textField),
			date: optionalField(isoDateField),
			horizon: optionalField(horizonField),
			distance_km: optionalField(distanceField),
			sport: optionalField(sportField),
			time_goal: optionalField(textField),
			plan_start: optionalField(isoDateField),
			url: optionalField(urlField),
			itinerary_url: optionalField(urlField),
			primary: optionalField(primaryField),
			notes: optionalField(textField)
		},
		{ error: 'Need a JSON object with goal fields (name, date, primary, notes, …).' }
	)
);

export type GoalCopyImport = z.infer<typeof replySchema>;

/** Form fields the import can fill (strings, as in the goal form). */
export type GoalCopyDraft = {
	name: string;
	date: string;
	horizon: string;
	distance_km: string;
	sport: ActivityType;
	time_goal: string;
	plan_start: string;
	url: string;
	itinerary_url: string;
	primary: string;
	notes: string;
};

export type GoalCopyPatch = Partial<GoalCopyDraft>;

export type GoalCopyField = keyof GoalCopyDraft;

export type GoalCopyChange = {
	key: GoalCopyField;
	label: string;
	preview: string;
	lines?: string[];
	multiline?: boolean;
	was?: string;
	hint?: string;
	patch: GoalCopyPatch;
};

export function parseGoalCopyReply(input: unknown): GoalCopyImport {
	const parsed = replySchema.safeParse(input);
	if (!parsed.success) {
		throw new Error(parsed.error.issues[0]?.message ?? 'Could not read that reply.');
	}
	const out = Object.fromEntries(
		Object.entries(parsed.data).filter(([, v]) => v !== undefined)
	) as GoalCopyImport;
	if (!Object.keys(out).length) throw new Error('That JSON had no goal fields to apply.');
	return out;
}

function parseJsonText(text: string): unknown {
	const t = text.trim();
	if (!t) throw new Error('Nothing to check — paste the JSON from the reply.');
	const attempts = [
		t,
		t.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1],
		t.slice(Math.max(0, t.search(/[[{]/)))
	];
	for (const body of attempts) {
		if (!body?.trim()) continue;
		try {
			return JSON.parse(body.trim()) as unknown;
		} catch {
			// try the next shape
		}
	}
	throw new Error('That is not valid JSON — paste the JSON block from the reply.');
}

export function parseGoalCopyReplyText(text: string): GoalCopyImport {
	const json = parseJsonText(text);
	return parseGoalCopyReply(Array.isArray(json) ? json[0] : json);
}

function lines(text: string): string[] {
	return text
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean);
}

/** One change per field that differs from the current form; respects race vs look-ahead. */
export function planGoalCopyImport(
	reply: GoalCopyImport,
	current: GoalCopyDraft,
	kind: 'race' | 'intention'
): GoalCopyChange[] {
	const out: GoalCopyChange[] = [];
	const text = (key: 'name' | 'time_goal' | 'url' | 'itinerary_url', label: string) => {
		const next = reply[key];
		if (next === undefined || next === current[key].trim()) return;
		out.push({ key, label, preview: next, was: current[key].trim(), patch: { [key]: next } });
	};

	text('name', kind === 'race' ? 'Race name' : 'Name');
	if (kind === 'race') {
		if (reply.date !== undefined && reply.date !== current.date) {
			const shifted = shiftPlanStartWithRaceDate(current.plan_start, current.date, reply.date);
			out.push({
				key: 'date',
				label: 'Race date',
				preview: reply.date,
				was: current.date,
				hint:
					reply.plan_start === undefined && shifted !== current.plan_start
						? `Plan start moves to ${shifted} to keep the block length.`
						: undefined,
				patch: { date: reply.date, horizon: reply.date.slice(0, 7) }
			});
		}
	} else {
		const horizon = reply.date?.slice(0, 7) ?? reply.horizon;
		if (horizon !== undefined && horizon !== current.horizon) {
			out.push({
				key: 'horizon',
				label: 'Month',
				preview: formatHorizonLabel(horizon),
				was: current.horizon ? formatHorizonLabel(current.horizon) : '',
				patch: { horizon }
			});
		}
	}
	if (reply.distance_km !== undefined && reply.distance_km !== Number(current.distance_km)) {
		out.push({
			key: 'distance_km',
			label: 'Distance',
			preview: `${reply.distance_km} km`,
			was: current.distance_km.trim() ? `${current.distance_km} km` : '',
			patch: { distance_km: String(reply.distance_km) }
		});
	}
	if (reply.sport !== undefined && reply.sport !== current.sport) {
		out.push({
			key: 'sport',
			label: 'Sport',
			preview: activityLabel(reply.sport),
			was: activityLabel(current.sport),
			patch: { sport: reply.sport }
		});
	}
	text('time_goal', 'Time goal');
	if (kind === 'race' && reply.plan_start !== undefined) {
		const start = mondayIso(reply.plan_start);
		if (start !== current.plan_start) {
			out.push({
				key: 'plan_start',
				label: 'Plan starts',
				preview: start,
				was: current.plan_start,
				patch: { plan_start: start }
			});
		}
	}
	text('url', 'Race URL');
	text('itinerary_url', 'Itinerary URL');
	if (
		reply.primary !== undefined &&
		reply.primary.join('\n') !== lines(current.primary).join('\n')
	) {
		out.push({
			key: 'primary',
			label: 'Priorities',
			preview: reply.primary.join('\n'),
			lines: reply.primary,
			patch: { primary: reply.primary.join('\n') }
		});
	}
	if (reply.notes !== undefined && reply.notes !== current.notes.trim()) {
		out.push({
			key: 'notes',
			label: 'Notes',
			preview: reply.notes,
			multiline: true,
			patch: { notes: reply.notes }
		});
	}
	if (!out.length)
		throw new Error('Nothing new in that reply — it matches what is already in the form.');
	return out;
}
