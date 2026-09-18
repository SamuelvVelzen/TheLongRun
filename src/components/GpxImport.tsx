import { ACTIVITY_TYPES, activityLabel } from '$lib/activity';
import { importGpx } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { BestEffortBadges } from './BestEffortBadges';
import { DeleteButton } from './DeleteButton';
import { ConfirmDialog } from './Dialog';
import { Icon } from './Icon';
import { errorMessage, useSnackbar } from './Snackbar';
import { Actions, Button, Form, useAppForm, buttonClass, actionsClass, tagClass, dropzoneClass } from './ui';

export type GpxImportResult = {
	name: string;
	status: 'ok' | 'error';
	slug?: string;
	distanceKm?: number | null;
	message?: string;
	duplicate?: boolean;
	highlights?: import('$lib/best-efforts').EffortHighlight[];
};

export function GpxImport({
	onImported,
	coachAfter
}: {
	onImported?: (ok: GpxImportResult[]) => void;
	coachAfter?: boolean;
}) {
	const navigate = useNavigate();
	const router = useRouter();
	const snack = useSnackbar();
	const [files, setFiles] = useState<File[]>([]);
	const [dragOver, setDragOver] = useState(false);
	const [busy, setBusy] = useState(false);
	const [progress, setProgress] = useState('');
	const [results, setResults] = useState<GpxImportResult[]>([]);
	const [pendingFile, setPendingFile] = useState<string | null>(null);
	const form = useAppForm({
		defaultValues: { activityType: '' },
		onSubmit: async ({ value }) => {
			await runImport(value.activityType);
		}
	});

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

	async function runImport(activityType: string) {
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
					duplicate: res.duplicate,
					highlights: res.highlights ?? []
				});
			} catch (err) {
				out.push({
					name: f.name,
					status: 'error',
					message: errorMessage(err, 'Import failed')
				});
			}
			setResults([...out]);
		}
		setProgress('');
		setBusy(false);
		setFiles([]);
		const ok = out.filter((r) => r.status === 'ok');
		const fail = out.filter((r) => r.status === 'error');
		const continueSlug = [...ok].reverse().find((r) => r.slug)?.slug;
		const continueAction =
			coachAfter && continueSlug
				? {
						label: 'Open activity',
						onClick: () =>
							navigate({
								to: '/runs/$slug',
								params: { slug: continueSlug }
							})
					}
				: undefined;
		if (ok.length && !fail.length) {
			const one = ok[0]!;
			snack.success(
				ok.length === 1
					? `Imported ${one.name}${one.duplicate ? ' — already logged, refreshed its map' : ''}`
					: `Imported ${ok.length} files`,
				{ action: continueAction }
			);
		} else if (ok.length) {
			snack.info(`Imported ${ok.length} of ${out.length} files`, { action: continueAction });
		} else {
			snack.error(fail[0]?.message ?? 'Import failed');
		}
		if (ok.length) {
			// Update route search (Coach debrief slug) before invalidating cached loaders.
			onImported?.(ok);
			void router.invalidate();
		}
	}

	const okCount = results.filter((r) => r.status === 'ok').length;
	const lastOk = [...results].reverse().find((r) => r.status === 'ok' && r.slug);

	return (
		<>
			<label
				className={dropzoneClass(dragOver && true)}
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
				<Icon name="upload" size={34} />
				<strong>Choose a GPX</strong>
				<span className={'text-muted'}>or tap to browse — multiple files supported</span>
				<span className={cn('text-muted', 'hidden [@media(hover:hover)_and_(pointer:fine)]:block')}>
					You can also drop files here
				</span>
			</label>

			{files.length > 0 && (
				<ul className="list-none m-[0.9rem_0_0] p-0 grid gap-1.5">
					{files.map((f) => (
						<li
							key={f.name}
							className="flex items-center gap-[0.6rem] p-[0.5rem_0.7rem] border border-line rounded-[10px] bg-inset text-[0.9rem]"
						>
							<code className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
								{f.name}
							</code>
							<span className={'text-muted'}>{(f.size / 1024).toFixed(0)} KB</span>
							<DeleteButton
								label={`Delete ${f.name}`}
								disabled={busy}
								onClick={() => setPendingFile(f.name)}
							/>
						</li>
					))}
				</ul>
			)}

			<Form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					if (!files.length) return;
					void form.handleSubmit();
				}}
			>
			<form.AppField
				name="activityType"
				children={(field) => (
					<field.SelectField
						label="Activity type"
						placeholder="Auto-detect from file"
						options={[
							{ value: '', label: 'Auto-detect from file' },
							...ACTIVITY_TYPES.map((t) => ({
								value: t,
								label: activityLabel(t)
							}))
						]}
					/>
				)}
			/>

			<Actions>
				<form.Subscribe selector={(s) => s.isSubmitting}>
					{(submitting) => (
						<Button type="submit" variant="primary" disabled={submitting || files.length === 0}>
							{submitting
								? progress || 'Importing…'
								: (
									<>
										<Icon name="upload" size={16} />
										{`Import ${files.length || ''} ${files.length === 1 ? 'file' : 'files'}`.trim()}
									</>
								)}
						</Button>
					)}
				</form.Subscribe>
			</Actions>
			</Form>

			{results.length > 0 && (
				<div className="mt-4">
					<h3>
						Imported {okCount} / {results.length}
					</h3>
					<ul className="list-none m-[0.85rem_0_0] p-0 grid gap-2 text-[0.92rem]">
						{results.map((r) => (
							<li
								key={r.name}
								className="flex flex-wrap items-center gap-[0.45rem] py-2 border-b border-line last:border-b-0"
							>
								<span className={tagClass(r.status === 'ok' && true)}>
									<Icon name={r.status === 'ok' ? 'check' : 'close'} size={12} />
									{r.status}
								</span>
								<code>{r.name}</code>
								{r.slug && (
									<>
										{' → '}
										<Link to="/runs/$slug" params={{ slug: r.slug }}>
											{r.slug}
										</Link>
									</>
								)}
								{r.distanceKm != null && <span className={'text-muted'}>({r.distanceKm} km)</span>}
								{r.duplicate && <span className={'text-muted'}>— already logged, refreshed its map</span>}
								{r.message && <span className={'text-muted'}>— {r.message}</span>}
								{r.highlights && r.highlights.length > 0 && (
									<BestEffortBadges highlights={r.highlights} />
								)}
							</li>
						))}
					</ul>
					{coachAfter && lastOk?.slug && (
						<div className={actionsClass('mt-3')}>
							<Link
								className={buttonClass()}
								to="/runs/$slug"
								params={{ slug: lastOk.slug }}
							>
								Open activity
							</Link>
						</div>
					)}
				</div>
			)}
			<ConfirmDialog
				open={pendingFile != null}
				title="Remove this file?"
				description={pendingFile ? `“${pendingFile}” will be dropped from the import list.` : null}
				confirmLabel="Remove"
				onClose={() => setPendingFile(null)}
				onConfirm={() => {
					if (pendingFile) removeFile(pendingFile);
				}}
			/>
		</>
	);
}
