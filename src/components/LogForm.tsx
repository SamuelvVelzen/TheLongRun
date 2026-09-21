import { normalizeActivityType, type ActivityType } from '$lib/activity';
import { emptyActivityForm, toCreateRunInput } from '$lib/activity-form';
import { withHabitDefaults, type ActivityHabits } from '$lib/activity-habits';
import { dayFromIsoDate } from '$lib/format';
import { gearKindForActivity, type GearContext, type GearKind, type GearWear } from '$lib/gear';
import { type PlanCalendar } from '$lib/plan';
import { createRun } from '$lib/server/functions';
import { fillStrengthNotesFromTops, type RecentLiftTop } from '$lib/strength';
import type { PlanWeek } from '$lib/types';
import { Link, useRouter } from '@tanstack/react-router';
import { ActivityForm } from './ActivityForm';
import { Icon } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';
import { buttonClass } from './ui';

export type LogFormPrefill = {
	activityType?: ActivityType;
	date?: string;
	time?: string;
	notes?: string;
};

export function LogForm({
	week,
	gear,
	gearWear,
	calendar,
	habits,
	prefill,
	strengthTops = []
}: {
	week: PlanWeek | null;
	gear: GearContext;
	gearWear?: Record<GearKind, Record<string, GearWear>>;
	calendar: PlanCalendar;
	habits: ActivityHabits;
	prefill?: LogFormPrefill;
	strengthTops?: RecentLiftTop[];
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const todayIso = new Date().toISOString().slice(0, 10);
	const fromPlan = prefill?.activityType === 'strength';
	const dateValue = prefill?.date || todayIso;
	const activityType = prefill?.activityType ?? 'run';
	const derivedDay = dayFromIsoDate(dateValue);
	const planSession =
		week?.sessions.find(
			(s) =>
				s.day.toLowerCase() === derivedDay.toLowerCase() &&
				normalizeActivityType(s.activity_type ?? 'run') === normalizeActivityType(activityType)
		) ?? week?.sessions.find((s) => s.day.toLowerCase() === derivedDay.toLowerCase());
	const defaultSession = planSession?.label.toLowerCase().includes('long')
		? 'long'
		: planSession?.label.toLowerCase().includes('easy')
			? 'easy'
			: planSession
				? 'quality'
				: 'easy';
	const gearKind = gearKindForActivity(activityType);
	const notes = fromPlan ? fillStrengthNotesFromTops(prefill?.notes ?? '', strengthTops) : '';
	const ritual = withHabitDefaults(activityType, habits);

	return (
		<ActivityForm
			fromPlan={fromPlan}
			calendar={calendar}
			gear={gear}
			gearWear={gearWear}
			habits={habits}
			submitLabel="Save activity"
			defaultValues={emptyActivityForm({
				date: dateValue,
				activity_type: activityType,
				session: defaultSession,
				time: prefill?.time || '',
				gear: gearKind ? gear[gearKind].active : '',
				notes,
				before_notes: ritual.before,
				after_notes: ritual.after
			})}
			cancel={
				<Link className={buttonClass({ variant: 'ghost' })} to="/">
					<Icon name="close" size={16} />
					Cancel
				</Link>
			}
			onSubmit={async (values) => {
				try {
					const input = toCreateRunInput(values);
					const res = await createRun({ data: input });
					await router.invalidate();
					if (input.session === 'race') {
						router.navigate({
							to: '/coach',
							search: { tab: 'debrief', slug: res.slug },
							replace: true,
							resetScroll: false
						});
					} else {
						router.navigate({ to: '/runs/$slug', params: { slug: res.slug } });
					}
				} catch (err) {
					snack.error(errorMessage(err, 'Save failed'));
				}
			}}
		/>
	);
}
