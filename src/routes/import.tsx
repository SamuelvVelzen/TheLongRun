import { SignInPanel, useAuthed } from '$lib/auth';
import { getLogDefaults } from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DeferredData } from '../components/DeferredData';
import { PageHero } from '../components/PageHero';
import { GpxImport } from '../components/GpxImport';
import { Icon } from '../components/Icon';
import { LogForm } from '../components/LogForm';

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
			<PageHero
				variant="quiet"
				kicker="GPX file or type it in"
				title="Add activity"
				lead={
					<p>
						Import a <code>.gpx</code> from Strava, or log numbers by hand. After an activity, debrief in{' '}
						<Link to="/coach" search={{ tab: 'debrief' }}>
							Coach
						</Link>
						. After a race, pin the time on{' '}
						<Link to="/goals">Goals</Link>.
					</p>
				}
			/>

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
							<Icon name="upload" size={15} />
							GPX file
						</Link>
						<Link
							to="/import"
							search={{ mode: 'manual' }}
							role="tab"
							aria-selected={mode === 'manual'}
							className={cn(ui.coachTab, mode === 'manual' && ui.coachTabActive)}
						>
							<Icon name="pencil" size={15} />
							Log manually
						</Link>
					</div>

					{mode === 'gpx' ? (
						<div className={cn(ui.panel, ui.form)}>
							<GpxImport coachAfter />
						</div>
					) : (
						<DeferredData promise={page}>
							{(data) => (
								<LogForm
									week={data.week}
									shoes={data.shoes}
									shoeWear={data.shoeWear}
									calendar={data.calendar}
								/>
							)}
						</DeferredData>
					)}
				</>
			)}
		</>
	);
}
