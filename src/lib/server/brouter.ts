import { isValidCoord, type GpsPoint } from '$lib/gps-repair';

const BROUTER_URL = 'https://brouter.de/brouter';
const TIMEOUT_MS = 12000;
const MAX_POINTS = 2500;

type BrouterGeo = {
	features?: { geometry?: { coordinates?: unknown } }[];
	geometry?: { coordinates?: unknown };
	coordinates?: unknown;
};

function flattenCoords(raw: unknown): GpsPoint[] {
	const lines: unknown[] = Array.isArray(raw) ? raw : [];
	const looksNested = lines.length > 0 && Array.isArray(lines[0]) && Array.isArray((lines[0] as unknown[])[0]);
	const pts = looksNested ? (lines as unknown[][]).flat() : lines;
	const out: GpsPoint[] = [];
	for (const c of pts) {
		if (!Array.isArray(c) || c.length < 2) continue;
		const lng = Number(c[0]);
		const lat = Number(c[1]);
		if (!isValidCoord(lat, lng)) continue;
		const elev = c.length >= 3 ? Number(c[2]) : NaN;
		out.push(Number.isFinite(elev) ? { lat, lng, elev } : { lat, lng });
		if (out.length >= MAX_POINTS) break;
	}
	return out;
}

/** Trail/road path through via points (BRouter public instance). */
export async function brouterViaPath(points: GpsPoint[]): Promise<GpsPoint[]> {
	const pts = points.filter((p) => isValidCoord(p.lat, p.lng));
	if (pts.length < 2) return [];
	const lonlats = pts.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join('|');
	const url = `${BROUTER_URL}?lonlats=${lonlats}&profile=trekking&alternativeidx=0&format=geojson`;
	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
	try {
		const res = await fetch(url, {
			signal: ac.signal,
			headers: { Accept: 'application/json,text/plain', 'User-Agent': 'the-long-run/1.0' }
		});
		if (!res.ok) return [];
		const text = await res.text();
		if (!text || text[0] !== '{') return [];
		const data = JSON.parse(text) as BrouterGeo;
		const coords =
			data.features?.[0]?.geometry?.coordinates ?? data.geometry?.coordinates ?? data.coordinates;
		const out = flattenCoords(coords);
		return out.length >= 2 ? out : [];
	} catch {
		return [];
	} finally {
		clearTimeout(timer);
	}
}

/** Trail/road path between two known-good GPS points (BRouter public instance). */
export async function brouterFill(from: GpsPoint, to: GpsPoint): Promise<GpsPoint[]> {
	return brouterViaPath([from, to]);
}
