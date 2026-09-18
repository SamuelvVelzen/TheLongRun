import { getWeather } from '$lib/server/functions';
import { useState } from 'react';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Input } from './ui/Input';

/** Weather input with a Fetch button that only works once date + start time are set. */
export function WeatherField({
	value,
	onChange,
	date,
	time,
	duration
}: {
	value: string;
	onChange: (v: string) => void;
	date: string;
	time: string;
	duration?: string;
}) {
	const [hint, setHint] = useState('');
	const canFetch = Boolean(date && time);

	async function fetchWeather() {
		if (!canFetch) return;
		setHint('Fetching…');
		try {
			const w = await getWeather({ data: { date, time, duration: duration || null } });
			onChange(w ?? '');
			setHint(w ? 'From Open-Meteo (hourly)' : 'No weather for that date/time');
		} catch {
			setHint('Fetch failed');
		}
	}

	return (
		<Field label="Weather" hint={hint || (canFetch ? undefined : 'Set date + start time to fetch')}>
			<div className="flex gap-1.5 items-stretch min-w-0">
				<Input
					className="flex-1 min-w-0"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="27°C humid / cloudy"
					enterKeyHint="done"
					autoComplete="off"
				/>
				<Button
					type="button"
					variant="ghost"
					className="shrink-0 min-h-11 px-[0.9rem]"
					onClick={fetchWeather}
					disabled={!canFetch}
					title={canFetch ? 'Look up weather' : 'Set date + start time first'}
				>
					Fetch
				</Button>
			</div>
		</Field>
	);
}
