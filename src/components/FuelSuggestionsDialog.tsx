import type { FuelEntry } from '$lib/fuel';
import { addFuelEntries } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { FuelTryLine } from './FuelParts';
import { Icon } from './Icon';
import { Button, Checkbox, Dialog, errorMessage, useSnackbar } from './ui';

/** Food the coach spotted in the write-up — nothing is saved until confirmed here. */
export function FuelSuggestionsDialog({
	suggestions,
	onClose
}: {
	suggestions: FuelEntry[];
	onClose: () => void;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		setPicked(new Set(suggestions.map((s) => s.id)));
	}, [suggestions]);

	async function save() {
		const entries = suggestions.filter((s) => picked.has(s.id));
		if (!entries.length) return onClose();
		setBusy(true);
		try {
			const res = await addFuelEntries({ data: entries });
			snack.success(`Saved ${res.added} fuel tr${res.added === 1 ? 'y' : 'ies'} to your log.`);
			await router.invalidate();
			onClose();
		} catch (err) {
			snack.error(errorMessage(err, 'Could not save fuel.'));
		} finally {
			setBusy(false);
		}
	}

	const count = picked.size;
	return (
		<Dialog
			open={suggestions.length > 0}
			title="Save food to your fuel log?"
			onClose={busy ? () => {} : onClose}
			actions={
				<>
					<Button variant="ghost" disabled={busy} onClick={onClose}>
						Not now
					</Button>
					<Button variant="primary" disabled={busy || count === 0} onClick={() => void save()}>
						<Icon name="check" size={16} />
						{busy ? 'Saving…' : `Save ${count || ''} to fuel log`.replace('  ', ' ')}
					</Button>
				</>
			}
		>
			<p className={cn('text-muted', 'm-0')}>
				Your write-up mentions food or drink. Untick anything you don't want to keep.
			</p>
			<div className="grid">
				{suggestions.map((s) => (
					<Checkbox
						key={s.id}
						boxClassName="mt-4"
						checked={picked.has(s.id)}
						disabled={busy}
						onChange={(on) =>
							setPicked((prev) => {
								const next = new Set(prev);
								if (on) next.add(s.id);
								else next.delete(s.id);
								return next;
							})
						}
						label={<FuelTryLine entry={s} showItem showPhase />}
					/>
				))}
			</div>
		</Dialog>
	);
}
