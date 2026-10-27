import type { FeelFilterKind } from '$lib/feel';
import { cn } from '$lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { segItemClass, segToggleClass } from './ui/SegmentedToggle';

const OPTIONS: { value: FeelFilterKind; label: string }[] = [
	{ value: 'all', label: 'All feel' },
	{ value: 'yes', label: 'Has feel' },
	{ value: 'no', label: 'No feel yet' }
];

type FeelRun = { effort?: number | null };

/** Coach-style debrief completeness — only shown when both filled and missing exist. */
export function FeelFilter({
	feel,
	to,
	runs,
	hasFeelForRun
}: {
	feel: string;
	to: string;
	runs: FeelRun[];
	hasFeelForRun: (run: FeelRun) => boolean;
}) {
	const navigate = useNavigate();
	const hasYes = runs.some((r) => hasFeelForRun(r));
	const hasNo = runs.some((r) => !hasFeelForRun(r));
	if (!hasYes || !hasNo) return null;

	const current = (feel === 'yes' || feel === 'no' ? feel : 'all') as FeelFilterKind;

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
				aria-label="How it felt"
			>
				{OPTIONS.map((o) => (
					<button
						key={o.value}
						type="button"
						className={segItemClass}
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
}
