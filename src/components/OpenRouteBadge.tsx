import { MapBadge } from './ui';
import { formatStraightLineGap } from '$lib/format';
import { cn } from '$lib/ui';
import { Icon } from './Icon';

export function openRouteWarningLabel(gapMeters: number): string {
	return `Start and finish are ${formatStraightLineGap(gapMeters)} apart from each other`;
}

/** Warns that a planned route is not a closed loop. */
export function OpenRouteBadge({
	gapMeters,
	size = 14,
	className
}: {
	gapMeters: number;
	size?: number;
	className?: string;
}) {
	const label = openRouteWarningLabel(gapMeters);
	return (
		<MapBadge className={cn('text-warn', className)} title={label} aria-label={label}>
			<Icon name="warning" size={size} />
		</MapBadge>
	);
}
