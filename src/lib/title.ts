import { normalizeActivityType } from '$lib/activity';

/** Browser tab: `Dashboard | The Long Run` (local prefixes `Dev |`). */
export function appTitle(...parts: Array<string | null | undefined>): string {
	const bits = parts.map((part) => String(part ?? '').trim()).filter(Boolean);
	bits.push('The Long Run');
	if (import.meta.env.DEV) bits.unshift('Dev');
	return bits.join(' | ');
}

export function appHead(...parts: Array<string | null | undefined>) {
	return { meta: [{ title: appTitle(...parts) }] };
}

function clockLabel(startTime: string | null | undefined): string {
	const match = String(startTime ?? '')
		.trim()
		.match(/^(\d{1,2}):(\d{2})/);
	if (!match) return '';
	return `${Number(match[1])}:${match[2]}`;
}

function sportWord(activityType: string | null | undefined): string {
	switch (normalizeActivityType(activityType)) {
		case 'ride':
			return 'bike';
		case 'walk':
			return 'walk';
		case 'strength':
			return 'strength';
		default:
			return 'run';
	}
}

/** Compact activity label for tabs: `bike · 8:38`, `race · 9:10`, `long run · 12:10`. */
export function activityTitlePart(run: {
	activity_type?: string | null;
	session?: string | null;
	start_time?: string | null;
}): string {
	const type = normalizeActivityType(run.activity_type);
	const session = String(run.session ?? '')
		.trim()
		.toLowerCase();
	const sport = sportWord(run.activity_type);

	let kind = sport;
	if (session === 'race') kind = 'race';
	else if (session && session !== 'other' && session !== 'easy') {
		if (session === 'long') kind = type === 'run' ? 'long run' : `long ${sport}`;
		else if (session === 'shakeout') kind = 'shakeout';
		else if (type === 'run') kind = `${session} run`;
		else kind = `${session} ${sport}`;
	}

	const clock = clockLabel(run.start_time);
	return clock ? `${kind} · ${clock}` : kind;
}
