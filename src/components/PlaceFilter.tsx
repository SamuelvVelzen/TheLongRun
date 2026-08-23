import { useNavigate } from '@tanstack/react-router';

type PlaceRun = { country?: string; province?: string; place?: string };

function distinct(arr: (string | undefined)[]) {
	return [...new Set(arr.filter(Boolean) as string[])].sort();
}

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
				<label className="filter-country">
					<span className="muted">Country</span>
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
				<label className="filter-country">
					<span className="muted">Province</span>
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
				<label className="filter-country">
					<span className="muted">Place</span>
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
