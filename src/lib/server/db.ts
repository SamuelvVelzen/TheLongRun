import { neon, type NeonQueryFunction } from '@neondatabase/serverless';

/**
 * Neon serverless (HTTP) client. Works on Cloudflare Workers and Node.
 * Reads DATABASE_URL from process.env. IMPORTANT: getSql() must be called at request time
 * (inside a server-function handler), never at module scope — on Cloudflare Workers env vars
 * are injected per-request. Set it via .dev.vars locally and a Wrangler secret in production.
 * Use the Neon *pooled* connection string (host contains `-pooler`).
 */
let _sql: NeonQueryFunction<false, false> | null = null;

export function getSql(): NeonQueryFunction<false, false> {
	if (_sql) return _sql;
	const url = process.env.DATABASE_URL;
	if (!url) {
		throw new Error(
			'DATABASE_URL is not set. Add the Neon pooled connection string to your environment.'
		);
	}
	_sql = neon(url);
	return _sql;
}
