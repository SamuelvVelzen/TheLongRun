import { ACTIVITY_TYPES, activityLabel, type ActivityType } from '$lib/activity';
import { useAuthed } from '$lib/auth';
import {
	activityLooksLikeRace,
	emptyGoalDraft,
	goalDraftFromReply,
	goalUrlHref,
	planStartHint
} from '$lib/goals';
import { calendarFromGoal, daysUntil, mondayIso } from '$lib/plan';
import { clearGoal, completeGoal, getGoalBrief, getGoalsData, saveActiveGoal } from '$lib/server/functions';
import type { Goal } from '$lib/types';
import { cn, ui } from '$lib/ui';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ChoiceChips } from '../components/ChoiceChips';
import { DeferredData } from '../components/DeferredData';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Icon, sportChipLabel } from '../components/Icon';
import { PageHero } from '../components/PageHero';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { errorMessage, useSnackbar } from '../components/Snackbar';

type GoalsTab = 'races' | 'medals';
type GoalsSearch = { tab?: GoalsTab };

function parseTab(v: unknown): GoalsTab {
	return v === 'medals' ? 'medals' : 'races';
}

export const Route = createFileRoute('/goals')({
	validateSearch: (s: Record<string, unknown>): GoalsSearch => ({
		tab: parseTab(s.tab)
	}),
	loaderDeps: () => ({}),
	loader: () => ({ page: getGoalsData() }),
	component: GoalsPage
});

type GoalsData = Awaited<ReturnType<typeof getGoalsData>>;

function hasRaceCopy(primary: string[] | string, notes: string): boolean {
	const lines = Array.isArray(primary)
		? primary
		: primary.split('\n').map((s) => s.trim()).filter(Boolean);
	return lines.some((p) => p.trim()) || notes.trim() !== '';
}

function formatRaceDate(iso: string) {
	const d = new Date(`${iso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function GoalUrlLinks({ url, itineraryUrl }: { url?: string; itineraryUrl?: string }) {
	const raceHref = goalUrlHref(url ?? '');
	const itineraryHref = goalUrlHref(itineraryUrl ?? '');
	if (!raceHref && !itineraryHref) return null;
	return (
		<div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
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
		</div>
	);
}

function GoalsPage() {
	const { page } = Route.useLoaderData();
	const search = Route.useSearch();
	const router = useRouter();
	const authed = useAuthed();
	const tab = parseTab(search.tab);

	function setTab(next: GoalsTab) {
		router.navigate({
			to: '/goals',
			search: { tab: next },
			replace: true,
			resetScroll: false
		});
	}

	return (
		<>
			<PageHero
				variant="quiet"
				kicker={tab === 'medals' ? 'On the wall' : 'Race on the calendar'}
				title="Goals"
				lead={
					tab === 'medals'
						? 'Finished races live here with the time you pinned. Open one for the goal you set and the activity you ran.'
						: 'The soonest race is active — it drives the plan length and the generate prompt. Later races wait their turn.'
				}
			/>
			<div className={ui.coachTabs} role="tablist">
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'races'}
					className={cn(ui.coachTab, tab === 'races' && ui.coachTabActive)}
					onClick={() => setTab('races')}
				>
					<Icon name="flag" size={15} />
					Races
				</button>
				<button
					type="button"
					role="tab"
					aria-selected={tab === 'medals'}
					className={cn(ui.coachTab, tab === 'medals' && ui.coachTabActive)}
					onClick={() => setTab('medals')}
				>
					<Icon name="trophy" size={15} />
					Medals
				</button>
			</div>
			<DeferredData promise={page}>
				{(data) => <GoalsBody data={data} authed={authed} tab={tab} />}
			</DeferredData>
		</>
	);
}

function GoalsBody({ data, authed, tab }: { data: GoalsData; authed: boolean; tab: GoalsTab }) {
	const router = useRouter();
	const snack = useSnackbar();
	const [editingId, setEditingId] = useState<string | 'new' | null>(data.activeGoal ? null : 'new');
	const [pendingRemove, setPendingRemove] = useState<{
		id: string;
		name: string;
		isActive: boolean;
	} | null>(null);
	const [openMedal, setOpenMedal] = useState<Goal | null>(null);
	const nextAfterClear = pendingRemove?.isActive ? data.upcoming[0] : undefined;

	return (
		<>
			{tab === 'races' && (
				<>
					{data.activeGoal ? (
						<ActiveGoalCard
							goal={data.activeGoal}
							weekCount={data.calendar.weekCount}
							candidates={data.candidates}
							authed={authed}
							editing={editingId === data.activeGoal.id}
							onEdit={() => setEditingId(data.activeGoal!.id)}
							onCancelEdit={() => setEditingId(null)}
							onSaved={async () => {
								setEditingId(null);
								await router.invalidate();
							}}
							onClear={() =>
								setPendingRemove({
									id: data.activeGoal!.id,
									name: data.activeGoal!.name,
									isActive: true
								})
							}
						/>
					) : (
						<section className={cn(ui.panel, 'mb-6')}>
							<p className={cn(ui.muted, 'mt-0')}>
								No race on the calendar. Coach still plans this week as base training.
							</p>
							{authed && editingId !== 'new' && (
								<div className={cn(ui.actions, 'justify-start!')}>
									<button className={ui.btnPrimary} type="button" onClick={() => setEditingId('new')}>
										<Icon name="flag" size={16} />
										Set a goal
									</button>
								</div>
							)}
							{authed && editingId === 'new' && (
								<GoalForm
									initial={null}
									submitLabel="Set goal"
									onCancel={() => setEditingId(null)}
									onSaved={async () => {
										setEditingId(null);
										await router.invalidate();
									}}
								/>
							)}
							{!authed && <p className={cn(ui.muted, 'mb-0')}>Sign in to set a race.</p>}
						</section>
					)}

					{data.activeGoal && authed && editingId === 'new' && (
						<section className={cn(ui.panel, 'mb-6 grid gap-3')}>
							<div>
								<p className="m-0 inline-flex items-center gap-1.5 text-accent-fg font-bold text-[0.72rem] tracking-[0.08em] uppercase">
									<Icon name="plus" size={14} />
									Add race
								</p>
								<p className={cn(ui.muted, 'm-0 mt-1')}>
									Later dates wait. A sooner date takes over as active and resets the plan.
								</p>
							</div>
							<GoalForm
								initial={null}
								submitLabel="Add race"
								onCancel={() => setEditingId(null)}
								onSaved={async () => {
									setEditingId(null);
									await router.invalidate();
								}}
							/>
						</section>
					)}

					{(data.activeGoal || data.upcoming.length > 0) && (
						<>
							<section className={ui.sectionTitle}>
								<div>
									<h2>Up next</h2>
									<p>
										{data.upcoming.length
											? `${data.upcoming.length} later race${data.upcoming.length === 1 ? '' : 's'} — the soonest date becomes active when this one is done.`
											: 'Add the races after this one. Closest date stays active.'}
									</p>
								</div>
								{authed && data.activeGoal && editingId !== 'new' && (
									<button className={ui.btnPrimary} type="button" onClick={() => setEditingId('new')}>
										<Icon name="plus" size={16} />
										Add race
									</button>
								)}
							</section>
							{data.upcoming.map((g) => (
								<UpcomingGoalCard
									key={g.id}
									goal={g}
									authed={authed}
									editing={editingId === g.id}
									onEdit={() => setEditingId(g.id)}
									onCancelEdit={() => setEditingId(null)}
									onSaved={async () => {
										setEditingId(null);
										await router.invalidate();
									}}
									onRemove={() => setPendingRemove({ id: g.id, name: g.name, isActive: false })}
								/>
							))}
							{!authed && data.activeGoal && (
								<p className={cn(ui.muted, 'mb-6')}>Sign in to add another race.</p>
							)}
						</>
					)}
				</>
			)}

			{tab === 'medals' && (
				<>
					{data.medals.length ? (
						<div className="grid gap-3 min-[640px]:grid-cols-2">
							{data.medals.map((g) => (
								<button
									key={g.id}
									type="button"
									className={cn(
										ui.panel,
										'text-left cursor-pointer transition-[border-color,transform] duration-150 hover:border-accent/40 hover:-translate-y-px'
									)}
									onClick={() => setOpenMedal(g)}
								>
									<p className="m-0 inline-flex items-center gap-1.5 text-accent-fg font-bold text-[0.72rem] tracking-[0.08em] uppercase">
										<Icon name="trophy" size={14} />
										Medal
									</p>
									<h3 className="font-display text-[1.35rem] tracking-[-0.03em] m-0 mt-1">{g.name}</h3>
									<p className="font-display font-bold text-[2.1rem] tracking-[-0.04em] text-accent-fg m-0 mt-2 leading-none">
										{g.result?.time || '—'}
									</p>
									<p className={cn(ui.muted, 'm-0 mt-2')}>
										{formatRaceDate(g.date)}
										{g.result?.distance_km != null ? ` · ${g.result.distance_km} km` : ` · ${g.distance_km} km`}
										{g.result?.pace ? ` · ${g.result.pace}/km` : ''}
									</p>
								</button>
							))}
						</div>
					) : (
						<section className={ui.panel}>
							<p className={cn(ui.muted, 'm-0')}>
								Nothing on the wall yet. Pin a result from the active race after you run it.
							</p>
						</section>
					)}
				</>
			)}

			<Dialog
				open={openMedal != null}
				title={openMedal?.name ?? 'Medal'}
				onClose={() => setOpenMedal(null)}
			>
				{openMedal && (
					<div className="grid gap-3">
						<p className="font-display font-bold text-[2.4rem] tracking-[-0.04em] text-accent-fg m-0 leading-none">
							{openMedal.result?.time || '—'}
						</p>
						<p className={cn(ui.muted, 'm-0')}>
							{formatRaceDate(openMedal.date)}
							{openMedal.result?.distance_km != null
								? ` · ${openMedal.result.distance_km} km`
								: ` · ${openMedal.distance_km} km`}
							{openMedal.result?.pace ? ` · ${openMedal.result.pace}/km` : ''}
						</p>
						<GoalUrlLinks url={openMedal.url} itineraryUrl={openMedal.itinerary_url} />
						{openMedal.time_goal ? <p className="m-0">Time goal was {openMedal.time_goal}.</p> : null}
						{openMedal.primary.length > 0 && (
							<ul className="m-0 pl-[1.1rem]">
								{openMedal.primary.map((p) => (
									<li key={p}>{p}</li>
								))}
							</ul>
						)}
						{openMedal.notes ? <p className={cn(ui.muted, 'm-0 whitespace-pre-wrap')}>{openMedal.notes}</p> : null}
						{openMedal.result?.activity_slug && (
							<div className={ui.actions}>
								<Link
									className={ui.btnPrimary}
									to="/runs/$slug"
									params={{ slug: openMedal.result.activity_slug }}
									onClick={() => setOpenMedal(null)}
								>
									Open activity
								</Link>
							</div>
						)}
					</div>
				)}
			</Dialog>

			<ConfirmDialog
				open={pendingRemove != null}
				title={pendingRemove?.isActive ? 'Clear this goal?' : `Remove ${pendingRemove?.name ?? 'this race'}?`}
				description={
					pendingRemove?.isActive
						? nextAfterClear
							? `The race leaves the calendar and this week’s plan resets. ${nextAfterClear.name} becomes the training target.`
							: 'The race leaves the calendar. This week’s plan resets. Medals stay.'
						: 'This race leaves the calendar. The current plan and active goal stay put.'
				}
				confirmLabel={pendingRemove?.isActive ? 'Clear goal' : 'Remove race'}
				onClose={() => setPendingRemove(null)}
				onConfirm={async () => {
					if (!pendingRemove) return;
					try {
						await clearGoal({ data: pendingRemove.id });
						setPendingRemove(null);
						setEditingId(pendingRemove.isActive && !nextAfterClear ? 'new' : null);
						if (pendingRemove.isActive) {
							snack.success(
								nextAfterClear
									? `Cleared — ${nextAfterClear.name} is now the training target.`
									: 'Goal cleared — Coach will plan base weeks.'
							);
						} else {
							snack.success(`${pendingRemove.name} removed from the calendar.`);
						}
						await router.invalidate();
					} catch (e) {
						snack.error(errorMessage(e, 'Could not remove that race.'));
					}
				}}
			/>
		</>
	);
}

function ActiveGoalCard({
	goal,
	weekCount,
	candidates,
	authed,
	editing,
	onEdit,
	onCancelEdit,
	onSaved,
	onClear
}: {
	goal: Goal;
	weekCount: number;
	candidates: GoalsData['candidates'];
	authed: boolean;
	editing: boolean;
	onEdit: () => void;
	onCancelEdit: () => void;
	onSaved: () => void | Promise<void>;
	onClear: () => void;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const days = daysUntil(goal.date);
	const [pinSlug, setPinSlug] = useState(
		candidates.find((c) => activityLooksLikeRace(goal, c))?.slug ?? candidates[0]?.slug ?? ''
	);
	const [pinning, setPinning] = useState(false);

	async function pinResult() {
		if (!pinSlug) {
			snack.error('Import or log the race first, then pin it here.');
			return;
		}
		setPinning(true);
		try {
			await completeGoal({ data: { activitySlug: pinSlug } });
			snack.success(`Saved — ${goal.name} is on the medal wall.`);
			await router.navigate({ to: '/goals', search: { tab: 'medals' } });
			await router.invalidate();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not pin that result.'));
		} finally {
			setPinning(false);
		}
	}

	return (
		<section className={cn(ui.panel, 'mb-6 grid gap-4')}>
			<div>
				<p className="m-0 inline-flex items-center gap-1.5 text-accent-fg font-bold text-[0.72rem] tracking-[0.08em] uppercase">
					<Icon name="flag" size={14} />
					Active
				</p>
				<h2 className="font-display text-[1.7rem] tracking-[-0.03em] m-0 mt-1">{goal.name}</h2>
				<p className={cn(ui.muted, 'm-0 mt-1')}>
					{formatRaceDate(goal.date)} · {goal.distance_km} km · {activityLabel(goal.sport)}
					{goal.time_goal ? ` · goal ${goal.time_goal}` : ''}
				</p>
				<GoalUrlLinks url={goal.url} itineraryUrl={goal.itinerary_url} />
			</div>
			<div className="flex flex-wrap gap-6">
				<div>
					<span className={cn('block text-[0.78rem]', ui.muted)}>
						{days == null ? 'Race day' : days > 0 ? 'Days to go' : days === 0 ? 'Race day' : 'Days since'}
					</span>
					<strong className="font-display text-[2.1rem] tracking-[-0.04em] text-accent-fg leading-none">
						{days == null ? '—' : days === 0 ? 'Today' : Math.abs(days)}
					</strong>
				</div>
				<div>
					<span className={cn('block text-[0.78rem]', ui.muted)}>Plan</span>
					<strong className="font-display text-[1.35rem] tracking-[-0.03em]">
						{weekCount} week{weekCount === 1 ? '' : 's'}
					</strong>
					<p className={cn(ui.muted, 'm-0 mt-1 text-[0.85rem]')}>
						Monday {goal.plan_start} through race week
					</p>
				</div>
			</div>
			{goal.primary.length > 0 && (
				<ul className="m-0 pl-[1.1rem]">
					{goal.primary.map((p) => (
						<li key={p}>{p}</li>
					))}
				</ul>
			)}
			{goal.notes ? <p className={cn(ui.muted, 'm-0 whitespace-pre-wrap')}>{goal.notes}</p> : null}
			{authed && (
				<div className={cn(ui.actions, 'justify-start!')}>
					{!editing && (
						<button className={ui.btnGhost} type="button" onClick={onEdit}>
							<Icon name="pencil" size={16} />
							Edit
						</button>
					)}
					<button className={cn(ui.btnGhost, ui.btnDanger)} type="button" onClick={onClear}>
						Clear
					</button>
					<Link className={ui.btnGhost} to="/coach" search={{ tab: 'plan' }}>
						<Icon name="board" size={16} />
						Plan
					</Link>
				</div>
			)}
			{authed && editing && (
				<GoalForm initial={goal} submitLabel="Save goal" onCancel={onCancelEdit} onSaved={onSaved} />
			)}
			{authed && (days == null || days <= 1) && (
				<div className="grid gap-3 pt-3 border-t border-line">
					<h3 className="m-0">Pin race result</h3>
					<p className={cn(ui.muted, 'm-0')}>
						Attach the activity you ran on the day. That time becomes the medal.
					</p>
					{candidates.length ? (
						<label className={ui.field}>
							<span>Activity</span>
							<select value={pinSlug} onChange={(e) => setPinSlug(e.target.value)}>
								{candidates.map((c) => (
									<option key={c.slug} value={c.slug}>
										{c.date}
										{c.time ? ` · ${c.time}` : ''}
										{c.distance_km != null ? ` · ${c.distance_km} km` : ''}
									</option>
								))}
							</select>
						</label>
					) : (
						<p className={cn(ui.muted, 'm-0')}>
							No matching activity yet.{' '}
							<Link className="text-accent-fg font-semibold" to="/import">
								Import the GPX
							</Link>
							.
						</p>
					)}
					<div className={ui.actions}>
						<button
							className={ui.btnPrimary}
							type="button"
							disabled={!pinSlug || pinning}
							onClick={() => void pinResult()}
						>
							<Icon name="trophy" size={16} />
							{pinning ? 'Saving…' : 'Save as medal'}
						</button>
					</div>
				</div>
			)}
		</section>
	);
}

function UpcomingGoalCard({
	goal,
	authed,
	editing,
	onEdit,
	onCancelEdit,
	onSaved,
	onRemove
}: {
	goal: Goal;
	authed: boolean;
	editing: boolean;
	onEdit: () => void;
	onCancelEdit: () => void;
	onSaved: () => void | Promise<void>;
	onRemove: () => void;
}) {
	const days = daysUntil(goal.date);
	return (
		<section className={cn(ui.panel, 'mb-3 grid gap-3')}>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="m-0 inline-flex items-center gap-1.5 text-muted font-bold text-[0.72rem] tracking-[0.08em] uppercase">
						<Icon name="calendar" size={14} />
						Upcoming
					</p>
					<h3 className="font-display text-[1.35rem] tracking-[-0.03em] m-0 mt-1">{goal.name}</h3>
					<p className={cn(ui.muted, 'm-0 mt-1')}>
						{formatRaceDate(goal.date)} · {goal.distance_km} km · {activityLabel(goal.sport)}
						{goal.time_goal ? ` · goal ${goal.time_goal}` : ''}
					</p>
					<GoalUrlLinks url={goal.url} itineraryUrl={goal.itinerary_url} />
				</div>
				<div className="text-right">
					<span className={cn('block text-[0.78rem]', ui.muted)}>
						{days == null ? 'Race day' : days > 0 ? 'Days to go' : days === 0 ? 'Race day' : 'Days since'}
					</span>
					<strong className="font-display text-[1.7rem] tracking-[-0.04em] leading-none">
						{days == null ? '—' : days === 0 ? 'Today' : Math.abs(days)}
					</strong>
				</div>
			</div>
			{authed && (
				<div className={cn(ui.actions, 'justify-start!')}>
					{!editing && (
						<button className={ui.btnGhost} type="button" onClick={onEdit}>
							<Icon name="pencil" size={16} />
							Edit
						</button>
					)}
					<button className={cn(ui.btnGhost, ui.btnDanger)} type="button" onClick={onRemove}>
						Remove
					</button>
				</div>
			)}
			{authed && editing && (
				<GoalForm initial={goal} submitLabel="Save race" onCancel={onCancelEdit} onSaved={onSaved} />
			)}
		</section>
	);
}

function GoalForm({
	initial,
	submitLabel,
	onCancel,
	onSaved
}: {
	initial: Goal | null;
	submitLabel: string;
	onCancel: () => void;
	onSaved: () => void | Promise<void>;
}) {
	const snack = useSnackbar();
	const draft = initial ?? emptyGoalDraft();
	const [name, setName] = useState(draft.name);
	const [date, setDate] = useState(draft.date);
	const [distance, setDistance] = useState(String(draft.distance_km));
	const [sport, setSport] = useState<ActivityType>(
		ACTIVITY_TYPES.includes(draft.sport as ActivityType) ? (draft.sport as ActivityType) : 'run'
	);
	const [timeGoal, setTimeGoal] = useState(draft.time_goal);
	const [planStart, setPlanStart] = useState(draft.plan_start);
	const [url, setUrl] = useState(draft.url ?? '');
	const [itineraryUrl, setItineraryUrl] = useState(draft.itinerary_url ?? '');
	const [primary, setPrimary] = useState(draft.primary.join('\n'));
	const [notes, setNotes] = useState(draft.notes);
	const [copyTab, setCopyTab] = useState<'copy' | 'generate'>(() =>
		hasRaceCopy(draft.primary, draft.notes) ? 'copy' : 'generate'
	);
	const [extra, setExtra] = useState('');
	const [briefText, setBriefText] = useState('');
	const [replyJson, setReplyJson] = useState('');
	const [briefBusy, setBriefBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const [busy, setBusy] = useState(false);

	const hint = useMemo(() => planStartHint(planStart, date), [planStart, date]);
	const weeks = useMemo(() => {
		try {
			return calendarFromGoal({ plan_start: mondayIso(planStart), date }).weekCount;
		} catch {
			return 1;
		}
	}, [planStart, date]);

	async function generateBrief() {
		setBriefBusy(true);
		try {
			const next = await getGoalBrief({
				data: {
					name,
					date,
					distance_km: distance,
					sport,
					time_goal: timeGoal,
					plan_start: planStart,
					url,
					itinerary_url: itineraryUrl,
					primary,
					notes,
					extra
				}
			});
			setBriefText(next);
		} catch (e) {
			snack.error(errorMessage(e, 'Could not build the prompt.'));
		} finally {
			setBriefBusy(false);
		}
	}

	async function copyBrief() {
		try {
			await navigator.clipboard.writeText(briefText);
			setCopied(true);
			setTimeout(() => setCopied(false), 1800);
		} catch {
			snack.error('Could not copy — select and copy the text instead.');
		}
	}

	function applyReply() {
		try {
			const patch = goalDraftFromReply(replyJson);
			if (patch.name !== undefined) setName(patch.name);
			if (patch.date !== undefined) setDate(patch.date);
			if (patch.distance_km !== undefined) setDistance(patch.distance_km);
			if (patch.sport !== undefined) setSport(patch.sport);
			if (patch.time_goal !== undefined) setTimeGoal(patch.time_goal);
			if (patch.plan_start !== undefined) setPlanStart(patch.plan_start);
			if (patch.url !== undefined) setUrl(patch.url);
			if (patch.itinerary_url !== undefined) setItineraryUrl(patch.itinerary_url);
			if (patch.primary !== undefined) setPrimary(patch.primary);
			if (patch.notes !== undefined) setNotes(patch.notes);
			setReplyJson('');
			if (patch.primary !== undefined || patch.notes !== undefined) setCopyTab('copy');
			snack.success('Filled from the reply — review and save.');
		} catch (e) {
			snack.error(errorMessage(e, 'Could not apply that JSON.'));
		}
	}

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setBusy(true);
		try {
			const res = await saveActiveGoal({
				data: {
					id: initial?.id,
					name,
					date,
					distance_km: Number(distance),
					sport,
					time_goal: timeGoal,
					primary: primary.split('\n'),
					notes,
					url,
					itinerary_url: itineraryUrl,
					plan_start: mondayIso(planStart)
				}
			});
			if (res.isActive) {
				snack.success(`Saved — ${weeks} week plan through race day.`);
			} else {
				snack.success(`Saved — later on the calendar. Training stays on ${res.activeName}.`);
			}
			await onSaved();
		} catch (err) {
			snack.error(errorMessage(err, 'Could not save the goal.'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className={cn(ui.form, initial ? 'pt-3 border-t border-line' : '')} onSubmit={onSubmit}>
			<label className={ui.field}>
				<span className={ui.req}>Race name</span>
				<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Amersfoort 10K" />
			</label>
			<div className={ui.formGrid}>
				<label className={ui.field}>
					<span className={ui.req}>Race date</span>
					<input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
				</label>
				<label className={ui.field}>
					<span className={ui.req}>Distance (km)</span>
					<input
						type="number"
						min={0.1}
						step="0.1"
						value={distance}
						onChange={(e) => setDistance(e.target.value)}
						required
					/>
				</label>
			</div>
			<div className={ui.field}>
				<span>Sport</span>
				<ChoiceChips
					aria-label="Goal sport"
					value={sport}
					options={ACTIVITY_TYPES.map((t) => ({
						value: t,
						label: sportChipLabel(t, activityLabel(t))
					}))}
					onChange={setSport}
				/>
			</div>
			<label className={ui.field}>
				<span>Time goal</span>
				<input value={timeGoal} onChange={(e) => setTimeGoal(e.target.value)} placeholder="45:00" />
			</label>
			<label className={ui.field}>
				<span className={ui.req}>Plan starts (Monday)</span>
				<input
					type="date"
					value={planStart}
					onChange={(e) => setPlanStart(e.target.value)}
					onBlur={() => setPlanStart(mondayIso(planStart))}
					required
				/>
				<span className={ui.fieldHint}>{hint}</span>
			</label>
			<div className={ui.formGrid}>
				<label className={ui.field}>
					<span>Race URL</span>
					<input
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						placeholder="https://example.com/race"
						inputMode="url"
						autoComplete="url"
					/>
				</label>
				<label className={ui.field}>
					<span>Itinerary URL</span>
					<input
						value={itineraryUrl}
						onChange={(e) => setItineraryUrl(e.target.value)}
						placeholder="https://maps.app.goo.gl/…"
						inputMode="url"
						autoComplete="url"
					/>
				</label>
			</div>
			<div className={cn(ui.formSection, 'border-t border-line pt-4 grid gap-4')}>
				<SegmentedToggle
					aria-label="Priorities and notes"
					value={copyTab}
					onChange={setCopyTab}
					className="w-full"
					options={[
						{ value: 'copy', label: 'Priorities & notes' },
						{
							value: 'generate',
							label: (
								<>
									<Icon name="sparkle" size={14} />
									Generate
								</>
							)
						}
					]}
				/>
				{copyTab === 'copy' && (
					<>
						<label className={ui.field}>
							<span>Priorities (one per line)</span>
							<textarea rows={4} value={primary} onChange={(e) => setPrimary(e.target.value)} />
						</label>
						<label className={ui.field}>
							<span>Notes</span>
							<textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
						</label>
					</>
				)}
				{copyTab === 'generate' && (
					<>
						<p className={cn(ui.muted, 'm-0')}>
							Same as Coach: build a prompt from this race plus your last 30 days of activities, copy
							it to an AI, then paste the JSON back to fill the form.
						</p>
						<label className={ui.field}>
							<span>Anything extra for the prompt? (optional)</span>
							<textarea
								rows={3}
								value={extra}
								onChange={(e) => setExtra(e.target.value)}
								placeholder="e.g. hilly course, travel the day before, want a conservative first 5k"
							/>
						</label>
						<div className={cn(ui.actions, 'justify-start!')}>
							<button
								className={ui.btnPrimary}
								type="button"
								onClick={() => void generateBrief()}
								disabled={briefBusy}
							>
								<Icon name="sparkle" size={16} />
								{briefBusy ? 'Building…' : briefText ? 'Regenerate prompt' : 'Generate prompt'}
							</button>
						</div>
						{briefText && (
							<>
								<label className={ui.field}>
									<span>Prompt (editable — tweak before you copy)</span>
									<textarea
										className={ui.editor}
										rows={12}
										value={briefText}
										onChange={(e) => setBriefText(e.target.value)}
									/>
								</label>
								<div className={cn(ui.actions, 'justify-start!')}>
									<button className={ui.btnGhost} type="button" onClick={() => void copyBrief()}>
										<Icon name={copied ? 'check' : 'copy'} size={16} />
										{copied ? 'Copied' : 'Copy prompt'}
									</button>
								</div>
							</>
						)}
						<label className={ui.field}>
							<span>Paste the JSON your AI returned</span>
							<textarea
								className={ui.editor}
								rows={8}
								value={replyJson}
								onChange={(e) => setReplyJson(e.target.value)}
								placeholder='{ "name": "…", "primary": ["…"], "notes": "…" }'
							/>
						</label>
						<div className={cn(ui.actions, 'justify-start!')}>
							<button
								className={ui.btnGhost}
								type="button"
								onClick={applyReply}
								disabled={!replyJson.trim()}
							>
								<Icon name="plus" size={16} />
								Fill form
							</button>
						</div>
					</>
				)}
			</div>
			<div className={ui.actions}>
				<button className={ui.btnPrimary} type="submit" disabled={busy}>
					<Icon name="check" size={16} />
					{busy ? 'Saving…' : submitLabel}
				</button>
				<button className={ui.btnGhost} type="button" onClick={onCancel} disabled={busy}>
					Cancel
				</button>
			</div>
		</form>
	);
}
