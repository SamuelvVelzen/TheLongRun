import { cn, ui } from '$lib/ui';
import { useNavigate } from '@tanstack/react-router';

type PlaceRun = { country?: string; province?: string; place?: string };

function distinct(arr: (string | undefined)[]) {
	return [...new Set(arr.filter(Boolean) as string[])].sort();
}

const filterLabel =
	'inline-flex items-center gap-1 shrink-0 text-[0.8rem] max-sm:grid max-sm:gap-[0.3rem] max-sm:w-full [&_select]:w-auto [&_select]:min-h-11 [&_select]:px-3 [&_select]:py-2 [&_select]:rounded-lg [&_select]:text-[0.88rem] sm:[&_select]:min-h-9 sm:[&_select]:px-2 sm:[&_select]:py-1 sm:[&_select]:text-[0.82rem] max-sm:[&_select]:w-full';

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

	const showCountry = availableCountries.length > 1;
	const showProvince = availableProvinces.length > 1;
	const showPlace = availablePlaces.length > 1;
	if (!showCountry && !showProvince && !showPlace) return null;

	return (
		<div
			className={cn(
				'inline-flex items-center shrink-0',
				'max-sm:flex-col max-sm:items-stretch max-sm:w-full max-sm:gap-3',
				'sm:gap-1.5'
			)}
		>
			{showCountry && (
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
			{showProvince && (
				<label className={filterLabel}>
					<span className={ui.muted}>
						<span className="sm:hidden">Province</span>
						<span className="hidden sm:inline">Prov.</span>
					</span>
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
			{showPlace && (
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
		</div>
	);
}
