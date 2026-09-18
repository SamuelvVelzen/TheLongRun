import { ACTIVITY_TYPES, activityLabel } from '$lib/activity';
import { useAuthed } from '$lib/auth';
import {
    activityLooksLikeRace,
    canPinRaceResult,
    emptyGoalDraft,
    goalDraftFromReply,
    goalUrlHref,
    isOlderPastRace,
    isUnpinnedPastRace,
    planStartHint,
    shiftPlanStartWithRaceDate
} from '$lib/goals';
import { goalFormSchema, goalToFormValues, pinRaceSchema, toGoalInput } from '$lib/goal-form';
import { calendarFromGoal, daysUntil, mondayIso } from '$lib/plan';
import { clearGoal, completeGoal, getGoalBrief, getGoalsData, saveActiveGoal } from '$lib/server/functions';
import { appHead } from '$lib/title';
import type { Goal } from '$lib/types';
import { cn } from '$lib/ui';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import { DeferredData } from '../components/DeferredData';
import { ConfirmDialog } from '../components/Dialog';
import { Icon, sportChipLabel } from '../components/Icon';
import { MedalDialog } from '../components/MedalDialog';
import { PageHero } from '../components/PageHero';
import { RouteLine } from '../components/RouteLine';
import { SegmentedToggle } from '../components/SegmentedToggle';
import { errorMessage, useSnackbar } from '../components/Snackbar';
import { Actions, Button, Field, Form, FormGrid, FormSection, Textarea, useAppForm, buttonClass, panelClass, actionsClass, sectionTitleClass, tabBarClass } from '../components/ui';

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
	head: () => appHead('Goals'),
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

function goalSummaryLine(
	goal: Pick<Goal, 'date' | 'distance_km' | 'sport' | 'time_goal' | 'bib_number' | 'wave' | 'start_time'>
) {
	return [
		formatRaceDate(goal.date),
		goal.start_time || null,
		`${goal.distance_km} km`,
		activityLabel(goal.sport),
		goal.time_goal ? `goal ${goal.time_goal}` : null,
		goal.wave ? `wave ${goal.wave}` : null,
		goal.bib_number ? `bib ${goal.bib_number}` : null
	]
		.filter(Boolean)
		.join(' · ');
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
			<div className={tabBarClass()}>
				<SegmentedToggle
					fill
					aria-label="Goals"
					value={tab}
					onChange={setTab}
					options={[
						{
							value: 'races',
							label: (
								<>
									<Icon name="flag" size={15} />
									Races
								</>
							)
						},
						{
							value: 'medals',
							label: (
								<>
									<Icon name="trophy" size={15} />
									Medals
								</>
							)
						}
					]}
				/>
			</div>

			<PageHero
				variant="quiet"
				className="max-sm:hidden"
				kicker={tab === 'medals' ? 'On the wall' : 'Race on the calendar'}
				title="Goals"
				lead={
					tab === 'medals'
						? 'Finished races live here with the time you pinned. Open one for the goal you set and the activity you ran.'
						: 'The soonest race is active — it drives the plan length and the generate prompt. Later races wait. Older past races stay hidden until you open them.'
				}
			/>

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
	const [showOlder, setShowOlder] = useState(false);
	const nextAfterClear = pendingRemove?.isActive ? data.upcoming[0] : undefined;
	const pastOpen = data.upcoming
		.filter((g) => isUnpinnedPastRace(g))
		.slice()
		.sort((a, b) => b.date.localeCompare(a.date));
	const olderPast = data.upcoming
		.filter((g) => isOlderPastRace(g))
		.slice()
		.sort((a, b) => b.date.localeCompare(a.date));
	const later = data.upcoming.filter((g) => {
		const days = daysUntil(g.date);
		return days == null || days >= 0;
	});
	const olderVisible =
		olderPast.length > 0 &&
		(showOlder || (typeof editingId === 'string' && olderPast.some((g) => g.id === editingId)));

	function toggleOlder() {
		if (olderVisible) {
			setShowOlder(false);
			if (typeof editingId === 'string' && olderPast.some((g) => g.id === editingId)) {
				setEditingId(null);
			}
		} else {
			setShowOlder(true);
		}
	}

	function pastCard(g: Goal) {
		return (
			<UpcomingGoalCard
				key={g.id}
				goal={g}
				candidates={data.candidatesByGoalId[g.id] ?? []}
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
		);
	}

	return (
		<>
			{tab === 'races' && (
				<>
					{data.activeGoal ? (
						<ActiveGoalCard
							goal={data.activeGoal}
							weekCount={data.calendar.weekCount}
							candidates={data.candidatesByGoalId[data.activeGoal.id] ?? []}
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
						<section className={panelClass('mb-6')}>
							<p className={cn('text-muted', 'mt-0')}>
								No race on the calendar. Coach still plans this week as base training.
							</p>
							{authed && editingId !== 'new' && (
								<div className={actionsClass('justify-start!')}>
									<button className={buttonClass()} type="button" onClick={() => setEditingId('new')}>
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
							{!authed && <p className={cn('text-muted', 'mb-0')}>Sign in to set a race.</p>}
						</section>
					)}

					{data.activeGoal && authed && editingId === 'new' && (
						<section className={panelClass('mb-6 grid gap-3')}>
							<div>
								<p className="m-0 inline-flex items-center gap-1.5 text-accent-fg font-bold text-[0.72rem] tracking-[0.08em] uppercase">
									<Icon name="plus" size={14} />
									Add race
								</p>
								<p className={cn('text-muted', 'm-0 mt-1')}>
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

					{(pastOpen.length > 0 || olderVisible) && (
						<>
							<section className={sectionTitleClass()}>
								<div>
									<h2>Unpinned</h2>
									<p>
										{pastOpen.length
											? pastOpen.length === 1
												? 'This race already happened. Pin the activity this week to put it on the medal wall.'
												: `${pastOpen.length} races already happened. Pin each activity this week to put them on the medal wall.`
											: olderPast.length === 1
												? 'This race already happened. Pin the activity to put it on the medal wall.'
												: `${olderPast.length} races already happened. Pin each activity to put them on the medal wall.`}
									</p>
								</div>
							</section>
							{pastOpen.map(pastCard)}
							{olderVisible && olderPast.map(pastCard)}
						</>
					)}

					{(data.activeGoal || later.length > 0) && (
						<>
							<section className={sectionTitleClass()}>
								<div>
									<h2>Up next</h2>
									<p>
										{later.length ? (
											<>
												{`${later.length} later race${later.length === 1 ? '' : 's'}`}
												{olderPast.length > 0 && (
													<>
														{' · '}
														<button
															type="button"
															className="appearance-none bg-transparent border-0 p-0 m-0 text-accent-fg font-semibold font-inherit cursor-pointer hover:underline underline-offset-2"
															aria-expanded={olderVisible}
															onClick={toggleOlder}
														>
															{olderVisible
																? 'Hide older'
																: olderPast.length === 1
																	? '1 older race'
																	: `${olderPast.length} older races`}
														</button>
													</>
												)}
												{' — the soonest date becomes active when this one is done.'}
											</>
										) : olderPast.length > 0 ? (
											<>
												<button
													type="button"
													className="appearance-none bg-transparent border-0 p-0 m-0 text-accent-fg font-semibold font-inherit cursor-pointer hover:underline underline-offset-2"
													aria-expanded={olderVisible}
													onClick={toggleOlder}
												>
													{olderVisible
														? 'Hide older'
														: olderPast.length === 1
															? '1 older race'
															: `${olderPast.length} older races`}
												</button>
												{' — already run.'}
											</>
										) : (
											'Add the races after this one. Closest date stays active.'
										)}
									</p>
								</div>
								{authed && data.activeGoal && editingId !== 'new' && (
									<button className={buttonClass()} type="button" onClick={() => setEditingId('new')}>
										<Icon name="plus" size={16} />
										Add race
									</button>
								)}
							</section>
							{later.map((g) => (
								<UpcomingGoalCard
									key={g.id}
									goal={g}
									candidates={data.candidatesByGoalId[g.id] ?? []}
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
								<p className={cn('text-muted', 'mb-6')}>Sign in to add another race.</p>
							)}
						</>
					)}
				</>
			)}

			{tab === 'medals' && (
				<>
					{data.medals.length ? (
						<div className="grid gap-3 min-[640px]:grid-cols-2">
							{data.medals.map((g) => {
								const track = data.medalTracks[g.id];
								return (
									<button
										key={g.id}
										type="button"
										className={panelClass(
											'text-left cursor-pointer transition-[border-color,transform] duration-150 hover:border-accent/40 hover:-translate-y-px flex items-stretch justify-between gap-3'
										)}
										onClick={() => setOpenMedal(g)}
									>
										<div className="min-w-0 flex-1">
											<p className="m-0 inline-flex items-center gap-1.5 text-accent-fg font-bold text-[0.72rem] tracking-[0.08em] uppercase">
												<Icon name="trophy" size={14} />
												Medal
											</p>
											<h3 className="font-display text-[1.35rem] tracking-[-0.03em] m-0 mt-1">{g.name}</h3>
											<p className="font-display font-bold text-[2.1rem] tracking-[-0.04em] text-accent-fg m-0 mt-2 leading-none">
												{g.result?.time || '—'}
											</p>
											<p className={cn('text-muted', 'm-0 mt-2')}>
												{formatRaceDate(g.date)}
												{g.result?.distance_km != null
													? ` · ${g.result.distance_km} km`
													: ` · ${g.distance_km} km`}
												{g.result?.pace ? ` · ${g.result.pace}/km` : ''}
											</p>
										</div>
										{track && (
											<RouteLine
												coords={track}
												className="shrink-0 self-center text-accent/35"
											/>
										)}
									</button>
								);
							})}
						</div>
					) : (
						<section className={panelClass()}>
							<p className={cn('text-muted', 'm-0')}>
								Nothing on the wall yet. Pin a result after you run the race.
							</p>
						</section>
					)}
				</>
			)}

			<MedalDialog
				open={openMedal != null}
				goal={openMedal}
				track={openMedal ? data.medalTracks[openMedal.id] : undefined}
				activity={openMedal ? data.medalActivities[openMedal.id] : undefined}
				authed={authed}
				onClose={() => setOpenMedal(null)}
				onSaved={() => router.invalidate()}
			/>

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

function PinRaceResult({
	goal,
	candidates
}: {
	goal: Goal;
	candidates: GoalsData['candidatesByGoalId'][string];
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const defaultSlug = (() => {
		const tight = candidates.find((c) => activityLooksLikeRace(goal, c) || c.date === goal.date);
		if (tight) return tight.slug;
		return candidates.length === 1 ? candidates[0]!.slug : '';
	})();
	const form = useAppForm({
		defaultValues: { pinSlug: defaultSlug },
		validators: { onSubmit: pinRaceSchema },
		onSubmit: async ({ value }) => {
			try {
				await completeGoal({ data: { goalId: goal.id, activitySlug: value.pinSlug } });
				snack.success(`Saved — ${goal.name} is on the medal wall.`);
				await router.navigate({ to: '/goals', search: { tab: 'medals' } });
				await router.invalidate();
			} catch (e) {
				snack.error(errorMessage(e, 'Could not pin that result.'));
			}
		}
	});

	return (
		<div className="grid gap-3 pt-3 border-t border-line">
			<h3 className="m-0">Pin race result</h3>
			<p className={cn('text-muted', 'm-0')}>
				Pick the activity you ran. That time becomes the medal.
				{goal.bib_number ? ` Bib ${goal.bib_number} is already saved.` : ''}
			</p>
			{candidates.length ? (
				<Form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						void form.handleSubmit();
					}}
				>
					<form.AppField
						name="pinSlug"
						children={(field) => (
							<field.SelectField
								label="Activity"
								placeholder="Pick the activity…"
								options={candidates.map((c) => ({
									value: c.slug,
									label: `${c.date}${c.time ? ` · ${c.time}` : ''}${c.distance_km != null ? ` · ${c.distance_km} km` : ''}`
								}))}
							/>
						)}
					/>
					<Actions>
						<form.AppForm>
							<form.SubmitButton busyLabel="Saving…">
								<Icon name="trophy" size={16} />
								Save as medal
							</form.SubmitButton>
						</form.AppForm>
					</Actions>
				</Form>
			) : (
				<>
					<p className={cn('text-muted', 'm-0')}>
						No matching activity yet.{' '}
						<Link className="text-accent-fg font-semibold" to="/import">
							Import the GPX
						</Link>
						, then pick it here.
					</p>
					<Actions>
						<Button variant="primary" disabled>
							<Icon name="trophy" size={16} />
							Save as medal
						</Button>
					</Actions>
				</>
			)}
		</div>
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
	candidates: GoalsData['candidatesByGoalId'][string];
	authed: boolean;
	editing: boolean;
	onEdit: () => void;
	onCancelEdit: () => void;
	onSaved: () => void | Promise<void>;
	onClear: () => void;
}) {
	const days = daysUntil(goal.date);
	return (
		<section className={panelClass('mb-6 grid gap-4')}>
			<div>
				<p className="m-0 inline-flex items-center gap-1.5 text-accent-fg font-bold text-[0.72rem] tracking-[0.08em] uppercase">
					<Icon name="flag" size={14} />
					Active
				</p>
				<h2 className="font-display text-[1.7rem] tracking-[-0.03em] m-0 mt-1">{goal.name}</h2>
				<p className={cn('text-muted', 'm-0 mt-1')}>{goalSummaryLine(goal)}</p>
				<GoalUrlLinks url={goal.url} itineraryUrl={goal.itinerary_url} />
			</div>
			<div className="flex flex-wrap gap-6">
				<div>
					<span className={cn('block text-[0.78rem]', 'text-muted')}>
						{days == null ? 'Race day' : days > 0 ? 'Days to go' : days === 0 ? 'Race day' : 'Days since'}
					</span>
					<strong className="font-display text-[2.1rem] tracking-[-0.04em] text-accent-fg leading-none">
						{days == null ? '—' : days === 0 ? 'Today' : Math.abs(days)}
					</strong>
				</div>
				<div>
					<span className={cn('block text-[0.78rem]', 'text-muted')}>Plan</span>
					<strong className="font-display text-[1.35rem] tracking-[-0.03em]">
						{weekCount} week{weekCount === 1 ? '' : 's'}
					</strong>
					<p className={cn('text-muted', 'm-0 mt-1 text-[0.85rem]')}>
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
			{goal.notes ? <p className={cn('text-muted', 'm-0 whitespace-pre-wrap')}>{goal.notes}</p> : null}
			{authed && (
				<div className={actionsClass('justify-start!')}>
					{!editing && (
						<button className={buttonClass({ variant: 'ghost' })} type="button" onClick={onEdit}>
							<Icon name="pencil" size={16} />
							Edit
						</button>
					)}
					<button className={buttonClass({ variant: 'danger' })} type="button" onClick={onClear}>
						Clear
					</button>
					<Link className={buttonClass({ variant: 'ghost' })} to="/coach" search={{ tab: 'plan' }}>
						<Icon name="board" size={16} />
						Plan
					</Link>
				</div>
			)}
			{authed && editing && (
				<GoalForm initial={goal} submitLabel="Save goal" onCancel={onCancelEdit} onSaved={onSaved} />
			)}
			{authed && canPinRaceResult(goal) && !editing && (
				<PinRaceResult goal={goal} candidates={candidates} />
			)}
		</section>
	);
}

function UpcomingGoalCard({
	goal,
	candidates,
	authed,
	editing,
	onEdit,
	onCancelEdit,
	onSaved,
	onRemove
}: {
	goal: Goal;
	candidates: GoalsData['candidatesByGoalId'][string];
	authed: boolean;
	editing: boolean;
	onEdit: () => void;
	onCancelEdit: () => void;
	onSaved: () => void | Promise<void>;
	onRemove: () => void;
}) {
	const days = daysUntil(goal.date);
	const past = days != null && days < 0;
	return (
		<section className={panelClass('mb-3 grid gap-3')}>
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<p className="m-0 inline-flex items-center gap-1.5 text-muted font-bold text-[0.72rem] tracking-[0.08em] uppercase">
						<Icon name="calendar" size={14} />
						{past ? 'Past' : 'Upcoming'}
					</p>
					<h3 className="font-display text-[1.35rem] tracking-[-0.03em] m-0 mt-1">{goal.name}</h3>
					<p className={cn('text-muted', 'm-0 mt-1')}>{goalSummaryLine(goal)}</p>
					<GoalUrlLinks url={goal.url} itineraryUrl={goal.itinerary_url} />
				</div>
				<div className="text-right">
					<span className={cn('block text-[0.78rem]', 'text-muted')}>
						{days == null ? 'Race day' : days > 0 ? 'Days to go' : days === 0 ? 'Race day' : 'Days since'}
					</span>
					<strong className="font-display text-[1.7rem] tracking-[-0.04em] leading-none">
						{days == null ? '—' : days === 0 ? 'Today' : Math.abs(days)}
					</strong>
				</div>
			</div>
			{authed && (
				<div className={actionsClass('justify-start!')}>
					{!editing && (
						<button className={buttonClass({ variant: 'ghost' })} type="button" onClick={onEdit}>
							<Icon name="pencil" size={16} />
							Edit
						</button>
					)}
					<button className={buttonClass({ variant: 'danger' })} type="button" onClick={onRemove}>
						Remove
					</button>
				</div>
			)}
			{authed && editing && (
				<GoalForm initial={goal} submitLabel="Save race" onCancel={onCancelEdit} onSaved={onSaved} />
			)}
			{authed && canPinRaceResult(goal) && !editing && (
				<PinRaceResult goal={goal} candidates={candidates} />
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
	const defaultValues = goalToFormValues(draft);
	const lastDate = useRef(defaultValues.date);
	const [copyTab, setCopyTab] = useState<'copy' | 'generate'>(() =>
		hasRaceCopy(draft.primary, draft.notes) ? 'copy' : 'generate'
	);
	const [extra, setExtra] = useState('');
	const [briefText, setBriefText] = useState('');
	const [replyJson, setReplyJson] = useState('');
	const [briefBusy, setBriefBusy] = useState(false);
	const [copied, setCopied] = useState(false);

	const form = useAppForm({
		defaultValues,
		validators: { onSubmit: goalFormSchema },
		onSubmit: async ({ value }) => {
			try {
				const res = await saveActiveGoal({ data: toGoalInput(value, initial?.id) });
				let weeks = 1;
				try {
					weeks = calendarFromGoal({
						plan_start: mondayIso(value.plan_start),
						date: value.date
					}).weekCount;
				} catch {
					weeks = 1;
				}
				if (res.isActive) {
					snack.success(`Saved — ${weeks} week plan through race day.`);
				} else {
					snack.success(`Saved — later on the calendar. Training stays on ${res.activeName}.`);
				}
				await onSaved();
			} catch (err) {
				snack.error(errorMessage(err, 'Could not save the goal.'));
			}
		}
	});

	async function generateBrief() {
		const value = form.state.values;
		setBriefBusy(true);
		try {
			const next = await getGoalBrief({
				data: {
					name: value.name,
					date: value.date,
					distance_km: value.distance_km,
					sport: value.sport,
					time_goal: value.time_goal,
					plan_start: value.plan_start,
					url: value.url,
					itinerary_url: value.itinerary_url,
					primary: value.primary,
					notes: value.notes,
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
			const currentDate = form.getFieldValue('date');
			if (patch.name !== undefined) form.setFieldValue('name', patch.name);
			if (patch.date !== undefined) {
				if (patch.plan_start === undefined) {
					form.setFieldValue(
						'plan_start',
						shiftPlanStartWithRaceDate(form.getFieldValue('plan_start'), currentDate, patch.date)
					);
				}
				form.setFieldValue('date', patch.date);
				lastDate.current = patch.date;
			}
			if (patch.distance_km !== undefined) form.setFieldValue('distance_km', patch.distance_km);
			if (patch.sport !== undefined) form.setFieldValue('sport', patch.sport);
			if (patch.time_goal !== undefined) form.setFieldValue('time_goal', patch.time_goal);
			if (patch.plan_start !== undefined) form.setFieldValue('plan_start', patch.plan_start);
			if (patch.url !== undefined) form.setFieldValue('url', patch.url);
			if (patch.itinerary_url !== undefined) form.setFieldValue('itinerary_url', patch.itinerary_url);
			if (patch.primary !== undefined) form.setFieldValue('primary', patch.primary);
			if (patch.notes !== undefined) form.setFieldValue('notes', patch.notes);
			setReplyJson('');
			if (patch.primary !== undefined || patch.notes !== undefined) setCopyTab('copy');
			snack.success('Filled from the reply — review and save.');
		} catch (e) {
			snack.error(errorMessage(e, 'Could not apply that JSON.'));
		}
	}

	return (
		<Form
			className={initial ? 'pt-3 border-t border-line' : ''}
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<form.AppField
				name="name"
				children={(field) => (
					<field.TextField label="Race name" required placeholder="Amersfoort 10K" />
				)}
			/>
			<FormGrid>
				<form.AppField
					name="date"
					listeners={{
						onChange: ({ value }) => {
							if (!value) return;
							const prev = lastDate.current;
							lastDate.current = value;
							if (prev && prev !== value) {
								form.setFieldValue(
									'plan_start',
									shiftPlanStartWithRaceDate(form.getFieldValue('plan_start'), prev, value)
								);
							}
						}
					}}
					children={(field) => <field.TextField label="Race date" required type="date" />}
				/>
				<form.AppField
					name="distance_km"
					children={(field) => (
						<field.TextField label="Distance (km)" required type="number" min={0.1} step="0.1" />
					)}
				/>
			</FormGrid>
			<form.AppField
				name="sport"
				children={(field) => (
					<field.ChipField
						label="Sport"
						options={ACTIVITY_TYPES.map((t) => ({
							value: t,
							label: sportChipLabel(t, activityLabel(t))
						}))}
					/>
				)}
			/>
			<FormGrid>
				<form.AppField
					name="time_goal"
					children={(field) => <field.TextField label="Time goal" placeholder="45:00" />}
				/>
				<form.AppField
					name="bib_number"
					children={(field) => (
						<field.TextField label="Bib number" placeholder="e.g. 4821" inputMode="numeric" />
					)}
				/>
			</FormGrid>
			<FormGrid>
				<form.AppField
					name="wave"
					children={(field) => <field.TextField label="Wave" placeholder="e.g. 2" />}
				/>
				<form.AppField
					name="start_time"
					children={(field) => <field.TextField label="Start time" type="time" />}
				/>
			</FormGrid>
			<form.Subscribe selector={(s) => [s.values.plan_start, s.values.date] as const}>
				{([planStart, date]) => (
					<form.AppField
						name="plan_start"
						listeners={{
							onBlur: ({ value }) => {
								const monday = mondayIso(value);
								if (monday !== value) form.setFieldValue('plan_start', monday);
							}
						}}
						children={(field) => (
							<field.TextField
								label="Plan starts (Monday)"
								required
								type="date"
								hint={planStartHint(planStart, date)}
							/>
						)}
					/>
				)}
			</form.Subscribe>
			<FormGrid>
				<form.AppField
					name="url"
					children={(field) => (
						<field.TextField
							label="Race URL"
							placeholder="https://example.com/race"
							inputMode="url"
							autoComplete="url"
						/>
					)}
				/>
				<form.AppField
					name="itinerary_url"
					children={(field) => (
						<field.TextField
							label="Itinerary URL"
							placeholder="https://maps.app.goo.gl/…"
							inputMode="url"
							autoComplete="url"
						/>
					)}
				/>
			</FormGrid>
			<FormSection className="border-t border-line pt-4 grid gap-4">
				<SegmentedToggle
					fill
					aria-label="Priorities and notes"
					value={copyTab}
					onChange={setCopyTab}
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
						<form.AppField
							name="primary"
							children={(field) => (
								<field.TextAreaField label="Priorities (one per line)" rows={4} />
							)}
						/>
						<form.AppField
							name="notes"
							children={(field) => <field.TextAreaField label="Notes" rows={4} />}
						/>
					</>
				)}
				{copyTab === 'generate' && (
					<>
						<p className={cn('text-muted', 'm-0')}>
							Same as Coach: build a prompt from this race plus your last 30 days of activities, copy
							it to an AI, then paste the JSON back to fill the form.
						</p>
						<Field label="Anything extra for the prompt? (optional)">
							<Textarea
								rows={3}
								value={extra}
								onChange={(e) => setExtra(e.target.value)}
								placeholder="e.g. hilly course, travel the day before, want a conservative first 5k"
							/>
						</Field>
						<Actions className="justify-start!">
							<Button variant="primary" disabled={briefBusy} onClick={() => void generateBrief()}>
								<Icon name="sparkle" size={16} />
								{briefBusy ? 'Building…' : briefText ? 'Regenerate prompt' : 'Generate prompt'}
							</Button>
						</Actions>
						{briefText && (
							<>
								<Field label="Prompt (editable — tweak before you copy)">
									<Textarea
										variant="editor"
										rows={12}
										value={briefText}
										onChange={(e) => setBriefText(e.target.value)}
									/>
								</Field>
								<Actions className="justify-start!">
									<Button variant="ghost" onClick={() => void copyBrief()}>
										<Icon name={copied ? 'check' : 'copy'} size={16} />
										{copied ? 'Copied' : 'Copy prompt'}
									</Button>
								</Actions>
							</>
						)}
						<Field label="Paste the JSON your AI returned">
							<Textarea
								variant="editor"
								rows={8}
								value={replyJson}
								onChange={(e) => setReplyJson(e.target.value)}
								placeholder='{ "name": "…", "primary": ["…"], "notes": "…" }'
							/>
						</Field>
						<Actions className="justify-start!">
							<Button variant="ghost" onClick={applyReply} disabled={!replyJson.trim()}>
								<Icon name="plus" size={16} />
								Fill form
							</Button>
						</Actions>
					</>
				)}
			</FormSection>
			<Actions>
				<form.AppForm>
					<form.SubmitButton busyLabel="Saving…">
						<Icon name="check" size={16} />
						{submitLabel}
					</form.SubmitButton>
				</form.AppForm>
				<form.Subscribe selector={(s) => s.isSubmitting}>
					{(busy) => (
						<Button variant="ghost" onClick={onCancel} disabled={busy}>
							Cancel
						</Button>
					)}
				</form.Subscribe>
			</Actions>
		</Form>
	);
}
