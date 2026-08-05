import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import { env as cfEnv } from 'cloudflare:workers';

/**
 * Neon serverless (HTTP) client. Works on Cloudflare Workers and Node.
 *
 * DATABASE_URL is read from the Cloudflare `cloudflare:workers` env binding (where secrets and
 * vars live on Workers), falling back to process.env for Node/other contexts. Read at request time
 * (getSql is only called inside server-function handlers), never at module scope.
 * Set it as an encrypted secret on the Worker (dashboard → Variables and Secrets) for production,
 * and in .env for local dev. Use the Neon *pooled* connection string (host contains `-pooler`).
 */
let _sql: NeonQueryFunction<false, false> | null = null;

function databaseUrl(): string | undefined {
	const fromCf = (cfEnv as Record<string, string | undefined>).DATABASE_URL;
	return fromCf ?? process.env.DATABASE_URL;
}

export function getSql(): NeonQueryFunction<false, false> {
	if (_sql) return _sql;
	const url = databaseUrl();
	if (!url) {
		throw new Error(
			'DATABASE_URL is not set. Add the Neon pooled connection string to your environment.'
		);
	}
	_sql = neon(url);
	return _sql;
}
