/**
 * zod schemas for clothing — the AI "describe / suggest" reply and the manual form.
 * AI wording is normalized leniently (category/flag aliases, "3x" counts, "8°C" temps) then checked strictly.
 */
import { z } from 'zod';
import {
	CLOTHING_CATEGORIES,
	CLOTHING_FLAGS,
	MAX_CLOTHING_COUNT,
	MAX_CLOTHING_NAME,
	MAX_CLOTHING_NOTES,
	newClothingId,
	type ClothingCategory,
	type ClothingFlag,
	type ClothingItem
} from '$lib/wardrobe';

const CATEGORY_ALIASES: Record<string, ClothingCategory> = {
	top: 'top',
	tops: 'top',
	shirt: 'top',
	tshirt: 'top',
	tee: 'top',
	singlet: 'top',
	tank: 'top',
	bottom: 'bottom',
	bottoms: 'bottom',
	shorts: 'bottom',
	short: 'bottom',
	tights: 'bottom',
	leggings: 'bottom',
	pants: 'bottom',
	layer: 'layer',
	layers: 'layer',
	jacket: 'layer',
	vest: 'layer',
	gilet: 'layer',
	longsleeve: 'layer',
	midlayer: 'layer',
	accessory: 'accessory',
	accessories: 'accessory',
	cap: 'accessory',
	hat: 'accessory',
	gloves: 'accessory',
	socks: 'accessory',
	buff: 'accessory'
};

const FLAG_ALIASES: Record<string, ClothingFlag> = {
	longrun: 'long_run',
	longrunsafe: 'long_run',
	antichafe: 'long_run',
	nochafe: 'long_run',
	rain: 'rain',
	waterproof: 'rain',
	waterresistant: 'rain',
	wet: 'rain',
	reflective: 'reflective',
	hiviz: 'reflective',
	visibility: 'reflective',
	dark: 'reflective'
};

function aliasKey(v: unknown): string {
	return typeof v === 'string' ? v.toLowerCase().replace(/[^a-z]/g, '') : '';
}

function compact(v: unknown, max: number): string {
	return String(v ?? '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);
}

/** "3", 3, "3x", "×3" → 3; missing → 1. */
function toCount(v: unknown): unknown {
	if (v == null || v === '') return 1;
	if (typeof v === 'number') return v;
	const m = String(v).match(/\d+/);
	return m ? Number(m[0]) : v;
}

/** 8, "8", "8°C", "-2 C" → number; blank/null → null. */
function toTemp(v: unknown): unknown {
	if (v == null || (typeof v === 'string' && !v.trim())) return null;
	if (typeof v === 'number') return Math.round(v);
	const m = String(v).replace(',', '.').match(/-?\d+(\.\d+)?/);
	return m ? Math.round(Number(m[0])) : v;
}

function toFlags(v: unknown): unknown {
	const list = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(/[,;]/) : [];
	return [...new Set(list.map((f) => FLAG_ALIASES[aliasKey(f)] ?? f))];
}

const nameField = z.string().trim().min(1, 'Name it').max(MAX_CLOTHING_NAME);
const countField = z
	.number({ message: 'How many?' })
	.int('Whole number')
	.min(1, 'At least 1')
	.max(MAX_CLOTHING_COUNT, `At most ${MAX_CLOTHING_COUNT}`);
const tempField = z
	.number({ message: 'Use a number' })
	.int('Whole degrees')
	.min(-40, 'Too cold')
	.max(50, 'Too hot')
	.nullable();

function rangeOrdered(v: { min_c: number | null; max_c: number | null }) {
	return v.min_c == null || v.max_c == null || v.min_c <= v.max_c;
}

/** Manual add/edit form — same field rules as AI input. */
export const clothingFormSchema = z
	.object({
		category: z.enum(CLOTHING_CATEGORIES),
		name: nameField,
		count: countField.nullable().refine((v) => v != null, 'How many?'),
		min_c: tempField,
		max_c: tempField,
		flags: z.array(z.enum(CLOTHING_FLAGS)),
		notes: z.string().max(MAX_CLOTHING_NOTES)
	})
	.refine(rangeOrdered, { message: 'Lower than “Up to”', path: ['min_c'] });

export type ClothingFormValues = z.input<typeof clothingFormSchema>;

export const clothingReplySchema = z
	.object({
		category: z.preprocess(
			(v) => CATEGORY_ALIASES[aliasKey(v)] ?? v,
			z.enum(CLOTHING_CATEGORIES, { message: 'use top, bottom, layer or accessory' })
		),
		name: z.preprocess((v) => compact(v, MAX_CLOTHING_NAME), nameField),
		count: z.preprocess(toCount, countField),
		min_c: z.preprocess(toTemp, tempField).optional().default(null),
		max_c: z.preprocess(toTemp, tempField).optional().default(null),
		flags: z
			.preprocess(toFlags, z.array(z.enum(CLOTHING_FLAGS, { message: 'use long_run, rain or reflective' })))
			.optional()
			.default([]),
		notes: z.preprocess((v) => compact(v, MAX_CLOTHING_NOTES), z.string()).optional().default('')
	})
	.refine(rangeOrdered, { message: 'min_c is above max_c', path: ['min_c'] });

/** `{ items: [...] }`, `{ clothing: [...] }`, a bare array, or one item object. */
function itemList(input: unknown): unknown[] | null {
	if (Array.isArray(input)) return input;
	if (!input || typeof input !== 'object') return null;
	const o = input as Record<string, unknown>;
	if (Array.isArray(o.items)) return o.items;
	if (Array.isArray(o.clothing)) return o.clothing;
	if ('name' in o) return [o];
	return null;
}

function describeItem(raw: unknown, index: number): string {
	const name =
		raw && typeof raw === 'object' && typeof (raw as { name?: unknown }).name === 'string'
			? (raw as { name: string }).name.trim()
			: '';
	return name ? `Item ${index + 1} (${name})` : `Item ${index + 1}`;
}

function formatIssues(error: z.ZodError, list: unknown[], max = 8): string {
	const lines = error.issues.slice(0, max).map((issue) => {
		const path = [...issue.path];
		const idx = path[0];
		const where = typeof idx === 'number' ? describeItem(list[idx], idx) : 'Clothing';
		if (typeof idx === 'number') path.shift();
		const field = path.map(String).join('.');
		return `- ${[where, field].filter(Boolean).join(' · ')}: ${issue.message}`;
	});
	const more = error.issues.length > max ? `\n- …and ${error.issues.length - max} more` : '';
	return `That clothing JSON has problems:\n${lines.join('\n')}${more}`;
}

/** Strict: throws an Error listing every problem with its item. */
export function parseClothingReply(input: unknown): ClothingItem[] {
	const list = itemList(input);
	if (!list || !list.length) throw new Error('No "items" found in that JSON.');
	const parsed = z.array(clothingReplySchema).safeParse(list);
	if (!parsed.success) throw new Error(formatIssues(parsed.error, list));
	return parsed.data.map((p) => ({ id: newClothingId(), ...p }));
}

/** Accepts the raw reply text: a ```json fence, or the first `{…}` / `[…]` in it. */
export function parseClothingReplyText(text: string): ClothingItem[] {
	const t = text.trim();
	const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const body = fenced ?? t.slice(Math.max(0, t.search(/[[{]/)));
	let json: unknown;
	try {
		json = JSON.parse(body.trim());
	} catch {
		throw new Error('That is not valid JSON — paste the JSON block from the reply.');
	}
	return parseClothingReply(json);
}
