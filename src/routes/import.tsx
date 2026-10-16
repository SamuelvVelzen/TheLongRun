import type { ActivityType } from '$lib/activity';
import { SignInPanel, useAuthed } from '$lib/auth';
import { getLogDefaults } from '$lib/server/functions';
import { appHead } from '$lib/title';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { DeferredData } from '../components/DeferredData';
import { GpxImport } from '../components/GpxImport';
import { Icon } from '../components/Icon';
import { LogForm } from '../components/LogForm';
import { PageHero, PageTabs, Panel, useLeaveGuard } from '../components/ui';

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
	head: () => appHead('Add activity'),
	component: AddActivity
});

function AddActivity() {
	const { page } = Route.useLoaderData();
	const search = Route.useSearch();
	const { mode = 'gpx' } = search;
	const authed = useAuthed();
	const prefillType: ActivityType | undefined = search.type === 'strength' ? 'strength' : undefined;
	const [formDirty, setFormDirty] = useState(false);
	// Only one form is mounted at a time (gpx OR manual), so one flag is enough.
	// Reset stale dirty when the tab changes; the newly mounted form re-reports on mount.
	useEffect(() => setFormDirty(false), [mode]);
	const { guard: leaveGuard, allowNextLeave } = useLeaveGuard({ dirty: authed && formDirty });

	return (
		<>
			<PageHero
				variant="quiet"
				kicker="GPX file or type it in"
				title="Add activity"
				lead={<p>GPX/TCX from your watch or Strava, or type it in.</p>}
			/>

			{!authed ? (
				<SignInPanel title="Sign in to add an activity" />
			) : (
				<>
					<PageTabs
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

					{mode === 'gpx' ? (
						<Panel form>
							<GpxImport coachAfter onDirtyChange={setFormDirty} />
						</Panel>
					) : (
						<DeferredData promise={page}>
							{(data) => (
								<LogForm
									week={data.week}
									gear={data.gear}
									gearWear={data.gearWear}
									calendar={data.calendar}
									habits={data.habits}
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
									onDirtyChange={setFormDirty}
									onIntentionalLeave={allowNextLeave}
								/>
							)}
						</DeferredData>
					)}
				</>
			)}
			{leaveGuard}
		</>
	);
}
