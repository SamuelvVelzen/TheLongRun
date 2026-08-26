import { createFileRoute, Link } from '@tanstack/react-router';
import { getLogDefaults } from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import { GpxImport } from '../components/GpxImport';
import { LogForm } from '../components/LogForm';
import { DeferredData } from '../components/DeferredData';

type AddSearch = { mode?: 'gpx' | 'manual' };

export const Route = createFileRoute('/import')({
	validateSearch: (s: Record<string, unknown>): AddSearch => ({
		mode: s.mode === 'manual' ? 'manual' : 'gpx'
	}),
	loader: () => ({ page: getLogDefaults() }),
	component: AddActivity
});

function AddActivity() {
	const { page } = Route.useLoaderData();
	const { mode = 'gpx' } = Route.useSearch();

	return (
		<>
			<section className={ui.hero}>
				<div>
					<p className={ui.muted}>GPX file or type it in</p>
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

			<div className={ui.coachTabs} role="tablist">
				<Link
					to="/import"
					search={{ mode: 'gpx' }}
					role="tab"
					aria-selected={mode === 'gpx'}
					className={cn(ui.coachTab, mode === 'gpx' && ui.coachTabActive)}
				>
					GPX file
				</Link>
				<Link
					to="/import"
					search={{ mode: 'manual' }}
					role="tab"
					aria-selected={mode === 'manual'}
					className={cn(ui.coachTab, mode === 'manual' && ui.coachTabActive)}
				>
					Log manually
				</Link>
			</div>

			{mode === 'gpx' ? (
				<div className={cn(ui.panel, ui.form)}>
					<GpxImport coachAfter />
				</div>
			) : (
				<DeferredData promise={page}>
					{(data) => <LogForm week={data.week} shoes={data.shoes} />}
				</DeferredData>
			)}
		</>
	);
}
