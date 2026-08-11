import { useState } from 'react';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import {
	getCoachBrief,
	getFeelingsPrompt,
	saveFeelings,
	savePlanWeeks
} from '$lib/server/functions';

type CoachSearch = { weeks?: number };

const WEEK_OPTIONS = [
	{ value: 4, label: '4 weeks' },
	{ value: 8, label: '8 weeks' },
	{ value: 12, label: '12 weeks' },
	{ value: 26, label: '6 months' },
	{ value: 520, label: 'All time' }
];

const DEFAULT_QUESTION =
	'What should next week look like? Give me specific Tuesday / Friday / Sunday sessions with distance and intent, and flag anything to watch.';

export const Route = createFileRoute('/coach')({
	validateSearch: (s: Record<string, unknown>): CoachSearch => {
		const n = Number(s.weeks);
		return { weeks: Number.isFinite(n) && n > 0 ? Math.floor(n) : undefined };
	},
	loaderDeps: ({ search }) => ({ weeks: search.weeks ?? 12 }),
	loader: ({ deps }) => getCoachBrief({ data: deps.weeks }),
	component: Coach
});

function Coach() {
	const brief = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const router = useRouter();
	const weeks = search.weeks ?? 12;

	const [question, setQuestion] = useState('');
	const [copied, setCopied] = useState(false);
	const [planJson, setPlanJson] = useState('');
	const [planMsg, setPlanMsg] = useState('');

	// Weekly feelings round-trip
	const [feelScope, setFeelScope] = useState<'window' | 'missing'>('window');
	const [feelWeeks, setFeelWeeks] = useState(1);
	const [feelPrompt, setFeelPrompt] = useState('');
	const [feelCount, setFeelCount] = useState<number | null>(null);
	const [feelBusy, setFeelBusy] = useState(false);
	const [feelCopied, setFeelCopied] = useState(false);
	const [feelJson, setFeelJson] = useState('');
	const [feelMsg, setFeelMsg] = useState('');

	async function generateFeelPrompt() {
		setFeelBusy(true);
		setFeelMsg('');
		try {
			const res = await getFeelingsPrompt({ data: { scope: feelScope, weeks: feelWeeks } });
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
			setFeelMsg(`Saved feelings to ${res.updated} activit${res.updated === 1 ? 'y' : 'ies'}${miss}.`);
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

	const fullDoc = `${brief}\n## My question\n${question.trim() || DEFAULT_QUESTION}\n`;

	function download() {
		const date = new Date().toISOString().slice(0, 10);
		const blob = new Blob([fullDoc], { type: 'text/markdown;charset=utf-8' });
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
			await navigator.clipboard.writeText(fullDoc);
			setCopied(true);
			setTimeout(() => setCopied(false), 1800);
		} catch {
			/* ignore */
		}
	}

	return (
		<>
			<section className="hero">
				<div>
					<p className="muted">Context for your AI coach</p>
					<h1>Coach brief</h1>
					<p>
						A ready-to-paste snapshot of your training — goal, plan, recent activities with how they
						felt, and your constraints. Download it (or copy it) and drop it into your AI each week
						to get your next plan.
					</p>
				</div>
			</section>

			<div className="panel form" style={{ marginBottom: '1rem' }}>
				<div className="form-grid">
					<label className="field">
						<span>History window</span>
						<select
							value={weeks}
							onChange={(e) => navigate({ to: '/coach', search: { weeks: Number(e.target.value) } })}
						>
							{WEEK_OPTIONS.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
					</label>
				</div>
				<label className="field">
					<span>Your question for the AI (optional)</span>
					<textarea
						placeholder={DEFAULT_QUESTION}
						value={question}
						onChange={(e) => setQuestion(e.target.value)}
						rows={2}
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

			<div className="panel">
				<h3 style={{ marginBottom: '0.6rem' }}>Preview</h3>
				<pre className="coach-preview">{fullDoc}</pre>
			</div>

			<div className="panel form" style={{ marginTop: '1rem' }}>
				<h3>Save next week's plan</h3>
				<p className="muted" style={{ marginTop: '0.3rem' }}>
					Paste the JSON block your AI returned — it's merged into your plan (by week number) and
					shows up in Context and the next brief.
				</p>
				{planMsg && <div className="flash">{planMsg}</div>}
				<label className="field">
					<textarea
						className="editor"
						rows={8}
						placeholder='{ "week": 2, "dates": "…", "phase": "build", "focus": "…", "sessions": [ … ] }'
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

			<div className="panel form" style={{ marginTop: '1rem' }}>
				<h3>Capture how it felt</h3>
				<p className="muted" style={{ marginTop: '0.3rem' }}>
					At the end of the week, generate a prompt that asks your AI to summarise — per activity —
					how each run/ride felt from your chat. Paste its JSON back here to save the feelings onto
					each activity (shins, energy, surface, notes…). Objective numbers are never touched.
				</p>
				{feelMsg && <div className="flash">{feelMsg}</div>}

				<div className="form-grid">
					<label className="field">
						<span>Which activities</span>
						<select
							value={feelScope}
							onChange={(e) => setFeelScope(e.target.value as 'window' | 'missing')}
						>
							<option value="window">Recent weeks</option>
							<option value="missing">All still missing feel</option>
						</select>
					</label>
					{feelScope === 'window' && (
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
					)}
				</div>

				<div className="actions">
					<button className="btn btn-primary" type="button" onClick={generateFeelPrompt} disabled={feelBusy}>
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

				{feelPrompt && (
					<label className="field" style={{ marginTop: '0.6rem' }}>
						<span>Prompt (copy into your weekly chat)</span>
						<textarea className="editor" rows={10} readOnly value={feelPrompt} />
					</label>
				)}

				<label className="field" style={{ marginTop: '0.6rem' }}>
					<span>Paste the JSON your AI returned</span>
					<textarea
						className="editor"
						rows={8}
						placeholder='{ "activities": [ { "slug": "…", "shins": 3, "notes": "…" } ] }'
						value={feelJson}
						onChange={(e) => setFeelJson(e.target.value)}
					/>
				</label>
				<div className="actions">
					<button className="btn btn-primary" type="button" onClick={saveFeel} disabled={!feelJson.trim()}>
						Save feelings
					</button>
				</div>
			</div>
		</>
	);
}
