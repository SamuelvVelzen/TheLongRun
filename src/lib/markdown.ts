import { Marked } from 'marked';

const marked = new Marked({
	gfm: true,
	breaks: false
});

export function renderMarkdown(source: string): string {
	const raw = source?.trim() ? source : '_Empty file._';
	return marked.parse(raw, { async: false }) as string;
}

export function renderJsonPretty(source: string): string {
	try {
		const pretty = JSON.stringify(JSON.parse(source), null, 2);
		return renderMarkdown('```json\n' + pretty + '\n```');
	} catch {
		return renderMarkdown('```\n' + source + '\n```');
	}
}
