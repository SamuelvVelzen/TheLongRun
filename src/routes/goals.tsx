import { ACTIVITY_TYPES, activityLabel, type ActivityType } from '$lib/activity';
import { useAuthed } from '$lib/auth';
import { activityLooksLikeRace, emptyGoalDraft, planStartHint } from '$lib/goals';
import { calendarFromGoal, daysUntil, mondayIso } from '$lib/plan';
import {
    clearActiveGoal,
    completeGoal,
    getGoalsData,
    saveActiveGoal
} from '$lib/server/functions';
import type { Goal } from '$lib/types';
import { cn, ui } from '$lib/ui';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { ChoiceChips } from '../components/ChoiceChips';
import { DeferredData } from '../components/DeferredData';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Icon, sportChipLabel } from '../components/Icon';
import { errorMessage, useSnackbar } from '../components/Snackbar';

export const Route = createFileRoute('/goals')({
	loader: () => ({ page: getGoalsData() }),
	component: GoalsPage
});

type GoalsData = Awaited<ReturnType<typeof getGoalsData>>;

function formatRaceDate(iso: string) {
	const d = new Date(`${iso}T12:00:00`);
	if (Number.isNaN(d.getTime())) return iso;
	return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function GoalsPage() {
	const { page } = Route.useLoaderData();
	const authed = useAuthed();
	return (
		<>
			<section className={ui.hero}>
				<div>
					<p className={ui.muted}>Race on the calendar</p>
					<h1>Goals</h1>
					<p>
						One active race drives the plan length and the generate prompt. When it’s done, it
						becomes a medal with the time you ran.
					</p>
				</div>
			</section>
			<DeferredData promise={page}>
				{(data) => <GoalsBody data={data} authed={authed} />}
			</DeferredData>
		</>
	);
}

function GoalsBody({ data, authed }: { data: GoalsData; authed: boolean }) {
	const router = useRouter();
	const snack = useSnackbar();
	const [editing, setEditing] = useState(!data.activeGoal);
	const [pendingClear, setPendingClear] = useState(false);
	const [openMedal, setOpenMedal] = useState<Goal | null>(null);

	return (
		<>
			{data.activeGoal ? (
				<ActiveGoalCard
					goal={data.activeGoal}
					weekCount={data.calendar.weekCount}
					candidates={data.candidates}
					authed={authed}
					editing={editing}
					onEdit={() => setEditing(true)}
					onCancelEdit={() => setEditing(false)}
					onSaved={async () => {
						setEditing(false);
						await router.invalidate();
					}}
					onClear={() => setPendingClear(true)}
				/>
			) : (
				<section className={cn(ui.panel, 'mb-6')}>
					<p className={cn(ui.muted, 'mt-0')}>
						No race on the calendar. Coach still plans this week as base training.
					</p>
					{authed && !editing && (
						<button className={ui.btnPrimary} type="button" onClick={() => setEditing(true)}>
							<Icon name="flag" size={16} />
							Set a goal
						</button>
					)}
					{authed && editing && (
						<GoalForm
							initial={null}
							onCancel={() => setEditing(false)}
							onSaved={async () => {
								setEditing(false);
								await router.invalidate();
							}}
						/>
					)}
					{!authed && (
						<p className={cn(ui.muted, 'mb-0')}>Sign in to set a race.</p>
					)}
				</section>
			)}

			<section className={ui.sectionTitle}>
				<h2>Medals</h2>
				<p>{data.medals.length ? `${data.medals.length} finished` : 'Races you pin a result on land here.'}</p>
			</section>
			{data.medals.length ? (
				<div className="grid gap-3 min-[640px]:grid-cols-2">
					{data.medals.map((g) => (
						<button
							key={g.id}
							type="button"
							className={cn(
								ui.panel,
								'text-left cursor-pointer transition-[border-color,transform] duration-150 hover:border-[rgba(200,242,90,0.4)] hover:-translate-y-px'
							)}
							onClick={() => setOpenMedal(g)}
						>
							<p className="m-0 inline-flex items-center gap-1.5 text-accent font-bold text-[0.72rem] tracking-[0.08em] uppercase">
								<Icon name="trophy" size={14} />
								Medal
							</p>
							<h3 className="font-display text-[1.35rem] tracking-[-0.03em] m-0 mt-1">{g.name}</h3>
							<p className="font-display font-bold text-[2.1rem] tracking-[-0.04em] text-accent m-0 mt-2 leading-none">
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
				<p className={ui.muted}>Nothing on the wall yet.</p>
			)}

			<Dialog
				open={openMedal != null}
				title={openMedal?.name ?? 'Medal'}
				onClose={() => setOpenMedal(null)}
			>
				{openMedal && (
					<div className="grid gap-3">
						<p className="font-display font-bold text-[2.4rem] tracking-[-0.04em] text-accent m-0 leading-none">
							{openMedal.result?.time || '—'}
						</p>
						<p className={cn(ui.muted, 'm-0')}>
							{formatRaceDate(openMedal.date)}
							{openMedal.result?.distance_km != null
								? ` · ${openMedal.result.distance_km} km`
								: ` · ${openMedal.distance_km} km`}
							{openMedal.result?.pace ? ` · ${openMedal.result.pace}/km` : ''}
						</p>
						{openMedal.time_goal ? (
							<p className="m-0">Time goal was {openMedal.time_goal}.</p>
						) : null}
						{openMedal.primary.length > 0 && (
							<ul className="m-0 pl-[1.1rem]">
								{openMedal.primary.map((p) => (
									<li key={p}>{p}</li>
								))}
							</ul>
						)}
						{openMedal.result?.activity_slug && (
							<Link
								className={ui.btnPrimary}
								to="/runs/$slug"
								params={{ slug: openMedal.result.activity_slug }}
								onClick={() => setOpenMedal(null)}
							>
								Open activity
							</Link>
						)}
					</div>
				)}
			</Dialog>

			<ConfirmDialog
				open={pendingClear}
				title="Clear this goal?"
				description="The race leaves the calendar. This week’s plan resets. Medals stay."
				confirmLabel="Clear goal"
				onClose={() => setPendingClear(false)}
				onConfirm={async () => {
					try {
						await clearActiveGoal();
						setPendingClear(false);
						setEditing(true);
						snack.success('Goal cleared — Coach will plan base weeks.');
						await router.invalidate();
					} catch (e) {
						snack.error(errorMessage(e, 'Could not clear the goal.'));
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
				<p className="m-0 inline-flex items-center gap-1.5 text-accent font-bold text-[0.72rem] tracking-[0.08em] uppercase">
					<Icon name="flag" size={14} />
					Active
				</p>
				<h2 className="font-display text-[1.7rem] tracking-[-0.03em] m-0 mt-1">{goal.name}</h2>
				<p className={cn(ui.muted, 'm-0 mt-1')}>
					{formatRaceDate(goal.date)} · {goal.distance_km} km · {activityLabel(goal.sport)}
					{goal.time_goal ? ` · goal ${goal.time_goal}` : ''}
				</p>
			</div>
			<div className="flex flex-wrap gap-6">
				<div>
					<span className={cn('block text-[0.78rem]', ui.muted)}>
						{days == null ? 'Race day' : days > 0 ? 'Days to go' : days === 0 ? 'Race day' : 'Days since'}
					</span>
					<strong className="font-display text-[2.1rem] tracking-[-0.04em] text-accent leading-none">
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
			{authed && (
				<div className={ui.actions}>
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
				<GoalForm initial={goal} onCancel={onCancelEdit} onSaved={onSaved} />
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
							<select
								value={pinSlug}
								onChange={(e) => setPinSlug(e.target.value)}
							>
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
							<Link className="text-accent font-semibold" to="/import">
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

function GoalForm({
	initial,
	onCancel,
	onSaved
}: {
	initial: Goal | null;
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
	const [primary, setPrimary] = useState(draft.primary.join('\n'));
	const [notes, setNotes] = useState(draft.notes);
	const [busy, setBusy] = useState(false);

	const hint = useMemo(() => planStartHint(planStart, date), [planStart, date]);
	const weeks = useMemo(() => {
		try {
			return calendarFromGoal({ plan_start: mondayIso(planStart), date }).weekCount;
		} catch {
			return 1;
		}
	}, [planStart, date]);

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
					plan_start: mondayIso(planStart)
				}
			});
			snack.success(`Saved — ${weeks} week plan through race day.`);
			await onSaved();
			void res;
		} catch (err) {
			snack.error(errorMessage(err, 'Could not save the goal.'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className={cn(ui.form, 'pt-3 border-t border-line')} onSubmit={onSubmit}>
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
			<label className={ui.field}>
				<span>Priorities (one per line)</span>
				<textarea rows={4} value={primary} onChange={(e) => setPrimary(e.target.value)} />
			</label>
			<label className={ui.field}>
				<span>Notes</span>
				<textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} />
			</label>
			<div className={ui.actions}>
				<button className={ui.btnPrimary} type="submit" disabled={busy}>
					<Icon name="check" size={16} />
					{busy ? 'Saving…' : initial ? 'Save goal' : 'Set goal'}
				</button>
				<button className={ui.btnGhost} type="button" onClick={onCancel} disabled={busy}>
					Cancel
				</button>
			</div>
		</form>
	);
}
