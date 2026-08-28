import { createFileRoute, Link } from '@tanstack/react-router';
import { SignInPanel, useAuthed } from '$lib/auth';
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
	const authed = useAuthed();

	return (
		<>
			<section className={ui.hero}>
				<div>
					<p className={ui.muted}>GPX file or type it in</p>
					<h1>Add activity</h1>
					<p>
						Import a <code>.gpx</code> from Strava, or log numbers by hand. After a race, open{' '}
						<Link to="/coach" search={{ tab: 'debrief' }}>
							Coach
						</Link>{' '}
						to debrief.
					</p>
				</div>
			</section>

			{!authed ? (
				<SignInPanel title="Sign in to add an activity" />
			) : (
				<>
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
			)}
		</>
	);
}
