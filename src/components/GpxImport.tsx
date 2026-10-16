import {
	ACTIVITY_TYPES,
	activityLabel,
	importActivityType,
	importDetectionSummary,
	type ActivityType
} from '$lib/activity';
import { parseActivityFile, type ParsedGpx } from '$lib/activity-file';
import { importGpx } from '$lib/server/functions';
import { cn } from '$lib/ui';
import { Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { BestEffortBadges } from './BestEffortBadges';
import { DeleteButton } from './DeleteButton';
import { ActivityTag, Icon, sportChipLabel } from './Icon';
import {
	Actions,
	Button,
	ConfirmDialog,
	Form,
	InsetRow,
	Tag,
	errorMessage,
	useAppForm,
	useSnackbar
} from './ui';
import { buttonClass } from './ui/Button';
import { dropzoneClass } from './ui/Chrome';

export type GpxImportResult = {
	name: string;
	status: 'ok' | 'error';
	id?: number;
	slug?: string;
	distanceKm?: number | null;
	message?: string;
	duplicate?: boolean;
	highlights?: import('$lib/best-efforts').EffortHighlight[];
};

type FilePreview = {
	detectedRaw: string;
	resolved: ActivityType;
	date: string;
	startClock: string;
	distanceKm: number | null;
	pointCount: number;
	warn?: string;
};

function previewFromXml(xml: string): { preview?: FilePreview; error?: string } {
	try {
		const parsed = parseActivityFile(xml);
		const warn = previewWarn(parsed);
		if (!parsed.date) {
			if (parsed.points.length >= 2) {
				return {
					error:
						'Track without timestamps — looks like a planned route. Save it from Routes instead.'
				};
			}
			return { error: 'No date or time found in this file.' };
		}
		return {
			preview: {
				detectedRaw: parsed.detectedType,
				resolved: importActivityType(parsed.detectedType),
				date: parsed.date,
				startClock: parsed.startClock,
				distanceKm: parsed.distanceKm,
				pointCount: parsed.points.length,
				warn
			}
		};
	} catch {
		return { error: 'Could not read this file.' };
	}
}

function previewWarn(parsed: ParsedGpx): string | undefined {
	if (parsed.points.length < 2) {
		return 'No GPS track — you can still import duration and distance if the file has them.';
	}
	return undefined;
}

export function GpxImport({
	onImported,
	coachAfter,
	onDirtyChange
}: {
	onImported?: (ok: GpxImportResult[]) => void;
	coachAfter?: boolean;
	onDirtyChange?: (dirty: boolean) => void;
}) {
	const navigate = useNavigate();
	const router = useRouter();
	const snack = useSnackbar();
	const [files, setFiles] = useState<File[]>([]);
	const [previews, setPreviews] = useState<Record<string, FilePreview>>({});
	const [previewErrors, setPreviewErrors] = useState<Record<string, string>>({});
	const [perFileType, setPerFileType] = useState<Record<string, ActivityType>>({});
	const [previewing, setPreviewing] = useState(false);
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

	useEffect(() => {
		onDirtyChange?.(files.length > 0);
	}, [files.length, onDirtyChange]);

	useEffect(() => {
		if (!files.length) {
			setPreviews({});
			setPreviewErrors({});
			return;
		}
		let cancelled = false;
		setPreviewing(true);
		void (async () => {
			const nextPreview: Record<string, FilePreview> = {};
			const nextErr: Record<string, string> = {};
			for (const f of files) {
				const xml = await f.text();
				if (cancelled) return;
				const { preview, error } = previewFromXml(xml);
				if (preview) nextPreview[f.name] = preview;
				else if (error) nextErr[f.name] = error;
			}
			if (!cancelled) {
				setPreviews(nextPreview);
				setPreviewErrors(nextErr);
				setPreviewing(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [files]);

	function addFiles(list: FileList | null) {
		if (!list) return;
		const tracks = Array.from(list).filter((f) => /\.(gpx|tcx)$/i.test(f.name));
		setFiles((prev) => {
			const names = new Set(prev.map((f) => f.name));
			return [...prev, ...tracks.filter((f) => !names.has(f.name))];
		});
	}

	function removeFile(name: string) {
		setFiles((prev) => prev.filter((f) => f.name !== name));
		setPerFileType((prev) => {
			const next = { ...prev };
			delete next[name];
			return next;
		});
	}

	function effectiveType(name: string, globalOverride: string): ActivityType {
		const global = globalOverride.trim();
		if (global) return importActivityType(global);
		const picked = perFileType[name];
		if (picked) return picked;
		return previews[name]?.resolved ?? 'run';
	}

	async function runImport(globalActivityType: string) {
		if (!files.length) return;
		setBusy(true);
		setResults([]);
		const out: GpxImportResult[] = [];
		for (let i = 0; i < files.length; i++) {
			const f = files[i]!;
			if (previewErrors[f.name]) {
				out.push({
					name: f.name,
					status: 'error',
					message: previewErrors[f.name]
				});
				continue;
			}
			setProgress(`Importing ${i + 1} / ${files.length}: ${f.name}`);
			try {
				const xml = await f.text();
				const activityType = effectiveType(f.name, globalActivityType);
				const res = await importGpx({ data: { xml, activityType } });
				out.push({
					name: f.name,
					status: 'ok',
					id: res.id,
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
		setPreviews({});
		setPreviewErrors({});
		setPerFileType({});
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
			onImported?.(ok);
			void router.invalidate();
		}
	}

	const okCount = results.filter((r) => r.status === 'ok').length;
	const lastOk = [...results].reverse().find((r) => r.status === 'ok' && r.slug);
	const hasPreviewBlockers = files.some((f) => previewErrors[f.name]);

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
					accept=".gpx,.tcx,application/gpx+xml,application/vnd.garmin.tcx+xml"
					multiple
					hidden
					onChange={(e) => addFiles(e.target.files)}
				/>
				<Icon name="upload" size={34} />
				<strong>Choose GPX or TCX files</strong>
				<span className={'text-muted'}>
					Open GPS exchange format from a watch app, Strava export, Komoot, etc. — multiple
					files OK
				</span>
				<span className={cn('text-muted', 'block text-[0.88rem]')}>
					TCX often keeps watch distance; plain GPX is usually GPS-only.
				</span>
				<span className={cn('text-muted', 'hidden [@media(hover:hover)_and_(pointer:fine)]:block')}>
					You can also drop files here
				</span>
			</label>

			{files.length > 0 && (
				<ul className="list-none m-[0.9rem_0_0] p-0 grid gap-3">
					{files.map((f) => {
						const preview = previews[f.name];
						const err = previewErrors[f.name];
						const chosen = perFileType[f.name] ?? preview?.resolved ?? 'run';
						return (
							<li key={f.name} className="list-none">
								<InsetRow className="flex-col! items-stretch! gap-2">
									<div className="flex flex-wrap items-center gap-2 min-w-0">
										<code className="flex-1 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
											{f.name}
										</code>
										<span className={'text-muted'}>{(f.size / 1024).toFixed(0)} KB</span>
										<DeleteButton
											label={`Delete ${f.name}`}
											disabled={busy}
											onClick={() => setPendingFile(f.name)}
										/>
									</div>
									{previewing && !preview && !err && (
										<p className={cn('text-muted', 'm-0 text-[0.88rem]')}>Reading file…</p>
									)}
									{err && <p className={cn('text-muted', 'm-0 text-[0.88rem]')}>{err}</p>}
									{preview && (
										<>
											<p className={cn('text-muted', 'm-0 text-[0.88rem]')}>
												{preview.date}
												{preview.startClock ? ` · ${preview.startClock}` : ''}
												{preview.distanceKm != null ? ` · ${preview.distanceKm} km` : ''}
												{preview.pointCount > 0
													? ` · ${preview.pointCount} pts`
													: ' · no GPS track'}
											</p>
											<p className={cn('text-muted', 'm-0 text-[0.88rem]')}>
												{importDetectionSummary(preview.detectedRaw, preview.resolved)}
											</p>
											{preview.warn && (
												<p className={cn('text-muted', 'm-0 text-[0.82rem]')}>{preview.warn}</p>
											)}
											<div className="flex flex-wrap items-center gap-1.5">
												<span className={cn('text-muted', 'text-[0.82rem]')}>Log as</span>
												{ACTIVITY_TYPES.map((t) => (
													<button
														key={t}
														type="button"
														disabled={busy}
														className={cn(
															buttonClass({
																variant: chosen === t ? 'primary' : 'ghost',
																size: 'sm'
															}),
															'gap-1.5!'
														)}
														onClick={() =>
															setPerFileType((prev) => ({ ...prev, [f.name]: t }))
														}
													>
														{sportChipLabel(t, activityLabel(t))}
													</button>
												))}
											</div>
											{chosen !== preview.resolved && (
												<ActivityTag type={chosen} className="self-start" />
											)}
										</>
									)}
								</InsetRow>
							</li>
						);
					})}
				</ul>
			)}

			<Form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					if (!files.length || hasPreviewBlockers) return;
					void form.handleSubmit();
				}}
			>
				<form.AppField
					name="activityType"
					children={(field) => (
						<field.SelectField
							label="Same type for every file"
							placeholder="Use detection above (per file)"
							hint="Optional — overrides the per-file buttons"
							options={[
								{ value: '', label: 'Per file (from detection)' },
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
							<Button
								type="submit"
								variant="primary"
								disabled={
									submitting || files.length === 0 || previewing || hasPreviewBlockers
								}
							>
								{submitting ? (
									progress || 'Importing…'
								) : (
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
								<Tag accent>
									<Icon name={r.status === 'ok' ? 'check' : 'close'} size={12} />
									{r.status}
								</Tag>
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
								{r.duplicate && (
									<span className={'text-muted'}>— already logged, refreshed its map</span>
								)}
								{r.message && <span className={'text-muted'}>— {r.message}</span>}
								{r.highlights && r.highlights.length > 0 && (
									<BestEffortBadges highlights={r.highlights} />
								)}
							</li>
						))}
					</ul>
					{coachAfter && lastOk?.id != null && (
						<Actions className="mt-3">
							<Link
								className={buttonClass()}
								to="/coach"
								search={{ tab: 'debrief', id: String(lastOk.id) }}
							>
								Continue debrief
							</Link>
						</Actions>
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
