import { useNavigate } from '@tanstack/react-router';
import { FilterRow } from './FilterRow';
import { Icon } from './Icon';
import { Select } from './ui';

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

	const showCountry = availableCountries.length > 1;
	const showProvince = availableProvinces.length > 1;
	const showPlace = availablePlaces.length > 1;
	if (!showCountry && !showProvince && !showPlace) return null;

	return (
		<>
			{showCountry ? (
				<FilterRow label="Country" icon={<Icon name="map" size={14} />}>
					<Select
						size="compact"
						appearance="filter"
						value={country}
						aria-label="Country"
						onChange={(next) =>
							navigate({
								to,
								replace: true,
								resetScroll: false,
								search: (prev) => ({
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
				</FilterRow>
			) : null}
			{showProvince ? (
				<FilterRow label="Province" icon={<Icon name="locate" size={14} />}>
					<Select
						size="compact"
						appearance="filter"
						value={province}
						aria-label="Province"
						onChange={(next) =>
							navigate({
								to,
								replace: true,
								resetScroll: false,
								search: (prev) => ({
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
				</FilterRow>
			) : null}
			{showPlace ? (
				<FilterRow label="Place" icon={<Icon name="locate" size={14} />}>
					<Select
						size="compact"
						appearance="filter"
						value={place}
						aria-label="Place"
						onChange={(next) =>
							navigate({
								to,
								replace: true,
								resetScroll: false,
								search: (prev) => ({
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
				</FilterRow>
			) : null}
		</>
	);
}
