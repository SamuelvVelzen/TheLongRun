import {
	BODY_SAFETY_RULE,
	formatBodyNotesSection,
	type BodyNotes
} from '$lib/body-notes';
import { tidyPrompt } from '$lib/prompt';

export const BODY_NOTES_EXTRA_TOKEN = '<<<BODY_EXTRA>>>';

export function injectBodyNotesExtra(template: string, extra: string): string {
	return template.split(BODY_NOTES_EXTRA_TOKEN).join(extra.trim() || '(nothing extra.)');
}

export function buildBodyNotesPrompt(body: BodyNotes, todayIso: string): string {
	const current = formatBodyNotesSection(body) || '## Body notes\n(none yet)';
	const areas = body.notes.map((n) => n.area);
	const example = JSON.stringify({
		body: [
			{
				area: areas[0] ?? 'left knee',
				status: 'monitoring',
				trigger: 'downhills and hard surfaces',
				helps: 'trails, longer warm-up'
			}
		]
	});
	return tidyPrompt(`# The Long Run — body notes for my coach

Help me keep injury and niggle notes in my training app. Today is ${todayIso}.

${current}

## What I wrote
Turn my list into body notes — new areas, status changes, or niggles that cleared up. If I ask what to watch, answer briefly in prose before the JSON.

${BODY_NOTES_EXTRA_TOKEN}

## Reply
A short note is fine, then ONE JSON block in exactly this shape:

\`\`\`json
${example}
\`\`\`

Rules:
- One entry per area; \`status\` is \`active\`, \`monitoring\`, or \`resolved\`.
- \`trigger\` and \`helps\` are short, in my words.
- Only include areas I mentioned or that should change.${areas.length ? ` Reuse an exact area name when it is the same place: ${areas.join(', ')}.` : ''}
- Do not invent injuries I did not mention.
- ${BODY_SAFETY_RULE}
`);
}
