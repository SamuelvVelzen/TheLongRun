import { useState } from 'react';
import { getWeather } from '$lib/server/functions';
import { cn, ui } from '$lib/ui';

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
		<label className={ui.field}>
			<span>Weather</span>
			<div className="flex gap-1.5 items-stretch">
				<input
					className="flex-1 min-w-0"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					placeholder="27°C humid / cloudy"
				/>
				<button
					type="button"
					className={cn(ui.btnGhost, 'shrink-0 min-h-11 px-[0.9rem]')}
					onClick={fetchWeather}
					disabled={!canFetch}
					title={canFetch ? 'Look up weather' : 'Set date + start time first'}
				>
					Fetch
				</button>
			</div>
			<span className={cn(ui.fieldHint, ui.muted)}>
				{hint || (canFetch ? '' : 'Set date + start time to fetch')}
			</span>
		</label>
	);
}
