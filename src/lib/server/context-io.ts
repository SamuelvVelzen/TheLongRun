import { getSql } from './db';

export async function readContextFile(name: string): Promise<string> {
	const sql = getSql();
	const rows = (await sql`SELECT content FROM context WHERE name = ${name} LIMIT 1`) as {
		content: string;
	}[];
	return rows.length ? String(rows[0]!.content ?? '') : '';
}

export async function writeContextFile(name: string, content: string): Promise<void> {
	const sql = getSql();
	await sql`
		INSERT INTO context (name, content) VALUES (${name}, ${content})
		ON CONFLICT (name) DO UPDATE SET content = EXCLUDED.content
	`;
}
