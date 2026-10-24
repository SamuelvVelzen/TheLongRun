import { activityLabel, normalizeActivityType } from '$lib/activity';
import { formatUsualHabitsSection } from '$lib/activity-habits';
import { dateRangeFromSearch, filterRunsByRange } from '$lib/date-range';
import { formatFuelSection } from '$lib/fuel';
import {
	canPinRaceResult,
	formatHorizonLabel,
	isRaceGoal,
	normalizeGoalInput,
	normalizeGoalUrl,
	openIntentions,
	pickSoonestOpenGoal,
	pinCandidatesForGoal,
	resultFromActivity,
	type GoalInput,
	type MedalDetailsInput
} from '$lib/goals';
import { calendarFromGoal, daysUntil, isoDateLocal } from '$lib/plan';
import { BODY_SAFETY_RULE, formatBodyNotesSection, formatCoachNotesSection } from '$lib/body-notes';
import { buildPaceProfile, formatPaceSection } from '$lib/pace-profile';
import { feelScale, joinSections, section, tidyPrompt } from '$lib/prompt';
import type {
	ActivityAttachOption,
	ActivityGroupInfo,
	Goal,
	PlanAttachOption,
	PlannedRoute,
	PlannedRouteActivityLink,
	PlannedRoutePlanLink,
	PlanWeek,
	RouteTrack,
	RunRecord,
	RunWithMap,
	SessionRouteRef
} from '$lib/types';
import { loadProfile } from '../profile';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';
import {
	loadActivityHabits,
	loadFuelLog,
	loadGoalStore,
	loadPlan,
	loadTrainingContext,
	saveGoalStore,
	savePlan
} from '../context';
import { routeIdForRun } from '../route-analytics';
import { listRouteTracks } from '../routes';
import { getRun, listRuns } from '../runs';
import { byDateNewestFirst } from '../run-sort';
import { fuelRunRefs } from '../fuel-prompt';
import { allTimeSummarySection, briefTableRow, BRIEF_TABLE_HEAD } from '../coach-brief';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_HORIZON_RE = /^\d{4}-\d{2}$/;

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const getGoalBrief = createServerFn({ method: 'GET' })
	.validator((d: Partial<GoalBriefDraft> = {}) => ({
		name: typeof d?.name === 'string' ? d.name : '',
		date: typeof d?.date === 'string' ? d.date : '',
		horizon: typeof d?.horizon === 'string' ? d.horizon : '',
		distance_km: d?.distance_km,
		sport: typeof d?.sport === 'string' ? d.sport : 'run',
		time_goal: typeof d?.time_goal === 'string' ? d.time_goal : '',
		plan_start: typeof d?.plan_start === 'string' ? d.plan_start : '',
		url: typeof d?.url === 'string' ? d.url : '',
		itinerary_url: typeof d?.itinerary_url === 'string' ? d.itinerary_url : '',
		primary: d?.primary,
		notes: typeof d?.notes === 'string' ? d.notes : '',
		extra: typeof d?.extra === 'string' ? d.extra : ''
	}))
	.handler(async ({ data }) => {
		const range = dateRangeFromSearch({ range: '30d' });
		const [allRuns, training, profile, habits, fuelLog] = await Promise.all([
			listRuns(),
			loadTrainingContext(),
			loadProfile(),
			loadActivityHabits(),
			loadFuelLog()
		]);
		const { medals } = training;
		const windowRuns = filterRunsByRange(allRuns, range).sort(byDateNewestFirst);
		const todayIso = isoDateLocal(new Date());
		const sport = normalizeActivityType(data.sport || 'run');
		const distance = Number(data.distance_km);
		const distanceKm = Number.isFinite(distance) && distance > 0 ? distance : null;
		const primaryLines = Array.isArray(data.primary)
			? data.primary.map((p) => String(p).trim()).filter(Boolean)
			: String(data.primary ?? '')
					.split('\n')
					.map((s) => s.trim())
					.filter(Boolean);
		const booked = Boolean(data.date && ISO_DATE_RE.test(data.date));
		const horizon = ISO_HORIZON_RE.test(data.horizon.trim()) ? data.horizon.trim() : '';
		const daysToRace = booked ? Math.max(0, daysUntil(data.date) ?? 0) : null;
		const lastMedal = medals[0];
		const lastMedalLine = lastMedal
			? `- Last race: ${lastMedal.name} on ${lastMedal.date}${lastMedal.result?.time ? ` in ${lastMedal.result.time}` : ''}${lastMedal.result?.pace ? ` (${lastMedal.result.pace}/km)` : ''}`
			: '';
		const activityRows = windowRuns.map(briefTableRow).join('\n');
		const extra = data.extra.trim();
		const exampleJson = JSON.stringify(
			booked
				? {
						name: data.name.trim(),
						date: data.date || '',
						distance_km: distanceKm,
						sport,
						time_goal: data.time_goal.trim(),
						plan_start: data.plan_start || '',
						url: data.url.trim(),
						itinerary_url: data.itinerary_url.trim(),
						primary: primaryLines,
						notes: data.notes.trim()
					}
				: {
						name: data.name.trim(),
						horizon: horizon || '',
						distance_km: distanceKm,
						sport,
						time_goal: data.time_goal.trim(),
						url: data.url.trim(),
						itinerary_url: data.itinerary_url.trim(),
						primary: primaryLines,
						notes: data.notes.trim()
					}
		);
		const briefKind = booked ? 'race' : 'look-ahead';
		const field = (label: string, value: string) => (value ? `- ${label}: ${value}` : '');
		const identityLines = booked
			? [
					field('Name', data.name.trim()),
					field('Date', data.date),
					field('Distance', distanceKm != null ? `${distanceKm} km` : ''),
					field('Sport', activityLabel(sport)),
					field('Time goal', data.time_goal.trim()),
					field('Plan starts (Monday)', data.plan_start),
					daysToRace != null
						? `- Days to race: ${daysToRace}${daysToRace === 0 ? ' (race day or already past)' : ''}`
						: '',
					field('Race URL', data.url.trim()),
					field('Itinerary URL', data.itinerary_url.trim())
				]
			: [
					field('Name', data.name.trim()),
					field('Horizon', horizon ? formatHorizonLabel(horizon) : ''),
					field('Distance', distanceKm != null ? `${distanceKm} km` : ''),
					field('Sport', activityLabel(sport)),
					field('Time goal', data.time_goal.trim()),
					field('URL', data.url.trim()),
					field('Itinerary URL', data.itinerary_url.trim()),
					'This is **not a booked race**. Do not invent a race date, plan start, peak, or taper.'
				];
		const draftLines = [
			...identityLines,
			primaryLines.length
				? `- Current priorities:\n${primaryLines.map((p) => `  - ${p}`).join('\n')}`
				: '',
			field('Current notes', data.notes.trim())
		].filter(Boolean);
		const identity = `## ${booked ? 'Race' : 'Look-ahead'} (current draft — fields not listed are empty)\n${draftLines.join('\n')}`;
		const coaching = booked
			? 'You are helping me set this race in my training app. Propose **priorities** (how I should train toward it) and **notes** (course, logistics, race-day intent). Keep every identity field and any priorities/notes I already filled unless I asked to change them. Fill empty identity fields only from the race URL, itinerary URL, or my extra notes — do not guess.'
			: 'You are helping me set a **look-ahead**, not a booked race. Propose **priorities** (how I should train toward that month) and **notes**. Do not invent a race date. Do not peak or taper. Keep every identity field and any priorities/notes I already filled unless I asked to change them.';
		const replyNotes = booked
			? '`notes` is a few sentences on course / logistics / race-day intent.'
			: '`notes` is a few sentences on why this look-ahead matters. Leave `date` and `plan_start` empty.';
		const fuelSection = formatFuelSection(fuelLog, fuelRunRefs(allRuns, fuelLog));
		return tidyPrompt(
			joinSections(
				`# The Long Run — ${briefKind} brief`,
				`## Coaching brief\n${coaching}`,
				identity,
				[`Today is ${todayIso}.`, lastMedalLine].filter(Boolean).join('\n'),
				section('Extra from me', extra),
				allTimeSummarySection(allRuns),
				formatPaceSection(buildPaceProfile(allRuns, medals, todayIso)),
				activityRows
					? `## Recent training (${range.label.toLowerCase()}, newest first)\n${feelScale()} Use this to keep priorities honest (volume, body scores, what is already working).\n\n${BRIEF_TABLE_HEAD}\n${activityRows}`
					: '',
				formatBodyNotesSection(profile.body),
				formatCoachNotesSection(profile.coachNotes),
				formatUsualHabitsSection(habits),
				fuelSection
					? `${fuelSection}\nUse this fuel log for any race-day fueling advice in \`notes\` — repeat what worked, avoid what caused trouble.`
					: '',
				`## When you reply\nGive a short assessment in prose if you want. Then output **one JSON object** I can paste back, with exactly these keys. If a draft field is empty, leave it \`""\`, \`null\`, or \`[]\` unless a URL or my extra notes make it clear. Do not copy example placeholders. \`primary\` is an array of 3–6 short priorities (one line each). ${replyNotes} Keep any URL I gave. ${BODY_SAFETY_RULE}\n\n\`\`\`json\n${exampleJson}\n\`\`\``
			)
		);
	});

export const getGoalsData = createServerFn({ method: 'GET' }).handler(async () => {
	const [training, runs, tracks] = await Promise.all([
		loadTrainingContext(),
		listRuns(),
		listRouteTracks()
	]);
	const { activeGoal, medals, calendar, store } = training;
	const upcoming = store.goals
		.filter((g) => g.status !== 'done' && g.id !== activeGoal?.id && isRaceGoal(g))
		.sort((a, b) => a.date.localeCompare(b.date));
	const intentions = openIntentions(store.goals);
	const candidatesByGoalId: Record<string, ReturnType<typeof pinCandidatesForGoal>> = {};
	for (const g of store.goals) {
		if (g.status !== 'done' && !canPinRaceResult(g)) continue;
		if (!isRaceGoal(g)) continue;
		candidatesByGoalId[g.id] = pinCandidatesForGoal(g, runs);
	}
	const runBySlug = new Map(runs.map((r) => [r.slug, r]));
	/** Medal time/distance/pace follow the linked activity, not a stale pin snapshot. */
	const medalsLive = medals.map((g) => {
		const slug = g.result?.activity_slug;
		if (!slug) return g;
		const run = runBySlug.get(slug);
		if (!run) return g;
		return { ...g, result: resultFromActivity(run) };
	});
	const trackById = new Map(tracks.map((t) => [t.id, t.coords]));
	const medalTracks: Record<string, [number, number][]> = {};
	const medalActivities: Record<
		string,
		Pick<
			RunRecord,
			| 'slug'
			| 'date'
			| 'activity_type'
			| 'avg_hr'
			| 'max_hr'
			| 'elev_gain'
			| 'cadence'
			| 'calories'
			| 'gear'
			| 'weather'
			| 'surface'
			| 'place'
			| 'province'
			| 'country'
			| 'effort'
			| 'start_time'
			| 'elapsed_time'
		>
	> = {};
	for (const g of medalsLive) {
		const slug = g.result?.activity_slug;
		if (!slug) continue;
		const run = runBySlug.get(slug);
		if (!run) continue;
		medalActivities[g.id] = {
			slug: run.slug,
			date: run.date,
			activity_type: run.activity_type,
			avg_hr: run.avg_hr,
			max_hr: run.max_hr,
			elev_gain: run.elev_gain,
			cadence: run.cadence,
			calories: run.calories,
			gear: run.gear,
			weather: run.weather,
			surface: run.surface,
			place: run.place,
			province: run.province,
			country: run.country,
			effort: run.effort,
			start_time: run.start_time,
			elapsed_time: run.elapsed_time
		};
		const id = routeIdForRun(run);
		if (!id) continue;
		const coords = trackById.get(id);
		if (coords && coords.length >= 2) medalTracks[g.id] = coords;
	}
	return {
		activeGoal,
		upcoming,
		intentions,
		medals: medalsLive,
		calendar,
		candidatesByGoalId,
		medalTracks,
		medalActivities
	};
});

export const saveMedalDetails = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: MedalDetailsInput) => d)
	.handler(async ({ data }) => {
		const store = await loadGoalStore();
		const target = store.goals.find((g) => g.id === data.goalId);
		if (!target) throw new Error('That medal was not found.');
		if (target.status !== 'done') throw new Error('Only finished races can be updated here.');
		const next: Goal = {
			...target,
			bib_number: String(data.bib_number ?? target.bib_number ?? '').trim(),
			result_url: normalizeGoalUrl(data.result_url ?? target.result_url ?? ''),
			medal_notes: String(data.medal_notes ?? target.medal_notes ?? '').trim()
		};
		await saveGoalStore({
			goals: store.goals.map((g) => (g.id === next.id ? next : g))
		});
		return { id: next.id };
	});

export const saveActiveGoal = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: GoalInput) => d)
	.handler(async ({ data }) => {
		const name = data.name.trim();
		const date = data.date.trim();
		const horizon = String(data.horizon ?? '')
			.trim()
			.slice(0, 7);
		if (!name) throw new Error('Give it a name.');
		const booked = ISO_DATE_RE.test(date);
		if (!booked && !ISO_HORIZON_RE.test(horizon)) {
			throw new Error('Pick a race date or a look-ahead month.');
		}
		const store = await loadGoalStore();
		const existing = data.id ? (store.goals.find((g) => g.id === data.id) ?? null) : null;
		const next = normalizeGoalInput(data, existing);
		const isIntention = !isRaceGoal(next);
		if (!isIntention && next.date < next.plan_start) {
			throw new Error('Race day needs to be on or after the plan start.');
		}
		if (store.goals.some((g) => g.id === next.id && g.id !== existing?.id)) {
			throw new Error(
				isIntention
					? 'A look-ahead with that name and month is already saved.'
					: 'A race with that name and date is already on the calendar.'
			);
		}
		const beforeId = pickSoonestOpenGoal(store.goals)?.id ?? null;
		const others = store.goals.filter((g) => g.id !== next.id);
		const merged = [next, ...others];
		await saveGoalStore({ goals: merged });
		const active = pickSoonestOpenGoal(merged);
		if (beforeId !== (active?.id ?? null)) await savePlan([]);
		return {
			id: next.id,
			weekCount: calendarFromGoal(next).weekCount,
			isActive: active?.id === next.id,
			isIntention,
			activeName: active?.name ?? next.name
		};
	});

export const repinGoalResult = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { goalId: string; activitySlug: string }) => d)
	.handler(async ({ data }) => {
		const store = await loadGoalStore();
		const target = store.goals.find((g) => g.id === data.goalId);
		if (!target) throw new Error('That race was not found.');
		if (target.status !== 'done')
			throw new Error('Only finished races on the medal wall can be re-linked.');
		const run = await getRun(data.activitySlug);
		if (!run) throw new Error('That activity was not found.');
		const done: Goal = {
			...target,
			result: resultFromActivity(run)
		};
		await saveGoalStore({
			goals: store.goals.map((g) => (g.id === done.id ? done : g))
		});
		return { id: done.id };
	});

export const completeGoal = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { goalId: string; activitySlug: string }) => d)
	.handler(async ({ data }) => {
		const store = await loadGoalStore();
		const target = store.goals.find((g) => g.id === data.goalId);
		if (!target) throw new Error('That race was not found.');
		if (target.status === 'done') throw new Error('That race is already on the medal wall.');
		if (!canPinRaceResult(target)) throw new Error('Pin a result from race day onward.');
		const run = await getRun(data.activitySlug);
		if (!run) throw new Error('That activity was not found.');
		const activeId = pickSoonestOpenGoal(store.goals)?.id ?? null;
		const isActive = target.id === activeId;
		const rawPlan = isActive ? await loadPlan() : null;
		const done: Goal = {
			...target,
			status: 'done',
			result: resultFromActivity(run),
			plan: rawPlan
		};
		await saveGoalStore({
			goals: store.goals.map((g) => (g.id === done.id ? done : g))
		});
		if (isActive) await savePlan([]);
		return { id: done.id };
	});

export const clearGoal = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((id: string) => id)
	.handler(async ({ data: id }) => {
		const store = await loadGoalStore();
		const target = store.goals.find((g) => g.id === id);
		if (!target) return { ok: true as const };
		const wasActive = pickSoonestOpenGoal(store.goals)?.id === id;
		await saveGoalStore({ goals: store.goals.filter((g) => g.id !== id) });
		if (wasActive) await savePlan([]);
		return { ok: true as const };
	});

// ---------- planned routes (BRouter exports) ----------
