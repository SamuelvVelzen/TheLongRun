import { useState } from 'react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { importGpx } from '$lib/server/functions';
import { ACTIVITY_TYPES, activityLabel } from '$lib/activity';

export const Route = createFileRoute('/import')({
	component: Import
});

function Import() {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState('');
	const [activityType, setActivityType] = useState('');

	async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const fd = new FormData(e.currentTarget);
		const file = fd.get('gpx');
		if (!(file instanceof File) || !file.size) {
			setMessage('Choose a .gpx file first.');
			return;
		}
		if (!/\.gpx$/i.test(file.name)) {
			setMessage(`Not a .gpx file: ${file.name}`);
			return;
		}
		setBusy(true);
		setMessage('Parsing & importing…');
		try {
			const xml = await file.text();
			const res = await importGpx({ data: { xml, activityType } });
			router.navigate({ to: '/runs/$slug', params: { slug: res.slug } });
		} catch (err) {
			setMessage(err instanceof Error ? err.message : 'Import failed');
			setBusy(false);
		}
	}

	return (
		<>
			<section className="hero">
				<div>
					<p className="muted">Manual import</p>
					<h1>Import GPX</h1>
					<p>
						Upload a <code>.gpx</code> track. Distance, pace, HR, elevation and per-km splits are
						computed from the points and saved as a new activity with its route map.
					</p>
				</div>
			</section>

			{message && <div className="flash">{message}</div>}

			<form className="panel form" method="POST" onSubmit={onSubmit}>
				<label className="field file-box">
					<span className="req">GPX file</span>
					<input type="file" name="gpx" accept=".gpx,application/gpx+xml" required />
					<span className="muted" style={{ fontSize: '0.85rem' }}>
						A single <code>.gpx</code> track export
					</span>
				</label>

				<label className="field">
					<span>Activity type</span>
					<select value={activityType} onChange={(e) => setActivityType(e.target.value)}>
						<option value="">Auto-detect from file</option>
						{ACTIVITY_TYPES.map((t) => (
							<option key={t} value={t}>
								{activityLabel(t)}
							</option>
						))}
					</select>
				</label>

				<div className="actions">
					<button className="btn btn-primary" type="submit" disabled={busy}>
						{busy ? 'Importing…' : 'Import GPX'}
					</button>
					<Link className="btn btn-ghost" to="/timeline">
						Timeline
					</Link>
				</div>
			</form>
		</>
	);
}
