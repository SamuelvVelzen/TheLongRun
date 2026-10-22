import {
	emptyActivityHabits,
	normalizeActivityHabits,
	type ActivityHabits
} from '$lib/activity-habits';
import {
	asGearNameList,
	emptyGear,
	gearKey,
	gearKindForActivity,
	normalizeGearCatalog,
	normalizeGearContext,
	type GearCatalog,
	type GearContext
} from '$lib/gear';
import { emptyWardrobe, normalizeWardrobe, type Wardrobe } from '$lib/wardrobe';
import { splitFrontmatter } from './frontmatter';
import { readContextFile, writeContextFile } from './context-io';

const HABITS_FILE = 'activity-habits.json';
const GEAR_FILE = 'gear-inventory.json';
const WARDROBE_FILE = 'wardrobe.json';

export async function loadActivityHabits(): Promise<ActivityHabits> {
	const raw = await readContextFile(HABITS_FILE);
	if (!raw.trim()) return emptyActivityHabits();
	try {
		return normalizeActivityHabits(JSON.parse(raw));
	} catch {
		return emptyActivityHabits();
	}
}

export async function persistActivityHabits(habits: ActivityHabits): Promise<ActivityHabits> {
	const next = normalizeActivityHabits(habits);
	await writeContextFile(HABITS_FILE, `${JSON.stringify(next, null, 2)}\n`);
	return next;
}

function catalogFromShoesMarkdown(raw: string): GearCatalog {
	if (!raw.trim()) return normalizeGearCatalog({});
	const { data, content } = splitFrontmatter(raw);
	return normalizeGearCatalog({
		active: String(data.active ?? ''),
		rotation: asGearNameList(data.rotation),
		retired: asGearNameList(data.retired),
		notes: content.trim()
	});
}

export async function loadGear(): Promise<GearContext> {
	const raw = await readContextFile(GEAR_FILE);
	if (raw.trim()) {
		try {
			return normalizeGearContext(JSON.parse(raw));
		} catch {
			return normalizeGearContext(null);
		}
	}
	const legacy = await readContextFile('shoes.md');
	if (!legacy.trim()) return emptyGear();
	const next = { ...emptyGear(), shoes: catalogFromShoesMarkdown(legacy) };
	await persistGear(next);
	return next;
}

export async function persistGear(gear: GearContext): Promise<GearContext> {
	const next = normalizeGearContext(gear);
	await writeContextFile(GEAR_FILE, `${JSON.stringify(next, null, 2)}\n`);
	return next;
}

export async function loadWardrobe(): Promise<Wardrobe> {
	const raw = await readContextFile(WARDROBE_FILE);
	if (!raw.trim()) return emptyWardrobe();
	try {
		return normalizeWardrobe(JSON.parse(raw));
	} catch {
		return emptyWardrobe();
	}
}

export async function persistWardrobe(wardrobe: Wardrobe): Promise<Wardrobe> {
	const next = normalizeWardrobe(wardrobe);
	await writeContextFile(WARDROBE_FILE, `${JSON.stringify(next, null, 2)}\n`);
	return next;
}

export async function rememberGearName(
	name: string,
	activityType: string | null | undefined
): Promise<void> {
	const kind = gearKindForActivity(activityType);
	if (!kind) return;
	const n = String(name ?? '')
		.trim()
		.replace(/\s+/g, ' ');
	const k = gearKey(n);
	if (!k) return;
	const gear = await loadGear();
	const catalog = gear[kind];
	if (gearKey(catalog.active) === k) return;
	if (catalog.rotation.some((s) => gearKey(s) === k)) return;
	await persistGear({
		...gear,
		[kind]: {
			...catalog,
			rotation: [...catalog.rotation, n],
			retired: catalog.retired.filter((s) => gearKey(s) !== k)
		}
	});
}
