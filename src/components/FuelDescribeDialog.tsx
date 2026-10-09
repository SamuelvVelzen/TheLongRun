import type { FuelLog } from '$lib/fuel';
import { injectFuelText, readFuelDraft, writeFuelDraft } from '$lib/fuel-prompt';
import { saveFuelLog, saveFuelReply } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { AiPromptFlow } from './AiPromptFlow';
import { JsonPasteForm } from './JsonPasteForm';
import { errorMessage, useSnackbar } from './Snackbar';
import { Dialog, dialogPanelMedalClass, Field, Textarea } from './ui';

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
			title="Describe what you ate"
			onClose={onClose}
			className={cn(dialogPanelMedalClass, 'sm:max-w-[min(42rem,100%)]!')}
		>
			<AiPromptFlow
				intro={
					<p className="m-0">
						Write it down in your own words, copy the prompt into your AI, then paste its JSON back. The
						reply is checked and saved straight away{log.entries.length ? ' — names you already use are reused' : ''}.
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
						placeholder="Coffee 20 min before, fine. Lidl pigs sweets every 5 km during my long run — no issues."
						onChange={(e) => {
							setText(e.target.value);
							writeFuelDraft(e.target.value);
						}}
					/>
				</Field>
			</AiPromptFlow>
		</Dialog>
	);
}
