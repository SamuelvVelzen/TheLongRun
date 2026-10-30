import { normalizeActivityType } from '$lib/activity';
import { sessionFilterApplies } from '$lib/activity-filter-scope';
import { ACTIVITY_SESSIONS } from '$lib/activity-form';
import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { FilterRow } from './FilterRow';
import { Icon } from './Icon';
import { Select } from './ui';
import { matchesSportFilter } from './SportFilter';

const SESSION_SET = new Set<string>(ACTIVITY_SESSIONS);

const SESSION_LABELS: Record<(typeof ACTIVITY_SESSIONS)[number], string> = {
	easy: 'Easy',
	quality: 'Quality',
	tempo: 'Tempo',
	steady: 'Steady',
	long: 'Long',
	shakeout: 'Shakeout',
	race: 'Race',
	other: 'Other'
};

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

export { sessionFilterApplies };

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
	session: string,
	sport: string
): boolean {
	if (!sessionFilterApplies(sport)) return true;
	const selected = selectedSessions(session);
	if (selected.length === 0) return true;
	return selected.includes(normalizeRunSession(runSession) as (typeof ACTIVITY_SESSIONS)[number]);
}

export function sessionSummaryLabel(session: string): string {
	const selected = selectedSessions(session);
	if (selected.length === 0) return 'All';
	if (selected.length === 1) return SESSION_LABELS[selected[0]];
	return selected.map((s) => SESSION_LABELS[s]).join(' + ');
}

type SessionRun = { activity_type: string; session?: string | null };

/**
 * Compact run-kind filter (easy / long / …). Hidden for non-run sports and when
 * fewer than two kinds appear on scoped runs.
 */
export function SessionFilter({
	session,
	sport,
	to,
	runs
}: {
	session: string;
	sport: string;
	to: string;
	runs: SessionRun[];
}) {
	const navigate = useNavigate();

	const runRows = useMemo(
		() =>
			runs.filter(
				(r) =>
					normalizeActivityType(r.activity_type) === 'run' &&
					matchesSportFilter(r.activity_type, sport)
			),
		[runs, sport]
	);

	const availableKinds = useMemo(() => {
		const set = new Set<(typeof ACTIVITY_SESSIONS)[number]>();
		for (const r of runRows) {
			const k = normalizeRunSession(r.session) as (typeof ACTIVITY_SESSIONS)[number];
			if (k !== 'other') set.add(k);
		}
		return ACTIVITY_SESSIONS.filter((t) => set.has(t));
	}, [runRows]);

	if (!sessionFilterApplies(sport) || availableKinds.length < 2) return null;

	const selected = selectedSessions(session);
	const selectValue =
		selected.length === 1
			? selected[0]
			: selected.length > 1
				? session
				: 'all';

	return (
		<FilterRow label="Kind" icon={<Icon name="run" size={14} />}>
			<Select
				size="compact"
				appearance="filter"
				value={selectValue}
				aria-label="Run kind"
				onChange={(next) =>
					navigate({
						to,
						replace: true,
						resetScroll: false,
						search: (prev) => ({
							...prev,
							session: next === 'all' ? undefined : next
						})
					})
				}
				options={[
					{ value: 'all', label: 'All kinds' },
					...(selected.length > 1
						? [{ value: session, label: sessionSummaryLabel(session) }]
						: []),
					...availableKinds
						.filter((k) => selected.length <= 1 || !selected.includes(k))
						.map((k) => ({ value: k, label: SESSION_LABELS[k] }))
				]}
			/>
		</FilterRow>
	);
}
