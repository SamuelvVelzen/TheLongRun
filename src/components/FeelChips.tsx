import { useState } from 'react';

function range(min: number, max: number): number[] {
	const out: number[] = [];
	for (let n = min; n <= max; n++) out.push(n);
	return out;
}

/** Tappable 0–10 / 1–10 scores; posts the same hidden field name as the old number input. */
export function FeelChips({
	name,
	label,
	min,
	max,
	defaultValue
}: {
	name: string;
	label: string;
	min: number;
	max: number;
	defaultValue?: number | null;
}) {
	const [value, setValue] = useState(
		defaultValue != null && Number.isFinite(defaultValue) ? String(defaultValue) : ''
	);
	const selected = value === '' ? null : Number(value);

	return (
		<div className="field feel-field">
			<span>{label}</span>
			<input type="hidden" name={name} value={value} />
			<div className="feel-chips" role="group" aria-label={label}>
				{range(min, max).map((n) => {
					const active = selected === n;
					return (
						<button
							key={n}
							type="button"
							className={`feel-chip${active ? ' active' : ''}`}
							aria-pressed={active}
							onClick={() => setValue(active ? '' : String(n))}
						>
							{n}
						</button>
					);
				})}
			</div>
		</div>
	);
}

/** Y / N / unset chips for wanted_faster (same posted values as the old select). */
export function WantedFasterChips({
	name = 'wanted_faster',
	defaultValue = ''
}: {
	name?: string;
	defaultValue?: string;
}) {
	const [value, setValue] = useState(defaultValue);
	const opts = [
		{ v: 'Y', label: 'Y' },
		{ v: 'N', label: 'N' },
		{ v: '', label: '—' }
	] as const;

	return (
		<div className="field feel-field">
			<span>Wanted to go faster?</span>
			<input type="hidden" name={name} value={value} />
			<div className="feel-chips feel-chips-wanted" role="group" aria-label="Wanted to go faster?">
				{opts.map((opt) => {
					const active = value === opt.v;
					return (
						<button
							key={opt.v || 'unset'}
							type="button"
							className={`feel-chip${active ? ' active' : ''}`}
							aria-pressed={active}
							onClick={() => setValue(opt.v)}
						>
							{opt.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
