import { cn, ui } from '$lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { Select } from './Select';

type PlaceRun = { country?: string; province?: string; place?: string };

function distinct(arr: (string | undefined)[]) {
	return [...new Set(arr.filter(Boolean) as string[])].sort();
}

const filterLabel =
	'inline-flex items-center gap-1 shrink-0 text-[0.8rem] max-sm:grid max-sm:gap-[0.3rem] max-sm:w-full';

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
					<Select
						size="compact"
						value={country}
						aria-label="Country"
						onChange={(next) =>
							navigate({
								to,
								replace: true,
								resetScroll: false,
								search: (prev: Record<string, unknown>) => ({
									...prev,
									country: next === 'all' ? undefined : next,
									province: undefined,
									place: undefined
								})
							})
						}
						options={[
							{ value: 'all', label: 'All countries' },
							...availableCountries.map((c) => ({ value: c, label: c }))
						]}
					/>
				</label>
			)}
			{showProvince && (
				<label className={filterLabel}>
					<span className={ui.muted}>
						<span className="sm:hidden">Province</span>
						<span className="hidden sm:inline">Prov.</span>
					</span>
					<Select
						size="compact"
						value={province}
						aria-label="Province"
						onChange={(next) =>
							navigate({
								to,
								replace: true,
								resetScroll: false,
								search: (prev: Record<string, unknown>) => ({
									...prev,
									province: next === 'all' ? undefined : next,
									place: undefined
								})
							})
						}
						options={[
							{ value: 'all', label: 'All provinces' },
							...availableProvinces.map((p) => ({ value: p, label: p }))
						]}
					/>
				</label>
			)}
			{showPlace && (
				<label className={filterLabel}>
					<span className={ui.muted}>Place</span>
					<Select
						size="compact"
						value={place}
						aria-label="Place"
						onChange={(next) =>
							navigate({
								to,
								replace: true,
								resetScroll: false,
								search: (prev: Record<string, unknown>) => ({
									...prev,
									place: next === 'all' ? undefined : next
								})
							})
						}
						options={[
							{ value: 'all', label: 'All places' },
							...availablePlaces.map((p) => ({ value: p, label: p }))
						]}
					/>
				</label>
			)}
		</div>
	);
}
