import { useNavigate } from '@tanstack/react-router';
import { ui } from '$lib/ui';

type PlaceRun = { country?: string; province?: string; place?: string };

function distinct(arr: (string | undefined)[]) {
	return [...new Set(arr.filter(Boolean) as string[])].sort();
}

const filterLabel =
	'inline-flex items-center gap-1.5 text-[0.85rem] max-sm:grid max-sm:gap-[0.3rem] max-sm:w-full [&_select]:w-auto [&_select]:min-h-11 [&_select]:px-3 [&_select]:py-2 [&_select]:rounded-lg max-sm:[&_select]:w-full';

/**
 * Cascading country / province / place selects. Options shrink as parents are chosen.
 * Hidden when a level has fewer than two values.
 */
export function PlaceFilter({
	to,
	runs,
	country,
	province,
	place
}: {
	to: string;
	runs: PlaceRun[];
	country: string;
	province: string;
	place: string;
}) {
	const navigate = useNavigate();
	const byCountry = runs.filter((r) => country === 'all' || r.country === country);
	const byProvince = byCountry.filter((r) => province === 'all' || r.province === province);
	const availableCountries = distinct(runs.map((r) => r.country));
	const availableProvinces = distinct(byCountry.map((r) => r.province));
	const availablePlaces = distinct(byProvince.map((r) => r.place));

	return (
		<>
			{availableCountries.length > 1 && (
				<label className={filterLabel}>
					<span className={ui.muted}>Country</span>
					<select
						value={country}
						onChange={(e) =>
							navigate({
								to,
								replace: true,
								resetScroll: false,
								search: (prev: Record<string, unknown>) => ({
									...prev,
									country: e.target.value === 'all' ? undefined : e.target.value,
									province: undefined,
									place: undefined
								})
							})
						}
					>
						<option value="all">All countries</option>
						{availableCountries.map((c) => (
							<option key={c} value={c}>
								{c}
							</option>
						))}
					</select>
				</label>
			)}
			{availableProvinces.length > 1 && (
				<label className={filterLabel}>
					<span className={ui.muted}>Province</span>
					<select
						value={province}
						onChange={(e) =>
							navigate({
								to,
								replace: true,
								resetScroll: false,
								search: (prev: Record<string, unknown>) => ({
									...prev,
									province: e.target.value === 'all' ? undefined : e.target.value,
									place: undefined
								})
							})
						}
					>
						<option value="all">All provinces</option>
						{availableProvinces.map((p) => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
					</select>
				</label>
			)}
			{availablePlaces.length > 1 && (
				<label className={filterLabel}>
					<span className={ui.muted}>Place</span>
					<select
						value={place}
						onChange={(e) =>
							navigate({
								to,
								replace: true,
								resetScroll: false,
								search: (prev: Record<string, unknown>) => ({
									...prev,
									place: e.target.value === 'all' ? undefined : e.target.value
								})
							})
						}
					>
						<option value="all">All places</option>
						{availablePlaces.map((p) => (
							<option key={p} value={p}>
								{p}
							</option>
						))}
					</select>
				</label>
			)}
		</>
	);
}
