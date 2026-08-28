import { useAuthed } from '$lib/auth';
import { PLAN_WEEK_COUNT, planWeekIndex, weekToPlan } from '$lib/plan';
import {
    getCoachBrief,
    getCurrentWeekView,
    getDebriefPrompt,
    getWeekPattern,
    saveDebrief,
    savePlanWeeks,
    saveWeekPattern
} from '$lib/server/functions';
import {
    formatPatternProse,
    patternsEqual,
    type WeekPattern
} from '$lib/week-mix';
import { cn, ui } from '$lib/ui';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { DeferredData } from '../components/DeferredData';
import { GpxImport } from '../components/GpxImport';
import { ChoiceChips } from '../components/ChoiceChips';
import { WeekPlanBoard } from '../components/WeekPlanBoard';
import {
    rowsFrom,
    toPattern,
    WeekPatternEditor,
    type SlotRow
} from '../components/WeekPatternEditor';

type CoachTab = 'training' | 'debrief' | 'plan' | 'generate';
type CoachSearch = { weeks?: number; tab?: CoachTab; slug?: string };

const ALL_TIME_WEEKS = 520;
const WEEK_OPTIONS = [
	{ value: 4, label: '4 weeks' },
	{ value: 8, label: '8 weeks' },
	{ value: 12, label: '12 weeks' },
	{ value: 26, label: '6 months' },
	{ value: ALL_TIME_WEEKS, label: 'All time' }
];

function planWeekPhrase(today = new Date()): 'this week' | 'next week' {
	const cur = Math.min(PLAN_WEEK_COUNT, Math.max(1, planWeekIndex(today)));
	return weekToPlan(today) > cur ? 'next week' : 'this week';
}

function defaultQuestion(phrase: 'this week' | 'next week'): string {
	return `What should ${phrase} look like? Keep my usual days and sports. You pick the session kind (easy / quality / long / etc.), distance and intent. If you shift a day, say why.`;
}

function parseTab(v: unknown): CoachTab {
	if (v === 'training' || v === 'plan' || v === 'generate' || v === 'debrief') return v;
	return 'training';
}

function visibleTab(tab: CoachTab | undefined, authed: boolean): CoachTab {
	const next = tab ?? 'training';
	if ((next === 'debrief' || next === 'generate') && !authed) return 'training';
	return next;
}

type DebriefPrompt = Awaited<ReturnType<typeof getDebriefPrompt>>;
type WeekViewData = Awaited<ReturnType<typeof getCurrentWeekView>>;

export const Route = createFileRoute('/coach')({
	validateSearch: (s: Record<string, unknown>): CoachSearch => {
		const n = Number(s.weeks);
		return {
			weeks: Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined,
			tab: parseTab(s.tab),
			slug: typeof s.slug === 'string' && s.slug ? s.slug : undefined
		};
	},
	// weeks only — slug changes must not remount DeferredData/Await (that felt like a full refresh).
	loaderDeps: ({ search }) => ({
		weeks: search.weeks ?? ALL_TIME_WEEKS
	}),
	loader: ({ deps, location }) => {
		const slug = (location.search as CoachSearch).slug ?? '';
		return {
			page: Promise.all([
				getDebriefPrompt({ data: slug }),
				getWeekPattern(),
				getCurrentWeekView()
			]).then(([debrief, weekPattern, weekView]) => ({ debrief, weekPattern, weekView }))
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
	const weekPhrase = planWeekPhrase();

	function setTab(next: CoachTab) {
		router.navigate({
			to: '/coach',
			search: { tab: next, weeks: search.weeks, slug: next === 'debrief' ? search.slug : undefined },
			replace: true,
			resetScroll: false
		});
	}

	return (
		<>
			<section className={ui.hero}>
				<div>
					<p className={ui.muted}>{weekPhrase.charAt(0).toUpperCase() + weekPhrase.slice(1)}</p>
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
						aria-selected={tab === 'generate'}
						className={cn(ui.coachTab, tab === 'generate' && ui.coachTabActive)}
						onClick={() => setTab('generate')}
					>
						Generate
					</button>
				)}
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
						weekView={data.weekView}
					/>
				)}
			</DeferredData>
		</>
	);
}

function CoachPanels({
	debrief: initialDebrief,
	initialPattern,
	weekView
}: {
	debrief: DebriefPrompt;
	initialPattern: WeekPattern;
	weekView: WeekViewData;
}) {
	const search = Route.useSearch();
	const router = useRouter();
	const weeks = search.weeks ?? ALL_TIME_WEEKS;
	const authed = useAuthed();
	const tab = visibleTab(search.tab, authed);
	const slug = search.slug ?? '';

	const [question, setQuestion] = useState(() => defaultQuestion(planWeekPhrase()));
	const [copied, setCopied] = useState(false);
	const [briefText, setBriefText] = useState('');
	const [planJson, setPlanJson] = useState('');
	const [planMsg, setPlanMsg] = useState('');

	const [debrief, setDebrief] = useState(initialDebrief);
	const [debriefPrompt, setDebriefPrompt] = useState(initialDebrief.prompt);
	const [debriefJson, setDebriefJson] = useState('');
	const [debriefMsg, setDebriefMsg] = useState('');
	const [debriefCopied, setDebriefCopied] = useState(false);

	const [usual, setUsual] = useState<SlotRow[]>(() => rowsFrom(initialPattern));
	const [savedPattern, setSavedPattern] = useState<WeekPattern>(initialPattern);
	const [thisWeek, setThisWeek] = useState<SlotRow[]>(() => rowsFrom(initialPattern));
	const [linked, setLinked] = useState(true);
	const [mixNote, setMixNote] = useState('');
	const [mixMsg, setMixMsg] = useState('');
	const [mixSaveMsg, setMixSaveMsg] = useState('');
	const [mixBusy, setMixBusy] = useState(false);
	const mixBusyRef = useRef(false);
	const [briefBusy, setBriefBusy] = useState(false);

	// Loader remount (weeks change) brings fresh initial debrief.
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
		setPlanMsg('Saving…');
		try {
			const res = await savePlanWeeks({ data: planJson });
			setPlanMsg(`Saved — plan now has ${res.weeks} weeks (updated week ${res.updated.join(', ')}).`);
			setPlanJson('');
			router.invalidate();
		} catch (e) {
			setPlanMsg(e instanceof Error ? e.message : 'Could not save plan.');
		}
	}

	async function saveDebriefReply() {
		setDebriefMsg('Saving…');
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
			setDebriefMsg(`Saved — ${bits.join(' · ') || 'nothing changed'}${miss}.`);
			setDebriefJson('');
			router.invalidate();
		} catch (e) {
			setDebriefMsg(e instanceof Error ? e.message : 'Could not save debrief.');
		}
	}

	const run = debrief.run;
	const weekPhrase = planWeekPhrase();
	const defaultQ = defaultQuestion(weekPhrase);
	const usualPattern = toPattern(usual);
	const thisPattern = toPattern(linked ? usual : thisWeek);
	const mixDirty = !patternsEqual(usualPattern, savedPattern);

	async function generateBrief() {
		setBriefBusy(true);
		setMixMsg('');
		try {
			const next = await getCoachBrief({
				data: { weeks, pattern: thisPattern, defaultPattern: usualPattern, note: mixNote }
			});
			setBriefText(`${next}\n## My question\n${question.trim() || defaultQ}\n`);
		} catch (e) {
			setMixMsg(e instanceof Error ? e.message : 'Could not build the prompt.');
		} finally {
			setBriefBusy(false);
		}
	}

	async function saveDefaultMix() {
		if (mixBusyRef.current) return;
		mixBusyRef.current = true;
		setMixBusy(true);
		setMixSaveMsg('');
		try {
			const saved = await saveWeekPattern({ data: usualPattern });
			setSavedPattern(saved);
			setUsual(rowsFrom(saved));
			if (linked) setThisWeek(rowsFrom(saved));
			setMixSaveMsg('Saved as your default week.');
		} catch (e) {
			setMixSaveMsg(e instanceof Error ? e.message : 'Could not save the default week.');
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
							Saved default is {formatPatternProse(savedPattern)}.
						</span>
						{authed ? (
							<WeekPatternEditor
								rows={usual}
								disabled={mixBusy}
								onChange={(rows) => {
									setUsual(rows);
									setMixSaveMsg('');
								}}
							/>
						) : null}
					</div>
					{authed && (mixDirty || mixBusy || mixSaveMsg) && (
						<div className="mt-[0.35rem]">
							{(mixDirty || mixBusy) && (
								<div className={ui.actions}>
									<button
										className={ui.btnPrimary}
										type="button"
										onClick={saveDefaultMix}
										disabled={mixBusy}
										aria-busy={mixBusy}
									>
										{mixBusy ? 'Saving…' : 'Save as my default week'}
									</button>
								</div>
							)}
							{mixSaveMsg && (
								<div
									className={cn(
										ui.flash,
										/saved/i.test(mixSaveMsg) && ui.flashOk,
										mixDirty || mixBusy ? 'mt-2' : 'mt-0',
										'mb-0'
									)}
									role="status"
								>
									{mixSaveMsg}
								</div>
							)}
						</div>
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
													search: { tab: 'debrief', slug: last.slug, weeks: search.weeks },
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
								{debriefMsg && <div className={ui.flash}>{debriefMsg}</div>}
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
				<>
					{weekView ? (
						<WeekPlanBoard view={weekView} />
					) : (
						<p className={cn(ui.muted, 'mt-0 mb-4')}>No week plan saved yet.</p>
					)}
					{authed && (
						<p className={cn(ui.muted, 'mt-3 mb-0')}>
							<Link
								className="text-accent font-semibold"
								to="/coach"
								search={{ tab: 'generate', weeks: search.weeks }}
							>
								Generate {weekPhrase}
							</Link>
							.
						</p>
					)}
				</>
			)}

			{tab === 'generate' && authed && (
				<>
					<div className={cn(ui.panel, ui.form, 'mb-4')}>
						<div className={ui.field}>
							<span>History window</span>
							<ChoiceChips
								aria-label="History window"
								value={String(weeks)}
								options={WEEK_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
								onChange={(value) =>
									router.navigate({
										to: '/coach',
										search: { tab: 'generate', weeks: Number(value) },
										replace: true,
										resetScroll: false
									})
								}
							/>
						</div>
						<p className={cn(ui.muted, 'mt-[0.4rem]')}>
							All time is the default. The detailed activity table still covers only the last ~12
							weeks so the prompt stays short.
						</p>
						<p className={cn(ui.muted, 'mt-2 mb-0')}>
							Usual week: {formatPatternProse(savedPattern)}.{' '}
							<Link
								className="text-accent font-semibold"
								to="/coach"
								search={{ tab: 'training', weeks: search.weeks }}
							>
								Edit in Training
							</Link>
							.
						</p>
						{mixDirty && (
							<div className={ui.actions}>
								<button
									className={ui.btnGhost}
									type="button"
									onClick={saveDefaultMix}
									disabled={mixBusy}
									aria-busy={mixBusy}
								>
									{mixBusy ? 'Saving…' : 'Save usual week'}
								</button>
							</div>
						)}
						<div className={ui.field}>
							<span>{weekPhrase.charAt(0).toUpperCase() + weekPhrase.slice(1)}</span>
							<span className={cn(ui.muted, 'font-normal')}>
								{linked
									? `Using usual days. Change ${weekPhrase} only if this one is different.`
									: `One-off for ${weekPhrase} — the prompt uses these days, not your saved usual week.`}
							</span>
							<div className={cn(ui.actions, 'mt-[0.35rem]')}>
								<button
									className={ui.btnGhost}
									type="button"
									disabled={mixBusy}
									onClick={() => {
										if (linked) {
											setThisWeek(rowsFrom(usualPattern));
											setLinked(false);
										} else {
											setLinked(true);
										}
									}}
								>
									{linked ? `Change ${weekPhrase} only` : 'Use usual week'}
								</button>
								{!linked && !patternsEqual(thisPattern, usualPattern) && (
									<button
										className={ui.btnGhost}
										type="button"
										disabled={mixBusy}
										onClick={() => {
											setUsual(rowsFrom(thisPattern));
											setMixSaveMsg('');
										}}
									>
										Copy to usual week
									</button>
								)}
							</div>
							{!linked && (
								<WeekPatternEditor
									rows={thisWeek}
									disabled={mixBusy}
									onChange={setThisWeek}
								/>
							)}
						</div>
						<label className={ui.field}>
							<span>Anything unusual {weekPhrase}? (optional)</span>
							<textarea
								placeholder="e.g. motorcycle training Thursday, skip gym, extra long ride"
								value={mixNote}
								onChange={(e) => setMixNote(e.target.value)}
								rows={2}
							/>
						</label>
						{mixMsg && <div className={ui.flash}>{mixMsg}</div>}
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
						{planMsg && <div className={ui.flash}>{planMsg}</div>}
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
