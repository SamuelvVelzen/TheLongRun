import type { DebriefRaceHint } from '$lib/server/functions';
import { completeGoal } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Icon } from './Icon';
import { MedalDetailsForm } from './MedalDetailsForm';
import { errorMessage, useSnackbar } from './Snackbar';
import { Actions, Button, buttonClass, panelClass, formClass } from './ui';

export function DebriefRacePanel({
	hint,
	runSlug,
	onSaved
}: {
	hint: DebriefRaceHint;
	runSlug: string;
	onSaved: () => void | Promise<void>;
}) {
	const snack = useSnackbar();
	const [pinning, setPinning] = useState(false);

	if (hint.kind === 'race_no_goal') {
		return (
			<div className={panelClass('mt-3 p-[0.9rem_1rem] border-accent/35')}>
				<p className="m-0 font-semibold">Race session</p>
				<p className={cn('text-muted', 'm-[0.35rem_0_0] text-[0.9rem]')}>
					This activity is marked as a race. Add it on{' '}
					<Link className="text-accent-fg font-semibold" to="/goals">
						Goals
					</Link>{' '}
					if you want a medal and time goal on the wall.
				</p>
			</div>
		);
	}

	const match = hint;

	async function pinResult() {
		setPinning(true);
		try {
			await completeGoal({ data: { goalId: match.goalId, activitySlug: runSlug } });
			snack.success(`Saved — ${match.goalName} is on the medal wall.`);
			await onSaved();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not pin that result.'));
		} finally {
			setPinning(false);
		}
	}

	if (!match.pinned) {
		return (
			<div className={panelClass('mt-3 p-[0.9rem_1rem] border-accent/35')}>
				<p className="m-0 font-semibold">{match.goalName}</p>
				<p className={cn('text-muted', 'm-[0.35rem_0_0] text-[0.9rem]')}>
					This looks like your race
					{match.bib_number ? ` (bib ${match.bib_number})` : ''}. Pin this activity to put it on the
					medal wall.
				</p>
				<Actions className="mt-[0.65rem]">
					<Button variant="primary" disabled={pinning} onClick={() => void pinResult()}>
						<Icon name="trophy" size={16} />
						{pinning ? 'Saving…' : 'Save as medal'}
					</Button>
					<Link className={buttonClass({ variant: 'ghost' })} to="/goals">
						Open Goals
					</Link>
				</Actions>
			</div>
		);
	}

	if (!match.missingMedalDetails) return null;

	return (
		<div className={panelClass(formClass, 'mt-3 border-accent/35')}>
			<p className="m-0 font-semibold">{match.goalName} — medal details</p>
			<p className={cn('text-muted', 'm-[0.35rem_0_0] text-[0.9rem]')}>
				Bib and official results are not on Strava. Add them here or on the medal wall.
			</p>
			<MedalDetailsForm
				key={match.goalId}
				goalId={match.goalId}
				defaultValues={{
					bib_number: match.bib_number,
					result_url: match.result_url,
					medal_notes: match.medal_notes
				}}
				submitLabel="Save medal details"
				notesLabel="Post-race notes"
				notesPlaceholder="How the race felt, splits, weather…"
				bibPlaceholder="1234"
				resultPlaceholder="https://…"
				showSubmit="always"
				successMessage="Saved medal details."
				onSaved={onSaved}
				extraActions={
					<Link className={buttonClass({ variant: 'ghost' })} to="/goals" search={{ tab: 'medals' }}>
						Open medal wall
					</Link>
				}
			/>
		</div>
	);
}
