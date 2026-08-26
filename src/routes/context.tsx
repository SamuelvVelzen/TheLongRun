import { useState } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { getContextData, saveShoes, saveContextFile } from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import { DeferredData } from '../components/DeferredData';

export const Route = createFileRoute('/context')({
	loader: () => ({ page: getContextData() }),
	component: Context
});

function Context() {
	const { page } = Route.useLoaderData();
	return (
		<>
			<section className={ui.hero}>
				<div>
					<p className={ui.muted}>Profile, plan, gear, and race notes</p>
					<h1>Context</h1>
					<p>Read the formatted docs and edit markdown when something changes.</p>
				</div>
			</section>
			<DeferredData promise={page}>{(data) => <ContextBody data={data} />}</DeferredData>
		</>
	);
}

function ContextBody({ data }: { data: Awaited<ReturnType<typeof getContextData>> }) {
	const router = useRouter();

	const [copied, setCopied] = useState<string | null>(null);
	const [copyError, setCopyError] = useState('');
	const [editing, setEditing] = useState<string | null>(null);
	const [draft, setDraft] = useState('');
	const [openName, setOpenName] = useState<string | null>(null);
	const [saveFlash, setSaveFlash] = useState('');
	const [message, setMessage] = useState('');

	async function copyText(text: string, id: string) {
		setCopyError('');
		const value = (text ?? '').trim();
		if (!value) {
			setCopyError('Nothing to copy — this file looks empty.');
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
		setSaveFlash('');
	}

	async function onSaveShoes(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const fd = new FormData(e.currentTarget);
		const active = String(fd.get('active') ?? '').trim();
		const rotation = String(fd.get('rotation') ?? '')
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
		const notes = String(fd.get('notes') ?? '');
		try {
			await saveShoes({ data: { active, rotation, notes } });
			setSaveFlash('shoes.md');
			router.invalidate();
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Save failed');
		}
	}

	async function onSaveFile(e: React.FormEvent<HTMLFormElement>, name: string) {
		e.preventDefault();
		try {
			await saveContextFile({ data: { name, body: draft } });
			setEditing(null);
			setDraft('');
			setOpenName(name);
			setSaveFlash(name);
			router.invalidate();
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Save failed');
		}
	}

	return (
		<>
			{copyError && <div className={ui.flash}>{copyError}</div>}
			{saveFlash && <div className={cn(ui.flash, ui.flashOk)}>Saved {saveFlash}</div>}
			{message && <div className={ui.flash}>{message}</div>}

			<form className={cn(ui.panel, ui.form, 'mb-5')} method="POST" onSubmit={onSaveShoes}>
				<h2>Current shoes</h2>
				<div className={cn(ui.formGrid, 'mt-[0.8rem]')}>
					<label className={ui.field}>
						<span>Active pair</span>
						<input name="active" defaultValue={data.shoes.active} required />
					</label>
					<label className={ui.field}>
						<span>Rotation (one per line)</span>
						<textarea name="rotation" rows={3} defaultValue={data.shoes.rotation.join('\n')} />
					</label>
				</div>
				<label className={ui.field}>
					<span>Notes</span>
					<textarea name="notes" rows={3} defaultValue={data.shoes.notes} />
				</label>
				<button className={ui.btnPrimary} type="submit">
					Update shoes
				</button>
			</form>

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
								{copied === file.name ? 'Copied' : 'Copy'}
							</button>
							{editing !== file.name && (
								<button
									className={ui.btnGhost}
									type="button"
									onClick={() => startEdit(file.name, file.body)}
								>
									Edit
								</button>
							)}
						</div>

						{file.name === 'plan.json' && editing !== file.name && (
							<p className={cn(ui.muted, 'mt-[0.6rem]')}>
								Week headers only — Edit to see or change the full JSON.
							</p>
						)}

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
										Save
									</button>
									<button className={ui.btnGhost} type="button" onClick={() => setEditing(null)}>
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
