import { useAuthed } from '$lib/auth';
import { getContextData, saveContextFile } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { cn, ui } from '$lib/ui';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { DeferredData } from '../components/DeferredData';
import { GearInventory } from '../components/GearInventory';
import { Icon } from '../components/Icon';
import { PageHero } from '../components/PageHero';
import { errorMessage, useSnackbar } from '../components/Snackbar';
import { Actions, Button, Form, useAppForm } from '../components/ui';
import { z } from 'zod';

export const Route = createFileRoute('/context')({
	loader: () => ({ page: getContextData() }),
	head: () => appHead('Context'),
	component: Context
});

function Context() {
	const { page } = Route.useLoaderData();
	return (
		<>
			<PageHero
				variant="quiet"
				kicker="Profile, gear, and race notes"
				title="Context"
				lead="Read the formatted docs and edit markdown when something changes. Races live on Goals."
			/>
			<DeferredData promise={page}>{(data) => <ContextBody data={data} />}</DeferredData>
		</>
	);
}

function ContextBody({ data }: { data: Awaited<ReturnType<typeof getContextData>> }) {
	const router = useRouter();
	const authed = useAuthed();
	const snack = useSnackbar();

	const [copied, setCopied] = useState<string | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [openName, setOpenName] = useState<string | null>(null);

	async function copyText(text: string, id: string) {
		const value = (text ?? '').trim();
		if (!value) {
			snack.error('Nothing to copy — this file looks empty.');
			return;
		}
		try {
			await navigator.clipboard.writeText(value);
		} catch {
			const ta = document.createElement('textarea');
			ta.value = value;
			ta.style.position = 'fixed';
			ta.style.left = '-9999px';
			document.body.appendChild(ta);
			ta.select();
			document.execCommand('copy');
			ta.remove();
		}
		setCopied(id);
		setTimeout(() => setCopied((c) => (c === id ? null : c)), 1800);
	}

	function startEdit(name: string) {
		setEditing(name);
		setOpenName(name);
	}

	return (
		<>
			<GearInventory initial={data.gear} wear={data.gearWear} authed={authed} />

			<div className={ui.grid}>
				{data.files.map((file) => (
					<details
						key={file.name}
						id={`ctx-${file.name}`}
						className={ui.panel}
						open={openName === file.name || editing === file.name}
					>
						<summary className="cursor-pointer list-none flex flex-wrap items-baseline gap-x-3 gap-y-[0.45rem] min-h-11 [&::-webkit-details-marker]:hidden">
							<span className="font-display text-[1.15rem] max-sm:text-[1.05rem] max-sm:[overflow-wrap:anywhere]">
								{file.title}
							</span>
							<span className={cn(ui.muted, 'text-[0.85rem] max-sm:flex-[1_1_100%] max-sm:text-[0.8rem] max-sm:[overflow-wrap:anywhere] max-sm:break-words')}>
								data/context/{file.name}
							</span>
						</summary>

						<Actions className="mt-[0.85rem]">
							<Button variant="ghost" type="button" onClick={() => copyText(file.body, file.name)}>
								<Icon name={copied === file.name ? 'check' : 'copy'} size={16} />
								{copied === file.name ? 'Copied' : 'Copy'}
							</Button>
							{authed && editing !== file.name && (
								<Button variant="ghost" type="button" onClick={() => startEdit(file.name)}>
									<Icon name="pencil" size={16} />
									Edit
								</Button>
							)}
						</Actions>

						{editing === file.name ? (
							<ContextFileForm
								name={file.name}
								initial={file.body}
								onCancel={() => setEditing(null)}
								onSaved={async () => {
									setEditing(null);
									setOpenName(file.name);
									await router.invalidate();
								}}
							/>
						) : (
							<div className="md" dangerouslySetInnerHTML={{ __html: file.html }} />
						)}
					</details>
				))}
			</div>
		</>
	);
}

const contextFileSchema = z.object({ body: z.string() });

function ContextFileForm({
	name,
	initial,
	onCancel,
	onSaved
}: {
	name: string;
	initial: string;
	onCancel: () => void;
	onSaved: () => void | Promise<void>;
}) {
	const snack = useSnackbar();
	const form = useAppForm({
		defaultValues: { body: initial },
		validators: { onSubmit: contextFileSchema },
		onSubmit: async ({ value }) => {
			try {
				await saveContextFile({ data: { name, body: value.body } });
				snack.success(`Saved ${name}`);
				await onSaved();
			} catch (err) {
				snack.error(errorMessage(err, 'Save failed'));
			}
		}
	});

	return (
		<Form
			className="mt-[0.9rem]"
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				void form.handleSubmit();
			}}
		>
			<form.AppField
				name="body"
				children={(field) => (
					<field.TextAreaField label="Markdown source" variant="editor" rows={18} />
				)}
			/>
			<Actions>
				<form.AppForm>
					<form.SubmitButton busyLabel="Saving…">
						<Icon name="check" size={16} />
						Save
					</form.SubmitButton>
				</form.AppForm>
				<Button variant="ghost" type="button" onClick={onCancel}>
					<Icon name="close" size={16} />
					Cancel
				</Button>
			</Actions>
		</Form>
	);
}
