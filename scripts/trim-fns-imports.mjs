/**
 * Drop unused named/default imports from src/lib/server/fns/*.ts (conservative).
 */
import fs from 'node:fs';
import path from 'node:path';

const fnsDir = 'src/lib/server/fns';

function isUsed(name, body) {
	if (name === 'type') return true;
	const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
	return re.test(body);
}

function trimFile(filePath) {
	let src = fs.readFileSync(filePath, 'utf8');
	const lines = src.split(/\r?\n/);
	const importEnd = lines.findIndex((l, i) => i > 0 && l.startsWith('// ----------'));
	const cut = importEnd > 0 ? importEnd : lines.findIndex((l) => l.startsWith('export const '));
	if (cut < 1) return false;

	const importSection = lines.slice(0, cut).join('\n');
	const body = lines.slice(cut).join('\n');

	const kept = [];
	const importRe =
		/^import\s+(?:(type\s+)?\{([^}]+)\}|(\w+)\s*,?\s*(?:\{([^}]+)\})?\s*)from\s+(['"])([^'"]+)\5;?\s*$/;

	for (const block of importSection.split(/(?=^import )/m)) {
		const trimmed = block.trim();
		if (!trimmed.startsWith('import ')) {
			if (trimmed) kept.push(trimmed);
			continue;
		}

		// Multiline import { ... } from '...'
		const m = trimmed.match(/^import\s+(type\s+)?([\s\S]+?)\s+from\s+(['"])([^'"]+)\3\s*;?\s*$/);
		if (!m) {
			kept.push(trimmed);
			continue;
		}
		const isTypeOnly = Boolean(m[1]);
		const clause = m[2].trim();
		const spec = m[4];

		if (clause.startsWith('{')) {
			const inner = clause.slice(1, -1);
			const names = inner
				.split(',')
				.map((p) => p.trim())
				.filter(Boolean)
				.map((p) => {
					const typePrefix = p.startsWith('type ') ? 'type ' : '';
					const part = p.replace(/^type\s+/, '');
					const alias = part.split(/\s+as\s+/);
					return {
						raw: p,
						typePrefix,
						local: (alias[1] ?? alias[0]).trim(),
						orig: alias[0].trim()
					};
				});
			const used = names.filter((n) => isTypeOnly || isUsed(n.local, body) || isUsed(n.orig, body));
			if (!used.length) continue;
			const rebuilt = used.map((n) => n.raw).join(', ');
			kept.push(`import ${isTypeOnly ? 'type ' : ''}{ ${rebuilt} } from '${spec}';`);
		} else if (clause.includes('{')) {
			kept.push(trimmed);
		} else {
			const defaultName = clause.split(',')[0].trim();
			if (isUsed(defaultName, body)) kept.push(trimmed);
		}
	}

	const next = [...kept, '', body].join('\n');
	if (next === src) return false;
	fs.writeFileSync(filePath, next);
	return true;
}

let n = 0;
for (const name of fs.readdirSync(fnsDir)) {
	if (!name.endsWith('.ts')) continue;
	if (trimFile(path.join(fnsDir, name))) n++;
}
console.log(`Trimmed imports in ${n} fns files`);
