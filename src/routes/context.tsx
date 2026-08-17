import { useState } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { getContextData, saveShoes, saveContextFile } from '$lib/server/functions';

export const Route = createFileRoute('/context')({
	loader: () => getContextData(),
	component: Context
});

function Context() {
	const data = Route.useLoaderData();
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
			<section className="hero">
				<div>
					<p className="muted">Profile, plan, gear, and race notes</p>
					<h1>Context</h1>
					<p>Read the formatted docs and edit markdown when something changes.</p>
				</div>
			</section>

			{copyError && <div className="flash">{copyError}</div>}
			{saveFlash && <div className="flash ok-flash">Saved {saveFlash}</div>}
			{message && <div className="flash">{message}</div>}

			<form
				className="panel form"
				method="POST"
				onSubmit={onSaveShoes}
				style={{ marginBottom: '1.25rem' }}
			>
				<h2>Current shoes</h2>
				<div className="form-grid" style={{ marginTop: '0.8rem' }}>
					<label className="field">
						<span>Active pair</span>
						<input name="active" defaultValue={data.shoes.active} required />
					</label>
					<label className="field">
						<span>Rotation (one per line)</span>
						<textarea name="rotation" rows={3} defaultValue={data.shoes.rotation.join('\n')} />
					</label>
				</div>
				<label className="field">
					<span>Notes</span>
					<textarea name="notes" rows={3} defaultValue={data.shoes.notes} />
				</label>
				<button className="btn btn-primary" type="submit">
					Update shoes
				</button>
			</form>

			<div className="grid">
				{data.files.map((file) => (
					<details
						key={file.name}
						id={`ctx-${file.name}`}
						className="panel context-card"
						open={openName === file.name || editing === file.name}
					>
						<summary>
							<span className="context-title">{file.title}</span>
							<span className="muted context-path">data/context/{file.name}</span>
						</summary>

						<div className="actions" style={{ marginTop: '0.85rem' }}>
							<button
								className="btn btn-ghost"
								type="button"
								onClick={() => copyText(file.body, file.name)}
							>
								{copied === file.name ? 'Copied' : 'Copy'}
							</button>
							{editing !== file.name && (
								<button
									className="btn btn-ghost"
									type="button"
									onClick={() => startEdit(file.name, file.body)}
								>
									Edit
								</button>
							)}
						</div>

						{file.name === 'plan.json' && editing !== file.name && (
							<p className="muted" style={{ marginTop: '0.6rem' }}>
								Week headers only — Edit to see or change the full JSON.
							</p>
						)}

						{editing === file.name ? (
							<form
								className="form"
								method="POST"
								style={{ marginTop: '0.9rem' }}
								onSubmit={(e) => onSaveFile(e, file.name)}
							>
								<label className="field">
									<span>Markdown source</span>
									<textarea
										name="body"
										className="editor"
										rows={18}
										value={draft}
										onChange={(e) => setDraft(e.target.value)}
									/>
								</label>
								<div className="actions">
									<button className="btn btn-primary" type="submit">
										Save
									</button>
									<button className="btn btn-ghost" type="button" onClick={() => setEditing(null)}>
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
