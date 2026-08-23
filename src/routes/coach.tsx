import { useEffect, useRef, useState } from 'react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import {
	getCoachBrief,
	getDebriefPrompt,
	getFeelingsPrompt,
	saveDebrief,
	saveFeelings,
	savePlanWeeks
} from '$lib/server/functions';
import { PLAN_WEEK_COUNT, planWeekIndex, weekToPlan } from '$lib/plan';
import { GpxImport } from '../components/GpxImport';
import { DeferredData } from '../components/DeferredData';

type CoachTab = 'debrief' | 'plan' | 'feelings';
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
	return `What should ${phrase} look like? Give me specific sessions with day, distance and intent (days can move), and flag anything to watch.`;
}

function parseTab(v: unknown): CoachTab {
	if (v === 'plan' || v === 'feelings' || v === 'debrief') return v;
	return 'debrief';
}

type DebriefPrompt = Awaited<ReturnType<typeof getDebriefPrompt>>;

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
		const slug =
			typeof location.search === 'object' &&
			location.search &&
			typeof (location.search as CoachSearch).slug === 'string'
				? ((location.search as CoachSearch).slug ?? '')
				: '';
		return {
			page: Promise.all([
				getCoachBrief({ data: deps.weeks }),
				getDebriefPrompt({ data: slug })
			]).then(([brief, debrief]) => ({ brief, debrief }))
		};
	},
	component: Coach
});

function Coach() {
	const { page } = Route.useLoaderData();
	const search = Route.useSearch();
	const router = useRouter();
	const tab = search.tab ?? 'debrief';
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
			<section className="hero">
				<div>
					<p className="muted">After a run · then {weekPhrase}</p>
					<h1>Coach</h1>
					<p>
						Import the GPX, copy the debrief prompt into ChatGPT with your Strava screenshots and
						how it felt, then paste the JSON back. Next session on the dashboard is up to date.
					</p>
				</div>
			</section>

			<div className="coach-tabs" role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'debrief'}
					className={`coach-tab${tab === 'debrief' ? ' active' : ''}`}
					onClick={() => setTab('debrief')}
				>
					After a run
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'plan'}
					className={`coach-tab${tab === 'plan' ? ' active' : ''}`}
					onClick={() => setTab('plan')}
				>
					Plan {weekPhrase}
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'feelings'}
					className={`coach-tab${tab === 'feelings' ? ' active' : ''}`}
					onClick={() => setTab('feelings')}
				>
					Week review
				</button>
			</div>
			<DeferredData promise={page}>
				{(data) => <CoachPanels brief={data.brief} debrief={data.debrief} />}
			</DeferredData>
		</>
	);
}

function CoachPanels({
	brief,
	debrief: initialDebrief
}: {
	brief: string;
	debrief: DebriefPrompt;
}) {
	const search = Route.useSearch();
	const router = useRouter();
	const weeks = search.weeks ?? ALL_TIME_WEEKS;
	const tab = search.tab ?? 'debrief';
	const slug = search.slug ?? '';

	const [question, setQuestion] = useState('');
	const [copied, setCopied] = useState(false);
	const [briefText, setBriefText] = useState('');
	const [planJson, setPlanJson] = useState('');
	const [planMsg, setPlanMsg] = useState('');

	const [debrief, setDebrief] = useState(initialDebrief);
	const [debriefPrompt, setDebriefPrompt] = useState(initialDebrief.prompt);
	const [debriefJson, setDebriefJson] = useState('');
	const [debriefMsg, setDebriefMsg] = useState('');
	const [debriefCopied, setDebriefCopied] = useState(false);

	const [feelWeeks, setFeelWeeks] = useState(1);
	const [feelPrompt, setFeelPrompt] = useState('');
	const [feelCount, setFeelCount] = useState<number | null>(null);
	const [feelBusy, setFeelBusy] = useState(false);
	const [feelCopied, setFeelCopied] = useState(false);
	const [feelJson, setFeelJson] = useState('');
	const [feelMsg, setFeelMsg] = useState('');

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

	async function generateFeelPrompt() {
		setFeelBusy(true);
		setFeelMsg('');
		try {
			const res = await getFeelingsPrompt({ data: { scope: 'window', weeks: feelWeeks } });
			setFeelPrompt(res.prompt);
			setFeelCount(res.count);
		} catch (e) {
			setFeelMsg(e instanceof Error ? e.message : 'Could not build the prompt.');
		} finally {
			setFeelBusy(false);
		}
	}

	async function copyFeelPrompt() {
		try {
			await navigator.clipboard.writeText(feelPrompt);
			setFeelCopied(true);
			setTimeout(() => setFeelCopied(false), 1800);
		} catch {
			/* ignore */
		}
	}

	async function saveFeel() {
		setFeelMsg('Saving…');
		try {
			const res = await saveFeelings({ data: feelJson });
			const miss = res.missing.length ? ` (${res.missing.length} slug(s) not found)` : '';
			setFeelMsg(
				`Saved feelings to ${res.updated} activit${res.updated === 1 ? 'y' : 'ies'}${miss}.`
			);
			setFeelJson('');
			router.invalidate();
		} catch (e) {
			setFeelMsg(e instanceof Error ? e.message : 'Could not save feelings.');
		}
	}

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
	const fullDoc = `${brief}\n## My question\n${question.trim() || defaultQ}\n`;

	function generateBrief() {
		setBriefText(fullDoc);
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
			{tab === 'debrief' && (
				<>
					<ol className="coach-flow">
						<li className={run ? 'done' : 'current'}>
							<strong>1. Import the GPX</strong>
							<span className="muted">
								Download from Strava, then drop it here. ChatGPT can wait — the prompt needs this
								run in the app first.
							</span>
							{run && (
								<p className="coach-flow-run">
									Latest in the prompt:{' '}
									<Link to="/runs/$slug" params={{ slug: run.slug }}>
										{run.date}
										{run.day ? ` · ${run.day}` : ''}
										{run.distance_km != null ? ` · ${run.distance_km} km` : ''}
									</Link>
									{run.hasFeel ? ' · feel already saved' : ' · no feel yet'}
								</p>
							)}
							<div className="panel form" style={{ marginTop: '0.75rem' }}>
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
							</div>
							<p className="muted" style={{ marginTop: '0.5rem' }}>
								No GPS?{' '}
								<Link to="/import" search={{ mode: 'manual' }}>
									Log manually
								</Link>
								.
							</p>
						</li>
						<li className={run && debriefPrompt ? 'current' : undefined}>
							<strong>2. Copy the prompt</strong>
							<span className="muted">
								In ChatGPT: attach the Strava general + pace screenshots, paste this, and say how
								the run felt.
							</span>
							{debrief.error && !debriefPrompt && (
								<p className="muted" style={{ marginTop: '0.4rem' }}>
									{debrief.error}
								</p>
							)}
							{debriefPrompt && (
								<div className="panel form" style={{ marginTop: '0.75rem' }}>
									<label className="field">
										<textarea
											className="editor"
											rows={14}
											value={debriefPrompt}
											onChange={(e) => setDebriefPrompt(e.target.value)}
										/>
									</label>
									<div className="actions">
										<button className="btn btn-primary" type="button" onClick={copyDebrief}>
											{debriefCopied ? 'Copied' : 'Copy prompt'}
										</button>
									</div>
								</div>
							)}
						</li>
						<li>
							<strong>3. Paste ChatGPT’s JSON</strong>
							<span className="muted">
								Feelings for this run plus the updated rest of the week. Days can change.
							</span>
							<div className="panel form" style={{ marginTop: '0.75rem' }}>
								{debriefMsg && <div className="flash">{debriefMsg}</div>}
								<label className="field">
									<textarea
										className="editor"
										rows={8}
										placeholder='{ "feelings": { "slug": "…" }, "week": { "week": 3, "sessions": [ … ] } }'
										value={debriefJson}
										onChange={(e) => setDebriefJson(e.target.value)}
									/>
								</label>
								<div className="actions">
									<button
										className="btn btn-primary"
										type="button"
										onClick={saveDebriefReply}
										disabled={!debriefJson.trim()}
									>
										Save debrief
									</button>
								</div>
							</div>
						</li>
					</ol>
				</>
			)}

			{tab === 'plan' && (
				<>
					<div className="panel form" style={{ marginBottom: '1rem' }}>
						<div className="form-grid">
							<label className="field">
								<span>History window</span>
								<select
									value={weeks}
									onChange={(e) =>
										router.navigate({
											to: '/coach',
											search: { tab: 'plan', weeks: Number(e.target.value) },
											replace: true,
											resetScroll: false
										})
									}
								>
									{WEEK_OPTIONS.map((o) => (
										<option key={o.value} value={o.value}>
											{o.label}
										</option>
									))}
								</select>
							</label>
						</div>
						<p className="muted" style={{ marginTop: '0.4rem' }}>
							All time is the default. The detailed activity table still covers only the last ~12
							weeks so the prompt stays short.
						</p>
						<label className="field">
							<span>Your question for the AI (optional)</span>
							<textarea
								placeholder={defaultQ}
								value={question}
								onChange={(e) => setQuestion(e.target.value)}
								rows={2}
							/>
						</label>
						<div className="actions">
							<button className="btn btn-primary" type="button" onClick={generateBrief}>
								{briefText ? 'Regenerate prompt' : 'Generate prompt'}
							</button>
						</div>
					</div>

					{briefText && (
						<div className="panel form">
							<h3>Prompt (editable — tweak before you copy)</h3>
							<label className="field" style={{ marginTop: '0.5rem' }}>
								<textarea
									className="editor"
									rows={16}
									value={briefText}
									onChange={(e) => setBriefText(e.target.value)}
								/>
							</label>
							<div className="actions">
								<button className="btn btn-primary" type="button" onClick={download}>
									Download .md
								</button>
								<button className="btn btn-ghost" type="button" onClick={copy}>
									{copied ? 'Copied' : 'Copy'}
								</button>
							</div>
						</div>
					)}

					<div className="panel form" style={{ marginTop: '1rem' }}>
						<h3>Save {weekPhrase}’s plan</h3>
						<p className="muted" style={{ marginTop: '0.3rem' }}>
							Paste the JSON block your AI returned — merged by week number. Sessions can be any
							days.
						</p>
						{planMsg && <div className="flash">{planMsg}</div>}
						<label className="field">
							<textarea
								className="editor"
								rows={8}
								placeholder='{ "week": 3, "dates": "…", "phase": "build", "focus": "…", "sessions": [ … ] }'
								value={planJson}
								onChange={(e) => setPlanJson(e.target.value)}
							/>
						</label>
						<div className="actions">
							<button
								className="btn btn-primary"
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

			{tab === 'feelings' && (
				<>
					<div className="panel form" style={{ marginBottom: '1rem' }}>
						<p className="muted" style={{ marginTop: 0 }}>
							End-of-week dump from a long ChatGPT thread. If you debriefed each run already, you
							can skip this.
						</p>
						<div className="form-grid">
							<label className="field">
								<span>Duration</span>
								<select value={feelWeeks} onChange={(e) => setFeelWeeks(Number(e.target.value))}>
									{[1, 2, 3, 4, 6, 8].map((w) => (
										<option key={w} value={w}>
											{w} week{w === 1 ? '' : 's'}
										</option>
									))}
								</select>
							</label>
						</div>
						<div className="actions">
							<button
								className="btn btn-primary"
								type="button"
								onClick={generateFeelPrompt}
								disabled={feelBusy}
							>
								{feelBusy ? 'Building…' : 'Generate prompt'}
							</button>
							{feelPrompt && (
								<button className="btn btn-ghost" type="button" onClick={copyFeelPrompt}>
									{feelCopied ? 'Copied' : 'Copy prompt'}
								</button>
							)}
							{feelCount != null && (
								<span className="muted" style={{ alignSelf: 'center' }}>
									{feelCount} activit{feelCount === 1 ? 'y' : 'ies'}
								</span>
							)}
						</div>
					</div>

					{feelPrompt && (
						<div className="panel form">
							<h3>Prompt (editable — tweak before you copy)</h3>
							<label className="field" style={{ marginTop: '0.5rem' }}>
								<textarea
									className="editor"
									rows={14}
									value={feelPrompt}
									onChange={(e) => setFeelPrompt(e.target.value)}
								/>
							</label>
						</div>
					)}

					<div className="panel form" style={{ marginTop: '1rem' }}>
						<h3>Save the feelings</h3>
						<p className="muted" style={{ marginTop: '0.3rem' }}>
							Paste the JSON block — feelings are written onto each activity by slug. Device data is
							never touched.
						</p>
						{feelMsg && <div className="flash">{feelMsg}</div>}
						<label className="field">
							<textarea
								className="editor"
								rows={8}
								placeholder='{ "activities": [ { "slug": "…", "shins": 3, "notes": "…" } ] }'
								value={feelJson}
								onChange={(e) => setFeelJson(e.target.value)}
							/>
						</label>
						<div className="actions">
							<button
								className="btn btn-primary"
								type="button"
								onClick={saveFeel}
								disabled={!feelJson.trim()}
							>
								Save feelings
							</button>
						</div>
					</div>
				</>
			)}
		</>
	);
}
