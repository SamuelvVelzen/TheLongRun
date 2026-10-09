export const CLOTHING_CATEGORIES = ['top', 'bottom', 'layer', 'accessory'] as const;
export type ClothingCategory = (typeof CLOTHING_CATEGORIES)[number];

export const CLOTHING_FLAGS = ['long_run', 'rain', 'reflective'] as const;
export type ClothingFlag = (typeof CLOTHING_FLAGS)[number];

export type ClothingItem = {
	id: string;
	category: ClothingCategory;
	name: string;
	count: number;
	/** Comfortable from this temperature (°C); null = no lower bound noted. */
	min_c: number | null;
	/** Comfortable up to this temperature (°C); null = no upper bound noted. */
	max_c: number | null;
	flags: ClothingFlag[];
	notes: string;
};

export type Wardrobe = { items: ClothingItem[]; notes: string };

export const MAX_CLOTHING_NAME = 80;
export const MAX_CLOTHING_NOTES = 200;
export const MAX_WARDROBE_NOTES = 1000;
export const MAX_CLOTHING_COUNT = 20;

export const CLOTHING_CATEGORY_META: Record<
	ClothingCategory,
	{ label: string; title: string; placeholder: string }
> = {
	top: { label: 'Top', title: 'Tops', placeholder: 'e.g. Technical tee' },
	bottom: { label: 'Bottom', title: 'Bottoms', placeholder: 'e.g. Shorts + long liner' },
	layer: { label: 'Layer', title: 'Layers', placeholder: 'e.g. Thin long sleeve' },
	accessory: { label: 'Accessory', title: 'Accessories', placeholder: 'e.g. Cap, gloves, buff' }
};

export const CLOTHING_FLAG_META: Record<ClothingFlag, { label: string }> = {
	long_run: { label: 'Long-run safe' },
	rain: { label: 'Rain' },
	reflective: { label: 'Reflective' }
};

export const CLOTHING_CATEGORY_OPTIONS = CLOTHING_CATEGORIES.map((value) => ({
	value,
	label: CLOTHING_CATEGORY_META[value].label
}));

export function emptyWardrobe(): Wardrobe {
	return { items: [], notes: '' };
}

export function newClothingId(): string {
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function compactText(value: unknown, max: number): string {
	return String(value ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);
}

function isCategory(v: unknown): v is ClothingCategory {
	return typeof v === 'string' && (CLOTHING_CATEGORIES as readonly string[]).includes(v);
}

function isFlag(v: unknown): v is ClothingFlag {
	return typeof v === 'string' && (CLOTHING_FLAGS as readonly string[]).includes(v);
}

export function parseTempC(v: unknown): number | null {
	if (v == null || v === '') return null;
	const n = Number(String(v).replace(',', '.'));
	if (!Number.isFinite(n) || n < -40 || n > 50) return null;
	return Math.round(n);
}

export function clampClothingCount(v: unknown): number {
	const n = Math.round(Number(v));
	if (!Number.isFinite(n) || n < 1) return 1;
	return Math.min(n, MAX_CLOTHING_COUNT);
}

/** Stored-data normalizer — lenient, never throws. */
export function normalizeClothingItem(raw: unknown): ClothingItem | null {
	if (!raw || typeof raw !== 'object') return null;
	const o = raw as Record<string, unknown>;
	const name = compactText(o.name, MAX_CLOTHING_NAME);
	if (!name) return null;
	let min_c = parseTempC(o.min_c);
	let max_c = parseTempC(o.max_c);
	if (min_c != null && max_c != null && min_c > max_c) [min_c, max_c] = [max_c, min_c];
	const flags = Array.isArray(o.flags) ? [...new Set(o.flags.filter(isFlag))] : [];
	return {
		id: String(o.id ?? '').trim() || newClothingId(),
		category: isCategory(o.category) ? o.category : 'top',
		name,
		count: clampClothingCount(o.count ?? 1),
		min_c,
		max_c,
		flags: CLOTHING_FLAGS.filter((f) => flags.includes(f)),
		notes: compactText(o.notes, MAX_CLOTHING_NOTES)
	};
}

export function normalizeWardrobe(raw: unknown): Wardrobe {
	const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
	const items = Array.isArray(o.items)
		? o.items.map(normalizeClothingItem).filter((e): e is ClothingItem => e != null)
		: [];
	const notes = String(o.notes ?? '')
		.trim()
		.slice(0, MAX_WARDROBE_NOTES);
	return { items, notes };
}

export function wardrobeHasItems(w: Wardrobe): boolean {
	return w.items.length > 0;
}

export function itemsByCategory(w: Wardrobe): Record<ClothingCategory, ClothingItem[]> {
	const out = { top: [], bottom: [], layer: [], accessory: [] } as Record<ClothingCategory, ClothingItem[]>;
	for (const item of w.items) out[item.category].push(item);
	return out;
}

/** "8–18°C", "from 12°C", "up to 10°C", or "". */
export function tempRangeLabel(item: Pick<ClothingItem, 'min_c' | 'max_c'>): string {
	const { min_c, max_c } = item;
	if (min_c != null && max_c != null) return `${min_c}–${max_c}°C`;
	if (min_c != null) return `from ${min_c}°C`;
	if (max_c != null) return `up to ${max_c}°C`;
	return '';
}

export function clothingDetailLabel(item: ClothingItem): string {
	return [tempRangeLabel(item), ...item.flags.map((f) => CLOTHING_FLAG_META[f].label), item.notes]
		.filter(Boolean)
		.join(' · ');
}

export function upsertClothing(w: Wardrobe, item: ClothingItem): Wardrobe {
	const exists = w.items.some((i) => i.id === item.id);
	return normalizeWardrobe({
		...w,
		items: exists ? w.items.map((i) => (i.id === item.id ? item : i)) : [...w.items, item]
	});
}

export function removeClothing(w: Wardrobe, id: string): Wardrobe {
	return { ...w, items: w.items.filter((i) => i.id !== id) };
}

/** "Shorts + Long liner " and "shorts + long liner" are the same item. */
export function clothingKey(name: string): string {
	return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

export type ClothingChange = { item: ClothingItem; existing: ClothingItem | null };

/** Pair each incoming item with the owned item of the same name (if any). */
export function planClothingChanges(w: Wardrobe, incoming: ClothingItem[]): ClothingChange[] {
	const byKey = new Map(w.items.map((i) => [clothingKey(i.name), i]));
	return incoming.map((item) => {
		const existing = byKey.get(clothingKey(item.name)) ?? null;
		return { item: existing ? { ...item, id: existing.id } : item, existing };
	});
}

export function applyClothingChanges(w: Wardrobe, changes: ClothingChange[]): Wardrobe {
	return changes.reduce((acc, c) => upsertClothing(acc, c.item), w);
}

/** Marker in the wardrobe prompt; the dialog fills this as you type. */
export const WARDROBE_EXTRA_TOKEN = '<<<WARDROBE_EXTRA>>>';

export function injectWardrobeExtra(template: string, extra: string): string {
	return template.split(WARDROBE_EXTRA_TOKEN).join(extra.trim() || '(nothing extra.)');
}

export function buildWardrobePrompt(w: Wardrobe, todayIso: string): string {
	const owned = wardrobeHasItems(w)
		? w.items
				.map((i) => {
					const detail = clothingDetailLabel(i);
					return `- [${i.category}] ${i.name} ×${i.count}${detail ? ` — ${detail}` : ''}`;
				})
				.join('\n')
		: '- (nothing yet)';
	return `# The Long Run — my running clothes

Help me keep a list of the running clothes I own. Today is ${todayIso}.

## What I own now
${owned}
${w.notes.trim() ? `\nHow I dress: ${w.notes.trim()}\n` : ''}
## What I wrote
If this lists clothes I own, turn them into items. If it asks for advice (what I'm missing for the season, a race, rain, dark mornings), suggest items to buy and say so in a short note.

${WARDROBE_EXTRA_TOKEN}

## Reply
A few sentences of advice are fine, then ONE JSON block in exactly this shape:

\`\`\`json
{
  "items": [
    {
      "category": "bottom",
      "name": "Shorts + long liner",
      "count": 2,
      "min_c": 10,
      "max_c": null,
      "flags": ["long_run"],
      "notes": ""
    }
  ]
}
\`\`\`

Rules:
- \`category\`: \`top\`, \`bottom\`, \`layer\` (long sleeve, jacket, vest) or \`accessory\` (cap, gloves, buff, socks).
- \`name\`: short and specific (\`Shorts + short liner\`, not \`Shorts\`) — the liner length matters for chafing. To change an item I already own, reuse its exact name; the app updates it instead of adding a duplicate.
- \`count\`: how many I own (1–${MAX_CLOTHING_COUNT}). For a suggestion I don't own yet, use 1 and start \`notes\` with "Suggested:".
- \`min_c\` / \`max_c\`: whole °C I'd be comfortable running in, or \`null\` if unknown. Don't guess precise ranges for things I listed without comment — a rough range is fine, \`null\` is better than made up.
- \`flags\`: any of \`long_run\` (does not chafe on long or wet runs), \`rain\`, \`reflective\`. Empty array if none.
- Only include items that are new or changed. Never repeat my whole list unchanged.
`;
}

export const WARDROBE_PROMPT_RULE =
	'Pick only from items I own. Temperature ranges are my own comfort notes, not rules. Bottoms marked long-run safe are the ones that do not chafe on long or wet runs — use them for those. Count tells you how many I have (mind laundry on back-to-back days).';

export function formatWardrobeSection(w: Wardrobe): string {
	if (!wardrobeHasItems(w) && !w.notes.trim()) return '';
	const grouped = itemsByCategory(w);
	const blocks = CLOTHING_CATEGORIES.filter((c) => grouped[c].length).map((c) => {
		const lines = grouped[c].map((item) => {
			const detail = clothingDetailLabel(item);
			return `- ${item.name} ×${item.count}${detail ? ` — ${detail}` : ''}`;
		});
		return `### ${CLOTHING_CATEGORY_META[c].title}\n${lines.join('\n')}`;
	});
	const notes = w.notes.trim();
	return `## My clothing
${WARDROBE_PROMPT_RULE}

${blocks.join('\n\n')}${notes ? `\n\n${notes}` : ''}`;
}
