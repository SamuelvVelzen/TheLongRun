import type { BodySuggestion } from '$lib/body-notes';
import { applyBodySuggestions } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { BodyNoteLine } from './BodyNoteParts';
import { Icon } from './Icon';
import { Button, Checkbox, Dialog, errorMessage, useSnackbar } from './ui';

function bodySuggestionTag({ note, existing }: BodySuggestion): ReactNode {
	if (!existing) {
		return <span className="inline-flex px-[0.5rem] py-[0.12rem] rounded-full text-[0.68rem] font-bold uppercase tracking-wide bg-accent/15 text-accent-fg">New</span>;
	}
	if (note.status === 'resolved') {
		return <span className="inline-flex px-[0.5rem] py-[0.12rem] rounded-full text-[0.68rem] font-bold uppercase tracking-wide text-muted border border-line">Resolved</span>;
	}
	return <span className="inline-flex px-[0.5rem] py-[0.12rem] rounded-full text-[0.68rem] font-bold uppercase tracking-wide text-muted border border-line">Changed</span>;
}

/** Body notes the coach read from the write-up — nothing is saved until confirmed here. */
export function BodySuggestionsDialog({
	suggestions,
	onClose
}: {
	suggestions: BodySuggestion[];
	onClose: () => void;
}) {
	const router = useRouter();
	const snack = useSnackbar();
	const [picked, setPicked] = useState<Set<string>>(new Set());
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		setPicked(new Set(suggestions.map((s) => s.note.id)));
	}, [suggestions]);

	async function save() {
		const notes = suggestions.filter((s) => picked.has(s.note.id)).map((s) => s.note);
		if (!notes.length) return onClose();
		setBusy(true);
		try {
			await applyBodySuggestions({ data: notes });
			snack.success(`Saved ${notes.length} body note${notes.length === 1 ? '' : 's'}.`);
			await router.invalidate();
			onClose();
		} catch (err) {
			snack.error(errorMessage(err, 'Could not save body notes.'));
		} finally {
			setBusy(false);
		}
	}

	const count = picked.size;
	return (
		<Dialog
			open={suggestions.length > 0}
			title="Update your body notes?"
			onClose={busy ? () => {} : onClose}
			actions={
				<>
					<Button variant="ghost" disabled={busy} onClick={onClose}>
						Not now
					</Button>
					<Button variant="primary" disabled={busy || count === 0} onClick={() => void save()}>
						<Icon name="check" size={16} />
						{busy ? 'Saving…' : `Save ${count || ''} to profile`.replace('  ', ' ')}
					</Button>
				</>
			}
		>
			<p className={cn('text-muted', 'm-0')}>
				From your debrief JSON — new areas, status changes, or niggles marked resolved. Nothing is written to Profile until you save here.
			</p>
			<div className="grid">
				{suggestions.map(({ note, existing }) => (
					<Checkbox
						key={note.id}
						boxClassName="mt-3"
						checked={picked.has(note.id)}
						disabled={busy}
						onChange={(on) =>
							setPicked((prev) => {
								const next = new Set(prev);
								if (on) next.add(note.id);
								else next.delete(note.id);
								return next;
							})
						}
						label={
							<BodyNoteLine
								note={note}
								hideUpdated
								tag={bodySuggestionTag({ note, existing })}
							/>
						}
					/>
				))}
			</div>
		</Dialog>
	);
}
