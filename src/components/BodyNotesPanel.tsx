import {
	BODY_NOTE_STATUS_META,
	BODY_NOTE_STATUSES,
	capitalize,
	MAX_BODY_AREA,
	MAX_BODY_TEXT,
	newBodyNoteId,
	type BodyNote,
	type BodyNotes,
	type BodyNoteStatus
} from '$lib/body-notes';
import { saveBodyNotes } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import { BodyNoteLine } from './BodyNoteParts';
import { EditButton, TrashIcon } from './DeleteButton';
import { Icon } from './Icon';
import { MoreMenu } from './MoreMenu';
import {
	Actions,
	Button,
	ConfirmDialog,
	Dialog,
	IconLabelButton,
	errorMessage,
	Form,
	FormGrid,
	Panel,
	PanelTitle,
	useAppForm,
	useSnackbar
} from './ui';
import { BodyNotesAiDialog } from './BodyNotesAiDialog';
import { buttonClass } from './ui/Button';

const STATUS_OPTIONS = BODY_NOTE_STATUSES.map((value) => ({
	value,
	label: BODY_NOTE_STATUS_META[value].label
}));

const bodyNoteFormSchema = z.object({
	area: z
		.string()
		.trim()
		.min(1, 'Which area — e.g. shins, left knee, lower back.')
		.max(MAX_BODY_AREA),
	status: z.enum(BODY_NOTE_STATUSES as [BodyNoteStatus, ...BodyNoteStatus[]]),
	trigger: z.string().max(MAX_BODY_TEXT),
	helps: z.string().max(MAX_BODY_TEXT)
});

type BodyNoteFormValues = z.infer<typeof bodyNoteFormSchema>;

function formValues(note: BodyNote | null): BodyNoteFormValues {
	return {
		area: note?.area ?? '',
		status: note?.status ?? 'active',
		trigger: note?.trigger ?? '',
		helps: note?.helps ?? ''
	};
}

function BodyNoteDialog({
	open,
	note,
	busy,
	onClose,
	onSave
}: {
	open: boolean;
	note: BodyNote | null;
	busy: boolean;
	onClose: () => void;
	onSave: (values: BodyNoteFormValues) => Promise<boolean>;
}) {
	const form = useAppForm({
		defaultValues: formValues(note),
		validators: { onSubmit: bodyNoteFormSchema },
		onSubmit: async ({ value }) => {
			const ok = await onSave({
				...value,
				area: value.area.trim(),
				trigger: value.trigger.trim(),
				helps: value.helps.trim()
			});
			if (ok) onClose();
		}
	});

	useEffect(() => {
		if (open) form.reset(formValues(note));
	}, [open, note]);

	return (
		<Dialog
			open={open}
			title={note ? `Edit · ${capitalize(note.area)}` : 'Add body note'}
			onClose={busy ? () => {} : onClose}
			size="medal"
			className="sm:max-w-[min(38rem,100%)]!"
		>
			<Form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					void form.handleSubmit();
				}}
			>
				<form.AppField
					name="area"
					children={(field) => (
						<field.TextField
							label="Area"
							required
							disabled={busy}
							placeholder="shins, left knee, lower back…"
						/>
					)}
				/>
				<form.AppField
					name="status"
					children={(field) => <field.ChipField label="Status" options={STATUS_OPTIONS} />}
				/>
				<FormGrid>
					<form.AppField
						name="trigger"
						children={(field) => (
							<field.TextAreaField
								label="What sets it off"
								rows={2}
								disabled={busy}
								placeholder="Hard surfaces, long downhills, big jumps in volume…"
							/>
						)}
					/>
					<form.AppField
						name="helps"
						children={(field) => (
							<field.TextAreaField
								label="What helps"
								rows={2}
								disabled={busy}
								placeholder="Longer warm-up, trails, calf work, newer shoes…"
							/>
						)}
					/>
				</FormGrid>
				<Actions>
					<Button variant="ghost" disabled={busy} onClick={onClose}>
						Cancel
					</Button>
					<form.AppForm>
						<form.SubmitButton busyLabel="Saving…">
							<Icon name="check" size={16} />
							{note ? 'Save note' : 'Add note'}
						</form.SubmitButton>
					</form.AppForm>
				</Actions>
			</Form>
		</Dialog>
	);
}

export function BodyNotesPanel({ initial, authed }: { initial: BodyNotes; authed: boolean }) {
	const router = useRouter();
	const snack = useSnackbar();
	const [body, setBody] = useState(initial);
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<BodyNote | null>(null);
	const [adding, setAdding] = useState(false);
	const [remove, setRemove] = useState<BodyNote | null>(null);
	const [importAi, setImportAi] = useState(false);

	useEffect(() => {
		setBody(initial);
	}, [initial]);

	async function persist(notes: BodyNote[], okMessage: string): Promise<boolean> {
		setBusy(true);
		try {
			const saved = await saveBodyNotes({ data: { notes } });
			setBody(saved);
			snack.success(okMessage);
			await router.invalidate();
			return true;
		} catch (err) {
			snack.error(errorMessage(err, 'Save failed'));
			return false;
		} finally {
			setBusy(false);
		}
	}

	async function save(values: BodyNoteFormValues): Promise<boolean> {
		if (editing) {
			const next = body.notes.map((n) => (n.id === editing.id ? { ...n, ...values } : n));
			return persist(next, `Saved ${values.area}`);
		}
		const note: BodyNote = { id: newBodyNoteId(), updated: '', ...values };
		return persist([...body.notes, note], `Added ${values.area}`);
	}

	const open = body.notes.filter((n) => n.status !== 'resolved');
	const resolved = body.notes.filter((n) => n.status === 'resolved');

	const row = (n: BodyNote) => (
		<div key={n.id} className="border-b border-line last:border-b-0">
			<BodyNoteLine
				note={n}
				actions={
					authed ? (
						<div className="inline-flex items-center gap-1 shrink-0">
							<EditButton
								compact
								disabled={busy}
								label={`Edit ${n.area} note`}
								onClick={() => setEditing(n)}
							/>
							<MoreMenu
								compact
								label={`More for ${n.area} note`}
								items={[
									{
										label: 'Remove',
										icon: <TrashIcon className="size-4" />,
										onClick: () => setRemove(n),
										danger: true,
										disabled: busy
									}
								]}
							/>
						</div>
					) : null
				}
			/>
		</div>
	);

	return (
		<Panel form={authed} className="mb-5">
			<div className="flex flex-wrap items-center justify-between gap-2">
				<PanelTitle className="m-0 mb-0 pb-0 border-b-0">Body notes</PanelTitle>
				{authed && (
					<div className="flex flex-wrap gap-2 justify-end">
						<IconLabelButton
							label="Import with AI"
							disabled={busy}
							icon={<Icon name="sparkle" size={16} />}
							onClick={() => setImportAi(true)}
						/>
						<IconLabelButton
							label="Add"
							disabled={busy}
							icon={<Icon name="plus" size={16} />}
							onClick={() => setAdding(true)}
						/>
					</div>
				)}
			</div>
			<p className={cn('text-muted', 'm-0 mt-1 text-[0.9rem]')}>
				Niggles and old injuries the coach should plan around. Every prompt includes the open ones
				with their last-updated date; resolved ones are one line of history. Each open note gets its
				own 0–10 score on every run and walk.
			</p>
			{open.length ? <div className="mt-2">{open.map(row)}</div> : null}
			{resolved.length ? (
				<details className="mt-3">
					<summary className="cursor-pointer text-muted text-[0.9rem]">
						Resolved · {resolved.length}
					</summary>
					<div className="mt-1">{resolved.map(row)}</div>
				</details>
			) : null}
			{!body.notes.length && (
				<p className={cn('text-muted', 'mt-3 mb-0 text-[0.9rem]')}>
					Nothing noted. Add an area when something starts to bother you — prompts skip this section
					until then.
				</p>
			)}

			{authed && (
				<BodyNotesAiDialog
					open={importAi}
					body={body}
					busy={busy}
					onClose={() => setImportAi(false)}
					onSave={(next, okMessage) => persist(next.notes, okMessage)}
				/>
			)}
			{authed && (
				<BodyNoteDialog
					open={adding || editing != null}
					note={editing}
					busy={busy}
					onClose={() => {
						setAdding(false);
						setEditing(null);
					}}
					onSave={save}
				/>
			)}
			<ConfirmDialog
				open={remove != null}
				title="Remove this body note?"
				description={
					remove
						? `${capitalize(remove.area)} leaves your profile. Mark it resolved instead to keep it as history.`
						: undefined
				}
				confirmLabel="Remove"
				onClose={() => setRemove(null)}
				onConfirm={async () => {
					if (!remove) return;
					const ok = await persist(
						body.notes.filter((n) => n.id !== remove.id),
						`Removed ${remove.area}`
					);
					if (!ok) throw new Error('Save failed');
					setRemove(null);
				}}
			/>
		</Panel>
	);
}
