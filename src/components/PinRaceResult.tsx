import { activityLooksLikeRace } from '$lib/goals';
import { pinRaceSchema } from '$lib/goal-form';
import { completeGoal, repinGoalResult } from '$lib/server/functions';
import type { Goal } from '$lib/types';
import { cn } from '$lib/ui';
import { Link, useRouter } from '@tanstack/react-router';
import { Icon } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';
import { Actions, Button, Form, useAppForm } from './ui';

export type PinRaceCandidate = {
	slug: string;
	date: string;
	activity_type: string;
	time?: string;
	distance_km: number | null;
};

export function PinRaceResult({
	goal,
	candidates,
	mode = 'complete',
	currentSlug,
	onSaved
}: {
	goal: Goal;
	candidates: PinRaceCandidate[];
	mode?: 'complete' | 'repin';
	currentSlug?: string;
	onSaved?: () => void | Promise<void>;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const repin = mode === 'repin';
	const defaultSlug = (() => {
		if (repin && currentSlug) return currentSlug;
		const tight = candidates.find((c) => activityLooksLikeRace(goal, c) || c.date === goal.date);
		if (tight) return tight.slug;
		return candidates.length === 1 ? candidates[0]!.slug : '';
	})();
	const form = useAppForm({
		defaultValues: { pinSlug: defaultSlug },
		validators: { onSubmit: pinRaceSchema },
		onSubmit: async ({ value }) => {
			try {
				if (repin) {
					await repinGoalResult({ data: { goalId: goal.id, activitySlug: value.pinSlug } });
					snack.success('Linked activity updated.');
					await onSaved?.();
					await router.invalidate();
				} else {
					await completeGoal({ data: { goalId: goal.id, activitySlug: value.pinSlug } });
					snack.success(`Saved — ${goal.name} is on the medal wall.`);
					await router.navigate({ to: '/goals', search: { tab: 'medals' } });
					await router.invalidate();
				}
			} catch (e) {
				snack.error(errorMessage(e, repin ? 'Could not update that link.' : 'Could not pin that result.'));
			}
		}
	});

	return (
		<div className="grid gap-3 pt-3 border-t border-line">
			<h3 className="m-0">{repin ? 'Linked activity' : 'Pin race result'}</h3>
			<p className={cn('text-muted', 'm-0')}>
				{repin
					? 'Pick the activity this medal should use for time, distance, and route.'
					: 'Pick the activity you ran. That time becomes the medal.'}
				{!repin && goal.bib_number ? ` Bib ${goal.bib_number} is already saved.` : ''}
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
								<Icon name={repin ? 'check' : 'trophy'} size={16} />
								{repin ? 'Update link' : 'Save as medal'}
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
							<Icon name={repin ? 'check' : 'trophy'} size={16} />
							{repin ? 'Update link' : 'Save as medal'}
						</Button>
					</Actions>
				</>
			)}
		</div>
	);
}
