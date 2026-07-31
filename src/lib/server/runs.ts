import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import type { RunRecord } from '$lib/types';
import { ensureDataDirs, runsDir } from './paths';

function toBool(value: unknown): boolean | null {
	if (value === true || value === 'true' || value === 'Y' || value === 'y' || value === 'yes')
		return true;
	if (value === false || value === 'false' || value === 'N' || value === 'n' || value === 'no')
		return false;
	return null;
}

function toNum(value: unknown): number | null {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function toIsoDate(value: unknown): string {
	if (value instanceof Date && !Number.isNaN(value.getTime())) {
		const y = value.getUTCFullYear();
		const m = String(value.getUTCMonth() + 1).padStart(2, '0');
		const d = String(value.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	const raw = String(value ?? '').trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
	const parsed = new Date(raw);
	if (!Number.isNaN(parsed.getTime())) {
		const y = parsed.getUTCFullYear();
		const m = String(parsed.getUTCMonth() + 1).padStart(2, '0');
		const d = String(parsed.getUTCDate()).padStart(2, '0');
		return `${y}-${m}-${d}`;
	}
	return raw;
}

function parseRunFile(filepath: string, slug: string): RunRecord {
	const raw = readFileSync(filepath, 'utf8');
	const { data, content } = matter(raw);
	return {
		slug,
		date: toIsoDate(data.date),
		week: toNum(data.week),
		day: String(data.day ?? ''),
		session: String(data.session ?? 'other'),
		effort: toNum(data.effort),
		shins: toNum(data.shins),
		legs: toNum(data.legs),
		energy: toNum(data.energy),
		weather: String(data.weather ?? ''),
		surface: String(data.surface ?? ''),
		wanted_faster: toBool(data.wanted_faster),
		distance_km: toNum(data.distance_km),
		time: String(data.time ?? ''),
		avg_pace: String(data.avg_pace ?? ''),
		avg_hr: toNum(data.avg_hr),
		cadence: toNum(data.cadence),
		shoes: String(data.shoes ?? ''),
		summary_image: String(data.summary_image ?? ''),
		splits_image: String(data.splits_image ?? ''),
		strava_id: String(data.strava_id ?? ''),
		notes: content.trim(),
		filepath
	};
}

export function listRuns(): RunRecord[] {
	ensureDataDirs();
	if (!existsSync(runsDir)) return [];
	return readdirSync(runsDir)
		.filter((f) => f.endsWith('.md'))
		.map((f) => parseRunFile(path.join(runsDir, f), f.replace(/\.md$/, '')))
		.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getRun(slug: string): RunRecord | null {
	ensureDataDirs();
	const filepath = path.join(runsDir, `${slug}.md`);
	if (!existsSync(filepath)) return null;
	return parseRunFile(filepath, slug);
}

export function runSlug(date: string, day: string) {
	const d = day.toLowerCase().replace(/\s+/g, '-');
	return `${date}-${d}`;
}

export interface SaveRunInput {
	date: string;
	week: number | null;
	day: string;
	session: string;
	effort: number | null;
	shins: number | null;
	legs: number | null;
	energy: number | null;
	weather: string;
	surface: string;
	wanted_faster: boolean | null;
	distance_km: number | null;
	time: string;
	avg_pace: string;
	avg_hr: number | null;
	cadence: number | null;
	shoes: string;
	summary_image: string;
	splits_image: string;
	strava_id?: string;
	notes: string;
}

export function saveRun(input: SaveRunInput): RunRecord {
	ensureDataDirs();
	const slug = runSlug(input.date, input.day);
	const filepath = path.join(runsDir, `${slug}.md`);
	const front = {
		date: input.date,
		week: input.week,
		day: input.day,
		session: input.session,
		effort: input.effort,
		shins: input.shins,
		legs: input.legs,
		energy: input.energy,
		weather: input.weather,
		surface: input.surface,
		wanted_faster: input.wanted_faster,
		distance_km: input.distance_km,
		time: input.time,
		avg_pace: input.avg_pace,
		avg_hr: input.avg_hr,
		cadence: input.cadence,
		shoes: input.shoes,
		summary_image: input.summary_image,
		splits_image: input.splits_image,
		strava_id: input.strava_id || ''
	};
	const body = `${matter.stringify(input.notes?.trim() ? `${input.notes.trim()}\n` : '', front)}`;
	writeFileSync(filepath, body, 'utf8');
	return parseRunFile(filepath, slug);
}
