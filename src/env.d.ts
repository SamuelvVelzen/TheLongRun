/// <reference types="vite/client" />

declare module '*.css';

/** Minimal D1 surface used by the app. Wrangler provides the real binding. */
interface D1PreparedStatement {
	bind(...values: unknown[]): D1PreparedStatement;
	all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

interface D1Database {
	prepare(query: string): D1PreparedStatement;
}

declare module 'cloudflare:workers' {
	export const env: {
		DB: D1Database;
		DEFAULT_LAT?: string;
		DEFAULT_LON?: string;
		AUTH_DEV_BYPASS?: string;
		SESSION_SECRET?: string;
		CF_ACCESS_AUD?: string;
		CF_ACCESS_TEAM_DOMAIN?: string;
		CF_ACCESS_EMAIL?: string;
	};
}
