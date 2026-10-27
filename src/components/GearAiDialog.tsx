import { isoDateLocal } from '$lib/date-range';
import { applyGearImport, buildGearPrompt, injectGearExtra, type GearContext } from '$lib/gear';
import { gearImportSummary, parseGearReplyText, planGearImport } from '$lib/gear-schema';
import { cn } from '$lib/ui';
import { useMemo, useState } from 'react';
import { AiPromptFlow } from './AiPromptFlow';
import { Icon } from './Icon';
import { JsonPasteForm } from './JsonPasteForm';
import { Button, Checkbox, Dialog } from './ui';

export function GearAiImportPanel({
	gear,
	busy,
	onClose,
	onSave
}: {
	gear: GearContext;
	busy: boolean;
	onClose: () => void;
	onSave: (next: GearContext, okMessage: string) => Promise<boolean>;
}) {
	const [extra, setExtra] = useState('');
	const [changes, setChanges] = useState<ReturnType<typeof planGearImport>>([]);
	const [picked, setPicked] = useState<Set<string>>(new Set());

	const template = useMemo(() => buildGearPrompt(gear, isoDateLocal(new Date())), [gear]);
	const prompt = injectGearExtra(template, extra);

	async function save() {
		const chosen = changes.filter((c) => picked.has(c.key));
		if (!chosen.length) return;
		const ok = await onSave(
			applyGearImport(gear, chosen),
			`Updated ${chosen.length} kit item${chosen.length === 1 ? '' : 's'}`
		);
		if (ok) {
			setExtra('');
			setChanges([]);
			setPicked(new Set());
			onClose();
		}
	}

	const count = picked.size;

	return (
		<div className="grid gap-4">
			{changes.length ? (
				<>
					<p className={cn('text-muted', 'm-0')}>Untick anything you don't want to keep.</p>
					<div className="grid gap-1">
						{changes.map((c) => (
							<Checkbox
								key={c.key}
								className="py-2"
								checked={picked.has(c.key)}
								disabled={busy}
								onChange={(on) =>
									setPicked((prev) => {
										const next = new Set(prev);
										if (on) next.add(c.key);
										else next.delete(c.key);
										return next;
									})
								}
								label={
									<>
										<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
											<strong className="font-display">{gearImportSummary(c)}</strong>
											<span
												className={
													c.existing
														? 'text-muted border border-line'
														: 'bg-accent/15 text-accent-fg'
												}
											>
												{c.existing ? 'Update' : 'New'}
											</span>
										</div>
									</>
								}
							/>
						))}
					</div>
					<div className="flex justify-end gap-2">
						<Button variant="ghost" disabled={busy} onClick={() => setChanges([])}>
							Back
						</Button>
						<Button variant="primary" disabled={busy || count === 0} onClick={() => void save()}>
							<Icon name="check" size={16} />
							{busy ? 'Saving…' : `Save ${count}`}
						</Button>
					</div>
				</>
			) : (
				<AiPromptFlow
					intro={
						<p className="m-0">
							List shoes or bikes you own, or ask what to retire. Copy the prompt into your AI,
							paste JSON back — you choose what to save.
						</p>
					}
					extraLabel="Extra for the prompt"
					extra={extra}
					onExtraChange={setExtra}
					extraPlaceholder="Daily: Saucony Speed 4, rotation: Pegasus 41, retired old Brooks…"
					prompt={prompt}
					result={
						<JsonPasteForm
							description={
								<p className={cn('text-muted', 'm-0 text-[0.9rem]')}>Paste the AI's reply</p>
							}
							rows={5}
							placeholder='{ "items": [ { "kind": "shoes", "name": "Saucony Speed 4", "role": "active" } ] }'
							submitLabel="Check reply"
							submitIcon="check"
							errorLabel="Could not read that reply."
							onSubmit={(text) => {
								const next = planGearImport(gear, parseGearReplyText(text));
								setChanges(next);
								setPicked(new Set(next.map((c) => c.key)));
							}}
						/>
					}
				/>
			)}
		</div>
	);
}

export function GearAiDialog({
	open,
	gear,
	busy,
	onClose,
	onSave
}: {
	open: boolean;
	gear: GearContext;
	busy: boolean;
	onClose: () => void;
	onSave: (next: GearContext, okMessage: string) => Promise<boolean>;
}) {
	return (
		<Dialog
			open={open}
			title="Import kit with AI"
			className="sm:max-w-[38rem]"
			onClose={busy ? () => {} : onClose}
		>
			<GearAiImportPanel gear={gear} busy={busy} onClose={onClose} onSave={onSave} />
		</Dialog>
	);
}
