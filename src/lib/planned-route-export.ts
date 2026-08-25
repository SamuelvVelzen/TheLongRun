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

const MAX_VIA_POINTS = 30;

function round6(n: number): string {
	return n.toFixed(6);
}

/** Local-meters distance from P to segment AB. */
function distToSegmentMeters(p: number[], a: number[], b: number[]): number {
	const lat0 = ((a[1] ?? 0) * Math.PI) / 180;
	const mLat = 111132;
	const mLng = 111320 * Math.cos(lat0);
	const bx = ((b[0] ?? 0) - (a[0] ?? 0)) * mLng;
	const by = ((b[1] ?? 0) - (a[1] ?? 0)) * mLat;
	const px = ((p[0] ?? 0) - (a[0] ?? 0)) * mLng;
	const py = ((p[1] ?? 0) - (a[1] ?? 0)) * mLat;
	const len2 = bx * bx + by * by;
	if (len2 < 1) return Math.hypot(px, py);
	const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
	return Math.hypot(px - t * bx, py - t * by);
}

function ramerDouglasPeucker(points: number[][], epsilonM: number): number[][] {
	if (points.length <= 2) return points;
	const first = points[0]!;
	const last = points[points.length - 1]!;
	let maxDist = 0;
	let index = 0;
	for (let i = 1; i < points.length - 1; i++) {
		const d = distToSegmentMeters(points[i]!, first, last);
		if (d > maxDist) {
			maxDist = d;
			index = i;
		}
	}
	if (maxDist <= epsilonM) return [first, last];
	const left = ramerDouglasPeucker(points.slice(0, index + 1), epsilonM);
	const right = ramerDouglasPeucker(points.slice(index), epsilonM);
	return [...left.slice(0, -1), ...right];
}

/** Corner-preserving via points so BRouter can rebuild the line from the URL. */
function simplifyToViaPoints(track: number[][]): number[][] {
	if (track.length <= MAX_VIA_POINTS) return track;
	let epsilon = 15;
	let out = ramerDouglasPeucker(track, epsilon);
	while (out.length > MAX_VIA_POINTS && epsilon < 4000) {
		epsilon *= 1.5;
		out = ramerDouglasPeucker(track, epsilon);
	}
	if (out.length <= MAX_VIA_POINTS) return out;
	const step = (out.length - 1) / (MAX_VIA_POINTS - 1);
	return Array.from({ length: MAX_VIA_POINTS }, (_, i) => out[Math.round(i * step)]!);
}

function brouterUrlFromLngLats(points: number[][]): string | null {
	if (points.length < 2) return null;
	const lats = points.map((p) => Number(p[1]));
	const lngs = points.map((p) => Number(p[0]));
	const minLat = Math.min(...lats);
	const maxLat = Math.max(...lats);
	const minLng = Math.min(...lngs);
	const maxLng = Math.max(...lngs);
	const span = Math.max(maxLat - minLat, maxLng - minLng);
	const zoom = span > 0.18 ? 12 : span > 0.08 ? 13 : span > 0.04 ? 14 : span > 0.018 ? 15 : 16;
	const centerLat = (minLat + maxLat) / 2;
	const centerLng = (minLng + maxLng) / 2;
	const lonlats = points.map((p) => `${round6(Number(p[0]))},${round6(Number(p[1]))}`).join(';');
	return `https://brouter.de/brouter-web/#map=${zoom}/${centerLat.toFixed(4)}/${centerLng.toFixed(4)}/standard&lonlats=${lonlats}`;
}

function lonlatsFromWaypointsAndTrack(
	waypoints: PlannedWaypoint[],
	trackLngLat: number[][]
): number[][] {
	// from+to alone would draw a straight line — need intermediate vias or the track.
	if (waypoints.length >= 3) return waypoints.map((point) => [point.lng, point.lat]);
	return simplifyToViaPoints(trackLngLat);
}

/**
 * BRouter Web represents an editable route by its via points in the URL hash
 * (`#map=zoom/lat/lng/standard&lonlats=lng,lat;…`), so the tab can reopen the
 * same line without importing a GPX.
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

/** Open BRouter in a new tab from the lonlats hash — no GPX download. */
export function openPlannedRouteInBrouter(
	geojson: PlannedGeoJson,
	waypoints: PlannedWaypoint[]
): boolean {
	const url = plannedRouteBrouterUrl(geojson, waypoints);
	if (!url) return false;
	window.open(url, '_blank', 'noopener,noreferrer');
	return true;
}
