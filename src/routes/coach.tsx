import { emptyActivityHabits } from '$lib/activity-habits';
import { SignInPanel, useAuthed } from '$lib/auth';
import { dateRangeFromSearch, type RangeKind } from '$lib/date-range';
import { composeDebriefPrompt, debriefWriteupUnitsFromCoach } from '$lib/debrief';
import {
	readGenerateDraft,
	scheduleWriteGenerateDraft,
	type GenerateDraft
} from '$lib/generate-draft';
import {
	clearDebriefHabits,
	readDebriefHabits,
	seedDebriefHabits,
	setDebriefHabitField
} from '$lib/debrief-habits';
import {
	clearDebriefWriteups,
	readDebriefWriteups,
	writeDebriefWriteups
} from '$lib/debrief-writeups';
import type { BodySuggestion } from '$lib/body-notes';
import type { FuelEntry } from '$lib/fuel';
import type { GearContext, GearKind, GearWear } from '$lib/gear';
import { formatHorizonShort } from '$lib/goals';
import {
	formatAllWeeksClipboard,
	formatWeekPlanClipboard,
	isoDateLocal,
	planWeekDateRange,
	planWeekDateRangeShort
} from '$lib/plan';
import {
	createActivityGroupFn,
	getCoachBrief,
	getCoachPlan,
	getDebriefPrompt,
	getWeekPattern,
	saveActivityFeel,
	saveDebrief,
	savePlanWeeks,
	saveWeekPattern,
	ungroupActivitiesFn
} from '$lib/server/functions';
import { appHead } from '$lib/title';
import { cn } from '$lib/ui';
import type { ActivityType } from '$lib/activity';
import {
	formatWeekSetupProse,
	weekSetupsEqual,
	type DayLimit,
	type WeekSetup
} from '$lib/week-mix';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DateRangeFilter, type RangeSearch } from '../components/DateRangeFilter';
import { DebriefActivityTitle } from '../components/DebriefActivityTitle';
import { DebriefFeelForm, type DebriefDraftClearPick } from '../components/DebriefFeelForm';
import { DebriefRacePanel } from '../components/DebriefRacePanel';
import { AiPromptFlow } from '../components/AiPromptFlow';
import { DeferredData } from '../components/DeferredData';
import { BodySuggestionsDialog } from '../components/BodySuggestionsDialog';
import { FuelSuggestionsDialog } from '../components/FuelSuggestionsDialog';
import { GpxImport } from '../components/GpxImport';
import { Icon } from '../components/Icon';
import { JsonPasteForm } from '../components/JsonPasteForm';
import {
	Actions,
	Button,
	Checkbox,
	Field,
	Form,
	IconLabelButton,
	PageHero,
	PageTabs,
	Panel,
	PanelTitle,
	Select,
	Textarea,
	errorMessage,
	useLeaveGuard,
	useSnackbar
} from '../components/ui';
import { buttonClass } from '../components/ui/Button';
import {
	rowsFrom,
	toPattern,
	WeekPatternEditor,
	type SlotRow
} from '../components/WeekPatternEditor';
import { WeekPlanBoard } from '../components/WeekPlanBoard';

type CoachTab = 'training' | 'debrief' | 'plan' | 'generate';
type CoachSearch = RangeSearch & {
	tab?: CoachTab;
	/** Comma-separated activity ids for debrief. */
	id?: string;
	/** @deprecated Legacy comma-separated slugs — use `id`. */
	slug?: string;
	planWeek?: number;
	includePlan?: boolean;
};

const RANGE_KINDS: RangeKind[] = ['7d', '30d', 'all', 'custom'];
const DEFAULT_BRIEF_RANGE: RangeKind = '30d';

function withCoachSearch(search: CoachSearch, extra: Partial<CoachSearch> = {}): CoachSearch {
	const id = extra.id !== undefined ? extra.id : search.id;
	const slug = extra.slug !== undefined ? extra.slug : search.slug;
	const includePlan = extra.includePlan !== undefined ? extra.includePlan : search.includePlan;
	return {
		tab: extra.tab ?? search.tab,
		id: id || undefined,
		slug: slug || undefined,
		planWeek: extra.planWeek !== undefined ? extra.planWeek : search.planWeek,
		includePlan: includePlan === true ? true : undefined,
		range: extra.range !== undefined ? extra.range : search.range,
		from: extra.from !== undefined ? extra.from : search.from,
		to: extra.to !== undefined ? extra.to : search.to
	};
}

function defaultQuestion(nextWeek = false): string {
	return `What should ${nextWeek ? 'next week' : 'this week'} look like? Use the rules above. If I noted extras I'm considering, say whether to add them.`;
}

function parseTab(v: unknown): CoachTab | undefined {
	if (v === 'training' || v === 'plan' || v === 'generate' || v === 'debrief') return v;
	return undefined;
}

function parsePlanWeek(v: unknown): number | undefined {
	const n = Number(v);
	if (!Number.isFinite(n)) return undefined;
	const week = Math.floor(n);
	if (week < 1 || week > 52) return undefined;
	return week;
}

function weekTag(n: number, current: number, upcoming: number): 'now' | 'next' | null {
	if (n === current) return 'now';
	if (n === upcoming && n !== current) return 'next';
	return null;
}

function visibleTab(tab: CoachTab, authed: boolean): CoachTab {
	if ((tab === 'debrief' || tab === 'generate') && !authed) return 'training';
	return tab;
}

type DebriefPrompt = Awaited<ReturnType<typeof getDebriefPrompt>>;
type CoachDebriefUnit = NonNullable<DebriefPrompt['units']>[number];
type CoachPlanData = Awaited<ReturnType<typeof getCoachPlan>>;

function coachDebriefUnits(debrief: DebriefPrompt): CoachDebriefUnit[] {
	if (debrief.units?.length) return debrief.units;
	const runs = debrief.runs?.length ? debrief.runs : debrief.run ? [debrief.run] : [];
	return runs.map((run) => ({
		kind: 'single' as const,
		slug: run.slug,
		run,
		members: [run],
		groupId: undefined,
		groupName: undefined,
		stats: undefined
	}));
}

function defaultCoachTab(planData: CoachPlanData): CoachTab {
	return planData.views.length > 0 ? 'plan' : 'training';
}

function PlanWeekPanel({ planData }: { planData: CoachPlanData }) {
	const search = Route.useSearch();
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();
	const current = planData.currentWeek;
	const weekCount = planData.calendar.weekCount;
	const upcomingWeek = planData.views.find((v) => v.next)?.week.week ?? planData.generateWeek;
	const selected = Math.min(weekCount, search.planWeek ?? upcomingWeek);
	const byWeek = new Map(planData.views.map((v) => [v.week.week, v]));
	const view = byWeek.get(selected) ?? null;
	const [copied, setCopied] = useState<'week' | 'all' | null>(null);

	function setWeek(n: number) {
		const week = Math.min(weekCount, Math.max(1, n));
		router.navigate({
			to: '/coach',
			search: withCoachSearch(search, { tab: 'plan', planWeek: week }),
			replace: true,
			resetScroll: false
		});
	}

	async function copyText(kind: 'week' | 'all', text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(kind);
			setTimeout(() => setCopied((prev) => (prev === kind ? null : prev)), 1800);
		} catch {
			snack.error('Could not copy — select and copy the text instead.');
		}
	}

	const todayIso = isoDateLocal(new Date());

	return (
		<>
			<Panel form className="mb-4">
				<Field as="div" label="Week">
					<div className="hidden max-sm:flex flex-col gap-[0.35rem]">
						<div className="flex items-stretch gap-2">
							<button
								type="button"
								className={buttonClass({ variant: 'ghost', size: 'icon' })}
								aria-label="Previous week"
								disabled={selected <= 1}
								onClick={() => setWeek(selected - 1)}
							>
								<Icon name="arrow" size={18} className="rotate-180" />
							</button>
							<Select
								aria-label="Plan week"
								className="flex-1"
								value={String(selected)}
								onChange={(next) => setWeek(Number(next))}
								options={Array.from({ length: weekCount }, (_, i) => {
									const n = i + 1;
									const tag = weekTag(n, current, upcomingWeek);
									const dates = planWeekDateRangeShort(n, planData.calendar);
									const planned = byWeek.has(n);
									return {
										value: String(n),
										label: `Week ${n}${tag ? ` · ${tag}` : ''} · ${dates}${planned ? '' : ' · no plan'}`
									};
								})}
							/>
							<button
								type="button"
								className={buttonClass({ variant: 'ghost', size: 'icon' })}
								aria-label="Next week"
								disabled={selected >= weekCount}
								onClick={() => setWeek(selected + 1)}
							>
								<Icon name="arrow" size={18} />
							</button>
						</div>
						<p className={cn('text-muted', 'm-0 text-[0.82rem]')}>
							{planWeekDateRange(selected, planData.calendar)}
							{byWeek.has(selected) ? '' : ' · no plan yet'}
						</p>
					</div>
					<div className="max-sm:hidden" role="group" aria-label="Plan week">
						<div className="flex flex-wrap gap-[0.4rem]">
							{Array.from({ length: weekCount }, (_, i) => {
								const n = i + 1;
								const tag = weekTag(n, current, upcomingWeek);
								const dates = planWeekDateRangeShort(n, planData.calendar);
								const planned = byWeek.has(n);
								const pressed = n === selected;
								return (
									<button
										key={n}
										type="button"
										aria-pressed={pressed}
										aria-label={`Week ${n}, ${dates}${tag ? `, ${tag}` : ''}${planned ? '' : ', no plan yet'}`}
										className={cn(
											'appearance-none inline-flex flex-col items-center justify-center gap-[0.18rem] min-h-[3.35rem] min-w-[4.4rem] px-[0.7rem] py-[0.4rem] rounded-[14px] bg-transparent text-muted cursor-pointer transition-[color,background-color,border-color] duration-150 ease-out hover:text-fg',
											planned
												? 'border border-solid border-line hover:border-accent/35'
												: 'border border-dashed border-line/80 text-muted/80 hover:border-accent/40 hover:text-muted',
											'aria-[pressed=true]:bg-accent! aria-[pressed=true]:text-accent-ink! aria-[pressed=true]:border-solid! aria-[pressed=true]:border-accent! aria-[pressed=true]:hover:text-accent-ink aria-[pressed=true]:hover:border-accent'
										)}
										onClick={() => {
											if (!pressed) setWeek(n);
										}}
									>
										<span className="text-[0.95rem] font-semibold leading-none">
											{tag ? `${n} · ${tag}` : n}
										</span>
										<span className="text-[0.68rem] font-medium leading-[1.15] whitespace-nowrap opacity-80">
											{dates}
										</span>
									</button>
								);
							})}
						</div>
					</div>
				</Field>
				{authed ? (
					<>
						<p className={cn('text-muted', 'm-0 max-sm:hidden')}>
							Copy this week (live status plus JSON) into a new chat, or every week that already has
							sessions. Paste an updated JSON block back below.
						</p>
						<Actions>
							<IconLabelButton
								label={copied === 'week' ? 'Copied' : 'Copy this week'}
								disabled={!view}
								icon={<Icon name={copied === 'week' ? 'check' : 'copy'} size={16} />}
								onClick={() => view && copyText('week', formatWeekPlanClipboard(view, todayIso))}
							/>
							<IconLabelButton
								label={copied === 'all' ? 'Copied' : 'Copy all planned weeks'}
								disabled={!planData.views.length}
								icon={<Icon name={copied === 'all' ? 'check' : 'copy'} size={16} />}
								onClick={() => copyText('all', formatAllWeeksClipboard(planData.views, todayIso))}
							/>
						</Actions>
					</>
				) : null}
			</Panel>
			{view ? (
				<WeekPlanBoard
					view={view}
					routes={planData.routes}
					title={
						selected === current
							? 'This week'
							: selected === upcomingWeek
								? 'Next week'
								: `Week ${selected}`
					}
				/>
			) : (
				<p className={cn('text-muted', 'mt-0 mb-4')}>
					Week {selected} ({planWeekDateRange(selected, planData.calendar)}) is not in the plan yet.
				</p>
			)}
			{authed && (
				<JsonPasteForm
					className="mt-4"
					title="Paste updated JSON"
					description={
						<p className={cn('text-muted', 'mt-[0.3rem]')}>
							Same shape as Generate — one week object or an array of weeks. Merged by week number.
						</p>
					}
					placeholder='{ "week": 5, "dates": "…", "phase": "build", "focus": "…", "sessions": [ … ] }'
					submitLabel="Add to plan"
					errorLabel="Could not save plan."
					onSubmit={async (json) => {
						const res = await savePlanWeeks({ data: json });
						snack.success(
							`Saved — plan now has ${res.weeks} weeks (updated week ${res.updated.join(', ')}).`
						);
						await router.invalidate();
					}}
				/>
			)}
		</>
	);
}

export const Route = createFileRoute('/coach')({
	validateSearch: (s: Record<string, unknown>): CoachSearch => ({
		range: RANGE_KINDS.includes(s.range as RangeKind) ? (s.range as RangeKind) : undefined,
		from: typeof s.from === 'string' ? s.from : undefined,
		to: typeof s.to === 'string' ? s.to : undefined,
		tab: parseTab(s.tab),
		id: typeof s.id === 'string' && s.id ? s.id : undefined,
		// Legacy bookmarks — server resolves slugs when `id` is absent.
		slug: typeof s.slug === 'string' && s.slug ? s.slug : undefined,
		planWeek: parsePlanWeek(s.planWeek),
		includePlan:
			s.includePlan === true || s.includePlan === 'true' || s.includePlan === '1' ? true : undefined
	}),
	// Search (tab, range, slug) must not remount DeferredData/Await — that felt like a full refresh.
	loaderDeps: () => ({}),
	loader: ({ location }) => {
		const search = location.search as CoachSearch;
		const id = search.id ?? '';
		const slug = search.slug ?? '';
		const includePlan = search.includePlan === true;
		return {
			page: Promise.all([
				getDebriefPrompt({ data: { id, slug, includePlan } }),
				getWeekPattern(),
				getCoachPlan()
			]).then(([debrief, weekSetup, planData]) => ({ debrief, weekSetup, planData }))
		};
	},
	head: () => appHead('Coach'),
	component: Coach
});

function Coach() {
	const { page } = Route.useLoaderData();

	return (
		<>
			<PageHero variant="quiet" kicker="This week" title="Coach" />

			<DeferredData promise={page}>
				{(data) => (
					<CoachPanels
						debrief={data.debrief}
						initialSetup={data.weekSetup}
						planData={data.planData}
						gear={data.debrief.gear}
						gearWear={data.debrief.gearWear}
					/>
				)}
			</DeferredData>
		</>
	);
}

function CoachPanels({
	debrief: initialDebrief,
	initialSetup,
	planData,
	gear,
	gearWear
}: {
	debrief: DebriefPrompt;
	initialSetup: WeekSetup;
	planData: CoachPlanData;
	gear: GearContext;
	gearWear: Record<GearKind, Record<string, GearWear>>;
}) {
	const search = Route.useSearch();
	const router = useRouter();
	const snack = useSnackbar();
	const range = dateRangeFromSearch(
		search.range || search.from || search.to ? search : { range: DEFAULT_BRIEF_RANGE }
	);
	const authed = useAuthed();
	const tab = visibleTab(search.tab ?? defaultCoachTab(planData), authed);
	const debriefIds = search.id ?? '';
	const includePlan = search.includePlan === true;

	function setTab(next: CoachTab) {
		router.navigate({
			to: '/coach',
			search: withCoachSearch(search, {
				tab: next,
				id: next === 'debrief' ? search.id : ''
			}),
			replace: true,
			resetScroll: false
		});
	}

	useEffect(() => {
		if (search.tab !== undefined) return;
		router.navigate({
			to: '/coach',
			search: withCoachSearch(search, { tab: defaultCoachTab(planData) }),
			replace: true,
			resetScroll: false
		});
	}, [search.tab, planData.views.length, router, search]);

	const [generateDraft, setGenerateDraft] = useState(readGenerateDraft);

	useLayoutEffect(() => {
		setGenerateDraft(readGenerateDraft());
	}, []);

	function patchGenerateDraft(partial: Partial<GenerateDraft>) {
		setGenerateDraft((prev) => {
			const next = { ...prev, ...partial };
			scheduleWriteGenerateDraft(next);
			return next;
		});
	}

	const [debrief, setDebrief] = useState(initialDebrief);
	const [writeups, setWriteups] = useState(readDebriefWriteups);
	const [habitDrafts, setHabitDrafts] = useState(readDebriefHabits);
	const [debriefPrompt, setDebriefPrompt] = useState(() =>
		composeDebriefPrompt(
			initialDebrief.prompt,
			debriefWriteupUnitsFromCoach(initialDebrief),
			{},
			{},
			initialDebrief.habits ?? emptyActivityHabits()
		)
	);
	const [fuelSuggestions, setFuelSuggestions] = useState<FuelEntry[]>([]);
	const [bodySuggestions, setBodySuggestions] = useState<BodySuggestion[]>([]);
	const [bodySuggestionsQueued, setBodySuggestionsQueued] = useState<BodySuggestion[]>([]);

	const [usual, setUsual] = useState<SlotRow[]>(() => rowsFrom(initialSetup.pattern));
	const [dayLimits, setDayLimits] = useState<DayLimit[]>(initialSetup.dayLimits);
	const [plannedSports, setPlannedSports] = useState<ActivityType[]>(initialSetup.plannedSports);
	const [savedSetup, setSavedSetup] = useState<WeekSetup>(initialSetup);
	const [mixBusy, setMixBusy] = useState(false);
	const mixBusyRef = useRef(false);

	// Fresh loader data (e.g. after save) replaces the debrief prompt.
	useEffect(() => {
		setDebrief(initialDebrief);
	}, [initialDebrief]);

	// Soft id updates (e.g. after GPX import) refresh the prompt without remounting the page.
	const debriefIdsHydrated = useRef<string | null>(null);
	useEffect(() => {
		const key = `${debriefIds}|${includePlan ? '1' : '0'}`;
		if (debriefIdsHydrated.current === null) {
			debriefIdsHydrated.current = key;
			return;
		}
		if (debriefIdsHydrated.current === key) return;
		debriefIdsHydrated.current = key;
		let cancelled = false;
		getDebriefPrompt({ data: { id: debriefIds, includePlan } }).then((next) => {
			if (cancelled) return;
			setDebrief(next);
		});
		return () => {
			cancelled = true;
		};
	}, [debriefIds, includePlan]);

	const coachUnits = coachDebriefUnits(debrief);
	const writeupUnits = coachUnits.map((u) => ({ slug: u.slug, members: u.members }));

	useEffect(() => {
		const habits = debrief.habits ?? emptyActivityHabits();
		const seeds = writeupUnits.map((u) => {
			const lead = u.members[0]!;
			return {
				slug: u.slug,
				activity_type: lead.activity_type,
				before_notes: lead.before_notes,
				after_notes: lead.after_notes
			};
		});
		setHabitDrafts((prev) => seedDebriefHabits(seeds, habits, prev));
	}, [debrief, writeupUnits]);

	useEffect(() => {
		setDebriefPrompt(
			composeDebriefPrompt(
				debrief.prompt,
				writeupUnits,
				writeups,
				habitDrafts,
				debrief.habits ?? emptyActivityHabits()
			)
		);
	}, [debrief, writeupUnits, writeups, habitDrafts]);

	const sessionCount = writeupUnits.length;
	const many = sessionCount > 1;
	const allWrote =
		sessionCount > 0 && writeupUnits.every((u) => (writeups[u.slug] ?? '').trim() !== '');
	const ungroupedIds = coachUnits
		.filter((u) => u.kind === 'single')
		.flatMap((u) => u.members.map((m) => m.id));
	const canGroupDebrief = ungroupedIds.length >= 2;

	function setWriteup(slugKey: string, text: string) {
		setWriteups((prev) => {
			const next = { ...prev };
			if (text) next[slugKey] = text;
			else delete next[slugKey];
			writeDebriefWriteups(next);
			return next;
		});
	}

	function setHabit(slugKey: string, field: 'before' | 'after', text: string) {
		setHabitDrafts((prev) => setDebriefHabitField(slugKey, field, text, prev));
	}

	function clearDebriefDraft(slugKey: string, pick: DebriefDraftClearPick) {
		if (pick.writeup) {
			setWriteups((prev) => clearDebriefWriteups([slugKey], prev));
		}
		if (pick.before || pick.after) {
			setHabitDrafts((prev) => {
				let next = prev;
				if (pick.before) next = setDebriefHabitField(slugKey, 'before', '', next);
				if (pick.after) next = setDebriefHabitField(slugKey, 'after', '', next);
				const pair = next[slugKey];
				if (pair && !pair.before.trim() && !pair.after.trim()) {
					next = clearDebriefHabits([slugKey], next);
				}
				return next;
			});
		}
	}

	async function groupDebriefSessions() {
		if (!canGroupDebrief) return;
		try {
			await createActivityGroupFn({ data: { ids: ungroupedIds } });
			await refreshDebrief();
			snack.success('Grouped as one session in the debrief.');
		} catch (e) {
			snack.error(errorMessage(e, 'Could not group those activities.'));
		}
	}

	async function ungroupDebriefSession(groupId: string) {
		try {
			await ungroupActivitiesFn({ data: groupId });
			await refreshDebrief();
			snack.success('Sessions ungrouped.');
		} catch (e) {
			snack.error(errorMessage(e, 'Could not ungroup.'));
		}
	}

	async function refreshDebrief() {
		const next = await getDebriefPrompt({ data: { id: debriefIds, includePlan } });
		setDebrief(next);
		const nextRuns = next.runs?.length ? next.runs : next.run ? [next.run] : [];
		const nextIds = nextRuns.map((r) => String(r.id)).join(',');
		if (nextIds !== debriefIds) {
			router.navigate({
				to: '/coach',
				search: withCoachSearch(search, {
					tab: 'debrief',
					id: nextIds || undefined,
					slug: ''
				}),
				replace: true,
				resetScroll: false
			});
		}
		await router.invalidate();
	}

	function setIncludePlan(next: boolean) {
		router.navigate({
			to: '/coach',
			search: withCoachSearch(search, { tab: 'debrief', includePlan: next }),
			replace: true,
			resetScroll: false
		});
	}
	const planningNext = planData.generateWeek > planData.currentWeek;
	const weekPhrase = planningNext ? 'next week' : 'this week';
	const weekPhraseCap = planningNext ? 'Next week' : 'This week';
	const defaultQ = defaultQuestion(planningNext);
	const setup: WeekSetup = { pattern: toPattern(usual), dayLimits, plannedSports };
	const mixDirty = !weekSetupsEqual(setup, savedSetup);

	// Leaving /coach with a dirty week setup loses the unsaved mix — confirm first.
	// Tab switches keep this component mounted (the mix survives them) but still
	// remind, since the unsaved state is only visible on the training tab.
	const { guard: leaveGuard } = useLeaveGuard({
		dirty: authed && mixDirty,
		title: 'Unsaved week setup',
		description: 'Your week setup is unsaved — leaving Coach will lose it.',
		challengeSameRoute: (currentSearch, nextSearch) =>
			(currentSearch as { tab?: string } | undefined)?.tab !==
			(nextSearch as { tab?: string } | undefined)?.tab
	});

	function applySetup(next: WeekSetup) {
		setUsual(rowsFrom(next.pattern));
		setDayLimits(next.dayLimits);
		setPlannedSports(next.plannedSports);
	}

	async function generateBrief(mixNote: string, question: string) {
		try {
			const next = await getCoachBrief({
				data: {
					range: range.kind,
					from: range.from,
					to: range.to,
					setup,
					defaultSetup: savedSetup,
					note: mixNote
				}
			});
			patchGenerateDraft({
				brief: `${next}\n## My question\n${question.trim() || defaultQ}\n`
			});
		} catch (e) {
			snack.error(errorMessage(e, 'Could not build the prompt.'));
		}
	}

	async function saveDefaultMix() {
		if (mixBusyRef.current) return;
		mixBusyRef.current = true;
		setMixBusy(true);
		try {
			const saved = await saveWeekPattern({ data: setup });
			setSavedSetup(saved);
			applySetup(saved);
			snack.success('Saved as your default week.');
			router.invalidate();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not save the default week.'));
		} finally {
			mixBusyRef.current = false;
			setMixBusy(false);
		}
	}

	function download() {
		const date = new Date().toISOString().slice(0, 10);
		const blob = new Blob([generateDraft.brief], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `the-long-run-context-${date}.md`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	return (
		<>
			<PageTabs
				aria-label="Coach"
				value={tab}
				onChange={setTab}
				options={[
					{
						value: 'training' as const,
						label: (
							<>
								<Icon name="calendar" size={15} />
								Training
							</>
						)
					},
					...(authed
						? [
								{
									value: 'generate' as const,
									label: (
										<>
											<Icon name="sparkle" size={15} />
											Generate
										</>
									)
								}
							]
						: []),
					{
						value: 'plan' as const,
						label: (
							<>
								<Icon name="board" size={15} />
								Plan
							</>
						)
					},
					...(authed
						? [
								{
									value: 'debrief' as const,
									label: (
										<>
											<Icon name="flag" size={15} />
											<span className="max-sm:hidden">After an activity</span>
											<span className="hidden max-sm:inline">Activity</span>
										</>
									)
								}
							]
						: [])
				]}
			/>

			{tab === 'training' && (
				<Panel form className="mb-4">
					<Field as="div" label="Week setup">
						{authed ? (
							<span className={cn('text-muted', 'font-normal')}>
								Saved default: {formatWeekSetupProse(savedSetup)}.
							</span>
						) : null}
						<WeekPatternEditor
							rows={usual}
							onChange={setUsual}
							dayLimits={dayLimits}
							onDayLimitsChange={setDayLimits}
							plannedSports={plannedSports}
							onPlannedSportsChange={setPlannedSports}
							disabled={mixBusy}
							readOnly={!authed}
						/>
					</Field>
					{authed && (mixDirty || mixBusy) && (
						<>
							<p className={cn('text-muted', 'm-0')}>
								Unsaved — Generate will use this setup, not your saved default.
							</p>
							<Actions className="mt-[0.35rem]">
								<button
									className={buttonClass({ variant: 'ghost' })}
									type="button"
									onClick={() => applySetup(savedSetup)}
									disabled={mixBusy}
								>
									Revert to saved
								</button>
								<button
									className={buttonClass()}
									type="button"
									onClick={saveDefaultMix}
									disabled={mixBusy}
									aria-busy={mixBusy}
								>
									<Icon name={mixBusy ? 'calendar' : 'check'} size={16} />
									{mixBusy ? 'Saving…' : 'Save as my default week'}
								</button>
							</Actions>
						</>
					)}
				</Panel>
			)}

			{tab === 'debrief' && (
				<Panel className="mb-4">
					<ol className="list-none m-0 p-0 flex flex-col gap-6 max-sm:gap-[1.15rem] [&>li>strong]:block [&>li>strong]:text-[1.05rem]">
						<li className={sessionCount ? '[&>strong]:text-accent-fg' : undefined}>
							<strong>1. Import the GPX</strong>
							{sessionCount > 0 && (
								<div className="mt-[0.45rem] mb-0 font-semibold max-sm:[overflow-wrap:anywhere]">
									<p className="m-0">
										{many
											? `${sessionCount} sessions in the prompt:`
											: coachUnits[0]?.kind === 'group'
												? 'Grouped session in the prompt:'
												: 'In the prompt:'}
									</p>
									<ul className="list-none m-[0.35rem_0_0] p-0 grid gap-1">
										{coachUnits.map((u) => (
												<li key={u.slug}>
													{u.kind === 'group' && u.members.length > 1 ? (
														<span>
															Grouped · {u.members.length} parts
															{u.run.hasFeel ? '' : ' · no feel yet'}
														</span>
													) : (
														<>
															<DebriefActivityTitle run={u.run} link />
															{u.run.hasFeel ? '' : ' · no feel yet'}
														</>
													)}
												</li>
										))}
									</ul>
									{canGroupDebrief && (
										<Actions className="mt-2">
											<button
												type="button"
												className={buttonClass({ variant: 'ghost' })}
												onClick={() => void groupDebriefSessions()}
											>
												<Icon name="grid" size={16} />
												Group into one session
											</button>
										</Actions>
									)}
								</div>
							)}
							<Panel form className="mt-3">
								{authed ? (
									<GpxImport
										onImported={(ok) => {
											// Merge with the ids already in the URL instead of replacing
											// them — an earlier activity that is still being written up must
											// not vanish from the list mid-debrief.
											const current = (search.id ?? '')
												.split(',')
												.map((s) => s.trim())
												.filter(Boolean);
											const fresh = ok
												.map((r) => (r.id != null ? String(r.id) : ''))
												.filter(Boolean);
											const merged = [...new Set([...current, ...fresh])];
											if (merged.length) {
												router.navigate({
													to: '/coach',
													search: withCoachSearch(search, {
														tab: 'debrief',
														id: merged.join(',')
													}),
													replace: true,
													resetScroll: false
												});
											}
										}}
									/>
								) : (
									<SignInPanel title="Sign in to import a GPX" />
								)}
							</Panel>
							<p className={cn('text-muted', 'mt-2')}>
								No GPS?{' '}
								<Link to="/import" search={{ mode: 'manual' }}>
									Log manually
								</Link>
								.
							</p>
						</li>
						<li className={sessionCount && allWrote ? '[&>strong]:text-accent-fg' : undefined}>
							<strong>2. How it felt</strong>
							{sessionCount > 0 &&
								coachUnits.map((u) => {
									const mirrorIds =
										u.kind === 'group' && u.members.length > 1
											? u.members.map((m) => m.id)
											: [u.run.id];
									return (
										<div key={u.slug}>
											{u.kind === 'group' && u.groupId ? (
												<Actions className="mb-1">
													<button
														type="button"
														className={buttonClass({ variant: 'ghost' })}
														onClick={() => void ungroupDebriefSession(u.groupId!)}
													>
														Ungroup session
													</button>
												</Actions>
											) : null}
											<DebriefFeelForm
												run={u.run}
												parts={u.members.length > 1 ? u.members : undefined}
												mirrorIds={mirrorIds}
												writeup={writeups[u.slug] ?? ''}
												habitDraft={habitDrafts[u.slug] ?? { before: '', after: '' }}
												gear={gear}
												gearWear={gearWear}
												onWriteupChange={(text) => setWriteup(u.slug, text)}
												onHabitChange={(field, text) => setHabit(u.slug, field, text)}
												onClearDrafts={(pick) => clearDebriefDraft(u.slug, pick)}
												onSaved={refreshDebrief}
											/>
											{u.members.map((r) => {
												const raceHint = debrief.raceBySlug[r.slug];
												return raceHint ? (
													<DebriefRacePanel
														key={r.slug}
														hint={raceHint}
														runSlug={r.slug}
														onSaved={refreshDebrief}
													/>
												) : null;
											})}
										</div>
									);
								})}
							{!sessionCount && (
								<p className={cn('text-muted', 'mt-[0.4rem]')}>
									Import a GPX (or log manually) first.
								</p>
							)}
						</li>
						<li>
							<strong>3. Copy the prompt</strong>
							{debrief.error && !debriefPrompt && (
								<p className={cn('text-muted', 'mt-[0.4rem]')}>{debrief.error}</p>
							)}
							{debriefPrompt && (
								<Panel form className="mt-3">
									<AiPromptFlow
										prompt={debriefPrompt}
										promptEditable
										onPromptChange={setDebriefPrompt}
										promptRows={14}
									/>
									<Checkbox
										checked={includePlan}
										onChange={setIncludePlan}
										label="New chat — include my plan and standing info"
										hint="On for a new chat; off to keep the prompt small in an ongoing thread."
									/>
								</Panel>
							)}
						</li>
						<li>
							<strong>4. Paste the AI’s JSON</strong>
							{authed ? (
								<JsonPasteForm
									className="mt-3"
									placeholder={
										includePlan
											? '{ "feelings": { "id": 42, "notes": "…" }, "week": { "week": 3, "sessions": [ … ] } }'
											: '{ "feelings": { "id": 42, "notes": "…" } }'
									}
									submitLabel="Save reply"
									submitIcon="check"
									errorLabel="Could not save debrief."
									onSubmit={async (json) => {
										for (const u of writeupUnits) {
											const h = habitDrafts[u.slug];
											if (!h) continue;
											const ids = u.members.map((m) => m.id);
											for (const id of ids) {
												await saveActivityFeel({
													data: {
														id,
														before_notes: h.before,
														after_notes: h.after
													}
												});
											}
										}
										const res = await saveDebrief({ data: json });
										const bits: string[] = [];
										if (res.feelingsUpdated) {
											bits.push(
												`feelings on ${res.feelingsUpdated} activit${res.feelingsUpdated === 1 ? 'y' : 'ies'}`
											);
										}
										if (res.planUpdated.length)
											bits.push(`week ${res.planUpdated.join(', ')} updated`);
										if (res.fuelSuggestions.length) {
											bits.push('food found — review it');
											setFuelSuggestions(res.fuelSuggestions);
											if (res.bodySuggestions.length) {
												bits.push('body notes next');
												setBodySuggestionsQueued(res.bodySuggestions);
											}
										} else if (res.bodySuggestions.length) {
											bits.push('body notes found — review them');
											setBodySuggestions(res.bodySuggestions);
										}
										const miss = res.feelingsMissing.length
											? ` (${res.feelingsMissing.length} id(s) not found)`
											: '';
										snack.success(`Saved — ${bits.join(' · ') || 'nothing changed'}${miss}.`);
										if (res.feelingsUpdatedSlugs.length) {
											setWriteups((prev) => clearDebriefWriteups(res.feelingsUpdatedSlugs, prev));
											setHabitDrafts((prev) => clearDebriefHabits(res.feelingsUpdatedSlugs, prev));
										}
										await router.invalidate();
									}}
								/>
							) : null}
						</li>
					</ol>
					<FuelSuggestionsDialog
						suggestions={fuelSuggestions}
						onClose={() => {
							setFuelSuggestions([]);
							if (bodySuggestionsQueued.length) {
								setBodySuggestions(bodySuggestionsQueued);
								setBodySuggestionsQueued([]);
							}
						}}
					/>
					<BodySuggestionsDialog
						suggestions={bodySuggestions}
						onClose={() => setBodySuggestions([])}
					/>
				</Panel>
			)}

			{tab === 'plan' && <PlanWeekPanel planData={planData} />}

			{tab === 'generate' && authed && (
				<>
					<Panel form className="mb-4">
						<Field as="div" label="History window">
							<div className="flex flex-wrap items-center gap-x-6 gap-y-[0.55rem]">
								<DateRangeFilter range={range} to="/coach" defaultKind={DEFAULT_BRIEF_RANGE} />
							</div>
						</Field>
						<p className={cn('text-muted', 'mt-[0.4rem] mb-0 text-[0.88rem]')}>
							Activity window: {range.label.toLowerCase()}. Long-term totals always included.{' '}
							{planData.activeGoal ? (
								<>
									Week {planData.generateWeek} of {planData.calendar.weekCount} toward{' '}
									{planData.activeGoal.name}.
								</>
							) : null}{' '}
							<Link className="text-accent-fg font-semibold" to="/goals">
								Goals
							</Link>
							{mixDirty ? (
								<>
									{' · '}
									<Link
										className="text-accent-fg font-semibold"
										to="/coach"
										search={withCoachSearch(search, { tab: 'training' })}
									>
										Unsaved week setup
									</Link>
								</>
							) : null}
						</p>
						<GenerateBriefForm
							weekPhrase={weekPhrase}
							mixNote={generateDraft.mixNote}
							question={generateDraft.question ?? defaultQ}
							questionPlaceholder={defaultQ}
							hasBrief={Boolean(generateDraft.brief)}
							onMixNoteChange={(mixNote) => patchGenerateDraft({ mixNote })}
							onQuestionChange={(question) =>
								patchGenerateDraft({ question: question === defaultQ ? null : question })
							}
							onGenerate={generateBrief}
						/>
					</Panel>

					{generateDraft.brief && (
						<Panel form>
							<PanelTitle className="m-0 mb-2 pb-0 border-b-0">Prompt</PanelTitle>
							<AiPromptFlow
								className="mt-2"
								prompt={generateDraft.brief}
								promptEditable
								onPromptChange={(brief) => patchGenerateDraft({ brief })}
								promptRows={16}
								afterCopy={
									<IconLabelButton
										label="Download .md"
										icon={<Icon name="download" size={16} />}
										onClick={download}
									/>
								}
							/>
						</Panel>
					)}

					<JsonPasteForm
						className="mt-4"
						title={`Save ${weekPhrase}’s plan`}
						description={
							<p className={cn('text-muted', 'mt-[0.3rem]')}>
								Paste the JSON block your AI returned — merged by week number. Check that pinned
								activities kept their day.
							</p>
						}
						placeholder='{ "week": 3, "dates": "…", "phase": "build", "focus": "…", "sessions": [ … ] }'
						submitLabel="Add to plan"
						errorLabel="Could not save plan."
						onSubmit={async (json) => {
							const res = await savePlanWeeks({ data: json });
							snack.success(
								`Saved — plan now has ${res.weeks} weeks (updated week ${res.updated.join(', ')}).`
							);
							await router.invalidate();
						}}
					/>
				</>
			)}
			{leaveGuard}
		</>
	);
}

function GenerateBriefForm({
	weekPhrase,
	mixNote,
	question,
	questionPlaceholder,
	hasBrief,
	onMixNoteChange,
	onQuestionChange,
	onGenerate
}: {
	weekPhrase: string;
	mixNote: string;
	question: string;
	questionPlaceholder: string;
	hasBrief: boolean;
	onMixNoteChange: (text: string) => void;
	onQuestionChange: (text: string) => void;
	onGenerate: (mixNote: string, question: string) => Promise<void>;
}) {
	const [busy, setBusy] = useState(false);

	return (
		<Form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				if (busy) return;
				setBusy(true);
				void onGenerate(mixNote, question).finally(() => setBusy(false));
			}}
		>
			<Field
				label={`Anything unusual ${weekPhrase}? (optional)`}
				hint="Logged extras that did not match the plan are included automatically. Use this for extras that have not happened yet."
			>
				<Textarea
					rows={2}
					placeholder="e.g. extra walk Wednesday, considering a Saturday bike instead of the hike-prep walk"
					value={mixNote}
					onChange={(e) => onMixNoteChange(e.target.value)}
				/>
			</Field>
			<Field label="Your question for the AI">
				<Textarea
					rows={3}
					placeholder={questionPlaceholder}
					value={question}
					onChange={(e) => onQuestionChange(e.target.value)}
				/>
			</Field>
			<Actions>
				<Button type="submit" variant="primary" disabled={busy}>
					<Icon name="sparkle" size={16} />
					{busy ? 'Building…' : hasBrief ? 'Regenerate prompt' : 'Generate prompt'}
				</Button>
			</Actions>
		</Form>
	);
}
