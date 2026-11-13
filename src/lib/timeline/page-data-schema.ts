import { emptyGear, type GearContext } from '$lib/gear';
import type { ActivityGroupInfo, RunWithMap } from '$lib/types';
import { z } from 'zod';

function isRecord(v: unknown): v is Record<string, unknown> {
	return v != null && typeof v === 'object';
}

function isGearContext(v: unknown): v is GearContext {
	return isRecord(v) && isRecord(v.shoes) && isRecord(v.walk_shoes) && isRecord(v.bike);
}

function isRunWithMap(v: unknown): v is RunWithMap {
	return (
		isRecord(v) &&
		typeof v.id === 'number' &&
		typeof v.slug === 'string' &&
		typeof v.date === 'string' &&
		typeof v.has_map === 'boolean'
	);
}

function isActivityGroup(v: unknown): v is ActivityGroupInfo {
	if (!isRecord(v)) return false;
	return (
		typeof v.id === 'string' &&
		typeof v.name === 'string' &&
		typeof v.created_on === 'string' &&
		Array.isArray(v.member_ids) &&
		Array.isArray(v.best_efforts)
	);
}

const runWithMapSchema = z.custom<RunWithMap>(isRunWithMap, { message: 'Invalid timeline run' });
const activityGroupSchema = z.custom<ActivityGroupInfo>(isActivityGroup, {
	message: 'Invalid activity group'
});
const gearContextSchema = z.custom<GearContext>(isGearContext, { message: 'Invalid gear context' });

/** Runtime contract for `getTimelineRuns` / timeline route loader `page`. */
export const timelinePageDataSchema = z.object({
	runs: z.array(runWithMapSchema),
	groups: z.array(activityGroupSchema),
	gear: gearContextSchema
});

export type TimelinePageData = z.infer<typeof timelinePageDataSchema>;

export function emptyTimelinePageData(): TimelinePageData {
	return timelinePageDataSchema.parse({
		runs: [],
		groups: [],
		gear: emptyGear()
	});
}

export function formatTimelinePageDataIssues(error: z.ZodError, max = 6): string {
	const lines = error.issues.slice(0, max).map((i) => {
		const path = i.path.length ? i.path.join('.') : '(root)';
		return `${path}: ${i.message}`;
	});
	const extra = error.issues.length > max ? ` (+${error.issues.length - max} more)` : '';
	return lines.join('; ') + extra;
}
