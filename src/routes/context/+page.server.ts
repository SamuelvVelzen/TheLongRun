import { readContextFile, loadShoes, writeContextFile } from '$lib/server/context';
import { renderJsonPretty, renderMarkdown } from '$lib/markdown';
import { fail } from '@sveltejs/kit';
import matter from 'gray-matter';
import type { Actions, PageServerLoad } from './$types';

const EDITABLE = new Set([
	'profile.md',
	'goals.md',
	'shoes.md',
	'injury.md',
	'gear.md',
	'training-plan.md',
	'plan.json',
	'race-strategy.md'
]);

function shoesAsMarkdown(shoes: { active: string; rotation: string[]; notes: string }) {
	return matter.stringify(shoes.notes ? `${shoes.notes}\n` : '', {
		active: shoes.active,
		rotation: shoes.rotation
	});
}

function fileEntry(name: string, title: string, body: string) {
	const isJson = name.endsWith('.json');
	return {
		name,
		title,
		body,
		html: isJson ? renderJsonPretty(body) : renderMarkdown(body)
	};
}

export const load: PageServerLoad = async () => {
	const shoes = loadShoes();
	const files = [
		fileEntry('profile.md', 'Runner profile', readContextFile('profile.md')),
		fileEntry('goals.md', 'Goals', readContextFile('goals.md')),
		fileEntry('shoes.md', 'Shoes', shoesAsMarkdown(shoes)),
		fileEntry('injury.md', 'Injury rules', readContextFile('injury.md')),
		fileEntry('gear.md', 'Gear & fueling', readContextFile('gear.md')),
		fileEntry('training-plan.md', 'Training plan notes', readContextFile('training-plan.md')),
		fileEntry('plan.json', 'Plan sessions (JSON)', readContextFile('plan.json')),
		fileEntry('race-strategy.md', 'Race strategy', readContextFile('race-strategy.md'))
	];

	const allContext = files
		.map((f) => `# ===== ${f.name} =====\n\n${f.body.trim()}`)
		.join('\n\n');

	return { shoes, files, allContext };
};

export const actions: Actions = {
	shoes: async ({ request }) => {
		const fd = await request.formData();
		const active = String(fd.get('active') ?? '').trim();
		const rotation = String(fd.get('rotation') ?? '')
			.split('\n')
			.map((s) => s.trim())
			.filter(Boolean);
		const notes = String(fd.get('notes') ?? '');
		if (!active) return fail(400, { message: 'Active shoes required' });
		writeContextFile(
			'shoes.md',
			matter.stringify(notes ? `${notes}\n` : '', { active, rotation })
		);
		return { saved: 'shoes.md' };
	},

	saveFile: async ({ request }) => {
		const fd = await request.formData();
		const name = String(fd.get('name') ?? '').trim();
		let body = String(fd.get('body') ?? '');
		if (!EDITABLE.has(name) || name.includes('..') || name.includes('/') || name.includes('\\')) {
			return fail(400, { message: 'That file cannot be edited.' });
		}
		if (name.endsWith('.json')) {
			const trimmed = body.trim();
			if (!trimmed) body = '[]\n';
			try {
				JSON.parse(body);
			} catch {
				return fail(400, { message: 'plan.json must be valid JSON.', name, body });
			}
		}
		// Allow fully empty markdown files
		if (body.length > 0 && !body.endsWith('\n')) body = `${body}\n`;
		writeContextFile(name, body);
		return { saved: name };
	}
};
