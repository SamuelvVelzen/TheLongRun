import { normalizeActivityType, showsFeel, showsField } from '$lib/activity';
import { saveActivityFeel } from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import { useState } from 'react';
import { FeelChips, WantedFasterChips } from './FeelChips';
import { Icon } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';

export type DebriefFeelRun = {
	slug: string;
	date: string;
	day?: string | null;
	distance_km?: number | null;
	activity_type?: string;
	effort?: number | null;
	shins?: number | null;
	legs?: number | null;
	energy?: number | null;
	wanted_faster?: boolean | null;
	surface?: string;
	notes?: string;
	hasFeel?: boolean;
};

function isImportNote(n: string): boolean {
	return /^imported from/i.test(n.trim());
}

export function DebriefFeelForm({
	run,
	heading,
	onSaved
}: {
	run: DebriefFeelRun;
	heading?: string;
	onSaved: () => void | Promise<void>;
}) {
	const snack = useSnackbar();
	const [busy, setBusy] = useState(false);
	const [scoresOpen, setScoresOpen] = useState(false);
	const activityType = normalizeActivityType(run.activity_type ?? 'run');
	const notesStart = run.notes && !isImportNote(run.notes) ? run.notes : '';
	const wantedStart =
		run.wanted_faster === true ? 'Y' : run.wanted_faster === false ? 'N' : '';
	const hasScores =
		run.effort != null ||
		run.shins != null ||
		run.legs != null ||
		run.energy != null ||
		run.wanted_faster != null ||
		(run.surface ?? '').trim() !== '';

	async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const fd = new FormData(e.currentTarget);
		const num = (k: string) => {
			const v = String(fd.get(k) ?? '').trim();
			if (!v) return null;
			const n = Number(v);
			return Number.isFinite(n) ? n : null;
		};
		const wanted = String(fd.get('wanted_faster') ?? '');
		const notes = String(fd.get('notes') ?? '').trim();
		const surface = String(fd.get('surface') ?? '');
		setBusy(true);
		try {
			await saveActivityFeel({
				data: {
					slug: run.slug,
					...(scoresOpen
						? {
								effort: num('effort'),
								shins: num('shins'),
								legs: num('legs'),
								energy: num('energy'),
								wanted_faster: wanted === 'Y' ? true : wanted === 'N' ? false : null,
								...(showsField(activityType, 'surface') ? { surface } : {})
							}
						: {}),
					...(activityType === 'strength'
						? {}
						: notes || !isImportNote(run.notes ?? '')
							? { notes }
							: {})
				}
			});
			snack.success('Saved — the prompt now includes what you wrote.');
			await onSaved();
		} catch (err) {
			snack.error(errorMessage(err, 'Could not save how it felt.'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className={cn(ui.panel, ui.form, 'mt-3')} onSubmit={onSubmit}>
			{heading ? <h3 className="m-0">{heading}</h3> : null}
			{activityType !== 'strength' && (
				<label className={ui.field}>
					<span>What happened</span>
					<span className={cn(ui.muted, 'font-normal')}>
						Write it like you would in chat — as long as you want. Wind, surfaces, after-run
						checks, questions for this week. You do not have to pick numbers; the AI will read
						scores from this when you mention them, then summarise it into the activity notes.
					</span>
					<textarea
						name="notes"
						className={ui.debriefWrite}
						placeholder="Today’s run was… After: shins when pressing… Should I…?"
						defaultValue={notesStart}
						rows={12}
					/>
				</label>
			)}
			<button
				type="button"
				className="appearance-none self-start bg-transparent border-0 p-0 min-h-11 text-accent-fg font-semibold cursor-pointer text-left"
				aria-expanded={scoresOpen}
				onClick={() => setScoresOpen((open) => !open)}
			>
				{scoresOpen ? 'Hide scores' : hasScores ? 'Change scores' : 'Set scores myself'}
			</button>
			{scoresOpen && (
				<>
					<div className={ui.formGrid}>
						{showsFeel(activityType, 'effort') && (
							<FeelChips
								name="effort"
								label="Effort (1–10)"
								min={1}
								max={10}
								low="easy"
								high="max"
								defaultValue={run.effort}
							/>
						)}
						{showsFeel(activityType, 'shins') && (
							<FeelChips
								name="shins"
								label="Shins (0–10)"
								min={0}
								max={10}
								low="none"
								high="severe"
								defaultValue={run.shins}
							/>
						)}
						{showsFeel(activityType, 'legs') && (
							<FeelChips
								name="legs"
								label="Legs (0–10)"
								min={0}
								max={10}
								low="fresh"
								high="heavy"
								defaultValue={run.legs}
							/>
						)}
						{showsFeel(activityType, 'energy') && (
							<FeelChips
								name="energy"
								label="Energy (1–10)"
								min={1}
								max={10}
								low="empty"
								high="full"
								defaultValue={run.energy}
							/>
						)}
						{showsFeel(activityType, 'wanted_faster') && (
							<WantedFasterChips defaultValue={wantedStart} />
						)}
					</div>
					{showsField(activityType, 'surface') && (
						<label className={ui.field}>
							<span>Surface</span>
							<input
								name="surface"
								placeholder="asphalt / mixed / trail"
								defaultValue={run.surface ?? ''}
							/>
						</label>
					)}
				</>
			)}
			<div className={ui.actions}>
				<button className={ui.btnPrimary} type="submit" disabled={busy} aria-busy={busy}>
					<Icon name="check" size={16} />
					{busy ? 'Saving…' : run.hasFeel ? 'Update how it felt' : 'Save how it felt'}
				</button>
			</div>
		</form>
	);
}
