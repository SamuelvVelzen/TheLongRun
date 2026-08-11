import { useState } from 'react';
import { getWeather } from '$lib/server/functions';

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
		<label className="field">
			<span>Weather</span>
			<div className="weather-row">
				<input
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="27°C humid / cloudy"
				/>
				<button
					type="button"
					className="btn btn-ghost weather-fetch"
					onClick={fetchWeather}
					disabled={!canFetch}
					title={canFetch ? 'Look up weather' : 'Set date + start time first'}
				>
					Fetch
				</button>
			</div>
			<span className="field-hint muted">{hint || (canFetch ? '' : 'Set date + start time to fetch')}</span>
		</label>
	);
}
