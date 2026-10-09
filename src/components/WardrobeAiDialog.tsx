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
import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { JsonPasteForm } from './JsonPasteForm';
import { Button, Dialog, Field, statusPillClass, Textarea } from './ui';

/** Describe or ask → copy prompt → paste the AI's JSON → pick what to keep. Nothing saves until confirmed. */
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
	const [extra, setExtra] = useState('');
	const [copied, setCopied] = useState(false);
	const [changes, setChanges] = useState<ClothingChange[]>([]);
	const [picked, setPicked] = useState<Set<string>>(new Set());

	useEffect(() => {
		if (open) return;
		setChanges([]);
		setPicked(new Set());
	}, [open]);

	const template = useMemo(() => buildWardrobePrompt(wardrobe, isoDateLocal(new Date())), [wardrobe]);
	const prompt = injectWardrobeExtra(template, extra);

	async function copy() {
		try {
			await navigator.clipboard.writeText(prompt);
			setCopied(true);
			setTimeout(() => setCopied(false), 1800);
		} catch {
			/* ignore */
		}
	}

	async function save() {
		const chosen = changes.filter((c) => picked.has(c.item.id));
		if (!chosen.length) return;
		const added = chosen.filter((c) => !c.existing).length;
		const updated = chosen.length - added;
		const msg = [added && `Added ${added}`, updated && `updated ${updated}`].filter(Boolean).join(', ');
		const ok = await onSave(applyClothingChanges(wardrobe, chosen), msg.charAt(0).toUpperCase() + msg.slice(1));
		if (ok) {
			setExtra('');
			onClose();
		}
	}

	const count = picked.size;

	return (
		<Dialog
			open={open}
			title="Ask AI about your clothing"
			className="sm:max-w-[38rem]"
			onClose={busy ? () => {} : onClose}
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
						{changes.map((c) => {
							const detail = clothingDetailLabel(c.item);
							return (
								<label key={c.item.id} className="flex items-start gap-3 py-2 cursor-pointer select-none">
									<input
										className="mt-1 size-5 shrink-0 accent-[var(--accent,#c8f25a)]"
										type="checkbox"
										checked={picked.has(c.item.id)}
										disabled={busy}
										onChange={(e) =>
											setPicked((prev) => {
												const next = new Set(prev);
												if (e.target.checked) next.add(c.item.id);
												else next.delete(c.item.id);
												return next;
											})
										}
									/>
									<div className="flex-1 min-w-0">
										<div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
											<strong className="font-display">{c.item.name}</strong>
											<span className="text-muted text-[0.9rem] tabular-nums">×{c.item.count}</span>
											<span
												className={statusPillClass(
													c.existing ? 'text-muted border border-line' : 'bg-accent/15 text-accent-fg'
												)}
											>
												{c.existing ? 'Update' : 'New'}
											</span>
										</div>
										<p className={cn('text-muted', 'm-0 mt-1 text-[0.82rem]')}>
											{[CLOTHING_CATEGORY_META[c.item.category].label, detail].filter(Boolean).join(' · ')}
										</p>
									</div>
								</label>
							);
						})}
					</div>
				</>
			) : (
				<>
					<p className={cn('text-muted', 'm-0 text-[0.9rem]')}>
						List what you own, or ask what you're missing. Copy the prompt into your AI, then paste its JSON
						back — you choose what to keep.
					</p>
					<Field label="Extra for the prompt">
						<Textarea
							rows={3}
							value={extra}
							placeholder="I have 4 tees, 2 shorts with short liner, 1 with long liner… What do I need for winter mornings?"
							onChange={(e) => setExtra(e.target.value)}
						/>
					</Field>
					<details>
						<summary className="cursor-pointer text-muted text-[0.9rem]">Show prompt</summary>
						<Textarea variant="editor" rows={10} value={prompt} readOnly className="mt-2" />
					</details>
					<div>
						<Button variant="primary" onClick={() => void copy()}>
							<Icon name={copied ? 'check' : 'copy'} size={16} />
							{copied ? 'Copied' : 'Copy prompt'}
						</Button>
					</div>
					<JsonPasteForm
						description={<p className={cn('text-muted', 'm-0 text-[0.9rem]')}>Paste the AI's reply</p>}
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
				</>
			)}
		</Dialog>
	);
}
