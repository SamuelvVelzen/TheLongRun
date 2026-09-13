import { activityLabel, normalizeActivityType, showsFeel, showsField } from '$lib/activity';
import { gearKindForActivity, gearMetaForActivity, gearPickerOptions, type GearContext, type GearKind, type GearWear } from '$lib/gear';
import { saveActivityFeel } from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import { useState } from 'react';
import { DeleteButton } from './DeleteButton';
import { FeelChips, WantedFasterChips } from './FeelChips';
import { GearField } from './GearField';
import { Icon } from './Icon';
import { Select } from './Select';
import { errorMessage, useSnackbar } from './Snackbar';

const SESSIONS = ['easy', 'quality', 'tempo', 'steady', 'long', 'shakeout', 'race', 'other'];

export type DebriefFeelRun = {
	slug: string;
	date: string;
	day?: string | null;
	distance_km?: number | null;
	activity_type?: string;
	session?: string;
	cadence?: number | null;
	gear?: string;
	effort?: number | null;
	shins?: number | null;
	legs?: number | null;
	energy?: number | null;
	wanted_faster?: boolean | null;
	surface?: string;
	notes?: string;
	hasFeel?: boolean;
};

export function DebriefFeelForm({
	run,
	heading,
	writeup,
	gear,
	gearWear,
	onWriteupChange,
	onSaved
}: {
	run: DebriefFeelRun;
	heading?: string;
	writeup: string;
	gear: GearContext;
	gearWear: Record<GearKind, Record<string, GearWear>>;
	onWriteupChange: (text: string) => void;
	onSaved: () => void | Promise<void>;
}) {
	const snack = useSnackbar();
	const [busy, setBusy] = useState(false);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [scoresOpen, setScoresOpen] = useState(false);
	const activityType = normalizeActivityType(run.activity_type ?? 'run');
	const sport = activityLabel(activityType).toLowerCase();
	const gearKind = gearKindForActivity(activityType);
	const gearKindMeta = gearMetaForActivity(activityType);
	const wantedStart =
		run.wanted_faster === true ? 'Y' : run.wanted_faster === false ? 'N' : '';
	const hasScores =
		run.effort != null ||
		run.shins != null ||
		run.legs != null ||
		run.energy != null ||
		run.wanted_faster != null ||
		(run.surface ?? '').trim() !== '';
	const needsDetails =
		(activityType === 'run' && (!run.session || run.session === 'other' || run.cadence == null)) ||
		(showsField(activityType, 'gear') && !(run.gear ?? '').trim());
	const hasDetails =
		(activityType === 'run' && Boolean(run.session) && run.cadence != null) ||
		(showsField(activityType, 'gear') && Boolean((run.gear ?? '').trim()));

	async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!detailsOpen && !scoresOpen) return;
		const fd = new FormData(e.currentTarget);
		const num = (k: string) => {
			const v = String(fd.get(k) ?? '').trim();
			if (!v) return null;
			const n = Number(v);
			return Number.isFinite(n) ? n : null;
		};
		const wanted = String(fd.get('wanted_faster') ?? '');
		const surface = String(fd.get('surface') ?? '');
		setBusy(true);
		try {
			await saveActivityFeel({
				data: {
					slug: run.slug,
					...(detailsOpen && activityType === 'run'
						? {
								session: String(fd.get('session') ?? run.session ?? 'other'),
								cadence: num('cadence')
							}
						: {}),
					...(detailsOpen && showsField(activityType, 'gear')
						? { gear: String(fd.get('gear') ?? '') }
						: {}),
					...(scoresOpen
						? {
								effort: num('effort'),
								shins: num('shins'),
								legs: num('legs'),
								energy: num('energy'),
								wanted_faster: wanted === 'Y' ? true : wanted === 'N' ? false : null,
								...(showsField(activityType, 'surface') ? { surface } : {})
							}
						: {})
				}
			});
			snack.success('Saved.');
			await onSaved();
		} catch (err) {
			snack.error(errorMessage(err, 'Could not save.'));
		} finally {
			setBusy(false);
		}
	}

	return (
		<form className={cn(ui.panel, ui.form, 'mt-3')} onSubmit={onSubmit}>
			{heading ? <h3 className="m-0">{heading}</h3> : null}
			<label className={ui.field}>
				<span className="flex items-center justify-between gap-2">
					What happened
					<DeleteButton
						label="Clear write-up"
						compact
						disabled={!writeup}
						onClick={() => onWriteupChange('')}
					/>
				</span>
				<span className={cn(ui.muted, 'font-normal')}>
					Write it like you would in chat — as long as you want. Wind, surfaces, after-session
					checks, questions for this week. GPS numbers are already in the prompt. The AI will read
					scores from this when you mention them, then summarise it into the activity notes.
				</span>
				<textarea
					name="writeup"
					className={ui.debriefWrite}
					placeholder={`Today’s ${activityType === 'strength' ? 'session' : sport} was… After: … Should I…?`}
					value={writeup}
					onChange={(e) => onWriteupChange(e.target.value)}
					rows={12}
				/>
			</label>

			{(activityType === 'run' || showsField(activityType, 'gear')) && (
				<>
					<button
						type="button"
						className="appearance-none self-start bg-transparent border-0 p-0 min-h-11 text-accent-fg font-semibold cursor-pointer text-left"
						aria-expanded={detailsOpen}
						onClick={() => setDetailsOpen((open) => !open)}
					>
						{detailsOpen
							? 'Hide details'
							: needsDetails
								? 'Add session, cadence, gear'
								: hasDetails
									? 'Change session, cadence, gear'
									: 'Add session, cadence, gear'}
					</button>
					{detailsOpen && (
						<div className={ui.formGrid}>
							{activityType === 'run' && (
								<label className={ui.field}>
									<span>Session</span>
									<Select
										name="session"
										defaultValue={run.session || 'other'}
										aria-label="Session"
										options={SESSIONS.map((s) => ({ value: s, label: s }))}
									/>
								</label>
							)}
							{activityType === 'run' && (
								<label className={ui.field}>
									<span>Cadence</span>
									<input
										name="cadence"
										type="text"
										inputMode="numeric"
										placeholder="176"
										defaultValue={run.cadence ?? ''}
									/>
								</label>
							)}
							{showsField(activityType, 'gear') && gearKind && gearKindMeta && (
								<GearField
									key={gearKind}
									options={gearPickerOptions(gear[gearKind], run.gear ? [run.gear] : [])}
									wear={gearWear[gearKind]}
									defaultValue={run.gear ?? ''}
									label={gearKindMeta.label}
									placeholder={gearKindMeta.customPlaceholder}
									activeHint={gearKindMeta.activeLabel.toLowerCase()}
								/>
							)}
						</div>
					)}
				</>
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

			{(detailsOpen || scoresOpen) && (
				<div className={ui.actions}>
					<button className={ui.btnPrimary} type="submit" disabled={busy} aria-busy={busy}>
						<Icon name="check" size={16} />
						{busy ? 'Saving…' : 'Save'}
					</button>
				</div>
			)}
		</form>
	);
}
