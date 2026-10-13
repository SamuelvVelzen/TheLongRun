import { compactCoachNotes, formatCoachNotesSection, MAX_COACH_NOTES } from '$lib/body-notes';
import { tidyPrompt } from '$lib/prompt';

export const COACH_NOTES_EXTRA_TOKEN = '<<<COACH_EXTRA>>>';

export function injectCoachNotesExtra(template: string, extra: string): string {
	return template.split(COACH_NOTES_EXTRA_TOKEN).join(extra.trim() || '(nothing extra.)');
}

export function buildCoachNotesPrompt(coachNotes: string, todayIso: string): string {
	const current = formatCoachNotesSection(coachNotes) || '## Notes from me\n(none yet)';
	const example = JSON.stringify({
		text: 'Night shifts every other week. No running before 7am. Prefer trail long runs on weekends.'
	});
	return tidyPrompt(`# The Long Run — standing notes for my coach

Help me keep personal rules and context in my training app — not generic training advice. Today is ${todayIso}.

${current}

## What I wrote
Merge this into my standing coach notes. Keep what still applies; drop or rewrite what I asked to change. If I only ask a question, answer in prose then return the updated notes in JSON.

${COACH_NOTES_EXTRA_TOKEN}

## Reply
A short note is fine, then ONE JSON object:

\`\`\`json
${example}
\`\`\`

Rules:
- \`text\` is the full updated notes (max ${MAX_COACH_NOTES} characters), in my voice.
- Personal constraints only — schedules, preferences, life context the coach should remember.
- Do not paste training theory I did not write.
`);
}
