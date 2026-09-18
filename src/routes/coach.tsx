import { activityLabel } from '$lib/activity';
import { useAuthed } from '$lib/auth';
import { dateRangeFromSearch, type RangeKind } from '$lib/date-range';
import { composeDebriefPrompt } from '$lib/debrief';
import {
	clearDebriefWriteups,
	readDebriefWriteups,
	writeDebriefWriteups
} from '$lib/debrief-writeups';
import {
	formatAllWeeksClipboard,
	formatWeekPlanClipboard,
	isoDateLocal,
	planWeekDateRange,
	planWeekDateRangeShort
} from '$lib/plan';
import {
	getCoachBrief,
	getCoachPlan,
	getDebriefPrompt,
	getWeekPattern,
	saveDebrief,
	savePlanWeeks,
	saveWeekPattern
} from '$lib/server/functions';
import type { GearContext, GearKind, GearWear } from '$lib/gear';
import { appHead } from '$lib/title';
import { cn, ui } from '$lib/ui';
import {
	formatPatternProse,
	patternsEqual,
	type WeekPattern
} from '$lib/week-mix';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { DateRangeFilter, type RangeSearch } from '../components/DateRangeFilter';
import { DebriefFeelForm } from '../components/DebriefFeelForm';
import { DebriefRacePanel } from '../components/DebriefRacePanel';
import { DeferredData } from '../components/DeferredData';
import { GpxImport } from '../components/GpxImport';
import { Icon } from '../components/Icon';
import { PageHero } from '../components/PageHero';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { Select } from '../components/Select';
import { errorMessage, useSnackbar } from '../components/Snackbar';
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
	slug?: string;
	planWeek?: number;
	includePlan?: boolean;
};

const RANGE_KINDS: RangeKind[] = ['7d', '30d', 'all', 'custom'];

function withCoachSearch(search: CoachSearch, extra: Partial<CoachSearch> = {}): CoachSearch {
	const slug = extra.slug !== undefined ? extra.slug : search.slug;
	const includePlan = extra.includePlan !== undefined ? extra.includePlan : search.includePlan;
	return {
		tab: extra.tab ?? search.tab,
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

function parseTab(v: unknown): CoachTab {
	if (v === 'training' || v === 'plan' || v === 'generate' || v === 'debrief') return v;
	return 'training';
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

function visibleTab(tab: CoachTab | undefined, authed: boolean): CoachTab {
	const next = tab ?? 'training';
	if ((next === 'debrief' || next === 'generate') && !authed) return 'training';
	return next;
}

type DebriefPrompt = Awaited<ReturnType<typeof getDebriefPrompt>>;
type CoachPlanData = Awaited<ReturnType<typeof getCoachPlan>>;

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
	const [planJson, setPlanJson] = useState('');

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

	async function savePastedPlan() {
		try {
			const res = await savePlanWeeks({ data: planJson });
			snack.success(
				`Saved — plan now has ${res.weeks} weeks (updated week ${res.updated.join(', ')}).`
			);
			setPlanJson('');
			router.invalidate();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not save plan.'));
		}
	}

	const todayIso = isoDateLocal(new Date());

	return (
		<>
			<div className={cn(ui.panel, ui.form, 'mb-4')}>
				<div className={ui.field}>
					<span>Week</span>
					<div className="hidden max-sm:flex flex-col gap-[0.35rem]">
						<div className="flex items-stretch gap-2">
							<button
								type="button"
								className={cn(ui.btnGhost, ui.btnIcon)}
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
								className={cn(ui.btnGhost, ui.btnIcon)}
								aria-label="Next week"
								disabled={selected >= weekCount}
								onClick={() => setWeek(selected + 1)}
							>
								<Icon name="arrow" size={18} />
							</button>
						</div>
						<p className={cn(ui.muted, 'm-0 text-[0.82rem]')}>
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
				</div>
				<p className={cn(ui.muted, 'm-0 max-sm:hidden')}>
					Copy this week (live status plus JSON) into a new chat, or every week that already
					has sessions. Paste an updated JSON block back below.
				</p>
				<div className={ui.actions}>
					<button
						className={ui.btnGhost}
						type="button"
						disabled={!view}
						onClick={() => view && copyText('week', formatWeekPlanClipboard(view, todayIso))}
					>
						<Icon name={copied === 'week' ? 'check' : 'copy'} size={16} />
						{copied === 'week' ? 'Copied' : 'Copy this week'}
					</button>
					<button
						className={ui.btnGhost}
						type="button"
						disabled={!planData.views.length}
						onClick={() => copyText('all', formatAllWeeksClipboard(planData.views, todayIso))}
					>
						<Icon name={copied === 'all' ? 'check' : 'copy'} size={16} />
						{copied === 'all' ? 'Copied' : (
							<>
								<span className="max-sm:hidden">Copy all planned weeks</span>
								<span className="hidden max-sm:inline">Copy all weeks</span>
							</>
						)}
					</button>
				</div>
			</div>
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
				<p className={cn(ui.muted, 'mt-0 mb-4')}>
					Week {selected} ({planWeekDateRange(selected, planData.calendar)}) is not in the plan yet.
				</p>
			)}
			{authed && (
				<div className={cn(ui.panel, ui.form, 'mt-4')}>
					<h3>Paste updated JSON</h3>
					<p className={cn(ui.muted, 'mt-[0.3rem]')}>
						Same shape as Generate — one week object or an array of weeks. Merged by week
						number.
					</p>
					<label className={ui.field}>
						<textarea
							className={ui.editor}
							rows={8}
							placeholder='{ "week": 5, "dates": "…", "phase": "build", "focus": "…", "sessions": [ … ] }'
							value={planJson}
							onChange={(e) => setPlanJson(e.target.value)}
						/>
					</label>
					<div className={ui.actions}>
						<button
							className={ui.btnPrimary}
							type="button"
							onClick={savePastedPlan}
							disabled={!planJson.trim()}
						>
							<Icon name="plus" size={16} />
							Add to plan
						</button>
					</div>
				</div>
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
		slug: typeof s.slug === 'string' && s.slug ? s.slug : undefined,
		planWeek: parsePlanWeek(s.planWeek),
		includePlan: s.includePlan === true || s.includePlan === 'true' || s.includePlan === '1' ? true : undefined
	}),
	// Search (tab, range, slug) must not remount DeferredData/Await — that felt like a full refresh.
	loaderDeps: () => ({}),
	loader: ({ location }) => {
		const search = location.search as CoachSearch;
		const slug = search.slug ?? '';
		const includePlan = search.includePlan === true;
		return {
			page: Promise.all([
				getDebriefPrompt({ data: { slug, includePlan } }),
				getWeekPattern(),
				getCoachPlan()
			]).then(([debrief, weekPattern, planData]) => ({ debrief, weekPattern, planData }))
		};
	},
	head: () => appHead('Coach'),
	component: Coach
});

function Coach() {
	const { page } = Route.useLoaderData();
	const search = Route.useSearch();
	const router = useRouter();
	const authed = useAuthed();
	const tab = visibleTab(search.tab, authed);

	function setTab(next: CoachTab) {
		router.navigate({
			to: '/coach',
			search: withCoachSearch(search, {
				tab: next,
				slug: next === 'debrief' ? search.slug : ''
			}),
			replace: true,
			resetScroll: false
		});
	}

	return (
		<>
			<div className={ui.coachTabs}>
				<SegmentedToggle
					fill
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
			</div>

			<PageHero
				variant="quiet"
				className="max-sm:hidden"
				kicker="This week"
				title="Coach"
				lead="Usual week and the plan. With a race on Goals, the block runs through race week. Without one, generate this week as base training."
			/>

			<DeferredData promise={page}>
				{(data) => (
					<CoachPanels
						debrief={data.debrief}
						initialPattern={data.weekPattern}
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
	initialPattern,
	planData,
	gear,
	gearWear
}: {
	debrief: DebriefPrompt;
	initialPattern: WeekPattern;
	planData: CoachPlanData;
	gear: GearContext;
	gearWear: Record<GearKind, Record<string, GearWear>>;
}) {
	const search = Route.useSearch();
	const router = useRouter();
	const snack = useSnackbar();
	const range = dateRangeFromSearch(search);
	const authed = useAuthed();
	const tab = visibleTab(search.tab, authed);
	const slug = search.slug ?? '';
	const includePlan = search.includePlan === true;

	const [question, setQuestion] = useState(() =>
		defaultQuestion(planData.generateWeek > planData.currentWeek)
	);
	const [copied, setCopied] = useState(false);
	const [briefText, setBriefText] = useState('');
	const [planJson, setPlanJson] = useState('');

	const [debrief, setDebrief] = useState(initialDebrief);
	const [writeups, setWriteups] = useState(readDebriefWriteups);
	const [debriefPrompt, setDebriefPrompt] = useState(() =>
		composeDebriefPrompt(
			initialDebrief.prompt,
			initialDebrief.runs?.length
				? initialDebrief.runs
				: initialDebrief.run
					? [initialDebrief.run]
					: [],
			{}
		)
	);
	const [debriefJson, setDebriefJson] = useState('');
	const [debriefCopied, setDebriefCopied] = useState(false);

	const [usual, setUsual] = useState<SlotRow[]>(() => rowsFrom(initialPattern));
	const [savedPattern, setSavedPattern] = useState<WeekPattern>(initialPattern);
	const [mixNote, setMixNote] = useState('');
	const [mixBusy, setMixBusy] = useState(false);
	const mixBusyRef = useRef(false);
	const [briefBusy, setBriefBusy] = useState(false);

	// Fresh loader data (e.g. after save) replaces the debrief prompt.
	useEffect(() => {
		setDebrief(initialDebrief);
	}, [initialDebrief]);

	// Soft slug updates (e.g. after GPX import) refresh the prompt without remounting the page.
	const slugHydrated = useRef<string | null>(null);
	useEffect(() => {
		const key = `${slug}|${includePlan ? '1' : '0'}`;
		if (slugHydrated.current === null) {
			slugHydrated.current = key;
			return;
		}
		if (slugHydrated.current === key) return;
		slugHydrated.current = key;
		let cancelled = false;
		getDebriefPrompt({ data: { slug, includePlan } }).then((next) => {
			if (cancelled) return;
			setDebrief(next);
		});
		return () => {
			cancelled = true;
		};
	}, [slug, includePlan]);

	useEffect(() => {
		const featured = debrief.runs?.length ? debrief.runs : debrief.run ? [debrief.run] : [];
		setDebriefPrompt(composeDebriefPrompt(debrief.prompt, featured, writeups));
	}, [debrief, writeups]);

	async function savePlan() {
		try {
			const res = await savePlanWeeks({ data: planJson });
			snack.success(`Saved — plan now has ${res.weeks} weeks (updated week ${res.updated.join(', ')}).`);
			setPlanJson('');
			router.invalidate();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not save plan.'));
		}
	}

	async function saveDebriefReply() {
		try {
			const res = await saveDebrief({ data: debriefJson });
			const bits: string[] = [];
			if (res.feelingsUpdated) {
				bits.push(
					`feelings on ${res.feelingsUpdated} activit${res.feelingsUpdated === 1 ? 'y' : 'ies'}`
				);
			}
			if (res.planUpdated.length) bits.push(`week ${res.planUpdated.join(', ')} updated`);
			const miss = res.feelingsMissing.length
				? ` (${res.feelingsMissing.length} slug(s) not found)`
				: '';
			snack.success(`Saved — ${bits.join(' · ') || 'nothing changed'}${miss}.`);
			setDebriefJson('');
			if (res.feelingsUpdatedSlugs.length) {
				setWriteups((prev) => clearDebriefWriteups(res.feelingsUpdatedSlugs, prev));
			}
			router.invalidate();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not save debrief.'));
		}
	}

	const runs = debrief.runs?.length ? debrief.runs : debrief.run ? [debrief.run] : [];
	const many = runs.length > 1;
	const allWrote =
		runs.length > 0 && runs.every((r) => (writeups[r.slug] ?? '').trim() !== '');

	function setWriteup(slugKey: string, text: string) {
		setWriteups((prev) => {
			const next = { ...prev };
			if (text) next[slugKey] = text;
			else delete next[slugKey];
			writeDebriefWriteups(next);
			return next;
		});
	}

	async function refreshDebrief() {
		const next = await getDebriefPrompt({ data: { slug, includePlan } });
		setDebrief(next);
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
	const usualPattern = toPattern(usual);
	const mixDirty = !patternsEqual(usualPattern, savedPattern);

	async function generateBrief() {
		setBriefBusy(true);
		try {
			const next = await getCoachBrief({
				data: {
					range: range.kind,
					from: range.from,
					to: range.to,
					pattern: usualPattern,
					defaultPattern: savedPattern,
					note: mixNote
				}
			});
			setBriefText(`${next}\n## My question\n${question.trim() || defaultQ}\n`);
		} catch (e) {
			snack.error(errorMessage(e, 'Could not build the prompt.'));
		} finally {
			setBriefBusy(false);
		}
	}

	async function saveDefaultMix() {
		if (mixBusyRef.current) return;
		mixBusyRef.current = true;
		setMixBusy(true);
		try {
			const saved = await saveWeekPattern({ data: usualPattern });
			setSavedPattern(saved);
			setUsual(rowsFrom(saved));
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
		const blob = new Blob([briefText], { type: 'text/markdown;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `the-long-run-context-${date}.md`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}

	async function copy() {
		try {
			await navigator.clipboard.writeText(briefText);
			setCopied(true);
			setTimeout(() => setCopied(false), 1800);
		} catch {
			/* ignore */
		}
	}

	async function copyDebrief() {
		try {
			await navigator.clipboard.writeText(debriefPrompt);
			setDebriefCopied(true);
			setTimeout(() => setDebriefCopied(false), 1800);
		} catch {
			/* ignore */
		}
	}

	return (
		<>
			{tab === 'training' && (
				<div className={cn(ui.panel, ui.form, 'mb-4')}>
					<div className={ui.field}>
						<span>Usual week</span>
						<span className={cn(ui.muted, 'font-normal')}>
							Day and sport — the AI chooses easy / quality / long / etc. plus distance. Mark a
							session can't change (commute) or optional, and add notes the coach will see. Change
							days for this week without saving; Generate will use them. Save only if this should
							become your default.
						</span>
						<span className={cn(ui.muted, 'font-normal')}>
							Saved default is {formatPatternProse(savedPattern)}.
						</span>
						{authed ? (
							<WeekPatternEditor
								rows={usual}
								disabled={mixBusy}
								onChange={setUsual}
							/>
						) : null}
					</div>
					{authed && (mixDirty || mixBusy) && (
						<>
							<p className={cn(ui.muted, 'm-0')}>
								Unsaved — Generate will plan this week with these days, not your saved usual week.
							</p>
							<div className={cn(ui.actions, 'mt-[0.35rem]')}>
								<button
									className={ui.btnGhost}
									type="button"
									onClick={() => setUsual(rowsFrom(savedPattern))}
									disabled={mixBusy}
								>
									Revert to saved
								</button>
								<button
									className={ui.btnPrimary}
									type="button"
									onClick={saveDefaultMix}
									disabled={mixBusy}
									aria-busy={mixBusy}
								>
									<Icon name={mixBusy ? 'calendar' : 'check'} size={16} />
									{mixBusy ? 'Saving…' : 'Save as my default week'}
								</button>
							</div>
						</>
					)}
				</div>
			)}

			{tab === 'debrief' && (
				<>
					<ol className="list-none m-0 p-0 flex flex-col gap-6 max-sm:gap-[1.15rem] [&>li>strong]:block [&>li>strong]:text-[1.05rem] [&_li.done>strong]:text-accent-fg">
						<li className={runs.length ? 'done' : 'current'}>
							<strong>1. Import the GPX</strong>
							<span className={cn(ui.muted, 'block mt-1')}>
								Download from Strava, then drop it here. One file or several — they all go into the
								prompt, along with other this-week sessions that still need a write-up.
							</span>
							{runs.length > 0 && (
								<div className="mt-[0.45rem] mb-0 font-semibold max-sm:[overflow-wrap:anywhere]">
									<p className="m-0">
										{many ? `${runs.length} activities in the prompt:` : 'In the prompt:'}
									</p>
									<ul className="list-none m-[0.35rem_0_0] p-0 grid gap-1">
										{runs.map((r) => (
											<li key={r.slug}>
												<Link to="/runs/$slug" params={{ slug: r.slug }}>
													{r.date}
													{r.day ? ` · ${r.day}` : ''}
													{r.activity_type ? ` · ${activityLabel(r.activity_type)}` : ''}
													{r.distance_km != null ? ` · ${r.distance_km} km` : ''}
												</Link>
												{r.hasFeel ? ' · feel already saved' : ' · no feel yet'}
											</li>
										))}
									</ul>
								</div>
							)}
							<div className={cn(ui.panel, ui.form, 'mt-3')}>
								{authed ? (
									<GpxImport
										onImported={(ok) => {
											const slugs = ok
												.map((r) => r.slug)
												.filter((s): s is string => Boolean(s));
											if (slugs.length) {
												router.navigate({
													to: '/coach',
													search: withCoachSearch(search, {
														tab: 'debrief',
														slug: slugs.join(',')
													}),
													replace: true,
													resetScroll: false
												});
											}
										}}
									/>
								) : (
									<p className={cn(ui.muted, 'm-0')}>Sign in to import a GPX.</p>
								)}
							</div>
							<p className={cn(ui.muted, 'mt-2')}>
								No GPS?{' '}
								<Link to="/import" search={{ mode: 'manual' }}>
									Log manually
								</Link>
								.
							</p>
						</li>
						<li className={runs.length ? (allWrote ? 'done' : 'current') : undefined}>
							<strong>2. How it felt</strong>
							<span className={cn(ui.muted, 'block mt-1')}>
								Write how it felt — GPS numbers are already in the prompt. Under each activity,
								add session, cadence, and gear when Strava did not (or tap scores yourself). For
								races, pin the result and add bib / results when prompted.
							</span>
							{runs.length > 0 &&
								runs.map((r) => (
									<div key={r.slug}>
										<DebriefFeelForm
											run={r}
											heading={
												many
													? `${r.date}${r.day ? ` · ${r.day}` : ''}${r.activity_type ? ` · ${activityLabel(r.activity_type)}` : ''}${r.distance_km != null ? ` · ${r.distance_km} km` : ''}`
													: undefined
											}
											writeup={writeups[r.slug] ?? ''}
											gear={gear}
											gearWear={gearWear}
											onWriteupChange={(text) => setWriteup(r.slug, text)}
											onSaved={refreshDebrief}
										/>
										{(() => {
											const raceHint = debrief.raceBySlug[r.slug];
											return raceHint ? (
												<DebriefRacePanel
													hint={raceHint}
													runSlug={r.slug}
													onSaved={refreshDebrief}
												/>
											) : null;
										})()}
									</div>
								))}
							{!runs.length && (
								<p className={cn(ui.muted, 'mt-[0.4rem]')}>
									Import a GPX (or log manually) first.
								</p>
							)}
						</li>
						<li className={runs.length && debriefPrompt ? 'current' : undefined}>
							<strong>3. Copy the prompt</strong>
							<span className={cn(ui.muted, 'block mt-1')}>
								{includePlan
									? 'Paste into your AI. It will give advice first (including any questions you asked), then JSON with a notes summary, any scores it read from your write-up, and the rest of the week. Distance, time, elevation, and pace per km are already in the prompt — no screenshots.'
									: 'Paste into your AI. It will give advice first (including any questions you asked), then JSON with a notes summary and any scores it read from your write-up. The prompt also tells the AI to return an updated week if remaining sessions should change — even with “Include this week’s plan” off. Distance, time, elevation, and pace per km are already in the prompt — no screenshots.'}
							</span>
							{debrief.error && !debriefPrompt && (
								<p className={cn(ui.muted, 'mt-[0.4rem]')}>{debrief.error}</p>
							)}
							{debriefPrompt && (
								<div className={cn(ui.panel, ui.form, 'mt-3')}>
									<label className="flex items-start gap-3 cursor-pointer m-0 select-none">
										<input
											className="mt-1 size-5 shrink-0 accent-[var(--accent,#c8f25a)]"
											type="checkbox"
											checked={includePlan}
											onChange={(e) => setIncludePlan(e.target.checked)}
										/>
										<span>
											<span className="block text-fg font-semibold">Include this week’s plan</span>
											<span className={cn(ui.muted, 'block font-normal')}>
												Turn on for a new chat so the coach sees this week’s sessions (and can
												return an updated week). Leave off if you are continuing a chat that
												already has the plan — that keeps the prompt smaller.
											</span>
										</span>
									</label>
									<label className={ui.field}>
										<textarea
											className={ui.editor}
											rows={14}
											value={debriefPrompt}
											onChange={(e) => setDebriefPrompt(e.target.value)}
										/>
									</label>
									<div className={ui.actions}>
										<button className={ui.btnPrimary} type="button" onClick={copyDebrief}>
											<Icon name={debriefCopied ? 'check' : 'copy'} size={16} />
											{debriefCopied ? 'Copied' : 'Copy prompt'}
										</button>
									</div>
								</div>
							)}
						</li>
						<li>
							<strong>4. Paste the AI’s JSON</strong>
							<span className={cn(ui.muted, 'block mt-1')}>
								{includePlan
									? 'A short notes summary for this activity plus the updated rest of the week. Days can change. Advice stays in the chat — only the JSON is saved.'
									: 'A short notes summary for this activity, and an updated week if remaining sessions should change. Advice stays in the chat — only the JSON is saved.'}
							</span>
							{authed ? (
								<div className={cn(ui.panel, ui.form, 'mt-3')}>
									<label className={ui.field}>
										<textarea
											className={ui.editor}
											rows={8}
											placeholder={
												includePlan
													? '{ "feelings": { "slug": "…", "notes": "…" }, "week": { "week": 3, "sessions": [ … ] } }'
													: '{ "feelings": { "slug": "…", "notes": "…" } }'
											}
											value={debriefJson}
											onChange={(e) => setDebriefJson(e.target.value)}
										/>
									</label>
									<div className={ui.actions}>
										<button
											className={ui.btnPrimary}
											type="button"
											onClick={saveDebriefReply}
											disabled={!debriefJson.trim()}
										>
											<Icon name="check" size={16} />
											Save reply
										</button>
									</div>
								</div>
							) : null}
						</li>
					</ol>
				</>
			)}

			{tab === 'plan' && (
				<PlanWeekPanel planData={planData} />
			)}

			{tab === 'generate' && authed && (
				<>
					<div className={cn(ui.panel, ui.form, 'mb-4')}>
						<div className={ui.field}>
							<span>History window</span>
							<div className="flex flex-wrap items-center gap-x-6 gap-y-[0.55rem]">
								<DateRangeFilter range={range} to="/coach" />
							</div>
						</div>
						<p className={cn(ui.muted, 'mt-[0.4rem] mb-0')}>
							Weekly volume and the activity table both cover {range.label.toLowerCase()}. Shorter
							windows keep the prompt tighter.
							{planData.activeGoal
								? ` Generating week ${planData.generateWeek} of ${planData.calendar.weekCount} toward ${planData.activeGoal.name}.`
								: ' No race on the calendar — this prompt is a base week.'}{' '}
							<Link className="text-accent-fg font-semibold" to="/goals">
								Goals
							</Link>
							.
						</p>
						<p className={cn(ui.muted, 'mt-2 mb-0')}>
							{mixDirty ? (
								<>
									{weekPhraseCap}: {formatPatternProse(usualPattern)} — not saved as your usual week
									({formatPatternProse(savedPattern)}).
								</>
							) : (
								<>{weekPhraseCap} uses your usual days: {formatPatternProse(savedPattern)}.</>
							)}{' '}
							<Link
								className="text-accent-fg font-semibold"
								to="/coach"
								search={withCoachSearch(search, { tab: 'training' })}
							>
								Edit in Training
							</Link>
							.
						</p>
						<label className={ui.field}>
							<span>Anything unusual {weekPhrase}? (optional)</span>
							<span className={cn(ui.muted, 'font-normal')}>
								Logged extras that did not match the plan are included automatically. Use this
								for extras that have not happened yet.
							</span>
							<textarea
								placeholder="e.g. extra walk Wednesday, considering a Saturday bike instead of the hike-prep walk"
								value={mixNote}
								onChange={(e) => setMixNote(e.target.value)}
								rows={2}
							/>
						</label>
						<label className={ui.field}>
							<span>Your question for the AI</span>
							<textarea
								placeholder={defaultQ}
								value={question}
								onChange={(e) => setQuestion(e.target.value)}
								rows={3}
							/>
						</label>
						<div className={ui.actions}>
							<button
								className={ui.btnPrimary}
								type="button"
								onClick={generateBrief}
								disabled={briefBusy}
							>
								<Icon name="sparkle" size={16} />
								{briefBusy
									? 'Building…'
									: briefText
										? 'Regenerate prompt'
										: 'Generate prompt'}
							</button>
						</div>
					</div>

					{briefText && (
						<div className={cn(ui.panel, ui.form)}>
							<h3>Prompt (editable — tweak before you copy)</h3>
							<label className={cn(ui.field, 'mt-2')}>
								<textarea
									className={ui.editor}
									rows={16}
									value={briefText}
									onChange={(e) => setBriefText(e.target.value)}
								/>
							</label>
							<div className={ui.actions}>
								<button className={ui.btnPrimary} type="button" onClick={download}>
									<Icon name="download" size={16} />
									Download .md
								</button>
								<button className={ui.btnGhost} type="button" onClick={copy}>
									<Icon name={copied ? 'check' : 'copy'} size={16} />
									{copied ? 'Copied' : 'Copy'}
								</button>
							</div>
						</div>
					)}

					<div className={cn(ui.panel, ui.form, 'mt-4')}>
						<h3>Save {weekPhrase}’s plan</h3>
						<p className={cn(ui.muted, 'mt-[0.3rem]')}>
							Paste the JSON block your AI returned — merged by week number. Keep your usual
							days unless the reply explained a shift.
						</p>
						<label className={ui.field}>
							<textarea
								className={ui.editor}
								rows={8}
								placeholder='{ "week": 3, "dates": "…", "phase": "build", "focus": "…", "sessions": [ … ] }'
								value={planJson}
								onChange={(e) => setPlanJson(e.target.value)}
							/>
						</label>
						<div className={ui.actions}>
							<button
								className={ui.btnPrimary}
								type="button"
								onClick={savePlan}
								disabled={!planJson.trim()}
							>
								<Icon name="plus" size={16} />
								Add to plan
							</button>
						</div>
					</div>
				</>
			)}
		</>
	);
}
