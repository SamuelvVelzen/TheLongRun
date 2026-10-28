import { applyBodyImport, type BodyNotes, type BodySuggestion } from '$lib/body-notes';
import { buildBodyNotesPrompt, injectBodyNotesExtra } from '$lib/body-notes-prompt';
import { parseBodyNotesReplyText, planBodyNotesImport } from '$lib/body-notes-schema';
import { isoDateLocal } from '$lib/date-range';
import { cn } from '$lib/ui';
import { useEffect, useMemo, useState } from 'react';
import { AiPromptFlow } from './AiPromptFlow';
import { BodyNoteLine } from './BodyNoteParts';
import { Icon } from './Icon';
import { JsonPasteForm } from './JsonPasteForm';
import { Button, Checkbox, Dialog, useDiscardGuard } from './ui';

export function BodyNotesAiDialog({
	open,
	body,
	busy,
	onClose,
	onSave
}: {
	open: boolean;
	body: BodyNotes;
	busy: boolean;
	onClose: () => void;
	onSave: (next: BodyNotes, okMessage: string) => Promise<boolean>;
}) {
	const [extra, setExtra] = useState('');
	const [changes, setChanges] = useState<BodySuggestion[]>([]);
	const [picked, setPicked] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (open) return;
		setChanges([]);
		setPicked(new Set());
	}, [open]);

	const template = useMemo(() => buildBodyNotesPrompt(body, isoDateLocal(new Date())), [body]);
	const prompt = injectBodyNotesExtra(template, extra);

	async function save() {
		const chosen = changes.filter((c) => picked.has(c.note.id));
		if (!chosen.length) return;
		const ok = await onSave(
			applyBodyImport(body, chosen),
			`Updated ${chosen.length} body note${chosen.length === 1 ? '' : 's'}`
		);
		if (ok) {
			setExtra('');
			onClose();
		}
	}

	const count = picked.size;
	const dirty = changes.length > 0 || extra !== '';
	const [requestClose, discardGuard] = useDiscardGuard({
		dirty,
		busy,
		onDiscard: onClose,
		title: 'Discard this import?',
		description: 'Your pasted reply and picks will be lost.'
	});

	return (
		<>
			<Dialog
				open={open}
				title="Import body notes with AI"
				className="sm:max-w-[38rem]"
				onClose={requestClose}
				actions={
					changes.length ? (
						<>
							<Button variant="ghost" disabled={busy} onClick={() => setChanges([])}>
								Back
							</Button>
							<Button variant="primary" disabled={busy || count === 0} onClick={() => void save()}>
								<Icon name="check" size={16} />
								{busy ? 'Saving…' : `Save ${count}`}
							</Button>
						</>
					) : undefined
				}
			>
				{changes.length ? (
					<>
						<p className={cn('text-muted', 'm-0')}>Untick anything you don't want to keep.</p>
						<div className="grid gap-1">
							{changes.map((c) => (
								<Checkbox
									key={c.note.id}
									className="py-2"
									checked={picked.has(c.note.id)}
									disabled={busy}
									onChange={(on) =>
										setPicked((prev) => {
											const next = new Set(prev);
											if (on) next.add(c.note.id);
											else next.delete(c.note.id);
											return next;
										})
									}
									label={
										<BodyNoteLine
											note={c.note}
											hideUpdated
											tag={
												<span
													className={
														c.existing
															? 'text-muted border border-line'
															: 'bg-accent/15 text-accent-fg'
													}
												>
													{c.existing ? 'Update' : 'New'}
												</span>
											}
										/>
									}
								/>
							))}
						</div>
					</>
				) : (
					<AiPromptFlow
						intro={
							<p className="m-0">
								List niggles, injuries, or what cleared up. Copy the prompt into your AI, paste the
								AI response back — you choose what to save.
							</p>
						}
						extraLabel="Extra for the prompt"
						extra={extra}
						onExtraChange={setExtra}
						extraPlaceholder="Shins sore on pavement, left knee fine on trails now, old Achilles resolved…"
						prompt={prompt}
						result={
							<JsonPasteForm
								rows={5}
								placeholder='{ "body": [ { "area": "shins", "status": "monitoring", "trigger": "hard surfaces", "helps": "trails" } ] }'
								submitLabel="Check reply"
								submitIcon="check"
								errorLabel="Could not read that reply."
								onSubmit={(text) => {
									const next = planBodyNotesImport(body, parseBodyNotesReplyText(text));
									setChanges(next);
									setPicked(new Set(next.map((c) => c.note.id)));
								}}
							/>
						}
					/>
				)}
			</Dialog>
			{discardGuard}
		</>
	);
}
