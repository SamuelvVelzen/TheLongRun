import { ui } from '$lib/ui';
import { Link } from '@tanstack/react-router';

export function MapPinIcon({ size = 14 }: { size?: number }) {
	return (
		<svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="shrink-0">
			<path
				fill="currentColor"
				d="M12 2C8.1 2 5 5.1 5 9c0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z"
			/>
		</svg>
	);
}

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
	const distance =
		distanceKm != null && !/\bkm\b/i.test(name) ? ` · ${distanceKm} km` : '';
	return (
		<Link className={ui.routeChip} to="/routes/$slug" params={{ slug }} title={`Open route ${name}`}>
			<MapPinIcon />
			<span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
				{prefix ? `${prefix} · ` : ''}
				{name}
				{distance}
			</span>
		</Link>
	);
}
