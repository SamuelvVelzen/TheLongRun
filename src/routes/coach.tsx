import { useState } from 'react';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { getCoachBrief, savePlanWeeks } from '$lib/server/functions';

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
		</>
	);
}
