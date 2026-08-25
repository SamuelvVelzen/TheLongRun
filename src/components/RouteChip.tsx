import { Link } from '@tanstack/react-router';

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
		<Link className="route-chip" to="/routes/$slug" params={{ slug }}>
			{prefix ? `${prefix} · ` : ''}
			{name}
			{distanceKm != null ? ` · ${distanceKm} km` : ''}
		</Link>
	);
}
