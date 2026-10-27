import { cn } from '$lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { segItemClass, segToggleClass } from './ui/SegmentedToggle';

export type MapFilterKind = 'all' | 'mapped' | 'unmapped';

const OPTIONS: { value: MapFilterKind; label: string }[] = [
	{ value: 'all', label: 'All routes' },
	{ value: 'mapped', label: 'GPS' },
	{ value: 'unmapped', label: 'No GPS' }
];

export function parseMapSearch(raw: unknown): MapFilterKind | undefined {
	if (raw === 'mapped' || raw === 'unmapped') return raw;
	return undefined;
}

export function matchesMapFilter(hasMap: boolean | undefined, map: string): boolean {
	if (!map || map === 'all') return true;
	if (map === 'mapped') return !!hasMap;
	if (map === 'unmapped') return !hasMap;
	return true;
}

export function mapFilterActive(map: string): boolean {
	return map === 'mapped' || map === 'unmapped';
}

export function mapSummaryLabel(map: string): string {
	if (map === 'mapped') return 'GPS';
	if (map === 'unmapped') return 'No GPS';
	return 'All routes';
}

type MapRun = { has_map?: boolean };

/** Shown when the log mix includes both mapped and unmapped activities. */
export function MapFilter({
	map,
	to,
	runs,
	defaultMap = 'all'
}: {
	map: string;
	to: string;
	runs: MapRun[];
	defaultMap?: MapFilterKind;
}) {
	const navigate = useNavigate();
	const hasMapped = runs.some((r) => r.has_map);
	const hasUnmapped = runs.some((r) => !r.has_map);
	if (!hasMapped || !hasUnmapped) return null;

	const current = (map === 'mapped' || map === 'unmapped' ? map : 'all') as MapFilterKind;

	return (
		<div
			className={cn(
				'inline-flex items-center shrink-0',
				'max-sm:w-full max-sm:overflow-x-auto max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden'
			)}
		>
			<div
				className={cn(
					segToggleClass,
					'sm:[&_button]:min-h-9 sm:[&_button]:px-2.5 sm:[&_button]:text-[0.82rem]'
				)}
				role="group"
				aria-label="Route map"
			>
				{OPTIONS.map((o) => (
					<button
						key={o.value}
						type="button"
						className={segItemClass}
						aria-pressed={current === o.value}
						onClick={() => {
							const next = o.value === defaultMap ? undefined : o.value === 'all' ? undefined : o.value;
							const prev =
								current === defaultMap || current === 'all' ? undefined : current;
							if (next === prev) return;
							navigate({
								to,
								search: (prevSearch: Record<string, unknown>) => ({
									...prevSearch,
									map: next
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
}
