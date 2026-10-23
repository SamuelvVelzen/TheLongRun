import { activityLabel, normalizeActivityType } from '$lib/activity';
import { HABIT_PLACEHOLDERS, emptyActivityHabits, type HabitPair } from '$lib/activity-habits';
import type { BodySuggestion } from '$lib/body-notes';
import { composeDebriefPrompt, type DebriefWriteupRun } from '$lib/debrief';
import {
	clearDebriefHabits,
	readDebriefHabits,
	seedDebriefHabits,
	setDebriefHabitField
} from '$lib/debrief-habits';
import {
	clearDebriefWriteups,
	readDebriefWriteups,
	writeDebriefWriteups
} from '$lib/debrief-writeups';
import type { FuelEntry } from '$lib/fuel';
import { getDebriefPrompt, saveActivityFeel, saveDebrief } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AiPromptFlow } from './AiPromptFlow';
import { BodySuggestionsDialog } from './BodySuggestionsDialog';
import { FuelSuggestionsDialog } from './FuelSuggestionsDialog';
import { Icon } from './Icon';
import { JsonPasteForm } from './JsonPasteForm';
import { Actions, Button, Checkbox, Dialog, Field, FormGrid, Textarea, useSnackbar } from './ui';

type DebriefData = Awaited<ReturnType<typeof getDebriefPrompt>>;

/** Activity page → More → Feel with AI: same fields as Coach → After an activity, for one run. */
export function FeelAiDialog({
	open,
	run,
	onClose
}: {
	open: boolean;
	run: DebriefWriteupRun;
	onClose: () => void;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [debrief, setDebrief] = useState<DebriefData | null>(null);
	const [attempt, setAttempt] = useState(0);
	const [busy, setBusy] = useState(false);
	const [failed, setFailed] = useState(false);
	const [includePlan, setIncludePlan] = useState(true);
	const [writeup, setWriteup] = useState('');
	const [habitDrafts, setHabitDrafts] = useState<Record<string, HabitPair>>(readDebriefHabits);
	const [fuelSuggestions, setFuelSuggestions] = useState<FuelEntry[]>([]);
	const [bodySuggestions, setBodySuggestions] = useState<BodySuggestion[]>([]);
	const [bodySuggestionsQueued, setBodySuggestionsQueued] = useState<BodySuggestion[]>([]);

	const activityType = normalizeActivityType(run.activity_type ?? 'run');
	const sport = activityLabel(activityType).toLowerCase();
	const habitDraft = habitDrafts[run.slug] ?? { before: '', after: '' };

	// Fresh drafts whenever the dialog opens for this activity.
	useEffect(() => {
		if (!open) return;
		setWriteup(readDebriefWriteups()[run.slug] ?? '');
		setHabitDrafts(readDebriefHabits());
		setDebrief(null);
		setAttempt(0);
		setBusy(false);
		setFailed(false);
	}, [open, run.slug]);

	// Fetch only once Generate is pressed; toggling the checkbox refetches after that.
	useEffect(() => {
		if (!open || attempt === 0) return;
		let cancelled = false;
		setBusy(true);
		setFailed(false);
		setDebrief(null);
		getDebriefPrompt({ data: { id: String(run.id), includePlan, idsOnly: true } }).then(
			(next) => {
				if (!cancelled) {
					setDebrief(next);
					setBusy(false);
				}
			},
			() => {
				if (!cancelled) {
					setFailed(true);
					setBusy(false);
				}
			}
		);
		return () => {
			cancelled = true;
		};
	}, [open, run.slug, includePlan, attempt]);

	// Seed this run's before/after draft from its saved notes / usual habits (same as coach).
	useEffect(() => {
		if (!open) return;
		setHabitDrafts((prev) =>
			seedDebriefHabits([run], debrief?.habits ?? emptyActivityHabits(), prev)
		);
	}, [open, run, debrief]);

	const prompt = debrief?.prompt
		? composeDebriefPrompt(
				debrief.prompt,
				[{ slug: run.slug, members: [run] }],
				{ [run.slug]: writeup },
				{ [run.slug]: habitDraft },
				debrief.habits ?? emptyActivityHabits()
			)
		: '';

	function generate() {
		setAttempt((n) => n + 1);
	}

	function onWriteupChange(text: string) {
		setWriteup(text);
		const next = readDebriefWriteups();
		if (text) next[run.slug] = text;
		else delete next[run.slug];
		writeDebriefWriteups(next);
	}

	function onHabitChange(field: keyof HabitPair, text: string) {
		setHabitDrafts((prev) => setDebriefHabitField(run.slug, field, text, prev));
	}

	async function saveReply(json: string) {
		const h = habitDrafts[run.slug];
		if (h) {
			await saveActivityFeel({
				data: { id: run.id, before_notes: h.before, after_notes: h.after }
			});
		}
		const res = await saveDebrief({ data: json });
		const bits: string[] = [];
		if (res.feelingsUpdated) {
			bits.push(
				`feelings on ${res.feelingsUpdated} activit${res.feelingsUpdated === 1 ? 'y' : 'ies'}`
			);
		}
		if (res.planUpdated.length) bits.push(`week ${res.planUpdated.join(', ')} updated`);
		if (res.fuelSuggestions.length) {
			bits.push('food found — review it');
			setFuelSuggestions(res.fuelSuggestions);
			if (res.bodySuggestions.length) {
				bits.push('body notes next');
				setBodySuggestionsQueued(res.bodySuggestions);
			}
		} else if (res.bodySuggestions.length) {
			bits.push('body notes found — review them');
			setBodySuggestions(res.bodySuggestions);
		}
		const miss = res.feelingsMissing.length
			? ` (${res.feelingsMissing.length} id(s) not found)`
			: '';
		snack.success(`Saved — ${bits.join(' · ') || 'nothing changed'}${miss}.`);
		if (res.feelingsUpdatedSlugs.length) {
			if (res.feelingsUpdatedSlugs.includes(run.slug)) setWriteup('');
			setHabitDrafts((prev) => clearDebriefHabits(res.feelingsUpdatedSlugs, prev));
			clearDebriefWriteups(res.feelingsUpdatedSlugs, readDebriefWriteups());
		}
		await router.invalidate();
		if (!res.fuelSuggestions.length && !res.bodySuggestions.length) onClose();
	}

	return (
		<>
			<Dialog
				open={open}
				size="medal"
				title="Feel with AI"
				className="sm:max-w-[min(42rem,100%)]!"
				onClose={onClose}
			>
				<AiPromptFlow
					intro={
						<p className="m-0">
							Write how it felt, generate the prompt, copy it into your AI, then paste the JSON back
							— scores and notes land on this activity.
						</p>
					}
					extraLabel="What happened"
					extra={writeup}
					onExtraChange={onWriteupChange}
					extraPlaceholder={`Today’s ${
						activityType === 'strength' ? 'session' : sport
					} was… After: … Should I…?`}
					extraRows={6}
					prompt={prompt}
					promptReady={Boolean(prompt)}
					promptRows={10}
					result={
						<JsonPasteForm
							description={
								<p className={cn('text-muted', 'm-0 text-[0.9rem]')}>Paste the AI's reply</p>
							}
							rows={5}
							placeholder={
								includePlan
									? '{ "feelings": { "id": 42, "notes": "…" }, "week": { "week": 3, "sessions": [ … ] } }'
									: '{ "feelings": { "id": 42, "notes": "…" } }'
							}
							submitLabel="Save reply"
							submitIcon="check"
							errorLabel="Could not save debrief."
							onSubmit={saveReply}
						/>
					}
				>
					<FormGrid>
						<Field label="Before">
							<Textarea
								rows={2}
								placeholder={HABIT_PLACEHOLDERS[activityType].before}
								value={habitDraft.before}
								onChange={(e) => onHabitChange('before', e.target.value)}
							/>
						</Field>
						<Field label="After">
							<Textarea
								rows={2}
								placeholder={HABIT_PLACEHOLDERS[activityType].after}
								value={habitDraft.after}
								onChange={(e) => onHabitChange('after', e.target.value)}
							/>
						</Field>
					</FormGrid>
					<Checkbox
						checked={includePlan}
						onChange={setIncludePlan}
						label="New chat — include my plan and standing info"
						hint="On for a new chat; off to keep the prompt small in an ongoing thread."
					/>
					{!prompt &&
						(debrief?.error ? (
							<p className={cn('text-muted', 'm-0')}>{debrief.error}</p>
						) : (
							<>
								<Actions>
									<Button variant="primary" disabled={busy} onClick={generate}>
										<Icon name="sparkle" size={16} />
										{busy ? 'Building…' : failed ? 'Try again' : 'Generate prompt'}
									</Button>
								</Actions>
								{failed && !busy ? (
									<p className={cn('text-muted', 'm-0')}>Could not build the prompt.</p>
								) : null}
							</>
						))}
				</AiPromptFlow>
			</Dialog>
			<FuelSuggestionsDialog
				suggestions={fuelSuggestions}
				onClose={() => {
					setFuelSuggestions([]);
					if (bodySuggestionsQueued.length) {
						setBodySuggestions(bodySuggestionsQueued);
						setBodySuggestionsQueued([]);
					} else {
						onClose();
					}
				}}
			/>
			<BodySuggestionsDialog
				suggestions={bodySuggestions}
				onClose={() => {
					setBodySuggestions([]);
					onClose();
				}}
			/>
		</>
	);
}
