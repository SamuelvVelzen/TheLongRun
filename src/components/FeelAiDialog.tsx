import { emptyActivityHabits, type HabitPair } from '$lib/activity-habits';
import type { BodySuggestion } from '$lib/body-notes';
import {
	composeDebriefPrompt,
	debriefWriteupUnitsFromCoach,
	type DebriefWriteupRun
} from '$lib/debrief';
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
import type { GearContext, GearKind, GearWear } from '$lib/gear';
import { getDebriefPrompt, saveActivityFeel, saveDebrief } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AiPromptFlow } from './AiPromptFlow';
import { BodySuggestionsDialog } from './BodySuggestionsDialog';
import {
	DebriefFeelForm,
	type DebriefDraftClearPick,
	type DebriefFeelRun
} from './DebriefFeelForm';
import { FuelSuggestionsDialog } from './FuelSuggestionsDialog';
import { JsonPasteForm } from './JsonPasteForm';
import { Checkbox, Dialog, Panel, useSnackbar } from './ui';

type DebriefData = Awaited<ReturnType<typeof getDebriefPrompt>>;

/** Activity page → More → Feel with AI: same debrief prompt + form as Coach → After an activity. */
export function FeelAiDialog({
	open,
	run,
	gear,
	gearWear,
	onClose
}: {
	open: boolean;
	run: DebriefWriteupRun;
	gear: GearContext;
	gearWear: Record<GearKind, Record<string, GearWear>>;
	onClose: () => void;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [debrief, setDebrief] = useState<DebriefData | null>(null);
	const [loading, setLoading] = useState(false);
	const [failed, setFailed] = useState(false);
	const [includePlan, setIncludePlan] = useState(false);
	const [writeup, setWriteup] = useState('');
	const [habitDrafts, setHabitDrafts] = useState<Record<string, HabitPair>>(readDebriefHabits);
	const [fuelSuggestions, setFuelSuggestions] = useState<FuelEntry[]>([]);
	const [bodySuggestions, setBodySuggestions] = useState<BodySuggestion[]>([]);
	const [bodySuggestionsQueued, setBodySuggestionsQueued] = useState<BodySuggestion[]>([]);

	const writeupUnits = debrief
		? debriefWriteupUnitsFromCoach(debrief)
		: [{ slug: run.slug, members: [run] }];
	const unit = writeupUnits[0]!;
	const habitDraft = habitDrafts[unit.slug] ?? { before: '', after: '' };

	useEffect(() => {
		if (!open) return;
		setWriteup(readDebriefWriteups()[run.slug] ?? '');
		setHabitDrafts(readDebriefHabits());
		setDebrief(null);
		setLoading(false);
		setFailed(false);
	}, [open, run.slug]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setLoading(true);
		setFailed(false);
		setDebrief(null);
		getDebriefPrompt({ data: { id: String(run.id), includePlan, idsOnly: true } }).then(
			(next) => {
				if (!cancelled) {
					setDebrief(next);
					setLoading(false);
				}
			},
			() => {
				if (!cancelled) {
					setFailed(true);
					setLoading(false);
				}
			}
		);
		return () => {
			cancelled = true;
		};
	}, [open, run.id, includePlan]);

	useEffect(() => {
		if (!open) return;
		const units = debrief
			? debriefWriteupUnitsFromCoach(debrief)
			: [{ slug: run.slug, members: [run] }];
		const seeds = units.map((u) => {
			const lead = u.members[0]!;
			return {
				slug: u.slug,
				activity_type: lead.activity_type,
				before_notes: lead.before_notes,
				after_notes: lead.after_notes
			};
		});
		setHabitDrafts((prev) => seedDebriefHabits(seeds, debrief?.habits ?? emptyActivityHabits(), prev));
	}, [open, debrief, run]);

	const prompt = debrief?.prompt
		? composeDebriefPrompt(
				debrief.prompt,
				writeupUnits,
				{ [unit.slug]: writeup },
				{ [unit.slug]: habitDraft },
				debrief.habits ?? emptyActivityHabits()
			)
		: '';

	function onWriteupChange(text: string) {
		setWriteup(text);
		const next = readDebriefWriteups();
		if (text) next[unit.slug] = text;
		else delete next[unit.slug];
		writeDebriefWriteups(next);
	}

	function onHabitChange(field: keyof HabitPair, text: string) {
		setHabitDrafts((prev) => setDebriefHabitField(unit.slug, field, text, prev));
	}

	function clearDebriefDraft(slugKey: string, pick: DebriefDraftClearPick) {
		if (pick.writeup) {
			if (slugKey === unit.slug) setWriteup('');
			writeDebriefWriteups(clearDebriefWriteups([slugKey], readDebriefWriteups()));
		}
		if (pick.before || pick.after) {
			setHabitDrafts((prev) => {
				let next = prev;
				if (pick.before) next = setDebriefHabitField(slugKey, 'before', '', next);
				if (pick.after) next = setDebriefHabitField(slugKey, 'after', '', next);
				const pair = next[slugKey];
				if (pair && !pair.before.trim() && !pair.after.trim()) {
					next = clearDebriefHabits([slugKey], next);
				}
				return next;
			});
		}
	}

	async function refreshRun() {
		await router.invalidate();
	}

	async function saveReply(json: string) {
		const h = habitDrafts[unit.slug];
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
			if (res.feelingsUpdatedSlugs.includes(unit.slug)) setWriteup('');
			setHabitDrafts((prev) => clearDebriefHabits(res.feelingsUpdatedSlugs, prev));
			clearDebriefWriteups(res.feelingsUpdatedSlugs, readDebriefWriteups());
		}
		await refreshRun();
		if (!res.fuelSuggestions.length && !res.bodySuggestions.length) onClose();
	}

	const feelRun = (debrief?.runs?.[0] ?? debrief?.run ?? run) as DebriefFeelRun;
	const feelParts =
		unit.members.length > 1 ? (unit.members as DebriefFeelRun[]) : undefined;

	return (
		<>
			<Dialog
				open={open}
				size="medal"
				title="Feel with AI"
				className="sm:max-w-[min(42rem,100%)]!"
				onClose={onClose}
			>
				<div className="grid gap-4">
					<DebriefFeelForm
						run={feelRun}
						parts={feelParts}
						writeup={writeup}
						habitDraft={habitDraft}
						gear={gear}
						gearWear={gearWear}
						onWriteupChange={onWriteupChange}
						onHabitChange={onHabitChange}
						onClearDrafts={(pick) => clearDebriefDraft(unit.slug, pick)}
						onSaved={refreshRun}
					/>
					{debrief?.error && !prompt ? (
						<p className={cn('text-muted', 'm-0')}>{debrief.error}</p>
					) : null}
					{loading && !prompt ? (
						<p className={cn('text-muted', 'm-0')}>Building prompt…</p>
					) : null}
					{failed && !loading && !prompt ? (
						<p className={cn('text-muted', 'm-0')}>Could not build the prompt.</p>
					) : null}
					{prompt ? (
						<Panel form>
							<AiPromptFlow prompt={prompt} promptRows={14} />
							<Checkbox
								checked={includePlan}
								onChange={setIncludePlan}
								label="New chat — include my plan and standing info"
								hint="On for a new chat; off to keep the prompt small in an ongoing thread."
							/>
						</Panel>
					) : null}
					{prompt ? (
						<JsonPasteForm
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
					) : null}
				</div>
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
