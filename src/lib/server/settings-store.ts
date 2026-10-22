import type { ActivityType } from '$lib/activity';
import {
	clonePattern,
	DEFAULT_WEEK_PATTERN,
	defaultPlannedSports,
	mixFromPattern,
	normalizeDayLimits,
	normalizePlannedSports,
	normalizeWeekMix,
	normalizeWeekPattern,
	patternFromMix,
	type DayLimit,
	type WeekMix,
	type WeekPattern,
	type WeekSetup
} from '$lib/week-mix';
import { readContextFile, writeContextFile } from './context-io';

export type AppSettings = {
	hrMax: number | null;
	weekPattern: WeekPattern;
	dayLimits: DayLimit[];
	plannedSports: ActivityType[];
	weekMix: WeekMix;
};

export function weekSetupFromSettings(s: AppSettings): WeekSetup {
	return { pattern: s.weekPattern, dayLimits: s.dayLimits, plannedSports: s.plannedSports };
}

function emptySettings(): AppSettings {
	const weekPattern = clonePattern(DEFAULT_WEEK_PATTERN);
	return {
		hrMax: null,
		weekPattern,
		dayLimits: [],
		plannedSports: defaultPlannedSports(weekPattern),
		weekMix: mixFromPattern(weekPattern)
	};
}

function patternFromSettingsBlob(o: { weekPattern?: unknown; weekMix?: unknown }): WeekPattern {
	if (o.weekPattern != null) return normalizeWeekPattern(o.weekPattern);
	if (o.weekMix != null) return patternFromMix(normalizeWeekMix(o.weekMix));
	return clonePattern(DEFAULT_WEEK_PATTERN);
}

export async function loadSettings(): Promise<AppSettings> {
	const raw = await readContextFile('settings.json');
	if (!raw) return emptySettings();
	try {
		const o = JSON.parse(raw) as {
			hrMax?: unknown;
			weekPattern?: unknown;
			weekMix?: unknown;
			dayLimits?: unknown;
			plannedSports?: unknown;
		};
		const n = Number(o.hrMax);
		const weekPattern = patternFromSettingsBlob(o);
		return {
			hrMax: Number.isFinite(n) && n > 0 ? Math.round(n) : null,
			weekPattern,
			dayLimits: normalizeDayLimits(o.dayLimits),
			plannedSports: normalizePlannedSports(o.plannedSports, defaultPlannedSports(weekPattern)),
			weekMix: mixFromPattern(weekPattern)
		};
	} catch {
		return emptySettings();
	}
}

async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
	const current = await loadSettings();
	const weekPattern =
		patch.weekPattern !== undefined ? normalizeWeekPattern(patch.weekPattern) : current.weekPattern;
	const next: AppSettings = {
		hrMax: patch.hrMax !== undefined ? patch.hrMax : current.hrMax,
		weekPattern,
		dayLimits:
			patch.dayLimits !== undefined ? normalizeDayLimits(patch.dayLimits) : current.dayLimits,
		plannedSports:
			patch.plannedSports !== undefined
				? normalizePlannedSports(patch.plannedSports, current.plannedSports)
				: current.plannedSports,
		weekMix: mixFromPattern(weekPattern)
	};
	await writeContextFile('settings.json', JSON.stringify(next));
	return next;
}

export async function saveHrMaxSetting(hrMax: number | null): Promise<void> {
	await saveSettings({ hrMax: hrMax != null && hrMax > 0 ? Math.round(hrMax) : null });
}

export async function saveWeekSetupSetting(setup: WeekSetup): Promise<WeekSetup> {
	const next = await saveSettings({
		weekPattern: setup.pattern,
		dayLimits: setup.dayLimits,
		plannedSports: setup.plannedSports
	});
	return weekSetupFromSettings(next);
}
