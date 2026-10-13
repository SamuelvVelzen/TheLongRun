import type { FuelLog } from '$lib/fuel';
import {
	injectFuelText,
	readFuelDraft,
	scheduleFuelDraftWrite,
	writeFuelDraft
} from '$lib/fuel-prompt';
import { saveFuelLog, saveFuelReply } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AiPromptFlow } from './AiPromptFlow';
import { JsonPasteForm } from './JsonPasteForm';
import { Dialog, Field, Textarea, errorMessage, useSnackbar } from './ui';

/** Describe in your own words → copy prompt → paste the AI's JSON → saved (zod-checked) with Undo. */
export function FuelDescribeDialog({
	open,
	log,
	promptTemplate,
	onClose,
	onSaved
}: {
	open: boolean;
	log: FuelLog;
	promptTemplate: string;
	onClose: () => void;
	onSaved: (log: FuelLog) => void;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [text, setText] = useState('');

	useEffect(() => {
		if (open) setText(readFuelDraft());
	}, [open]);

	const prompt = injectFuelText(promptTemplate, text);
	const ready = Boolean(text.trim());

	async function undo(addedIds: string[], current: FuelLog) {
		const drop = new Set(addedIds);
		try {
			const saved = await saveFuelLog({
				data: { ...current, entries: current.entries.filter((e) => !drop.has(e.id)) }
			});
			onSaved(saved);
			snack.info('Undone — those tries were removed.');
			await router.invalidate();
		} catch (err) {
			snack.error(errorMessage(err, 'Undo failed'));
		}
	}

	return (
		<Dialog
			open={open}
			size="medal"
			title="Import fuel with AI"
			onClose={onClose}
			className="sm:max-w-[min(42rem,100%)]!"
		>
			<AiPromptFlow
				intro={
					<p className="m-0">
						Describe what you ate in your own words, copy the prompt into your AI, then paste JSON
						back. Checked entries save when you confirm
						{log.entries.length ? ' — existing food names are reused' : ''}.
					</p>
				}
				prompt={prompt}
				promptReady={ready}
				promptRows={8}
				result={
					<JsonPasteForm
						rows={5}
						placeholder='{ "fuel": [ { "phase": "before", "item": "Coffee", "timing": "20 min before", "outcome": "good" } ] }'
						submitLabel="Save fuel"
						submitIcon="check"
						errorLabel="Could not save fuel."
						onSubmit={async (json) => {
							const res = await saveFuelReply({ data: json });
							onSaved(res.log);
							setText('');
							writeFuelDraft('');
							const n = res.addedIds.length;
							snack.success(`Saved ${n} fuel tr${n === 1 ? 'y' : 'ies'}.`, {
								action: { label: 'Undo', onClick: () => void undo(res.addedIds, res.log) }
							});
							onClose();
							await router.invalidate();
						}}
					/>
				}
			>
				<Field label="What did you eat or drink?">
					<Textarea
						rows={4}
						value={text}
						placeholder="What you had, when, and how it felt."
						onChange={(e) => {
							setText(e.target.value);
							scheduleFuelDraftWrite(e.target.value);
						}}
					/>
				</Field>
			</AiPromptFlow>
		</Dialog>
	);
}
