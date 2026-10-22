import { activityLabel } from '$lib/activity';
import { formatUsualHabitsSection } from '$lib/activity-habits';
import { DEBRIEF_HABITS_TOKEN, DEBRIEF_WRITEUP_TOKEN } from '$lib/debrief';
import { formatFuelSection, fuelItemNames } from '$lib/fuel';
import { parseFuelSuggestions } from '$lib/fuel-schema';
import { wearByAllGear } from '$lib/gear';
import { collapseDebriefSessions, debriefUnitLead, debriefUnitSlug } from '$lib/debrief-group';
import { groupedSessionTitle, sortGroupMembers } from '$lib/group';
import { buildWeekView, formatUnplannedBrief, isoDateLocal, planWeekDateRange, planWeekStartIso, SKIP_STATUS_PROMPT } from '$lib/plan';
import { withEffectiveHrZones, type RouteAnalytics } from '$lib/splits';
import { parseFeelingsSuggestions } from '$lib/feelings-schema';
import { looksLikePlanWeek, parsePlanWeeks } from '$lib/plan-schema';
import { workoutSummary } from '$lib/run-workout';
import { BODY_SAFETY_RULE, formatBodyNotesSection, formatCoachNotesSection, mergeBodySuggestions } from '$lib/body-notes';
import { openBodyAreas, validateBodyScores } from '$lib/body-scores';
import { buildPaceProfile, typicalEasyPace } from '$lib/pace-profile';
import { feelScale, joinSections, section, tidyPrompt } from '$lib/prompt';
import type { ActivityAttachOption, ActivityGroupInfo, Goal, PlanAttachOption, PlannedRoute, PlannedRouteActivityLink, PlannedRoutePlanLink, PlanWeek, RouteTrack, RunRecord, RunWithMap, SessionRouteRef } from '$lib/types';
import { formatWeekSetupDebriefSection, runSessionPrompt, STRENGTH_SESSION_PROMPT } from '$lib/week-mix';
import { loadProfile } from '../profile';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';
import { currentPlanWeek, loadActivityHabits, loadGear, loadFuelLog, loadSettings, loadTrainingContext, rememberGearName, weekSetupFromSettings } from '../context';
import { listActivityGroups } from '../groups';
import { loadRouteAnalytics } from '../route-analytics';
import { getMaxHrAllTime, getRunById, listRuns, updateRunFeelings, type FeelingsPatch } from '../runs';
import { byDateNewestFirst } from '../run-sort';
import { fuelRunRefs, runDatesBySlug } from '../fuel-prompt';
import { applyFeelingsRows, mergePlanWeeks, parseJsonPayload, planWeekCandidates } from '../plan-mutations';
import { debriefRaceHint, debriefRunSummary, expandDebriefFeatured, feelingsExample, formatDebriefSessionUnit, formatFeelForUnit, formatPlannedForActivity, formatRunBriefLine, parseDebriefIds, parseDebriefSlugLabels, plannedSessionForActivity } from '../debrief-prompt';

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const getDebriefPrompt = createServerFn({ method: 'GET' })
	.validator((d: { id?: string; slug?: string; includePlan?: boolean } | string) => {
		if (typeof d === 'string') return { id: d, slug: '', includePlan: false };
		return {
			id: typeof d?.id === 'string' ? d.id : '',
			slug: typeof d?.slug === 'string' ? d.slug : '',
			includePlan: d?.includePlan === true
		};
	})
	.handler(async ({ data }) => {
		const { id: idRaw, slug: slugRaw, includePlan } = data;
		const [
			allRuns,
			week,
			profile,
			settings,
			training,
			gearInventory,
			allTimeMaxHr,
			habits,
			fuelLog,
			activityGroups
		] = await Promise.all([
			listRuns(),
			currentPlanWeek(),
			loadProfile(),
			loadSettings(),
			loadTrainingContext(),
			loadGear(),
			getMaxHrAllTime(),
			loadActivityHabits(),
			loadFuelLog(),
			listActivityGroups()
		]);
		const { goals } = training.store;
		const { calendar } = training;
		const weekView = week ? buildWeekView(week, allRuns, calendar) : null;
		const weekStart = week ? planWeekStartIso(week.week, calendar) : '';
		let weekEnd = weekStart;
		if (weekStart) {
			const end = new Date(`${weekStart}T12:00:00`);
			end.setDate(end.getDate() + 6);
			weekEnd = isoDateLocal(end);
		}
		const requestedIds = parseDebriefIds(idRaw);
		const legacySlugs = requestedIds.length ? [] : parseDebriefSlugLabels(slugRaw);
		const featuredUnsorted = requestedIds.length
			? requestedIds
					.map((rid) => allRuns.find((r) => r.id === rid) ?? null)
					.filter((r): r is RunRecord => r != null)
			: legacySlugs.length
				? legacySlugs
						.map((label) => allRuns.find((r) => r.slug === label) ?? null)
						.filter((r): r is RunRecord => r != null)
				: weekStart
				? (() => {
						const row = allRuns.find((r) => r.date >= weekStart && r.date <= weekEnd);
						return row ? [row] : [];
					})()
				: [];
		const featured = expandDebriefFeatured(
			featuredUnsorted,
			allRuns,
			weekStart,
			weekEnd,
			activityGroups
		);
		const units = collapseDebriefSessions(featured, activityGroups, allRuns);
		if (!units.length) {
			return {
				prompt: '',
				run: null,
				runs: [],
				units: [],
				raceBySlug: {} as Record<string, DebriefRaceHint | null>,
				gear: gearInventory,
				gearWear: wearByAllGear(allRuns),
				habits,
				weekView,
				error: 'Import this session’s GPX first — the prompt needs those numbers.'
			};
		}

		const featuredMembers = units.flatMap((u) => u.members);
		const storedAnalytics = await Promise.all(featuredMembers.map((r) => loadRouteAnalytics(r)));
		const analyticsById = new Map<number, RouteAnalytics | null>();
		featuredMembers.forEach((r, i) => {
			analyticsById.set(
				r.id,
				withEffectiveHrZones(storedAnalytics[i] ?? null, {
					avgHr: r.avg_hr,
					hrMaxManual: settings.hrMax,
					hrMaxAllTime: allTimeMaxHr
				})
			);
		});

		const weekRuns = weekStart
			? allRuns.filter((r) => r.date >= weekStart && r.date <= weekEnd).sort(byDateNewestFirst)
			: [];
		const featuredIds = new Set(featuredMembers.map((r) => r.id));
		const otherThisWeek = weekRuns.filter((r) => !featuredIds.has(r.id));
		const sessionLines =
			weekView?.sessions
				.map((s) => {
					const state = s.done
						? 'done'
						: s.skipped
							? 'skipped'
							: s.unlogged
								? 'unlogged — no activity logged yet, do not assume skipped'
								: s.isNext
									? 'next'
									: 'upcoming';
					const steps = s.workout ? `${workoutSummary(s.workout)}. ` : '';
					return `- ${s.day}${s.date ? ` (${s.date})` : ''}: ${activityLabel(s.activity_type ?? 'run')} · ${s.label}${s.distance_km != null ? ` · ${s.distance_km} km` : ''} — ${steps}${s.detail} [${state}]`;
				})
				.join('\n') ?? '- (no plan week)';
		const unplannedLines = weekView?.unplanned.length
			? formatUnplannedBrief(weekView.unplanned)
			: '';

		const scoreAreas = openBodyAreas(profile.body);
		const easyPace =
			typicalEasyPace(buildPaceProfile(allRuns, training.medals, isoDateLocal(new Date()))) ??
			'M:SS';
		const many = units.length > 1;
		const sessionWord = many ? 'these sessions' : 'this session';
		const sessionHeading = many ? 'These sessions' : 'This session';
		const sessionBlock = units.map((u) => formatDebriefSessionUnit(u, analyticsById)).join('\n');
		const feelBlock = units.map((u) => formatFeelForUnit(u, scoreAreas)).join('\n');
		const plannedHeading = many ? 'Planned for these sessions' : 'Planned for this session';
		const plannedBlock = units
			.map((u) => {
				if (u.kind === 'single') {
					const r = u.members[0]!;
					return formatPlannedForActivity(
						r,
						plannedSessionForActivity(r, training.plan, allRuns, calendar)
					);
				}
				const title = groupedSessionTitle(u.group, u.members.length, u.stats.date);
				const parts = u.members.map((r) =>
					formatPlannedForActivity(
						r,
						plannedSessionForActivity(r, training.plan, allRuns, calendar)
					)
				);
				return [`- ${title} (grouped)`, ...parts.map((p) => p.replace(/^- /, '  - '))].join('\n');
			})
			.join('\n');
		const compareLine = `Compare what I did against **${plannedHeading}**: did each step hit its target pace or effort (use the km splits and HR in the session block), and did I cut it short or add to it? If it says Unplanned, coach it as extra load. If no plan covers the date, do not call it unplanned.`;
		const job = includePlan
			? `Coach from ${sessionWord}: how it went, recovery, and what to watch. ${compareLine} Answer any questions I asked in What I wrote. Then update **this week** only if remaining sessions should change. Remaining sessions may move to any day my day limits allow, or be dropped, if recovery or the goal calls for it — say why. Never move or drop a **pinned** activity.`
			: `Coach from ${sessionWord}: how it went, recovery, and what to watch. ${compareLine} Answer any questions I asked in What I wrote. **Same rules and context as the week brief earlier in this chat** (plan, body notes, habits, fuel, day limits, workout JSON shape) — use those, they are not repeated here. If remaining sessions should change, include an updated \`week\` in your JSON reply.`;
		const planSections = includePlan
			? joinSections(
					`## Current week plan${week ? ` — week ${week.week} (${planWeekDateRange(week.week, calendar)}) · ${week.phase} · ${week.focus}` : ''}\n${sessionLines}`,
					unplannedLines
						? `## Unplanned activities this week\nThese logs did not match a planned session — extra load, already done. Do not add a plan row just to file them.\n${unplannedLines}`
						: ''
				)
			: '';
		const fuelNames = fuelItemNames(fuelLog);
		const bodyAreas = profile.body.notes.map((n) => n.area);
		const rules = [
			'- Grouped sessions (multiple GPX parts in one block) get **one** `feelings` object — use the **lead id** shown in This session / How I felt. One write-up covers the whole grouped session.',
			'- `feelings.notes` is a **short** first-person summary of What I wrote (about 2–5 sentences) for the activity log. Keep my voice and the useful specifics (body, shoes, questions you answered). Do **not** paste the whole write-up. Omit `notes` if I wrote nothing. For strength, notes are extra commentary only — never rewrite the lift list.',
			"- Before/after in **This session's habits** are what I actually did — ground truth. Do not copy those rituals into `feelings.notes` or into week `detail`.",
			`- Scores marked – were not tapped in the app. Infer effort / legs / energy${scoreAreas.length ? ' / body scores' : ''} (and wanted_faster / surface) from What I wrote when the text is clear enough for a number; otherwise omit the field. Do not invent from GPS. If How I felt already has a number, omit that field. Do not copy example numbers. Only include keys shown in the example for that activity.`,
			scoreAreas.length
				? `- \`body_scores\` (runs/walks): one 0–10 score per body area (higher = worse), keyed by the exact area name: ${scoreAreas.map((a) => a.area).join(', ')}. Only include areas I mentioned; omit the key if none.`
				: '',
			'- `session` (runs only): easy / quality / long / race / … — keep mine if already set; infer only when obvious. `cadence` (runs only, steps per minute) and `gear` (shoe or bike name): only if I gave them; never invent.',
			`- \`fuel\`: **only** when What I wrote mentions food or drink before, during, or after ${sessionWord} — otherwise omit it. One entry per item + phase + timing; \`phase\` before / during / after; \`timing\` in my words; \`outcome\` good / mixed / bad from what I said (cramps, stitch, nausea → bad; no complaint → good); \`notes\` short. Never invent food.${fuelNames.length ? ` Reuse an exact name from my known items when it is the same thing: ${fuelNames.join(', ')}.` : ''} If you include \`fuel\`, end your prose by asking whether I want these saved (the app asks me before saving).`,
			`- \`body\`: **only** when What I wrote mentions new or changed pain, or something that has cleared up — otherwise omit it. One entry per area; \`status\` active / monitoring / resolved; \`trigger\` and \`helps\` short, in my words.${bodyAreas.length ? ` Reuse an exact area name when it is the same place: ${bodyAreas.join(', ')}.` : ''} The app asks me before saving.`,
			includePlan
				? `- \`week.sessions\` is the **full week** from Current week plan: keep completed/skipped rows as they were, rewrite what's still ahead. Every session needs \`"activity_type"\`. Only move a day if you must, and say why. If the week is finished, return the rows unchanged. ${SKIP_STATUS_PROMPT}`
				: `- **Week updates:** if anything still ahead should change, include \`week\` (full week from this chat, \`activity_type\` on every session, completed/skipped rows kept as they were); otherwise omit it. ${SKIP_STATUS_PROMPT}`,
			includePlan ? `- ${runSessionPrompt(easyPace)}` : '',
			includePlan ? `- ${STRENGTH_SESSION_PROMPT}` : ''
		].filter(Boolean);
		const exampleReply = JSON.stringify({
			feelings: feelingsExample(units, scoreAreas),
			fuel: [
				{
					slug: debriefUnitLead(units[0]!)?.slug ?? '',
					phase: 'before',
					item: 'Coffee',
					timing: '20 min before',
					outcome: 'good',
					notes: ''
				}
			],
			body: [
				{ area: bodyAreas[0] ?? 'knee', status: 'monitoring', trigger: 'downhills', helps: '' }
			],
			week: {
				week: week?.week ?? 0,
				dates: week ? planWeekDateRange(week.week, calendar) : '',
				phase: week?.phase ?? '',
				focus: `one-line focus after ${sessionWord}`,
				sessions: [
					{
						day: 'Friday',
						activity_type: 'run',
						label: 'Easy',
						distance_km: 7,
						detail: 'every day of the week, not just this placeholder row',
						workout: {
							type: 'easy',
							blocks: [{ kind: 'run', distance_km: 7, pace: easyPace, effort: 'easy' }]
						}
					}
				]
			}
		});
		const reply = `## When you reply
Lead with coaching advice in prose (how ${sessionWord} went, recovery, and whether anything ahead should change). Answer any questions from What I wrote there. After the advice, output one fenced JSON object I can paste back — the JSON is what I save; the advice is not. \`fuel\`, \`body\` and \`week\` are optional.

\`\`\`json
${exampleReply}
\`\`\`

Rules:
${rules.join('\n')}`;

		const usualWeekSection = includePlan
			? formatWeekSetupDebriefSection(weekSetupFromSettings(settings), {
					includeSlots: week == null
				})
			: '';

		const prompt = tidyPrompt(
			joinSections(
				`# The Long Run — debrief ${sessionWord}`,
				`You are my coach for the sports I train, not a running-only coach. GPS numbers from the import (distance, moving and elapsed time, elevation, pace per km) and how I felt are below.${includePlan ? `\n${feelScale()}` : ''}\n\n${job}`,
				usualWeekSection,
				`## ${sessionHeading}\n${sessionBlock}`,
				`## ${plannedHeading}\n${plannedBlock}`,
				`## How I felt\n– means I did not tap a number. Infer those from What I wrote when the text is clear; keep any number already here.\n${feelBlock}`,
				`## What I wrote\nThis is my own account of ${sessionWord} — as long as I needed, including questions I want answered. Treat it as ground truth. GPS is the device record; if they disagree, mention it but trust how I said it felt.\n\n${DEBRIEF_WRITEUP_TOKEN}`,
				`## This session's habits\nBefore/after as I did them this time — may differ from Usual habits. Treat overrides as ground truth.\n\n${DEBRIEF_HABITS_TOKEN}`,
				section(
					'Other activities already logged this week',
					otherThisWeek.map(formatRunBriefLine).join('\n')
				),
				planSections,
				includePlan ? formatBodyNotesSection(profile.body) : '',
				includePlan ? formatCoachNotesSection(profile.coachNotes) : '',
				includePlan ? formatUsualHabitsSection(habits) : '',
				includePlan ? formatFuelSection(fuelLog, fuelRunRefs(allRuns, fuelLog)) : '',
				includePlan ? BODY_SAFETY_RULE : '',
				reply
			)
		);
		const runs = featuredMembers.map(debriefRunSummary);
		const clientUnits = units.map((u) => {
			const members = sortGroupMembers(u.members).map(debriefRunSummary);
			const lead = members[0]!;
			const slug = debriefUnitSlug(u);
			return {
				kind: u.kind,
				slug,
				groupId: u.kind === 'group' ? u.group.id : undefined,
				groupName: u.kind === 'group' ? u.group.name : undefined,
				run: lead,
				members,
				stats: u.kind === 'group' ? u.stats : undefined
			};
		});
		const raceBySlug: Record<string, DebriefRaceHint | null> = {};
		for (const r of featuredMembers) raceBySlug[r.slug] = debriefRaceHint(r, goals);
		return {
			prompt,
			run: runs[runs.length - 1] ?? null,
			runs,
			units: clientUnits,
			raceBySlug,
			gear: gearInventory,
			gearWear: wearByAllGear(allRuns),
			habits,
			weekView,
			error: null as string | null
		};
	});

export type { ActivityFeelInput } from '$lib/debrief-types';

export const saveActivityFeel = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: ActivityFeelInput) => d)
	.handler(async ({ data }) => {
		const patch: FeelingsPatch = {};
		if (data.effort !== undefined) patch.effort = data.effort;
		if (data.body_scores !== undefined) patch.body_scores = validateBodyScores(data.body_scores);
		if (data.legs !== undefined) patch.legs = data.legs;
		if (data.energy !== undefined) patch.energy = data.energy;
		if (data.wanted_faster !== undefined) patch.wanted_faster = data.wanted_faster;
		if (data.surface !== undefined) patch.surface = data.surface.trim();
		if (data.notes !== undefined) patch.notes = data.notes.trim();
		if (data.session !== undefined) patch.session = data.session.trim();
		if (data.cadence !== undefined) patch.cadence = data.cadence;
		if (data.gear !== undefined) patch.gear = data.gear.trim();
		if (data.before_notes !== undefined) patch.before_notes = data.before_notes.trim();
		if (data.after_notes !== undefined) patch.after_notes = data.after_notes.trim();
		const ok = await updateRunFeelings(data.id, patch);
		if (!ok) throw new Error('Activity not found.');
		if (data.gear !== undefined) {
			const run = await getRunById(data.id);
			if (run) await rememberGearName(run.gear, run.activity_type);
		}
		return { ok: true as const, id: data.id };
	});

// ---------- mutations ----------

export type { CreateRunInput, UpdateRunInput } from '$lib/run-input';

export const saveDebrief = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((jsonText: string) => jsonText)
	.handler(async ({ data: jsonText }) => {
		const parsed = parseJsonPayload(jsonText);
		const rows = parseFeelingsSuggestions(parsed);
		const obj = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
		const candidates = planWeekCandidates(looksLikePlanWeek(obj.week) ? obj.week : parsed);
		const weeks = candidates.length ? parsePlanWeeks(candidates) : [];
		const fuelSuggestions =
			obj.fuel != null ? parseFuelSuggestions(obj.fuel, runDatesBySlug(await listRuns())) : [];
		const bodySuggestions =
			obj.body != null ? mergeBodySuggestions((await loadProfile()).body, obj.body) : [];
		if (!rows.length && !weeks.length && !fuelSuggestions.length && !bodySuggestions.length) {
			throw new Error('Need a "feelings" object and/or a "week" with sessions in that JSON.');
		}
		const feelings = rows.length
			? await applyFeelingsRows(rows)
			: { updated: 0, updatedSlugs: [] as string[], missing: [] as string[] };
		const plan = weeks.length ? await mergePlanWeeks(weeks) : { weeks: 0, updated: [] as number[] };
		return {
			feelingsUpdated: feelings.updated,
			feelingsUpdatedSlugs: feelings.updatedSlugs,
			feelingsMissing: feelings.missing,
			planWeeks: plan.weeks,
			planUpdated: plan.updated,
			fuelSuggestions,
			bodySuggestions
		};
	});

// ---------- profile: body notes + coach notes ----------
