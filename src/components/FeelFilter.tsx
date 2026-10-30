import { runsMatchingSport } from '$lib/activity-filter-scope';
import type { FeelFilterKind } from '$lib/feel';
import { useNavigate } from '@tanstack/react-router';
import { filterSegButtonClass, filterSegToggleClass, filterSegWrapClass } from './filter-seg-classes';
import { FilterRow } from './FilterRow';
import { Icon } from './Icon';

const OPTIONS: { value: FeelFilterKind; label: string }[] = [
	{ value: 'all', label: 'All feel' },
	{ value: 'yes', label: 'Has feel' },
	{ value: 'no', label: 'No feel yet' }
];

type FeelRun = { effort?: number | null; activity_type: string };

/** Coach-style debrief completeness — only shown when both filled and missing exist. */
export function FeelFilter({
	feel,
	sport,
	to,
	runs,
	hasFeelForRun
}: {
	feel: string;
	sport: string;
	to: string;
	runs: FeelRun[];
	hasFeelForRun: (run: FeelRun) => boolean;
}) {
	const navigate = useNavigate();
	const scoped = runsMatchingSport(runs, sport);
	const hasYes = scoped.some((r) => hasFeelForRun(r));
	const hasNo = scoped.some((r) => !hasFeelForRun(r));
	if (!hasYes || !hasNo) return null;

	const current = (feel === 'yes' || feel === 'no' ? feel : 'all') as FeelFilterKind;

	const group = (
		<div className={filterSegWrapClass}>
			<div className={filterSegToggleClass} role="group" aria-label="How it felt">
				{OPTIONS.map((o) => (
					<button
						key={o.value}
						type="button"
						className={filterSegButtonClass}
						aria-pressed={current === o.value}
						onClick={() => {
							const next = o.value === 'all' ? undefined : o.value;
							const prev = current === 'all' ? undefined : current;
							if (next === prev) return;
							navigate({
								to,
								search: (prevSearch: Record<string, unknown>) => ({
									...prevSearch,
									feel: next
								}),
								replace: true,
								resetScroll: false
							});
						}}
					>
						{o.label}
					</button>
				))}
			</div>
		</div>
	);

	return (
		<FilterRow label="Feel" icon={<Icon name="sparkle" size={14} />}>
			{group}
		</FilterRow>
	);
}
