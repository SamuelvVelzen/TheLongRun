import { cn, ui } from '$lib/ui';
import { useState } from 'react';

function range(min: number, max: number): number[] {
	const out: number[] = [];
	for (let n = min; n <= max; n++) out.push(n);
	return out;
}

const feelChip =
	'min-w-0 min-h-11 inline-flex items-center justify-center p-0 border border-line rounded-[10px] bg-black/25 text-muted font-inherit tabular-nums cursor-pointer transition-[border-color,color,background-color] duration-150 ease-out hover:border-accent active:border-accent aria-[pressed=true]:border-accent! aria-[pressed=true]:bg-accent! aria-[pressed=true]:text-accent-ink! aria-[pressed=true]:font-semibold';

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
		<div className={cn(ui.field, 'col-span-full')}>
			<span>{label}</span>
			<input type="hidden" name={name} value={value} />
			<div
				className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-[0.3rem]"
				role="group"
				aria-label={label}
			>
				{range(min, max).map((n) => {
					const active = selected === n;
					return (
						<button
							key={n}
							type="button"
							className={feelChip}
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
		<div className={cn(ui.field, 'col-span-full')}>
			<span>Wanted to go faster?</span>
			<input type="hidden" name={name} value={value} />
			<div
				className="grid grid-cols-3 gap-[0.3rem]"
				role="group"
				aria-label="Wanted to go faster?"
			>
				{opts.map((opt) => {
					const active = value === opt.v;
					return (
						<button
							key={opt.v || 'unset'}
							type="button"
							className={feelChip}
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
