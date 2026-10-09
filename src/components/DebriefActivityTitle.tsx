import { showsField } from '$lib/activity';
import { Link } from '@tanstack/react-router';
import { ActivityTag } from './Icon';
import { runTitleClass } from './ui';

export type DebriefActivityTitleRun = {
	slug: string;
	date: string;
	day?: string | null;
	start_time?: string | null;
	distance_km?: number | null;
	activity_type?: string;
};

export function DebriefActivityTitle({
	run,
	link = false
}: {
	run: DebriefActivityTitleRun;
	link?: boolean;
}) {
	const rest = [
		run.day || null,
		run.start_time || null,
		showsField(run.activity_type, 'distance') && run.distance_km != null
			? `${run.distance_km} km`
			: null
	].filter(Boolean);
	const inner = (
		<span className="inline-flex flex-wrap items-center gap-x-2 gap-y-[0.15rem] align-middle">
			<span className={runTitleClass}>{run.date}</span>
			<ActivityTag type={run.activity_type ?? 'run'} />
			{rest.length ? <span className="text-muted font-normal">{rest.join(' · ')}</span> : null}
		</span>
	);
	if (!link) return inner;
	return (
		<Link
			to="/runs/$slug"
			params={{ slug: run.slug }}
			className="text-inherit no-underline hover:text-accent-fg"
		>
			{inner}
		</Link>
	);
}
