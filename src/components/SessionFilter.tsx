import { ACTIVITY_SESSIONS } from '$lib/activity-form';
import { cn } from '$lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { segItemClass, segToggleClass } from './ui/SegmentedToggle';

const SESSION_SET = new Set<string>(ACTIVITY_SESSIONS);

const OPTIONS: { value: 'all' | (typeof ACTIVITY_SESSIONS)[number]; label: string }[] = [
	{ value: 'all', label: 'All kinds' },
	...ACTIVITY_SESSIONS.map((s) => ({
		value: s,
		label: s === 'other' ? 'Other' : s.charAt(0).toUpperCase() + s.slice(1)
	}))
];

export function normalizeRunSession(session: string | null | undefined): string {
	const s = String(session ?? 'other').trim().toLowerCase();
	return SESSION_SET.has(s) ? s : 'other';
}

export function selectedSessions(session: string): (typeof ACTIVITY_SESSIONS)[number][] {
	if (!session || session === 'all') return [];
	return ACTIVITY_SESSIONS.filter((t) => session.split(',').includes(t));
}

export function sessionIsAll(session: string): boolean {
	return !session || session === 'all';
}

/** Parse `?session=` — comma-separated session kinds. Invalid tokens dropped. */
export function parseSessionSearch(raw: unknown): string | undefined {
	if (typeof raw !== 'string' || !raw.trim()) return undefined;
	const tokens = new Set(
		raw
			.split(',')
			.map((s) => s.trim().toLowerCase())
			.filter((s) => SESSION_SET.has(s))
	);
	const ordered = ACTIVITY_SESSIONS.filter((t) => tokens.has(t));
	if (ordered.length === 0) return undefined;
	return ordered.join(',');
}

export function matchesSessionFilter(
	runSession: string | null | undefined,
	session: string
): boolean {
	const selected = selectedSessions(session);
	if (selected.length === 0) return true;
	return selected.includes(normalizeRunSession(runSession) as (typeof ACTIVITY_SESSIONS)[number]);
}

export function sessionSummaryLabel(session: string): string {
	const selected = selectedSessions(session);
	if (selected.length === 0) return 'All kinds';
	if (selected.length === 1) {
		const o = OPTIONS.find((x) => x.value === selected[0]);
		return o?.label ?? selected[0];
	}
	return selected
		.map((s) => OPTIONS.find((x) => x.value === s)?.label ?? s)
		.join(' + ');
}

function toggleSession(
	current: string,
	clicked: 'all' | (typeof ACTIVITY_SESSIONS)[number],
	defaultSession: string,
	availableKinds: (typeof ACTIVITY_SESSIONS)[number][]
): string | undefined {
	let next: string;
	if (clicked === 'all') {
		next = 'all';
	} else if (sessionIsAll(current)) {
		next = clicked;
	} else {
		const selected = selectedSessions(current);
		const remaining = selected.includes(clicked)
			? selected.filter((s) => s !== clicked)
			: ACTIVITY_SESSIONS.filter((t) => t === clicked || selected.includes(t));
		next = remaining.length === 0 ? 'all' : remaining.join(',');
	}

	const selectedNow = selectedSessions(next);
	if (availableKinds.length > 1 && availableKinds.every((t) => selectedNow.includes(t))) {
		next = 'all';
	}

	return next === defaultSession ? undefined : next;
}

/**
 * Run session kind (easy / long / quality / …). Multi-select like sport; hidden when
 * fewer than two kinds appear in `available`.
 */
export function SessionFilter({
	session,
	to,
	defaultSession = 'all',
	available
}: {
	session: string;
	to: string;
	defaultSession?: string;
	available?: Set<string>;
}) {
	const navigate = useNavigate();
	const options = OPTIONS.filter(
		(o) => o.value === 'all' || !available || available.has(o.value)
	);
	const availableKinds = options
		.map((o) => o.value)
		.filter((v): v is (typeof ACTIVITY_SESSIONS)[number] => v !== 'all');
	if (availableKinds.length < 2) return null;

	const selected = selectedSessions(session);
	const allSelected = sessionIsAll(session);

	return (
		<div
			className={cn(
				'inline-flex items-center shrink-0',
				'max-sm:w-full max-sm:overflow-x-auto max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden'
			)}
		>
			<div
				className={cn(
					segToggleClass,
					'sm:[&_button]:min-h-9 sm:[&_button]:px-2.5 sm:[&_button]:text-[0.82rem]'
				)}
				role="group"
				aria-label="Run kind"
			>
				{options.map((o) => {
					const pressed =
						o.value === 'all' ? allSelected : selected.includes(o.value as (typeof ACTIVITY_SESSIONS)[number]);
					return (
						<button
							key={o.value}
							type="button"
							className={segItemClass}
							aria-pressed={pressed}
							onClick={() => {
								const next = toggleSession(session, o.value, defaultSession, availableKinds);
								const current = session === defaultSession ? undefined : session;
								if (next === current) return;
								navigate({
									to,
									search: (prev: Record<string, unknown>) => ({
										...prev,
										session: next
									}),
									replace: true,
									resetScroll: false
								});
							}}
						>
							{o.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
