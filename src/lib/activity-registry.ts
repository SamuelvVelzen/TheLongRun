import { z } from 'zod';

export type ActivityField =
	| 'distance'
	| 'pace'
	| 'hr'
	| 'elevation'
	| 'cadence'
	| 'gear'
	| 'surface'
	| 'weather';

export type FeelField = 'effort' | 'body' | 'legs' | 'energy' | 'wanted_faster';

export type ActivityFieldFlags = Record<ActivityField, boolean>;
export type ActivityFeelFlags = Record<FeelField, boolean>;

export type HeadlineMode = 'pace' | 'kmh' | 'strength';

export type ActivityDef = {
	label: string;
	/** Plural noun for lists, e.g. "runs". */
	plural: string;
	/** Singular count phrase when n === 1, e.g. "1 run". */
	countOne: string;
	mapColor: string;
	/** Thicker, more opaque track on overlay maps (run only today). */
	mapLineEmphasis: boolean;
	headlineMode: HeadlineMode;
	fields: ActivityFieldFlags;
	feel: ActivityFeelFlags;
	/** Lowercase tokens (no spaces) matched after the same normalization as imports. */
	importAliases: readonly string[];
	gpxType: string;
	tcxSport: string;
	habitPlaceholder: { before: string; after: string };
};

export const ACTIVITY_DEFS = {
	run: {
		label: 'Run',
		plural: 'runs',
		countOne: '1 run',
		mapColor: '#c8f25a',
		mapLineEmphasis: true,
		headlineMode: 'pace',
		fields: {
			distance: true,
			pace: true,
			hr: true,
			elevation: true,
			cadence: true,
			gear: true,
			surface: true,
			weather: true
		},
		feel: {
			effort: true,
			body: true,
			legs: true,
			energy: true,
			wanted_faster: true
		},
		importAliases: ['run', 'running', 'jog', 'jogging', 'trailrun', 'trailrunning'],
		gpxType: 'running',
		tcxSport: 'Running',
		habitPlaceholder: {
			before: 'Warmup stretches, walk 1000 m',
			after: 'Cooldown stretches'
		}
	},
	walk: {
		label: 'Walk',
		plural: 'walks',
		countOne: '1 walk',
		mapColor: '#6ec8ff',
		mapLineEmphasis: false,
		headlineMode: 'pace',
		fields: {
			distance: true,
			pace: true,
			hr: true,
			elevation: true,
			cadence: false,
			gear: true,
			surface: true,
			weather: true
		},
		feel: {
			effort: true,
			body: true,
			legs: true,
			energy: true,
			wanted_faster: false
		},
		importAliases: ['walk', 'walking', 'hike', 'hiking'],
		gpxType: 'walking',
		tcxSport: 'Walking',
		habitPlaceholder: {
			before: 'Warmup stretches',
			after: 'Cooldown stretches'
		}
	},
	bike: {
		label: 'Bike',
		plural: 'bikes',
		countOne: '1 bike',
		mapColor: '#ffb36b',
		mapLineEmphasis: false,
		headlineMode: 'kmh',
		fields: {
			distance: true,
			pace: false,
			hr: true,
			elevation: true,
			cadence: false,
			gear: true,
			surface: false,
			weather: true
		},
		feel: {
			effort: true,
			body: false,
			legs: true,
			energy: true,
			wanted_faster: false
		},
		importAliases: [
			'bike',
			'biking',
			'cycling',
			'bicycle',
			'cycle',
			'ebikeride',
			'riding',
			'ride'
		],
		gpxType: 'cycling',
		tcxSport: 'Biking',
		habitPlaceholder: {
			before: 'Warmup spin / mobility',
			after: 'Cooldown spin / stretch'
		}
	},
	strength: {
		label: 'Strength',
		plural: 'strength sessions',
		countOne: '1 strength session',
		mapColor: '#d4a5ff',
		mapLineEmphasis: false,
		headlineMode: 'strength',
		fields: {
			distance: false,
			pace: false,
			hr: false,
			elevation: false,
			cadence: false,
			gear: false,
			surface: false,
			weather: false
		},
		feel: {
			effort: true,
			body: false,
			legs: true,
			energy: true,
			wanted_faster: false
		},
		importAliases: [
			'strength',
			'strengthtraining',
			'weighttraining',
			'weights',
			'weightlifting',
			'gym',
			'workout',
			'crossfit'
		],
		gpxType: 'workout',
		tcxSport: 'Other',
		habitPlaceholder: {
			before: 'Warmup sets / mobility',
			after: 'Cooldown stretch'
		}
	}
} as const satisfies Record<string, ActivityDef>;

export type ActivityType = keyof typeof ACTIVITY_DEFS;

/** Canonical display order for chips, filters, and week-mix. */
export const ACTIVITY_TYPES = Object.keys(ACTIVITY_DEFS) as ActivityType[];

export const activityTypeSchema = z.enum(
	ACTIVITY_TYPES as [ActivityType, ...ActivityType[]]
);

const IMPORT_ALIAS_TO_TYPE = new Map<string, ActivityType>();
for (const type of ACTIVITY_TYPES) {
	for (const alias of ACTIVITY_DEFS[type].importAliases) {
		IMPORT_ALIAS_TO_TYPE.set(alias, type);
	}
}

export function normalizeImportToken(v: string | null | undefined): string {
	return String(v ?? '')
		.trim()
		.toLowerCase()
		.replace(/[\s_-]/g, '');
}

/** Coerce any stored/imported value to a supported activity type (unknown → run). */
export function coerceActivityType(v: string | null | undefined): ActivityType {
	const t = normalizeImportToken(v);
	if (!t) return 'run';
	return IMPORT_ALIAS_TO_TYPE.get(t) ?? 'run';
}

export function activityDef(type: string | null | undefined): ActivityDef {
	return ACTIVITY_DEFS[coerceActivityType(type)];
}

export function recordForActivities<T>(factory: (type: ActivityType) => T): Record<ActivityType, T> {
	const out = {} as Record<ActivityType, T>;
	for (const type of ACTIVITY_TYPES) out[type] = factory(type);
	return out;
}

/** GPS track colours keyed by activity type. */
export const ACTIVITY_MAP_COLORS: Record<ActivityType, string> = recordForActivities(
	(type) => ACTIVITY_DEFS[type].mapColor
);
