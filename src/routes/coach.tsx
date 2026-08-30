import { useAuthed } from '$lib/auth';
import { dateRangeFromSearch, type RangeKind } from '$lib/date-range';
import { PLAN_WEEK_COUNT, planWeekDateRange } from '$lib/plan';
import {
    getCoachBrief,
    getCoachPlan,
    getDebriefPrompt,
    getWeekPattern,
    saveDebrief,
    savePlanWeeks,
    saveWeekPattern
} from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import {
    formatPatternProse,
    patternsEqual,
    type WeekPattern
} from '$lib/week-mix';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { ChoiceChips } from '../components/ChoiceChips';
import { DateRangeFilter, type RangeSearch } from '../components/DateRangeFilter';
import { DeferredData } from '../components/DeferredData';
import { GpxImport } from '../components/GpxImport';
import { errorMessage, useSnackbar } from '../components/Snackbar';
import {
    rowsFrom,
    toPattern,
    WeekPatternEditor,
    type SlotRow
} from '../components/WeekPatternEditor';
import { WeekPlanBoard } from '../components/WeekPlanBoard';

type CoachTab = 'training' | 'debrief' | 'plan' | 'generate';
type CoachSearch = RangeSearch & { tab?: CoachTab; slug?: string; planWeek?: number };

const RANGE_KINDS: RangeKind[] = ['7d', '30d', 'all', 'custom'];

function withCoachSearch(search: CoachSearch, extra: Partial<CoachSearch> = {}): CoachSearch {
	const slug = extra.slug !== undefined ? extra.slug : search.slug;
	return {
		tab: extra.tab ?? search.tab,
		slug: slug || undefined,
		planWeek: extra.planWeek !== undefined ? extra.planWeek : search.planWeek,
		range: extra.range !== undefined ? extra.range : search.range,
		from: extra.from !== undefined ? extra.from : search.from,
		to: extra.to !== undefined ? extra.to : search.to
	};
}

function defaultQuestion(): string {
	return `What should this week look like? Keep my usual days and sports. You pick the session kind (easy / quality / long / etc.), distance and intent. If you shift a day, say why.`;
}

function parseTab(v: unknown): CoachTab {
	if (v === 'training' || v === 'plan' || v === 'generate' || v === 'debrief') return v;
	return 'training';
}

function parsePlanWeek(v: unknown): number | undefined {
	const n = Number(v);
	if (!Number.isFinite(n)) return undefined;
	const week = Math.floor(n);
	if (week < 1 || week > PLAN_WEEK_COUNT) return undefined;
	return week;
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
	const current = planData.currentWeek;
	const upcomingWeek = planData.views.find((v) => v.next)?.week.week ?? current;
	const selected = search.planWeek ?? upcomingWeek;
	const byWeek = new Map(planData.views.map((v) => [v.week.week, v]));
	const view = byWeek.get(selected) ?? null;

	function setWeek(n: number) {
		const week = Math.min(PLAN_WEEK_COUNT, Math.max(1, n));
		router.navigate({
			to: '/coach',
			search: withCoachSearch(search, { tab: 'plan', planWeek: week }),
			replace: true,
			resetScroll: false
		});
	}

	return (
		<>
			<div className={cn(ui.panel, ui.form, 'mb-4')}>
				<div className={ui.field}>
					<span>Week</span>
					<ChoiceChips
						aria-label="Plan week"
						value={String(selected)}
						options={Array.from({ length: PLAN_WEEK_COUNT }, (_, i) => {
							const n = i + 1;
							const planned = byWeek.has(n);
							return {
								value: String(n),
								label:
									n === current
										? `${n} · now`
										: n === upcomingWeek && n !== current
											? `${n} · next`
											: planned
												? String(n)
												: `${n} · —`
							};
						})}
						onChange={(value) => setWeek(Number(value))}
					/>
				</div>
			</div>
			{view ? (
				<WeekPlanBoard
					view={view}
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
					Week {selected} ({planWeekDateRange(selected)}) is not in the plan yet.
				</p>
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
		planWeek: parsePlanWeek(s.planWeek)
	}),
	// Search (tab, range, slug) must not remount DeferredData/Await — that felt like a full refresh.
	loaderDeps: () => ({}),
	loader: ({ location }) => {
		const slug = (location.search as CoachSearch).slug ?? '';
		return {
			page: Promise.all([
				getDebriefPrompt({ data: slug }),
				getWeekPattern(),
				getCoachPlan()
			]).then(([debrief, weekPattern, planData]) => ({ debrief, weekPattern, planData }))
		};
	},
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
			<section className={ui.hero}>
				<div>
					<p className={ui.muted}>This week</p>
					<h1>Coach</h1>
					<p>
						Usual week and the plan toward the race. After a race, debrief so the next sessions stay
						current.
					</p>
				</div>
			</section>

			<div className={ui.coachTabs} role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'training'}
					className={cn(ui.coachTab, tab === 'training' && ui.coachTabActive)}
					onClick={() => setTab('training')}
				>
					Training
				</button>
				{authed && (
					<button
						type="button"
						role="tab"
						aria-selected={tab === 'generate'}
						className={cn(ui.coachTab, tab === 'generate' && ui.coachTabActive)}
						onClick={() => setTab('generate')}
					>
						Generate
					</button>
				)}
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'plan'}
					className={cn(ui.coachTab, tab === 'plan' && ui.coachTabActive)}
					onClick={() => setTab('plan')}
				>
					Plan
				</button>
				{authed && (
					<button
						type="button"
						role="tab"
						aria-selected={tab === 'debrief'}
						className={cn(ui.coachTab, tab === 'debrief' && ui.coachTabActive)}
						onClick={() => setTab('debrief')}
					>
						After a race
					</button>
				)}
			</div>
			<DeferredData promise={page}>
				{(data) => (
					<CoachPanels
						debrief={data.debrief}
						initialPattern={data.weekPattern}
						planData={data.planData}
					/>
				)}
			</DeferredData>
		</>
	);
}

function CoachPanels({
	debrief: initialDebrief,
	initialPattern,
	planData
}: {
	debrief: DebriefPrompt;
	initialPattern: WeekPattern;
	planData: CoachPlanData;
}) {
	const search = Route.useSearch();
	const router = useRouter();
	const snack = useSnackbar();
	const range = dateRangeFromSearch(search);
	const authed = useAuthed();
	const tab = visibleTab(search.tab, authed);
	const slug = search.slug ?? '';

	const [question, setQuestion] = useState(() => defaultQuestion());
	const [copied, setCopied] = useState(false);
	const [briefText, setBriefText] = useState('');
	const [planJson, setPlanJson] = useState('');

	const [debrief, setDebrief] = useState(initialDebrief);
	const [debriefPrompt, setDebriefPrompt] = useState(initialDebrief.prompt);
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
		setDebriefPrompt(initialDebrief.prompt);
	}, [initialDebrief]);

	// Soft slug updates (e.g. after GPX import) refresh the prompt without remounting the page.
	const slugHydrated = useRef<string | null>(null);
	useEffect(() => {
		if (slugHydrated.current === null) {
			slugHydrated.current = slug;
			return;
		}
		if (slugHydrated.current === slug) return;
		slugHydrated.current = slug;
		let cancelled = false;
		getDebriefPrompt({ data: slug }).then((next) => {
			if (cancelled) return;
			setDebrief(next);
			setDebriefPrompt(next.prompt);
		});
		return () => {
			cancelled = true;
		};
	}, [slug]);

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
			router.invalidate();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not save debrief.'));
		}
	}

	const run = debrief.run;
	const weekPhrase = 'this week';
	const defaultQ = defaultQuestion();
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
							Day and sport only — the AI chooses easy / quality / long / etc. plus distance.
							Change days for this week without saving; Generate will use them. Save only if this
							should become your default.
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
									className={ui.btnPrimary}
									type="button"
									onClick={saveDefaultMix}
									disabled={mixBusy}
									aria-busy={mixBusy}
								>
									{mixBusy ? 'Saving…' : 'Save as my default week'}
								</button>
								<button
									className={ui.btnGhost}
									type="button"
									onClick={() => setUsual(rowsFrom(savedPattern))}
									disabled={mixBusy}
								>
									Revert to saved
								</button>
							</div>
						</>
					)}
					{authed && (
						<p className={cn(ui.muted, 'mb-0')}>
							When this week’s days look right,{' '}
							<Link
								className="text-accent font-semibold"
								to="/coach"
								search={withCoachSearch(search, { tab: 'generate' })}
							>
								generate the prompt
							</Link>
							.
						</p>
					)}
				</div>
			)}

			{tab === 'debrief' && (
				<>
					<ol className="list-none m-0 p-0 flex flex-col gap-6 max-sm:gap-[1.15rem] [&>li>strong]:block [&>li>strong]:text-[1.05rem] [&_li.done>strong]:text-accent">
						<li className={run ? 'done' : 'current'}>
							<strong>1. Import the GPX</strong>
							<span className={cn(ui.muted, 'block mt-1')}>
								Download from Strava, then drop it here. The race needs to be in the app before the
								prompt.
							</span>
							{run && (
								<p className="mt-[0.45rem] mb-0 font-semibold max-sm:[overflow-wrap:anywhere]">
									Latest in the prompt:{' '}
									<Link to="/runs/$slug" params={{ slug: run.slug }}>
										{run.date}
										{run.day ? ` · ${run.day}` : ''}
										{run.distance_km != null ? ` · ${run.distance_km} km` : ''}
									</Link>
									{run.hasFeel ? ' · feel already saved' : ' · no feel yet'}
								</p>
							)}
							<div className={cn(ui.panel, ui.form, 'mt-3')}>
								{authed ? (
									<GpxImport
										onImported={(ok) => {
											const last = ok[ok.length - 1];
											if (last?.slug) {
												router.navigate({
													to: '/coach',
													search: withCoachSearch(search, {
														tab: 'debrief',
														slug: last.slug
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
						<li className={run && debriefPrompt ? 'current' : undefined}>
							<strong>2. Copy the prompt</strong>
							<span className={cn(ui.muted, 'block mt-1')}>
								In ChatGPT: attach the Strava general + pace screenshots, paste this, and say how
								the race felt.
							</span>
							{debrief.error && !debriefPrompt && (
								<p className={cn(ui.muted, 'mt-[0.4rem]')}>{debrief.error}</p>
							)}
							{debriefPrompt && (
								<div className={cn(ui.panel, ui.form, 'mt-3')}>
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
											{debriefCopied ? 'Copied' : 'Copy prompt'}
										</button>
									</div>
								</div>
							)}
						</li>
						<li>
							<strong>3. Paste ChatGPT’s JSON</strong>
							<span className={cn(ui.muted, 'block mt-1')}>
								Feelings for this race plus the updated rest of the week. Days can change.
							</span>
							{authed ? (
							<div className={cn(ui.panel, ui.form, 'mt-3')}>
								<label className={ui.field}>
									<textarea
										className={ui.editor}
										rows={8}
										placeholder='{ "feelings": { "slug": "…" }, "week": { "week": 3, "sessions": [ … ] } }'
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
										Save debrief
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
						</p>
						<p className={cn(ui.muted, 'mt-2 mb-0')}>
							{mixDirty ? (
								<>
									This week: {formatPatternProse(usualPattern)} — not saved as your usual week
									({formatPatternProse(savedPattern)}).
								</>
							) : (
								<>This week uses your usual days: {formatPatternProse(savedPattern)}.</>
							)}{' '}
							<Link
								className="text-accent font-semibold"
								to="/coach"
								search={withCoachSearch(search, { tab: 'training' })}
							>
								Edit in Training
							</Link>
							.
						</p>
						<label className={ui.field}>
							<span>Anything unusual {weekPhrase}? (optional)</span>
							<textarea
								placeholder="e.g. motorcycle training Thursday, skip gym, extra long ride"
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
									Download .md
								</button>
								<button className={ui.btnGhost} type="button" onClick={copy}>
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
								Add to plan
							</button>
						</div>
					</div>
				</>
			)}
		</>
	);
}
