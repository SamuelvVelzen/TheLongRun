import { createFileRoute, Link } from '@tanstack/react-router';
import { getLogDefaults } from '$lib/server/functions';
import { GpxImport } from '../components/GpxImport';
import { LogForm } from '../components/LogForm';

type AddSearch = { mode?: 'gpx' | 'manual' };

export const Route = createFileRoute('/import')({
	validateSearch: (s: Record<string, unknown>): AddSearch => ({
		mode: s.mode === 'manual' ? 'manual' : 'gpx'
	}),
	loader: () => getLogDefaults(),
	component: AddActivity
});

function AddActivity() {
	const data = Route.useLoaderData();
	const { mode = 'gpx' } = Route.useSearch();

	return (
		<>
			<section className="hero">
				<div>
					<p className="muted">GPX file or type it in</p>
					<h1>Add activity</h1>
					<p>
						Import a <code>.gpx</code> from Strava, or log numbers by hand. Then open{' '}
						<Link to="/coach" search={{ tab: 'debrief' }}>
							Coach
						</Link>{' '}
						to debrief and update the rest of the week.
					</p>
				</div>
			</section>

			<div className="coach-tabs" role="tablist">
				<Link
					to="/import"
					search={{ mode: 'gpx' }}
					role="tab"
					aria-selected={mode === 'gpx'}
					className={`coach-tab${mode === 'gpx' ? ' active' : ''}`}
				>
					GPX file
				</Link>
				<Link
					to="/import"
					search={{ mode: 'manual' }}
					role="tab"
					aria-selected={mode === 'manual'}
					className={`coach-tab${mode === 'manual' ? ' active' : ''}`}
				>
					Log manually
				</Link>
			</div>

			{mode === 'gpx' ? (
				<div className="panel form">
					<GpxImport coachAfter />
				</div>
			) : (
				<LogForm week={data.week} shoes={data.shoes} />
			)}
		</>
	);
}
