import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { importGpx } from '$lib/server/functions';
import { ACTIVITY_TYPES, activityLabel } from '$lib/activity';

export type GpxImportResult = {
	name: string;
	status: 'ok' | 'error';
	slug?: string;
	distanceKm?: number | null;
	message?: string;
	duplicate?: boolean;
};

export function GpxImport({
	onImported,
	coachAfter
}: {
	onImported?: (ok: GpxImportResult[]) => void;
	coachAfter?: boolean;
}) {
	const [files, setFiles] = useState<File[]>([]);
	const [dragOver, setDragOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState('');
	const [results, setResults] = useState<GpxImportResult[]>([]);
	const [activityType, setActivityType] = useState('');

	function addFiles(list: FileList | null) {
		if (!list) return;
		const gpx = Array.from(list).filter((f) => /\.gpx$/i.test(f.name));
		setFiles((prev) => {
			const names = new Set(prev.map((f) => f.name));
			return [...prev, ...gpx.filter((f) => !names.has(f.name))];
		});
	}

	function removeFile(name: string) {
		setFiles((prev) => prev.filter((f) => f.name !== name));
	}

	async function onImport() {
		if (!files.length) return;
		setBusy(true);
		setResults([]);
		const out: GpxImportResult[] = [];
		for (let i = 0; i < files.length; i++) {
			const f = files[i]!;
			setProgress(`Importing ${i + 1} / ${files.length}: ${f.name}`);
			try {
				const xml = await f.text();
				const res = await importGpx({ data: { xml, activityType } });
				out.push({
					name: f.name,
					status: 'ok',
					slug: res.slug,
					distanceKm: res.distance_km,
					duplicate: res.duplicate
				});
			} catch (err) {
				out.push({
					name: f.name,
					status: 'error',
					message: err instanceof Error ? err.message : 'Import failed'
				});
			}
			setResults([...out]);
		}
		setProgress('');
		setBusy(false);
		setFiles([]);
		const ok = out.filter((r) => r.status === 'ok');
		if (ok.length) onImported?.(ok);
	}

	const okCount = results.filter((r) => r.status === 'ok').length;
	const lastOk = [...results].reverse().find((r) => r.status === 'ok' && r.slug);

	return (
		<>
			<label
				className={`dropzone${dragOver ? ' dragover' : ''}`}
				onDragOver={(e) => {
					e.preventDefault();
					setDragOver(true);
				}}
				onDragLeave={() => setDragOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setDragOver(false);
					addFiles(e.dataTransfer.files);
				}}
			>
				<input
					type="file"
					accept=".gpx,application/gpx+xml"
					multiple
					hidden
					onChange={(e) => addFiles(e.target.files)}
				/>
				<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">
					<path
						fill="currentColor"
						d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-4h2v4h10v-4h2zM12 3l4 4h-3v6h-2V7H8l4-4z"
					/>
				</svg>
				<strong>Choose a GPX</strong>
				<span className="muted">or tap to browse — multiple files supported</span>
				<span className="muted dropzone-dnd">You can also drop files here</span>
			</label>

			{files.length > 0 && (
				<ul className="upload-list">
					{files.map((f) => (
						<li key={f.name}>
							<code>{f.name}</code>
							<span className="muted">{(f.size / 1024).toFixed(0)} KB</span>
							<button
								type="button"
								className="upload-remove"
								aria-label={`Remove ${f.name}`}
								onClick={() => removeFile(f.name)}
								disabled={busy}
							>
								×
							</button>
						</li>
					))}
				</ul>
			)}

			<label className="field">
				<span>Activity type</span>
				<select
					value={activityType}
					onChange={(e) => setActivityType(e.target.value)}
					disabled={busy}
				>
					<option value="">Auto-detect from file</option>
					{ACTIVITY_TYPES.map((t) => (
						<option key={t} value={t}>
							{activityLabel(t)}
						</option>
					))}
				</select>
			</label>

			<div className="actions">
				<button
					className="btn btn-primary"
					type="button"
					onClick={onImport}
					disabled={busy || files.length === 0}
				>
					{busy
						? progress || 'Importing…'
						: `Import ${files.length || ''} ${files.length === 1 ? 'file' : 'files'}`.trim()}
				</button>
			</div>

			{results.length > 0 && (
				<div style={{ marginTop: '1rem' }}>
					<h3>
						Imported {okCount} / {results.length}
					</h3>
					<ul className="import-list">
						{results.map((r) => (
							<li key={r.name}>
								<span className={`tag${r.status === 'ok' ? ' accent' : ''}`}>{r.status}</span>
								<code>{r.name}</code>
								{r.slug && (
									<>
										{' → '}
										<Link to="/runs/$slug" params={{ slug: r.slug }}>
											{r.slug}
										</Link>
									</>
								)}
								{r.distanceKm != null && <span className="muted">({r.distanceKm} km)</span>}
								{r.duplicate && <span className="muted">— already logged, refreshed its map</span>}
								{r.message && <span className="muted">— {r.message}</span>}
							</li>
						))}
					</ul>
					{coachAfter && lastOk?.slug && (
						<div className="actions" style={{ marginTop: '0.75rem' }}>
							<Link
								className="btn btn-primary"
								to="/coach"
								search={{ tab: 'debrief', slug: lastOk.slug }}
							>
								Continue in Coach
							</Link>
						</div>
					)}
				</div>
			)}
		</>
	);
}
