import { env } from 'cloudflare:workers';

/**
 * D1 tagged-template helper: interpolations become bound parameters (`?`),
 * and the promise resolves to row objects.
 *
 * `env.DB` is read at query time (inside server-function handlers), never at module scope.
 */
export type SqlQuery = (
	strings: TemplateStringsArray,
	...values: unknown[]
) => Promise<Record<string, unknown>[]>;

function getDb(): D1Database {
	const db = env.DB;
	if (!db || typeof db.prepare !== 'function') {
		throw new Error(
			'D1 binding DB is missing. Add d1_databases in wrangler.jsonc and run npm run d1:apply:local.'
		);
	}
	return db;
}

function bindValue(value: unknown): string | number | null {
	if (value === undefined || value === null) return null;
	if (typeof value === 'boolean') return value ? 1 : 0;
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	if (typeof value === 'string') return value;
	if (typeof value === 'bigint') return Number(value);
	throw new Error(`Unsupported D1 bind value: ${typeof value}`);
}

export function getSql(): SqlQuery {
	return async (strings, ...values) => {
		let query = strings[0] ?? '';
		const params: Array<string | number | null> = [];
		for (let i = 0; i < values.length; i++) {
			query += `?${strings[i + 1] ?? ''}`;
			params.push(bindValue(values[i]));
		}
		const db = getDb();
		const stmt = params.length ? db.prepare(query).bind(...params) : db.prepare(query);
		const { results } = await stmt.all();
		return results;
	};
}

/** D1 stores JSON as TEXT. */
export function parseJsonColumn(raw: unknown): unknown {
	if (raw == null || raw === '') return null;
	if (typeof raw === 'object') return raw;
	if (typeof raw !== 'string') return raw;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}
