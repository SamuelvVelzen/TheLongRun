import type { DebriefRaceHint } from '$lib/server/functions';
import { completeGoal, saveMedalDetails } from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';

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
	const [bib, setBib] = useState(hint.kind === 'match' ? hint.bib_number : '');
	const [resultUrl, setResultUrl] = useState(hint.kind === 'match' ? hint.result_url : '');
	const [medalNotes, setMedalNotes] = useState(hint.kind === 'match' ? hint.medal_notes : '');
	const [medalBusy, setMedalBusy] = useState(false);

	useEffect(() => {
		if (hint.kind !== 'match') return;
		setBib(hint.bib_number);
		setResultUrl(hint.result_url);
		setMedalNotes(hint.medal_notes);
	}, [hint]);

	if (hint.kind === 'race_no_goal') {
		return (
			<div className={cn(ui.panel, 'mt-3 p-[0.9rem_1rem] border-accent/35')}>
				<p className="m-0 font-semibold">Race session</p>
				<p className={cn(ui.muted, 'm-[0.35rem_0_0] text-[0.9rem]')}>
					This activity is marked as a race. Add it on{' '}
					<Link className="text-accent-fg font-semibold" to="/goals">
						Goals
					</Link>{' '}
					if you want a medal and time goal on the wall.
				</p>
			</div>
		);
	}

	async function pinResult() {
		setPinning(true);
		try {
			await completeGoal({ data: { goalId: hint.goalId, activitySlug: runSlug } });
			snack.success(`Saved — ${hint.goalName} is on the medal wall.`);
			await onSaved();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not pin that result.'));
		} finally {
			setPinning(false);
		}
	}

	async function saveMedal() {
		setMedalBusy(true);
		try {
			await saveMedalDetails({
				data: {
					goalId: hint.goalId,
					bib_number: bib,
					result_url: resultUrl,
					medal_notes: medalNotes
				}
			});
			snack.success('Saved medal details.');
			await onSaved();
		} catch (e) {
			snack.error(errorMessage(e, 'Could not save medal details.'));
		} finally {
			setMedalBusy(false);
		}
	}

	if (!hint.pinned) {
		return (
			<div className={cn(ui.panel, 'mt-3 p-[0.9rem_1rem] border-accent/35')}>
				<p className="m-0 font-semibold">{hint.goalName}</p>
				<p className={cn(ui.muted, 'm-[0.35rem_0_0] text-[0.9rem]')}>
					This looks like your race. Pin this activity to put it on the medal wall.
				</p>
				<div className={cn(ui.actions, 'mt-[0.65rem]')}>
					<button
						className={ui.btnPrimary}
						type="button"
						disabled={pinning}
						onClick={() => void pinResult()}
					>
						<Icon name="trophy" size={16} />
						{pinning ? 'Saving…' : 'Save as medal'}
					</button>
					<Link className={ui.btnGhost} to="/goals">
						Open Goals
					</Link>
				</div>
			</div>
		);
	}

	if (!hint.missingMedalDetails) return null;

	return (
		<div className={cn(ui.panel, ui.form, 'mt-3 border-accent/35')}>
			<p className="m-0 font-semibold">{hint.goalName} — medal details</p>
			<p className={cn(ui.muted, 'm-[0.35rem_0_0] text-[0.9rem]')}>
				Bib and official results are not on Strava. Add them here or on the medal wall.
			</p>
			<div className={ui.formGrid}>
				<label className={ui.field}>
					<span>Bib number</span>
					<input value={bib} onChange={(e) => setBib(e.target.value)} placeholder="1234" />
				</label>
				<label className={ui.field}>
					<span>Results URL</span>
					<input
						value={resultUrl}
						onChange={(e) => setResultUrl(e.target.value)}
						placeholder="https://…"
					/>
				</label>
			</div>
			<label className={ui.field}>
				<span>Post-race notes</span>
				<textarea
					rows={3}
					value={medalNotes}
					onChange={(e) => setMedalNotes(e.target.value)}
					placeholder="How the race felt, splits, weather…"
				/>
			</label>
			<div className={ui.actions}>
				<button
					className={ui.btnPrimary}
					type="button"
					disabled={medalBusy}
					onClick={() => void saveMedal()}
				>
					<Icon name="check" size={16} />
					{medalBusy ? 'Saving…' : 'Save medal details'}
				</button>
				<Link className={ui.btnGhost} to="/goals" search={{ tab: 'medals' }}>
					Open medal wall
				</Link>
			</div>
		</div>
	);
}
