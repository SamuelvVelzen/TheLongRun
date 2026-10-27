import { activityLabel, resolveImportActivityType, normalizeActivityType, showsField } from '$lib/activity';
import { withHabitDefaults } from '$lib/activity-habits';
import { computeBestEffortsFromTrack, highlightsForActivity, supportsBestEfforts } from '$lib/best-efforts';
import { trackFromGeoJson } from '$lib/combine-track';
import { dayFromIsoDate, guessSession, normalizeStartTime, parseDurationSeconds } from '$lib/format';
import { gearKindForActivity, wearByAllGear } from '$lib/gear';
import { attachHrSeries, densifyWaypoints, diagnoseGps, normalizeTrackPoints, normalizeWaypoints, samplesFromGeoJson, stampAlongDistance, trackDistanceMeters } from '$lib/gps-repair';
import { plannedSessionFor, weekNumberForDate } from '$lib/plan';
import { analyticsFromProperties, analyticsToProperties, computeRouteAnalytics, withEffectiveHrZones } from '$lib/splits';
import { validateBodyScores } from '$lib/body-scores';
import type { ActivityAttachOption, ActivityGroupInfo, Goal, PlanAttachOption, PlannedRoute, PlannedRouteActivityLink, PlannedRoutePlanLink, PlanWeek, RouteTrack, RunRecord, RunWithMap, SessionRouteRef } from '$lib/types';
import type { ActivityFeelInput, DebriefRaceHint } from '$lib/debrief-types';
import type { GoalBriefDraft } from '$lib/goal-brief';
import type { PlanPeekData } from '$lib/plan-peek';
import type { CreateRunInput, UpdateRunInput } from '$lib/run-input';
import { createServerFn } from '@tanstack/react-start';
import { requireAuth } from '../auth';
import { brouterAlongPins } from '../brouter';
import { currentPlanWeek, loadActivityHabits, loadGear, loadFuelLog, loadSettings, loadTrainingContext, rememberGearName } from '../context';
import { reverseGeocode } from '../geo';
import { parseActivityFile } from '../gpx';
import { enrichAllGroupEfforts, listActivityGroups, membershipForRun } from '../groups';
import { attachRouteToActivity as dbAttachRouteToActivity, getActivityRouteRef, getPlannedRoute, listPlannedRoutes } from '../planned-routes';
import { getRouteGeoJson, routeIdForRun, saveRouteGeoJson } from '../route-analytics';
import { deleteRun as dbDeleteRun, updateRun as dbUpdateRun, findRunsByDate, getMaxHrAllTime, getRun, getRunById, listRouteIds, listRuns, runHasMap, saveRun, setRunBestEfforts, setRunImportMetrics, setRunRoute, updateRunFeelings, type UpdateRunFields } from '../runs';
import { inferSurfaceFromTrack } from '../surface';
import { fetchWeatherForDateTime, weatherLocationFromTrack } from '../weather';
import { highlightsAfterSave, hydrateBestEfforts, withMap } from '../run-orchestration';
import { activityStartMs } from '../planned-route-draw';

// ---------- reads ----------

/** Root-loader data shared by every page: sign-in state + the open body notes to score. */

export const getTimelineRuns = createServerFn({ method: 'GET' }).handler(async () => {
	const [runs, routeIds, groupsRaw, gear] = await Promise.all([
		listRuns(),
		listRouteIds(),
		listActivityGroups(),
		loadGear()
	]);
	await hydrateBestEfforts(runs);
	const groups = await enrichAllGroupEfforts(groupsRaw, runs);
	return { runs: withMap(runs, routeIds), groups, gear };
});

export const getRunDetail = createServerFn({ method: 'GET' })
	.validator((slug: string) => slug)
	.handler(async ({ data: slug }) => {
		const run = await getRun(slug);
		if (!run) return null;
		const routeId = routeIdForRun(run);
		const [
			geo,
			routeIds,
			gear,
			settings,
			allTimeMaxHr,
			allRuns,
			plannedRoute,
			training,
			group,
			plannedRoutes,
			habits,
			fuelLog
		] = await Promise.all([
			routeId ? getRouteGeoJson(routeId) : Promise.resolve(null),
			listRouteIds(),
			loadGear(),
			loadSettings(),
			getMaxHrAllTime(),
			listRuns(),
			getActivityRouteRef(slug),
			loadTrainingContext(),
			membershipForRun(run.id),
			listPlannedRoutes(),
			loadActivityHabits(),
			loadFuelLog()
		]);
		const analytics = geo
			? analyticsFromProperties(
					geo && typeof geo === 'object'
						? ((geo as { properties?: unknown }).properties ?? null)
						: null
				)
			: null;
		const gps = diagnoseGps(geo ? samplesFromGeoJson(geo) : []);
		await hydrateBestEfforts(allRuns);
		const current = allRuns.find((r) => r.slug === slug) ?? run;
		const highlights = highlightsForActivity(current.slug, current.activity_type, allRuns);
		const allGroups = await listActivityGroups();
		const groupedIds = new Set(allGroups.flatMap((g) => g.member_ids));

		// HR zones honour a manually-set HRmax; otherwise the all-time max across activities
		// (never just this one run's noisy peak). Time-in-zone needs the stored per-point HR
		// series — present for newer imports, absent for older ones (falls back to avg-zone).
		const hrMaxManual = settings.hrMax;
		const out = withEffectiveHrZones(analytics, {
			avgHr: run.avg_hr,
			hrMaxManual,
			hrMaxAllTime: allTimeMaxHr
		});

		const groupOptions = allRuns
			.filter((r) => r.id !== run.id)
			.map((r) => ({
				id: r.id,
				slug: r.slug,
				date: r.date,
				start_time: r.start_time,
				activity_type: r.activity_type,
				distance_km: r.distance_km,
				grouped: groupedIds.has(r.id)
			}));

		const gpsContextTracks = group
			? (
					await Promise.all(
						group.member_ids
							.filter((mid) => mid !== run.id)
							.map(async (mid) => {
								const sibling = allRuns.find((r) => r.id === mid);
								if (!sibling) return null;
								const id = routeIdForRun(sibling);
								if (!id) return null;
								const siblingGeo = await getRouteGeoJson(id);
								const coords = trackFromGeoJson(siblingGeo).coords;
								if (coords.length < 2) return null;
								return {
									slug: sibling.slug,
									label: `${sibling.date}${sibling.start_time ? ` · ${sibling.start_time}` : ''} ${activityLabel(sibling.activity_type)}`,
									coords
								};
							})
					)
				).filter((t): t is { slug: string; label: string; coords: [number, number][] } => t != null)
			: [];

		return {
			run: { ...current, has_map: runHasMap(current, routeIds) } as RunWithMap,
			analytics: out,
			gps,
			gear,
			gearWear: wearByAllGear(allRuns),
			hrMaxManual,
			hrMaxAllTime: allTimeMaxHr,
			bestEfforts: highlights,
			plannedRoute,
			repairRoutes: plannedRoutes
				.filter((r) => r.point_count >= 2)
				.map((r) => ({ slug: r.slug, name: r.name, distance_km: r.distance_km })),
			gpsContextTracks,
			calendar: training.calendar,
			group,
			groupOptions,
			habits,
			fuel: fuelLog.entries.filter((e) => e.slug === slug)
		};
	});

export const createRun = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: CreateRunInput) => d)
	.handler(async ({ data }) => {
		const date = data.date.trim();
		const session = data.session.trim();
		if (!date || !session) throw new Error('Date and session are required.');
		const day = dayFromIsoDate(date);
		const { calendar } = await loadTrainingContext();
		const week = weekNumberForDate(date, calendar);
		const start_time = normalizeStartTime(data.start_time.trim());
		const time = data.time.trim();
		let weather = data.weather.trim();
		if (!weather) {
			weather = await fetchWeatherForDateTime(
				date,
				start_time || null,
				null,
				null,
				time || null,
				null
			);
		}
		const activity_type = normalizeActivityType(data.activity_type);
		const habits = await loadActivityHabits();
		const ritual = withHabitDefaults(activity_type, habits, {
			before: data.before_notes,
			after: data.after_notes
		});
		const run = await saveRun({
			date,
			week,
			day,
			activity_type,
			session,
			effort: data.effort,
			body_scores: validateBodyScores(data.body_scores),
			legs: data.legs,
			energy: data.energy,
			weather,
			surface: data.surface.trim(),
			wanted_faster: data.wanted_faster,
			distance_km: data.distance_km,
			start_time,
			time,
			avg_pace: data.avg_pace.trim(),
			avg_hr: data.avg_hr,
			max_hr: data.max_hr,
			elev_gain: data.elev_gain,
			cadence: data.cadence,
			gear: data.gear.trim(),
			summary_image: '',
			splits_image: '',
			strava_id: '',
			notes: data.notes,
			before_notes: ritual.before,
			after_notes: ritual.after
		});
		await rememberGearName(run.gear, run.activity_type);
		return { id: run.id, slug: run.slug };
	});

export const importGpx = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { xml: string; activityType?: string }) => d)
	.handler(async ({ data }) => {
		const parsed = parseActivityFile(data.xml);
		if (!parsed.date) {
			if (parsed.points.length >= 2) {
				throw new Error(
					'This GPX has a track but no timestamps — it looks like a planned BRouter route. Save it from Routes instead of Import.'
				);
			}
			throw new Error('Could not read a date/time from that GPX file.');
		}

		const activity_type = resolveImportActivityType(data.activityType, parsed.detectedType);
		const day = dayFromIsoDate(parsed.date);
		const { calendar } = await loadTrainingContext();
		const week = weekNumberForDate(parsed.date, calendar);
		const planWeek = await currentPlanWeek(
			parsed.date ? new Date(`${parsed.date}T12:00:00`) : new Date()
		);
		const session = guessSession(day, parsed.distanceKm, plannedSessionFor(planWeek, day)?.label);

		// Dedup: an activity of the same type on the same day that matches on start time (or,
		// lacking one, on distance) is treated as the same activity — refresh its track in place
		// instead of creating a `-2` duplicate. This also backfills analytics (incl. HR series).
		const sameDay = await findRunsByDate(parsed.date);
		const existingDup =
			sameDay.find(
				(r) =>
					normalizeActivityType(r.activity_type) === activity_type &&
					parsed.startClock &&
					r.start_time &&
					r.start_time === parsed.startClock
			) ??
			sameDay.find(
				(r) =>
					normalizeActivityType(r.activity_type) === activity_type &&
					(!parsed.startClock || !r.start_time) &&
					parsed.distanceKm != null &&
					r.distance_km != null &&
					Math.abs(r.distance_km - parsed.distanceKm) <= 0.2
			) ??
			null;

		let route = existingDup?.route || '';
		if (parsed.points.length >= 2) {
			// Reuse the existing track id when refreshing a duplicate; else mint a new one.
			const id = (existingDup && routeIdForRun(existingDup)) || crypto.randomUUID();
			const geojson = {
				type: 'Feature',
				properties: {
					date: parsed.date,
					sport: activity_type,
					distance_km: parsed.distanceKm,
					point_count: parsed.points.length,
					...(parsed.analytics ? analyticsToProperties(parsed.analytics) : {}),
					...(parsed.points.some((p) => p.timeMs != null)
						? { times: parsed.points.map((p) => p.timeMs ?? null) }
						: {})
				},
				geometry: {
					type: 'LineString',
					coordinates: parsed.points.map((p) =>
						p.elev != null && Number.isFinite(p.elev) ? [p.lng, p.lat, p.elev] : [p.lng, p.lat]
					)
				}
			};
			await saveRouteGeoJson(id, geojson);
			route = existingDup?.route || `/routes/${id}.json`;
		}

		// Matched an existing activity → refresh its map/analytics, keep subjective data, no dup.
		if (existingDup) {
			if (route && route !== existingDup.route) await setRunRoute(existingDup.id, route);
			await setRunImportMetrics(existingDup.id, {
				distance_km: parsed.distanceKm,
				time: parsed.time,
				elapsed_time: parsed.elapsedTime,
				avg_pace: parsed.avgPace,
				avg_hr: parsed.avgHr,
				max_hr: parsed.maxHr,
				elev_gain: parsed.elevGain,
				max_speed: parsed.maxSpeed
			});
			if (
				!(existingDup.surface ?? '').trim() &&
				showsField(activity_type, 'surface') &&
				parsed.points.length >= 2
			) {
				const surface = await inferSurfaceFromTrack(parsed.points);
				if (surface) await updateRunFeelings(existingDup.id, { surface });
			}
			const efforts = supportsBestEfforts(activity_type) ? parsed.bestEfforts : [];
			if (efforts.length) await setRunBestEfforts(existingDup.id, efforts);
			const highlights = await highlightsAfterSave(
				existingDup.id,
				existingDup.slug,
				activity_type,
				efforts
			);
			return {
				id: existingDup.id,
				slug: existingDup.slug,
				activity_type,
				distance_km: parsed.distanceKm,
				has_route: Boolean(route),
				duplicate: true,
				highlights
			};
		}

		const trackPoints =
			showsField(activity_type, 'surface') && parsed.points.length >= 2 ? parsed.points : [];
		const weatherLoc = weatherLocationFromTrack(parsed.points, parsed.startLat, parsed.startLng);
		const [weather, geo, surface] = await Promise.all([
			fetchWeatherForDateTime(
				parsed.date,
				parsed.startClock || null,
				weatherLoc?.lat ?? null,
				weatherLoc?.lon ?? null,
				parsed.time || null
			),
			parsed.startLat != null && parsed.startLng != null
				? reverseGeocode(parsed.startLat, parsed.startLng)
				: Promise.resolve({ country: '', province: '', place: '' }),
			trackPoints.length >= 2 ? inferSurfaceFromTrack(trackPoints) : Promise.resolve('')
		]);

		const kind = gearKindForActivity(activity_type);
		const importedGear = kind ? (await loadGear())[kind].active : '';
		const ritual = withHabitDefaults(activity_type, await loadActivityHabits());

		const run = await saveRun({
			date: parsed.date,
			week,
			day,
			activity_type,
			session,
			effort: null,
			body_scores: [],
			legs: null,
			energy: null,
			weather,
			surface,
			wanted_faster: null,
			distance_km: parsed.distanceKm,
			start_time: parsed.startClock,
			time: parsed.time,
			elapsed_time: parsed.elapsedTime,
			avg_pace: parsed.avgPace,
			avg_hr: parsed.avgHr,
			max_hr: parsed.maxHr,
			elev_gain: parsed.elevGain,
			max_speed: parsed.maxSpeed,
			cadence: null,
			gear: importedGear,
			summary_image: '',
			splits_image: '',
			strava_id: '',
			route,
			notes: 'Imported from GPX.',
			before_notes: ritual.before,
			after_notes: ritual.after,
			country: geo.country,
			province: geo.province,
			place: geo.place,
			best_efforts: supportsBestEfforts(activity_type) ? parsed.bestEfforts : []
		});

		const highlights = await highlightsAfterSave(
			run.id,
			run.slug,
			activity_type,
			supportsBestEfforts(activity_type) ? parsed.bestEfforts : []
		);

		return {
			id: run.id,
			slug: run.slug,
			activity_type,
			distance_km: parsed.distanceKm,
			has_route: Boolean(route),
			duplicate: false,
			highlights
		};
	});

export const repairRunGps = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator(
		(d: {
			id: number;
			waypoints?: { lat: number; lng: number }[];
			follow_network?: boolean;
			network_coords?: { lat: number; lng: number }[];
			planned_slug?: string;
		}) => d
	)
	.handler(async ({ data }) => {
		const run = await getRunById(data.id);
		if (!run) throw new Error('Activity not found.');

		const pins = normalizeWaypoints(data.waypoints);
		let plannedSlug = data.planned_slug?.trim() || '';
		const attached = await getActivityRouteRef(run.slug);
		if (pins.length < 2) {
			if (plannedSlug && plannedSlug !== attached?.slug) {
				await dbAttachRouteToActivity(plannedSlug, run.slug);
			} else if (!plannedSlug) {
				plannedSlug = attached?.slug ?? '';
			}
		}

		const routeId = routeIdForRun(run);
		const [geo, planned] = await Promise.all([
			routeId ? getRouteGeoJson(routeId) : Promise.resolve(null),
			plannedSlug && pins.length < 2 ? getPlannedRoute(plannedSlug) : Promise.resolve(null)
		]);
		if (plannedSlug && pins.length < 2 && !planned)
			throw new Error('That planned route was not found.');

		let out =
			pins.length >= 2
				? densifyWaypoints(pins)
				: planned
					? samplesFromGeoJson(planned.geojson)
					: [];
		let source: 'waypoints' | 'waypoints-network' | 'planned' =
			pins.length >= 2 ? 'waypoints' : 'planned';

		const previewed = normalizeTrackPoints(data.network_coords);
		if (pins.length >= 2 && data.follow_network) {
			if (previewed.length >= 2) {
				out = previewed;
				source = 'waypoints-network';
			} else {
				const routed = await brouterAlongPins(pins);
				if (routed.length >= 2) {
					out = routed;
					source = 'waypoints-network';
				} else {
					throw new Error(
						'Could not follow roads between those pins. Uncheck Follow roads to save the straight line.'
					);
				}
			}
		}

		if (out.length < 2) {
			throw new Error('Drop at least two waypoints on the map, or pick a saved route.');
		}

		const durationSec = parseDurationSeconds(run.elapsed_time) ?? parseDurationSeconds(run.time);
		const startMs = activityStartMs(run, out);
		const durationMs = durationSec != null && durationSec > 0 ? durationSec * 1000 : null;
		if (startMs != null && durationMs != null) {
			out = stampAlongDistance(out, startMs, durationMs);
		}

		const prevHr = analyticsFromProperties(
			geo && typeof geo === 'object' ? ((geo as { properties?: unknown }).properties ?? null) : null
		)?.hrSamples;
		if (prevHr?.length) {
			out = attachHrSeries(
				out,
				prevHr.map((s) => ({ t: s.t, hr: s.hr }))
			);
		}

		const analytics = computeRouteAnalytics(out, { avgHr: run.avg_hr, maxHr: run.max_hr });
		const id = routeId || crypto.randomUUID();
		const geojson = {
			type: 'Feature',
			properties: {
				date: run.date,
				sport: run.activity_type,
				distance_km: run.distance_km,
				point_count: out.length,
				added_gps: true,
				gps_source: source,
				track_km: Math.round((trackDistanceMeters(out) / 1000) * 100) / 100,
				...(analytics ? analyticsToProperties(analytics) : {}),
				times: out.map((p) => p.timeMs ?? null)
			},
			geometry: {
				type: 'LineString',
				coordinates: out.map((p) =>
					p.elev != null && Number.isFinite(p.elev) ? [p.lng, p.lat, p.elev] : [p.lng, p.lat]
				)
			}
		};
		await saveRouteGeoJson(id, geojson);
		if (!run.route) await setRunRoute(run.id, `/routes/${id}.json`);

		if (supportsBestEfforts(run.activity_type)) {
			const efforts = computeBestEffortsFromTrack(out);
			if (efforts.length) await setRunBestEfforts(run.id, efforts);
		}

		return {
			ok: true as const,
			points: out.length,
			source
		};
	});

export const previewGpsNetwork = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { waypoints: { lat: number; lng: number }[] }) => d)
	.handler(async ({ data }) => {
		const pins = normalizeWaypoints(data.waypoints);
		if (pins.length < 2) return { coords: [] as { lat: number; lng: number }[] };
		const routed = await brouterAlongPins(pins);
		return {
			coords: routed.map((p) =>
				p.elev != null && Number.isFinite(p.elev)
					? { lat: p.lat, lng: p.lng, elev: p.elev }
					: { lat: p.lat, lng: p.lng }
			)
		};
	});

export const updateRun = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: UpdateRunInput) => d)
	.handler(async ({ data }) => {
		const date = data.date.trim();
		const session = data.session.trim();
		if (!date || !session) throw new Error('Date and session are required.');
		const day = dayFromIsoDate(date);
		const { calendar } = await loadTrainingContext();
		const week = weekNumberForDate(date, calendar);
		const fields: UpdateRunFields = {
			date,
			week,
			day,
			activity_type: normalizeActivityType(data.activity_type),
			session,
			effort: data.effort,
			body_scores: validateBodyScores(data.body_scores),
			legs: data.legs,
			energy: data.energy,
			weather: data.weather.trim(),
			surface: data.surface.trim(),
			wanted_faster: data.wanted_faster,
			distance_km: data.distance_km,
			start_time: normalizeStartTime(data.start_time.trim()),
			time: data.time.trim(),
			avg_pace: data.avg_pace.trim(),
			avg_hr: data.avg_hr,
			max_hr: data.max_hr,
			elev_gain: data.elev_gain,
			cadence: data.cadence,
			gear: data.gear.trim(),
			notes: data.notes,
			before_notes: data.before_notes?.trim() ?? '',
			after_notes: data.after_notes?.trim() ?? ''
		};
		const run = await dbUpdateRun(data.id, fields);
		await rememberGearName(run.gear, run.activity_type);
		return { id: run.id, slug: run.slug };
	});

export const deleteRun = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((id: number) => id)
	.handler(async ({ data: id }) => {
		return dbDeleteRun(id);
	});

export const deleteRunsFn = createServerFn({ method: 'POST' })
	.middleware([requireAuth])
	.validator((d: { ids: number[] }) => d)
	.handler(async ({ data }) => {
		const unique = [...new Set(data.ids.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0))];
		if (!unique.length) throw new Error('Pick at least one activity to delete.');
		for (const id of unique) await dbDeleteRun(id);
		return { ok: true as const };
	});
