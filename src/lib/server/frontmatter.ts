/**
 * Minimal `---` YAML frontmatter split for one-shot legacy D1 imports (goals.md, shoes.md).
 * Avoids gray-matter, which does not run in the Workers SSR bundle.
 */
export function splitFrontmatter(raw: string): {
	data: Record<string, unknown>;
	content: string;
} {
	const text = raw.replace(/\r\n/g, '\n');
	if (!text.startsWith('---\n')) {
		return { data: {}, content: text };
	}
	const end = text.indexOf('\n---\n', 4);
	if (end < 0) {
		return { data: {}, content: text };
	}
	const yaml = text.slice(4, end);
	const content = text.slice(end + 5);
	const data: Record<string, unknown> = {};
	let listKey: string | null = null;
	let list: string[] = [];

	for (const line of yaml.split('\n')) {
		const item = line.match(/^\s+-\s+(.*)$/);
		if (item && listKey) {
			list.push(item[1].trim());
			continue;
		}
		if (listKey) {
			data[listKey] = list;
			listKey = null;
			list = [];
		}
		const kv = line.match(/^([\w_]+):\s*(.*)$/);
		if (!kv) continue;
		const key = kv[1];
		const value = kv[2].trim();
		if (value === '') {
			listKey = key;
			list = [];
			continue;
		}
		if (value.startsWith('[') && value.endsWith(']')) {
			data[key] = [];
			continue;
		}
		data[key] = value.replace(/^["']|["']$/g, '');
	}
	if (listKey) data[listKey] = list;

	return { data, content };
}
