import { isoDateLocal } from '$lib/date-range';
import { cn } from '$lib/ui';
import {
	applyClothingChanges,
	buildWardrobePrompt,
	CLOTHING_CATEGORY_META,
	clothingDetailLabel,
	injectWardrobeExtra,
	planClothingChanges,
	type ClothingChange,
	type Wardrobe
} from '$lib/wardrobe';
import { parseClothingReplyText } from '$lib/wardrobe-schema';
import { useMemo, useState } from 'react';
import { AiPromptFlow } from './AiPromptFlow';
import { Icon } from './Icon';
import { JsonPasteForm } from './JsonPasteForm';
import { Button, Checkbox, Dialog } from './ui';

export function WardrobeAiImportPanel({
	wardrobe,
	busy,
	onClose,
	onSave
}: {
	wardrobe: Wardrobe;
	busy: boolean;
	onClose: () => void;
	onSave: (next: Wardrobe, okMessage: string) => Promise<boolean>;
}) {
	const [extra, setExtra] = useState('');
	const [changes, setChanges] = useState<ClothingChange[]>([]);
	const [picked, setPicked] = useState<Set<string>>(new Set());

	const template = useMemo(
		() => buildWardrobePrompt(wardrobe, isoDateLocal(new Date())),
		[wardrobe]
	);
	const prompt = injectWardrobeExtra(template, extra);

	async function save() {
		const chosen = changes.filter((c) => picked.has(c.item.id));
		if (!chosen.length) return;
		const added = chosen.filter((c) => !c.existing).length;
		const updated = chosen.length - added;
		const msg = [added && `Added ${added}`, updated && `updated ${updated}`]
			.filter(Boolean)
			.join(', ');
		const ok = await onSave(
			applyClothingChanges(wardrobe, chosen),
			msg.charAt(0).toUpperCase() + msg.slice(1)
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
						{changes.map((c) => {
							const detail = clothingDetailLabel(c.item);
							return (
								<Checkbox
									key={c.item.id}
									className="py-2"
									checked={picked.has(c.item.id)}
									disabled={busy}
									onChange={(on) =>
										setPicked((prev) => {
											const next = new Set(prev);
											if (on) next.add(c.item.id);
											else next.delete(c.item.id);
											return next;
										})
									}
									label={
										<>
											<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
												<strong className="font-display">{c.item.name}</strong>
												<span className="text-muted text-[0.9rem] tabular-nums">
													×{c.item.count}
												</span>
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
											<p className={cn('text-muted', 'm-0 mt-1 text-[0.82rem]')}>
												{[CLOTHING_CATEGORY_META[c.item.category].label, detail]
													.filter(Boolean)
													.join(' · ')}
											</p>
										</>
									}
								/>
							);
						})}
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
							List what you own, or ask what you're missing. Copy the prompt into your AI, then
							paste the AI response back — you choose what to keep.
						</p>
					}
					extraLabel="Extra for the prompt"
					extra={extra}
					onExtraChange={setExtra}
					extraPlaceholder="I have 4 tees, 2 shorts with short liner, 1 with long liner… What do I need for winter mornings?"
					prompt={prompt}
					result={
						<JsonPasteForm
							rows={5}
							placeholder='{ "items": [ { "category": "bottom", "name": "Shorts + long liner", "count": 2 } ] }'
							submitLabel="Check reply"
							submitIcon="check"
							errorLabel="Could not read that reply."
							onSubmit={(text) => {
								const next = planClothingChanges(wardrobe, parseClothingReplyText(text));
								setChanges(next);
								setPicked(new Set(next.map((c) => c.item.id)));
							}}
						/>
					}
				/>
			)}
		</div>
	);
}

/** Describe or ask → copy prompt → paste the AI response → pick what to keep. Nothing saves until confirmed. */
export function WardrobeAiDialog({
	open,
	wardrobe,
	busy,
	onClose,
	onSave
}: {
	open: boolean;
	wardrobe: Wardrobe;
	busy: boolean;
	onClose: () => void;
	onSave: (next: Wardrobe, okMessage: string) => Promise<boolean>;
}) {
	return (
		<Dialog
			open={open}
			title="Import clothing with AI"
			className="sm:max-w-[38rem]"
			onClose={busy ? () => {} : onClose}
		>
			<WardrobeAiImportPanel wardrobe={wardrobe} busy={busy} onClose={onClose} onSave={onSave} />
		</Dialog>
	);
}
