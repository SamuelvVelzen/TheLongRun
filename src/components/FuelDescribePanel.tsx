import type { FuelLog } from '$lib/fuel';
import { injectFuelText, readFuelDraft, writeFuelDraft } from '$lib/fuel-prompt';
import { saveFuelLog, saveFuelReply } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Icon } from './Icon';
import { JsonPasteForm } from './JsonPasteForm';
import { errorMessage, useSnackbar } from './Snackbar';
import { Actions, Button, Field, formClass, formSectionTitleClass, panelClass, Textarea } from './ui';

/** Describe in your own words → copy prompt → paste the AI's JSON → saved (zod-checked) with Undo. */
export function FuelDescribePanel({
	log,
	promptTemplate,
	onSaved
}: {
	log: FuelLog;
	promptTemplate: string;
	onSaved: (log: FuelLog) => void;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [text, setText] = useState('');
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		setText(readFuelDraft());
	}, []);

	const prompt = injectFuelText(promptTemplate, text);

	async function copy() {
		try {
			await navigator.clipboard.writeText(prompt);
			setCopied(true);
			setTimeout(() => setCopied(false), 1800);
		} catch {
			/* ignore */
		}
	}

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
		<section className={panelClass(formClass, 'mb-5')}>
			<h3 className={cn(formSectionTitleClass, 'm-0 mb-0 pb-0 border-b-0')}>Describe what you ate</h3>
			<p className={cn('text-muted', 'm-0 text-[0.9rem]')}>
				Write it down in your own words, copy the prompt into your AI, then paste its JSON back. The
				reply is checked and saved straight away{log.entries.length ? ' — names you already use are reused' : ''}.
			</p>
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
			{text.trim() ? (
				<>
					<Field label="Prompt">
						<Textarea variant="editor" rows={10} value={prompt} readOnly />
					</Field>
					<Actions>
						<Button variant="primary" onClick={() => void copy()}>
							<Icon name={copied ? 'check' : 'copy'} size={16} />
							{copied ? 'Copied' : 'Copy prompt'}
						</Button>
					</Actions>
					<JsonPasteForm
						rows={6}
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
							await router.invalidate();
						}}
					/>
				</>
			) : null}
		</section>
	);
}
