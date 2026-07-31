import { json } from '@sveltejs/kit';
import { fetchWeatherForDateTime, getDefaultLocation } from '$lib/server/weather';
import { normalizeStartTime } from '$lib/format';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	const date = String(url.searchParams.get('date') ?? '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
		return json({ error: 'Query param date=YYYY-MM-DD is required.' }, { status: 400 });
	}

	const time = normalizeStartTime(String(url.searchParams.get('time') ?? '').trim());
	const duration = String(url.searchParams.get('duration') ?? '').trim();
	const latParam = url.searchParams.get('lat');
	const lonParam = url.searchParams.get('lon');
	const lat = latParam != null && latParam !== '' ? Number(latParam) : null;
	const lon = lonParam != null && lonParam !== '' ? Number(lonParam) : null;

	const def = getDefaultLocation();
	const weather = await fetchWeatherForDateTime(
		date,
		time || null,
		lat != null && Number.isFinite(lat) ? lat : def.lat,
		lon != null && Number.isFinite(lon) ? lon : def.lon,
		duration || null
	);

	return json({
		date,
		time: time || null,
		weather,
		lat: lat != null && Number.isFinite(lat) ? lat : def.lat,
		lon: lon != null && Number.isFinite(lon) ? lon : def.lon
	});
};
