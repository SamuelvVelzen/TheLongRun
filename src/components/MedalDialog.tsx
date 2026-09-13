import { activityLabel, showsField } from '$lib/activity';
import { goalUrlHref } from '$lib/goals';
import { formatDuration, parseDurationSeconds } from '$lib/format';
import { saveMedalDetails } from '$lib/server/functions';
import type { Goal } from '$lib/types';
import { cn, ui } from '$lib/ui';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Confetti } from './Confetti';
import { Dialog } from './Dialog';
import { Icon } from './Icon';
import { RouteLine } from './RouteLine';
import { errorMessage, useSnackbar } from './Snackbar';

type MedalActivity = {
	slug: string;
	activity_type: string;
	avg_hr: number | null;
	max_hr: number | null;
	elev_gain: number | null;
	cadence: number | null;
	calories: number | null;
	gear: string;
	weather: string;
	surface: string;
	place: string;
	province: string;
	country: string;
	effort: number | null;
	strava_id: string;
	start_time: string;
	elapsed_time: string;
};

function formatRaceDate(iso: string) {
	const d = new Date(`${iso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric'
	});
}

function locationLabel(activity: MedalActivity | undefined): string | null {
	if (!activity) return null;
	const parts = [activity.place, activity.province, activity.country].map((s) => s.trim()).filter(Boolean);
	return parts.length ? parts.join(', ') : null;
}

function goalDelta(goal: Goal): { beat: boolean; label: string } | null {
	if (!goal.time_goal || !goal.result?.time) return null;
	const goalSec = parseDurationSeconds(goal.time_goal);
	const resultSec = parseDurationSeconds(goal.result.time);
	if (goalSec == null || resultSec == null) return null;
	const diff = resultSec - goalSec;
	if (diff === 0) return { beat: true, label: 'Right on goal' };
	const beat = diff < 0;
	const sign = beat ? '−' : '+';
	return { beat, label: `${sign}${formatDuration(Math.abs(diff))} vs goal` };
}

function MedalLinks({
	goal,
	activity
}: {
	goal: Goal;
	activity: MedalActivity | undefined;
}) {
	const raceHref = goalUrlHref(goal.url);
	const itineraryHref = goalUrlHref(goal.itinerary_url);
	const resultHref = goalUrlHref(goal.result_url);
	const stravaId = activity?.strava_id?.trim();
	const stravaHref = stravaId ? `https://www.strava.com/activities/${stravaId}` : null;
	if (!raceHref && !itineraryHref && !resultHref && !stravaHref) return null;
	return (
		<div className="flex flex-wrap gap-x-4 gap-y-1">
			{resultHref && (
				<a
					className="inline-flex items-center gap-1.5 text-accent-fg font-semibold text-[0.9rem]"
					href={resultHref}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon name="external" size={13} />
					Results
				</a>
			)}
			{raceHref && (
				<a
					className="inline-flex items-center gap-1.5 text-accent-fg font-semibold text-[0.9rem]"
					href={raceHref}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon name="external" size={13} />
					Race page
				</a>
			)}
			{itineraryHref && (
				<a
					className="inline-flex items-center gap-1.5 text-accent-fg font-semibold text-[0.9rem]"
					href={itineraryHref}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon name="external" size={13} />
					Itinerary
				</a>
			)}
			{stravaHref && (
				<a
					className="inline-flex items-center gap-1.5 text-accent-fg font-semibold text-[0.9rem]"
					href={stravaHref}
					target="_blank"
					rel="noopener noreferrer"
				>
					<Icon name="external" size={13} />
					Strava
				</a>
			)}
		</div>
	);
}

function ActivityStats({ activity }: { activity: MedalActivity }) {
	const hrFill =
		activity.avg_hr != null && activity.max_hr != null && activity.max_hr > 0
			? Math.min(100, Math.round((activity.avg_hr / activity.max_hr) * 100))
			: null;
	return (
		<div className={cn(ui.metrics, 'mt-1')}>
			{activity.avg_hr != null || activity.max_hr != null ? (
				<div className={cn(ui.metric, 'flex-[1.4_1_9rem]')}>
					<div className="flex items-baseline gap-1">
						<b>{activity.avg_hr ?? '—'}</b>
						<span className="text-muted text-[0.95rem]">/</span>
						<strong className="font-display text-[1.05rem] text-warn">{activity.max_hr ?? '—'}</strong>
					</div>
					<span>HR avg / max</span>
					{hrFill != null && (
						<div className="mt-[0.45rem] h-1 rounded-full bg-white/8 overflow-hidden" aria-hidden="true">
							<div
								className="h-full rounded-[inherit] bg-[linear-gradient(90deg,var(--color-accent),var(--color-warn))]"
								style={{ width: `${hrFill}%` }}
							/>
						</div>
					)}
				</div>
			) : null}
			{showsField(activity.activity_type, 'elevation') && activity.elev_gain != null && (
				<div className={ui.metric}>
					<b>{activity.elev_gain}</b>
					<span>elev m</span>
				</div>
			)}
			{showsField(activity.activity_type, 'cadence') && activity.cadence != null && (
				<div className={ui.metric}>
					<b>{activity.cadence}</b>
					<span>cadence</span>
				</div>
			)}
			{activity.calories != null && (
				<div className={ui.metric}>
					<b>{activity.calories}</b>
					<span>kcal</span>
				</div>
			)}
			{activity.effort != null && (
				<div className={ui.metric}>
					<b>{activity.effort}</b>
					<span>effort</span>
				</div>
			)}
		</div>
	);
}

export function MedalDialog({
	open,
	goal,
	track,
	activity,
	authed,
	onClose,
	onSaved
}: {
	open: boolean;
	goal: Goal | null;
	track?: [number, number][];
	activity?: MedalActivity;
	authed: boolean;
	onClose: () => void;
	onSaved?: () => void | Promise<void>;
}) {
	const snack = useSnackbar();
	const [bib, setBib] = useState('');
	const [resultUrl, setResultUrl] = useState('');
	const [medalNotes, setMedalNotes] = useState('');
	const [saved, setSaved] = useState({ bib: '', resultUrl: '', medalNotes: '' });
	const [saving, setSaving] = useState(false);
	const [celebrate, setCelebrate] = useState(false);

	useEffect(() => {
		if (!open || !goal) return;
		const next = {
			bib: goal.bib_number ?? '',
			resultUrl: goal.result_url ?? '',
			medalNotes: goal.medal_notes ?? ''
		};
		setBib(next.bib);
		setResultUrl(next.resultUrl);
		setMedalNotes(next.medalNotes);
		setSaved(next);
		setCelebrate(true);
	}, [open, goal?.id, goal?.bib_number, goal?.result_url, goal?.medal_notes]);

	const delta = goal ? goalDelta(goal) : null;
	const loc = locationLabel(activity);
	const detailsDirty =
		bib !== saved.bib || resultUrl !== saved.resultUrl || medalNotes !== saved.medalNotes;

	async function saveDetails() {
		if (!goal) return;
		setSaving(true);
		try {
			await saveMedalDetails({
				data: {
					goalId: goal.id,
					bib_number: bib,
					result_url: resultUrl,
					medal_notes: medalNotes
				}
			});
			setSaved({ bib, resultUrl, medalNotes });
			snack.success('Medal details saved.');
			await onSaved?.();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not save medal details.'));
		} finally {
			setSaving(false);
		}
	}

	return (
		<Dialog
			open={open}
			title={goal?.name ?? 'Medal'}
			onClose={onClose}
			className={ui.dialogPanelMedal}
		>
			{goal && (
				<div className="relative grid gap-4">
					<Confetti active={celebrate} />

					<div
						className={cn(
							ui.panel,
							'relative overflow-hidden border-accent/25 bg-[linear-gradient(165deg,color-mix(in_srgb,var(--accent)_14%,transparent),transparent_55%)] p-0!'
						)}
					>
						{track ? (
							<div className="flex items-center justify-center px-4 pt-5 pb-2 min-h-[9.5rem]">
								<RouteLine
									coords={track}
									width={280}
									height={120}
									markers
									strokeWidth={2.25}
									className="w-full max-w-[17.5rem] text-accent drop-shadow-[0_0_12px_color-mix(in_srgb,var(--accent)_35%,transparent)]"
								/>
							</div>
						) : (
							<div className="flex items-center justify-center min-h-[6rem] text-accent/40">
								<Icon name="trophy" size={48} />
							</div>
						)}
						<div className="px-4 pb-4 pt-1 text-center">
							<p className="font-display font-bold text-[2.6rem] tracking-[-0.04em] text-accent-fg m-0 leading-none">
								{goal.result?.time || '—'}
							</p>
							{delta && (
								<p
									className={cn(
										'm-0 mt-2 text-[0.82rem] font-semibold tracking-[0.04em] uppercase',
										delta.beat ? 'text-ok' : 'text-muted'
									)}
								>
									{delta.label}
								</p>
							)}
						</div>
					</div>

					<div className="grid gap-1">
						<p className={cn(ui.muted, 'm-0')}>
							{formatRaceDate(goal.date)}
							{goal.result?.distance_km != null
								? ` · ${goal.result.distance_km} km`
								: ` · ${goal.distance_km} km`}
							{goal.result?.pace ? ` · ${goal.result.pace}/km` : ''}
							{` · ${activityLabel(goal.sport)}`}
						</p>
						{loc && <p className={cn(ui.muted, 'm-0 text-[0.88rem]')}>{loc}</p>}
						{bib && !authed && (
							<p className="m-0 text-[0.88rem]">
								Bib <strong className="font-display">{bib}</strong>
							</p>
						)}
					</div>

					<MedalLinks goal={goal} activity={activity} />

					{goal.time_goal && !delta && (
						<p className={cn(ui.muted, 'm-0 text-[0.9rem]')}>Time goal was {goal.time_goal}.</p>
					)}

					{activity && <ActivityStats activity={activity} />}

					{(activity?.gear || activity?.weather || activity?.surface) && (
						<div className="flex flex-wrap gap-2">
							{activity.gear && (
								<span className={ui.tag}>
									<Icon name="run" size={12} />
									{activity.gear}
								</span>
							)}
							{activity.weather && <span className={ui.tag}>{activity.weather}</span>}
							{activity.surface && <span className={ui.tag}>{activity.surface}</span>}
							{activity.start_time && <span className={ui.tag}>Start {activity.start_time}</span>}
						</div>
					)}

					{goal.primary.length > 0 && (
						<div>
							<p className="m-0 text-[0.78rem] uppercase tracking-[0.06em] text-muted font-bold">Race plan</p>
							<ul className="m-0 mt-1 pl-[1.1rem]">
								{goal.primary.map((p) => (
									<li key={p}>{p}</li>
								))}
							</ul>
						</div>
					)}

					{goal.notes && (
						<div>
							<p className="m-0 text-[0.78rem] uppercase tracking-[0.06em] text-muted font-bold">
								Pre-race notes
							</p>
							<p className={cn(ui.muted, 'm-0 mt-1 whitespace-pre-wrap text-[0.92rem]')}>{goal.notes}</p>
						</div>
					)}

					<div className="grid gap-3 pt-1 border-t border-line">
						<p className="m-0 text-[0.78rem] uppercase tracking-[0.06em] text-muted font-bold">Medal details</p>
						{authed ? (
							<>
								<div className={ui.formGrid}>
									<label className={ui.field}>
										<span>Bib number</span>
										<input
											value={bib}
											onChange={(e) => setBib(e.target.value)}
											placeholder="e.g. 4821"
											inputMode="numeric"
										/>
									</label>
									<label className={ui.field}>
										<span>Results URL</span>
										<input
											value={resultUrl}
											onChange={(e) => setResultUrl(e.target.value)}
											placeholder="https://results.example.com/…"
											inputMode="url"
											autoComplete="url"
										/>
									</label>
								</div>
								<label className={ui.field}>
									<span>Your notes</span>
									<textarea
										rows={4}
										value={medalNotes}
										onChange={(e) => setMedalNotes(e.target.value)}
										placeholder="How it felt, who you ran with, what you’d do differently…"
									/>
								</label>
								{detailsDirty && (
									<div className={cn(ui.actions, 'justify-start!')}>
										<button
											className={ui.btnPrimary}
											type="button"
											disabled={saving}
											onClick={() => void saveDetails()}
										>
											<Icon name="check" size={16} />
											{saving ? 'Saving…' : 'Save details'}
										</button>
									</div>
								)}
							</>
						) : medalNotes ? (
							<p className={cn(ui.muted, 'm-0 whitespace-pre-wrap')}>{medalNotes}</p>
						) : (
							<p className={cn(ui.muted, 'm-0 text-[0.9rem]')}>Sign in to add bib, results link, and notes.</p>
						)}
					</div>

					{goal.result?.activity_slug && (
						<div className={ui.actions}>
							<Link
								className={ui.btnPrimary}
								to="/runs/$slug"
								params={{ slug: goal.result.activity_slug }}
								onClick={onClose}
							>
								Open activity
							</Link>
						</div>
					)}
				</div>
			)}
		</Dialog>
	);
}
