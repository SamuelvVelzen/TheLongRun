import { Link } from '@tanstack/react-router';
import { ui } from '$lib/ui';

export function RouteChip({
	slug,
	name,
	distanceKm,
	prefix
}: {
	slug: string;
	name: string;
	distanceKm?: number | null;
	prefix?: string;
}) {
	return (
		<Link className={ui.routeChip} to="/routes/$slug" params={{ slug }}>
			{prefix ? `${prefix} · ` : ''}
			{name}
			{distanceKm != null ? ` · ${distanceKm} km` : ''}
		</Link>
	);
}
