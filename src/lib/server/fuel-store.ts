import { emptyFuelLog, normalizeFuelLog, type FuelLog } from '$lib/fuel';
import { readContextFile, writeContextFile } from './context-io';

const FUEL_FILE = 'fuel-log.json';
const FUEL_SECTION_RE = /^##\s+Fuel\b[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im;

/** Pull the `## Fuel & hydration` section out of the checklist markdown. */
export function splitFuelSection(markdown: string): { guidance: string; rest: string } | null {
	const m = markdown.match(FUEL_SECTION_RE);
	if (!m) return null;
	const guidance = m[1]!.trim();
	const rest = markdown
		.replace(m[0], '')
		.replace(/\n{3,}/g, '\n\n')
		.trimEnd();
	return { guidance, rest: rest ? `${rest}\n` : '' };
}

async function migrateFuelFromChecklist(): Promise<FuelLog | null> {
	const checklist = await readContextFile('gear.md');
	const split = splitFuelSection(checklist);
	if (!split) return null;
	const log = await persistFuelLog({ ...emptyFuelLog(), guidance: split.guidance });
	await writeContextFile('gear.md', split.rest);
	return log;
}

export async function loadFuelLog(): Promise<FuelLog> {
	const raw = await readContextFile(FUEL_FILE);
	if (!raw.trim()) return (await migrateFuelFromChecklist()) ?? emptyFuelLog();
	try {
		return normalizeFuelLog(JSON.parse(raw));
	} catch {
		return emptyFuelLog();
	}
}

export async function persistFuelLog(log: FuelLog): Promise<FuelLog> {
	const next = normalizeFuelLog(log);
	await writeContextFile(FUEL_FILE, `${JSON.stringify(next, null, 2)}\n`);
	return next;
}
