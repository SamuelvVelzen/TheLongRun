import type { PlannedWaypoint } from '$lib/types';

type PlannedGeoJson = {
	geometry?: { coordinates?: number[][] };
};

function xmlEscape(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function coordinates(geojson: PlannedGeoJson): number[][] {
	const raw = geojson.geometry?.coordinates;
	if (!Array.isArray(raw)) return [];
	return raw.filter(
		(point) =>
			Array.isArray(point) &&
			point.length >= 2 &&
			Number.isFinite(Number(point[0])) &&
			Number.isFinite(Number(point[1]))
	);
}

export function plannedRouteGpx(
	name: string,
	geojson: PlannedGeoJson,
	waypoints: PlannedWaypoint[]
): string {
	const points = coordinates(geojson);
	const waypointXml = waypoints
		.map(
			(point) =>
				`  <wpt lat="${point.lat}" lon="${point.lng}"><name>${xmlEscape(point.name)}</name></wpt>`
		)
		.join('\n');
	const trackXml = points
		.map((point) => {
			const elevation =
				point.length >= 3 && Number.isFinite(Number(point[2]))
					? `<ele>${Number(point[2])}</ele>`
					: '';
			return `    <trkpt lat="${Number(point[1])}" lon="${Number(point[0])}">${elevation}</trkpt>`;
		})
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="The Long Run">
${waypointXml}
  <trk>
    <name>${xmlEscape(name)}</name>
    <trkseg>
${trackXml}
    </trkseg>
  </trk>
</gpx>
`;
}

export function downloadPlannedRouteGpx(
	name: string,
	geojson: PlannedGeoJson,
	waypoints: PlannedWaypoint[]
): void {
	const blob = new Blob([plannedRouteGpx(name, geojson, waypoints)], {
		type: 'application/gpx+xml;charset=utf-8'
	});
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = `${name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'route'}.gpx`;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sampleLngLats(track: number[][]): number[][] {
	const maxPoints = 25;
	const step = Math.max(1, Math.ceil(track.length / maxPoints));
	return track.filter(
		(_, index) => index === 0 || index === track.length - 1 || index % step === 0
	);
}

function brouterUrlFromLngLats(points: number[][]): string | null {
	if (points.length < 2) return null;
	const center = points[Math.floor(points.length / 2)]!;
	const lonlats = points.map(([lng, lat]) => `${lng},${lat}`).join(';');
	return `https://brouter.de/brouter-web/#map=13/${center[1]}/${center[0]}/standard&lonlats=${lonlats}`;
}

function lonlatsFromWaypointsAndTrack(
	waypoints: PlannedWaypoint[],
	trackLngLat: number[][]
): number[][] {
	const points = waypoints.map((point) => [point.lng, point.lat]);
	if (points.length >= 2) return points;
	return sampleLngLats(trackLngLat);
}

/**
 * BRouter Web represents an editable route by its via points in the URL.
 * For track-only GPX files, sampled track points approximate the imported shape.
 */
export function plannedRouteBrouterUrl(
	geojson: PlannedGeoJson,
	waypoints: PlannedWaypoint[]
): string | null {
	return brouterUrlFromLngLats(lonlatsFromWaypointsAndTrack(waypoints, coordinates(geojson)));
}

/** Build a BRouter URL from list data: waypoints plus a Leaflet [lat, lng] track. */
export function plannedRouteBrouterUrlFromTrack(
	waypoints: PlannedWaypoint[],
	trackLatLng: [number, number][]
): string | null {
	return brouterUrlFromLngLats(
		lonlatsFromWaypointsAndTrack(
			waypoints,
			trackLatLng.map(([lat, lng]) => [lng, lat])
		)
	);
}

/** Open BRouter in a new tab and download the GPX, matching the route detail button. */
export function openPlannedRouteInBrouter(
	name: string,
	geojson: PlannedGeoJson,
	waypoints: PlannedWaypoint[]
): boolean {
	const url = plannedRouteBrouterUrl(geojson, waypoints);
	if (url) window.open(url, '_blank', 'noopener,noreferrer');
	downloadPlannedRouteGpx(name, geojson, waypoints);
	return Boolean(url);
}
