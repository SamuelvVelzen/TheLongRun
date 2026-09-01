import { useAuthed } from '$lib/auth';
import { getContextData, saveContextFile } from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { DeferredData } from '../components/DeferredData';
import { Icon } from '../components/Icon';
import { ShoesInventory } from '../components/ShoesInventory';
import { errorMessage, useSnackbar } from '../components/Snackbar';

export const Route = createFileRoute('/context')({
	loader: () => ({ page: getContextData() }),
	component: Context
});

function Context() {
	const { page } = Route.useLoaderData();
	return (
		<>
			<section className={cn(ui.hero, ui.heroQuiet)}>
				<div>
					<p className={ui.muted}>Profile, gear, and race notes</p>
					<h1>Context</h1>
					<p>Read the formatted docs and edit markdown when something changes. Races live on Goals.</p>
				</div>
			</section>
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
	const [draft, setDraft] = useState('');
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

	function startEdit(name: string, body: string) {
		setEditing(name);
		setDraft(body);
		setOpenName(name);
	}

	async function onSaveFile(e: React.FormEvent<HTMLFormElement>, name: string) {
		e.preventDefault();
		try {
			await saveContextFile({ data: { name, body: draft } });
			setEditing(null);
			setDraft('');
			setOpenName(name);
			snack.success(`Saved ${name}`);
			router.invalidate();
		} catch (err) {
			snack.error(errorMessage(err, 'Save failed'));
		}
	}

	return (
		<>
			<ShoesInventory initial={data.shoes} wear={data.shoeWear} authed={authed} />

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

						<div className={cn(ui.actions, 'mt-[0.85rem]')}>
							<button
								className={ui.btnGhost}
								type="button"
								onClick={() => copyText(file.body, file.name)}
							>
								<Icon name={copied === file.name ? 'check' : 'copy'} size={16} />
								{copied === file.name ? 'Copied' : 'Copy'}
							</button>
							{authed && editing !== file.name && (
								<button
									className={ui.btnGhost}
									type="button"
									onClick={() => startEdit(file.name, file.body)}
								>
									<Icon name="pencil" size={16} />
									Edit
								</button>
							)}
						</div>

						{editing === file.name ? (
							<form
								className={cn(ui.form, 'mt-[0.9rem]')}
								method="POST"
								onSubmit={(e) => onSaveFile(e, file.name)}
							>
								<label className={ui.field}>
									<span>Markdown source</span>
									<textarea
										name="body"
										className={ui.editor}
										rows={18}
										value={draft}
										onChange={(e) => setDraft(e.target.value)}
									/>
								</label>
								<div className={ui.actions}>
									<button className={ui.btnPrimary} type="submit">
										<Icon name="check" size={16} />
										Save
									</button>
									<button className={ui.btnGhost} type="button" onClick={() => setEditing(null)}>
										<Icon name="close" size={16} />
										Cancel
									</button>
								</div>
							</form>
						) : (
							<div className="md" dangerouslySetInnerHTML={{ __html: file.html }} />
						)}
					</details>
				))}
			</div>
		</>
	);
}
