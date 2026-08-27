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
		DATABASE_URL?: string;
		DEFAULT_LAT?: string;
		DEFAULT_LON?: string;
	};
}
