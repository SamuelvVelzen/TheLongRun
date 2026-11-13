import type { ActivityHabits } from '$lib/activity-habits';
import type { BodyScore } from '$lib/body-scores';
import type { DebriefRaceHint } from '$lib/debrief-types';
import type { GearContext, GearKind, GearWear } from '$lib/gear';
import type { CombinedRunStats } from '$lib/group';
import type { WeekView } from '$lib/plan';

/** Client-safe summary of a run on the coach debrief surface (from `debriefRunSummary`). */
export type CoachDebriefRun = {
	id: number;
	slug: string;
	date: string;
	day: string;
	distance_km: number | null;
	start_time: string;
	avg_pace: string;
	hasFeel: boolean;
	activity_type: string;
	session: string;
	cadence: number | null;
	gear: string;
	effort: number | null;
	body_scores: BodyScore[];
	legs: number | null;
	energy: number | null;
	wanted_faster: boolean | null;
	surface: string;
	notes: string;
	before_notes: string;
	after_notes: string;
};

export type CoachDebriefUnit = {
	kind: 'single' | 'group';
	slug: string;
	groupId?: string;
	groupName?: string;
	run: CoachDebriefRun;
	members: CoachDebriefRun[];
	stats?: CombinedRunStats;
};

/** Runtime contract for `getDebriefPrompt` / coach route loader `debrief`. */
export type CoachDebriefData = {
	prompt: string;
	run: CoachDebriefRun | null;
	runs: CoachDebriefRun[];
	units: CoachDebriefUnit[];
	raceBySlug: Record<string, DebriefRaceHint | null>;
	gear: GearContext;
	gearWear: Record<GearKind, Record<string, GearWear>>;
	habits: ActivityHabits;
	weekView: WeekView | null;
	error: string | null;
};
