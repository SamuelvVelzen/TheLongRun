import { buildCoachNotesPrompt, injectCoachNotesExtra } from '$lib/coach-notes-prompt';
import { parseCoachNotesReplyText } from '$lib/coach-notes-schema';
import { isoDateLocal } from '$lib/date-range';
import { cn } from '$lib/ui';
import { useEffect, useMemo, useState } from 'react';
import { AiPromptFlow } from './AiPromptFlow';
import { Icon } from './Icon';
import { JsonPasteForm } from './JsonPasteForm';
import { Button, Checkbox, Dialog } from './ui';

export function CoachNotesAiDialog({
	open,
	coachNotes,
	busy,
	onClose,
	onSave
}: {
	open: boolean;
	coachNotes: string;
	busy: boolean;
	onClose: () => void;
	onSave: (text: string, okMessage: string) => Promise<boolean>;
}) {
	const [extra, setExtra] = useState('');
	const [preview, setPreview] = useState<string | null>(null);

	useEffect(() => {
		if (open) return;
		setPreview(null);
	}, [open]);

	const template = useMemo(() => buildCoachNotesPrompt(coachNotes, isoDateLocal(new Date())), [coachNotes]);
	const prompt = injectCoachNotesExtra(template, extra);

	async function save() {
		if (!preview) return;
		const ok = await onSave(preview, 'Saved notes for your coach');
		if (ok) {
			setExtra('');
			onClose();
		}
	}

	return (
		<Dialog
			open={open}
			title="Import coach notes with AI"
			className="sm:max-w-[38rem]"
			onClose={busy ? () => {} : onClose}
			actions={
				preview != null ? (
					<>
						<Button variant="ghost" disabled={busy} onClick={() => setPreview(null)}>
							Back
						</Button>
						<Button variant="primary" disabled={busy} onClick={() => void save()}>
							<Icon name="check" size={16} />
							{busy ? 'Saving…' : 'Save notes'}
						</Button>
					</>
				) : undefined
			}
		>
			{preview != null ? (
				<>
					<p className={cn('text-muted', 'm-0')}>This replaces your standing coach notes.</p>
					<Checkbox
						className="py-2"
						checked
						disabled
						label={
							<p className="m-0 whitespace-pre-wrap text-[0.9rem] leading-relaxed max-h-[14rem] overflow-y-auto">
								{preview}
							</p>
						}
					/>
				</>
			) : (
				<AiPromptFlow
					intro={
						<p className="m-0">
							Describe personal rules and context for every plan. Copy the prompt into your AI, paste JSON back
							— review before saving.
						</p>
					}
					extraLabel="Extra for the prompt"
					extra={extra}
					onExtraChange={setExtra}
					extraPlaceholder="Night shifts every other week. No runs before 7am. Prefer trails for long runs…"
					prompt={prompt}
					result={
						<JsonPasteForm
							description={<p className={cn('text-muted', 'm-0 text-[0.9rem]')}>Paste the AI's reply</p>}
							rows={5}
							placeholder='{ "text": "Night shifts every other week. No running before 7am." }'
							submitLabel="Check reply"
							submitIcon="check"
							errorLabel="Could not read that reply."
							onSubmit={(text) => setPreview(parseCoachNotesReplyText(text))}
						/>
					}
				/>
			)}
		</Dialog>
	);
}
