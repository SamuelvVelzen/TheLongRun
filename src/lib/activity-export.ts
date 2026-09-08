import { normalizeActivityType, type ActivityType } from '$lib/activity';
import type { TrackSample } from '$lib/splits';

export type ExportSegment = {
	name: string;
	activity_type: string;
	points: TrackSample[];
};

const STRAVA_GPX_TYPE: Record<ActivityType, string> = {
	run: 'running',
	walk: 'walking',
	ride: 'cycling',
	strength: 'workout'
};

const TCX_SPORT: Record<ActivityType, string> = {
	run: 'Running',
	walk: 'Walking',
	ride: 'Biking',
	strength: 'Other'
};

function xmlEscape(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

function isoUtc(timeMs: number): string {
	return new Date(timeMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function pointXmlGpx(p: TrackSample): string {
	const bits: string[] = [];
	if (p.timeMs != null && Number.isFinite(p.timeMs)) bits.push(`<time>${isoUtc(p.timeMs)}</time>`);
	if (p.elev != null && Number.isFinite(p.elev)) bits.push(`<ele>${p.elev}</ele>`);
	if (p.hr != null && p.hr > 0) {
		bits.push(
			`<extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${Math.round(p.hr)}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>`
		);
	}
	return `      <trkpt lat="${p.lat}" lon="${p.lng}">${bits.join('')}</trkpt>`;
}

function safeFilename(name: string): string {
	return name.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').trim() || 'activity';
}

export function combinedActivityGpx(opts: {
	name: string;
	activityType: string;
	segments: ExportSegment[];
}): string {
	const type = STRAVA_GPX_TYPE[normalizeActivityType(opts.activityType)];
	const segs = opts.segments
		.filter((s) => s.points.length >= 2)
		.map((s) => {
			const pts = s.points.map(pointXmlGpx).join('\n');
			return `    <trkseg>\n${pts}\n    </trkseg>`;
		})
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1" version="1.1" creator="The Long Run">
  <trk>
    <name>${xmlEscape(opts.name)}</name>
    <type>${type}</type>
${segs}
  </trk>
</gpx>
`;
}

function tcxSport(activityType: string): string {
	return TCX_SPORT[normalizeActivityType(activityType)];
}

function pointXmlTcx(p: TrackSample): string {
	const time =
		p.timeMs != null && Number.isFinite(p.timeMs)
			? `<Time>${isoUtc(p.timeMs)}</Time>`
			: '';
	const ele =
		p.elev != null && Number.isFinite(p.elev) ? `<AltitudeMeters>${p.elev}</AltitudeMeters>` : '';
	const hr =
		p.hr != null && p.hr > 0
			? `<HeartRateBpm><Value>${Math.round(p.hr)}</Value></HeartRateBpm>`
			: '';
	return `          <Trackpoint>${time}<Position><LatitudeDegrees>${p.lat}</LatitudeDegrees><LongitudeDegrees>${p.lng}</LongitudeDegrees></Position>${ele}${hr}</Trackpoint>`;
}

function lapSeconds(points: TrackSample[]): number {
	const times = points.map((p) => p.timeMs).filter((n): n is number => n != null && Number.isFinite(n));
	if (times.length < 2) return 0;
	return Math.max(0, (Math.max(...times) - Math.min(...times)) / 1000);
}

function lapDistance(points: TrackSample[]): number {
	let m = 0;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1]!;
		const b = points[i]!;
		const dlat = ((b.lat - a.lat) * Math.PI) / 180;
		const dlng = ((b.lng - a.lng) * Math.PI) / 180;
		const x =
			Math.sin(dlat / 2) ** 2 +
			Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dlng / 2) ** 2;
		const seg = 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(x)));
		if (Number.isFinite(seg) && seg > 0 && seg <= 200) m += seg;
	}
	return m;
}

export function combinedActivityTcx(opts: {
	name: string;
	activityType: string;
	segments: ExportSegment[];
}): string {
	const sport = tcxSport(opts.activityType);
	const usable = opts.segments.filter((s) => s.points.length >= 2);
	const firstTime = usable
		.flatMap((s) => s.points.map((p) => p.timeMs))
		.find((n): n is number => n != null && Number.isFinite(n));
	const id = firstTime != null ? isoUtc(firstTime) : new Date().toISOString();

	const laps = usable
		.map((s) => {
			const start =
				s.points.find((p) => p.timeMs != null)?.timeMs ?? firstTime ?? Date.now();
			const dist = lapDistance(s.points);
			const sec = lapSeconds(s.points);
			const pts = s.points.map(pointXmlTcx).join('\n');
			return `      <Lap StartTime="${isoUtc(start)}">
        <TotalTimeSeconds>${Math.round(sec)}</TotalTimeSeconds>
        <DistanceMeters>${Math.round(dist)}</DistanceMeters>
        <Intensity>Active</Intensity>
        <TriggerMethod>Manual</TriggerMethod>
        <Track>
${pts}
        </Track>
      </Lap>`;
		})
		.join('\n');

	return `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="${sport}">
      <Id>${id}</Id>
      <Notes>${xmlEscape(opts.name)}</Notes>
${laps}
    </Activity>
  </Activities>
</TrainingCenterDatabase>
`;
}

export function memberActivityGpx(opts: { name: string; activityType: string; points: TrackSample[] }): string {
	return combinedActivityGpx({
		name: opts.name,
		activityType: opts.activityType,
		segments: [{ name: opts.name, activity_type: opts.activityType, points: opts.points }]
	});
}

export function downloadBlob(filename: string, blob: Blob): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = safeFilename(filename);
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTextFile(filename: string, contents: string, mime: string): void {
	downloadBlob(filename, new Blob([contents], { type: `${mime};charset=utf-8` }));
}

export async function shareOrDownload(opts: {
	filename: string;
	blob: Blob;
	title: string;
}): Promise<'shared' | 'downloaded'> {
	const file = new File([opts.blob], safeFilename(opts.filename), { type: opts.blob.type });
	const nav = navigator as Navigator & {
		canShare?: (data?: ShareData) => boolean;
		share?: (data: ShareData) => Promise<void>;
	};
	try {
		if (typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
			await nav.share({ files: [file], title: opts.title });
			return 'shared';
		}
	} catch (err) {
		if (err instanceof DOMException && err.name === 'AbortError') return 'shared';
	}
	downloadBlob(opts.filename, opts.blob);
	return 'downloaded';
}

export function saveExportedFile(file: {
	filename: string;
	mime: string;
	encoding: 'utf8' | 'base64';
	body: string;
}): void {
	if (file.encoding === 'base64') {
		const bin = atob(file.body);
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		downloadBlob(file.filename, new Blob([bytes], { type: file.mime }));
		return;
	}
	downloadTextFile(file.filename, file.body, file.mime);
}

export { safeFilename };

