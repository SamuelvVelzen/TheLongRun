import { z } from 'zod';
import { GEAR_KINDS, gearKey, gearMeta, type GearContext, type GearKind } from '$lib/gear';

const KIND_ALIASES: Record<string, GearKind> = {
	shoes: 'shoes',
	shoe: 'shoes',
	run: 'shoes',
	running: 'shoes',
	walk_shoes: 'walk_shoes',
	walk: 'walk_shoes',
	walking: 'walk_shoes',
	bike: 'bike',
	bicycle: 'bike',
	cycling: 'bike'
};

const ROLES = ['active', 'rotation', 'retired'] as const;
type GearRole = (typeof ROLES)[number];

const ROLE_ALIASES: Record<string, GearRole> = {
	active: 'active',
	daily: 'active',
	primary: 'active',
	rotation: 'rotation',
	rotate: 'rotation',
	backup: 'rotation',
	retired: 'retired',
	retire: 'retired'
};

function aliasKey(v: unknown): string {
	return String(v ?? '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '_');
}

const nameField = z
	.string()
	.min(1, 'name is required')
	.max(120, 'name is too long')
	.transform((s) => s.trim().replace(/\s+/g, ' '));

const itemSchema = z.object({
	kind: z.preprocess((v) => KIND_ALIASES[aliasKey(v)] ?? v, z.enum(GEAR_KINDS)),
	name: nameField,
	role: z
		.preprocess((v) => ROLE_ALIASES[aliasKey(v)] ?? v, z.enum(ROLES))
		.optional()
		.default('rotation')
});

export type GearImportItem = z.infer<typeof itemSchema>;

function itemList(input: unknown): unknown[] | null {
	if (Array.isArray(input)) return input;
	if (!input || typeof input !== 'object') return null;
	const o = input as Record<string, unknown>;
	if (Array.isArray(o.items)) return o.items;
	if (Array.isArray(o.pairs)) return o.pairs;
	if (Array.isArray(o.gear)) return o.gear;
	if ('name' in o && 'kind' in o) return [o];
	return null;
}

function formatIssues(error: z.ZodError, list: unknown[], max = 8): string {
	const lines = error.issues.slice(0, max).map((issue) => {
		const path = [...issue.path];
		const idx = path[0];
		const where = typeof idx === 'number' ? `Item ${idx + 1}` : 'Gear';
		if (typeof idx === 'number') path.shift();
		const field = path.map(String).join('.');
		return `- ${[where, field].filter(Boolean).join(' · ')}: ${issue.message}`;
	});
	const more = error.issues.length > max ? `\n- …and ${error.issues.length - max} more` : '';
	return `That gear JSON has problems:\n${lines.join('\n')}${more}`;
}

export function parseGearReply(input: unknown): GearImportItem[] {
	const list = itemList(input);
	if (!list || !list.length) throw new Error('No "items" found in that JSON.');
	const parsed = z.array(itemSchema).safeParse(list);
	if (!parsed.success) throw new Error(formatIssues(parsed.error, list));
	return parsed.data;
}

export function parseGearReplyText(text: string): GearImportItem[] {
	const t = text.trim();
	const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const body = fenced ?? t.slice(Math.max(0, t.search(/[[{]/)));
	let json: unknown;
	try {
		json = JSON.parse(body.trim());
	} catch {
		throw new Error('That is not valid JSON — paste the JSON block from the reply.');
	}
	return parseGearReply(json);
}

export type GearImportChange = {
	key: string;
	kind: GearKind;
	name: string;
	role: GearRole;
	existing: boolean;
};

function catalogHasName(ctx: GearContext, kind: GearKind, name: string): boolean {
	const k = gearKey(name);
	const c = ctx[kind];
	return [c.active, ...c.rotation, ...c.retired].some((n) => gearKey(n) === k);
}

/** Deduplicate by kind+name; last role wins. */
export function planGearImport(ctx: GearContext, items: GearImportItem[]): GearImportChange[] {
	const byKey = new Map<string, GearImportChange>();
	for (const item of items) {
		const key = `${item.kind}:${gearKey(item.name)}`;
		byKey.set(key, {
			key,
			kind: item.kind,
			name: item.name,
			role: item.role,
			existing: catalogHasName(ctx, item.kind, item.name)
		});
	}
	return [...byKey.values()];
}

export function gearImportSummary(c: GearImportChange): string {
	const meta = gearMeta(c.kind);
	const roleLabel =
		c.role === 'active'
			? meta.activeLabel.toLowerCase()
			: c.role === 'retired'
				? 'retired'
				: 'rotation';
	return `${meta.section} · ${c.name} (${roleLabel})`;
}
