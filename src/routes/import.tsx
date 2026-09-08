import type { ActivityType } from '$lib/activity';
import { SignInPanel, useAuthed } from '$lib/auth';
import { getLogDefaults } from '$lib/server/functions';
import { cn, ui } from '$lib/ui';
import { createFileRoute, Link } from '@tanstack/react-router';
import { DeferredData } from '../components/DeferredData';
import { GpxImport } from '../components/GpxImport';
import { Icon } from '../components/Icon';
import { LogForm } from '../components/LogForm';
import { PageHero } from '../components/PageHero';
import { SegmentedToggle } from '../components/SegmentedToggle';

export type AddSearch = {
	mode?: 'gpx' | 'manual';
	type?: 'strength';
	date?: string;
	time?: string;
	notes?: string;
};

function isoDateParam(v: unknown): string | undefined {
	const s = String(v ?? '').trim();
	return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
}

function durationParam(v: unknown): string | undefined {
	const s = String(v ?? '').trim();
	if (!s || s.length > 12) return undefined;
	return /^[\d:.]+$/.test(s) ? s : undefined;
}

export const Route = createFileRoute('/import')({
	validateSearch: (s: Record<string, unknown>): AddSearch => {
		const type = s.type === 'strength' ? 'strength' : undefined;
		const notes = typeof s.notes === 'string' ? s.notes.trim().slice(0, 2500) : undefined;
		return {
			mode: s.mode === 'manual' || type === 'strength' ? 'manual' : 'gpx',
			type,
			date: isoDateParam(s.date),
			time: durationParam(s.time),
			notes: notes || undefined
		};
	},
	loader: () => ({ page: getLogDefaults() }),
	component: AddActivity
});

function AddActivity() {
	const { page } = Route.useLoaderData();
	const search = Route.useSearch();
	const { mode = 'gpx' } = search;
	const authed = useAuthed();
	const prefillType: ActivityType | undefined =
		search.type === 'strength' ? 'strength' : undefined;

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
					<div className={ui.coachTabs}>
						<SegmentedToggle
							fill
							aria-label="How to add"
							value={mode}
							options={[
								{
									value: 'gpx',
									label: (
										<>
											<Icon name="upload" size={15} />
											GPX file
										</>
									),
									to: '/import',
									search: { mode: 'gpx' }
								},
								{
									value: 'manual',
									label: (
										<>
											<Icon name="pencil" size={15} />
											Log manually
										</>
									),
									to: '/import',
									search: { mode: 'manual' }
								}
							]}
						/>
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
									gear={data.gear}
									gearWear={data.gearWear}
									calendar={data.calendar}
									strengthTops={data.strengthTops}
									prefill={
										prefillType
											? {
													activityType: prefillType,
													date: search.date,
													time: search.time,
													notes: search.notes
												}
											: undefined
									}
								/>
							)}
						</DeferredData>
					)}
				</>
			)}
		</>
	);
}
