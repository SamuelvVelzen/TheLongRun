import { cn, ui } from '$lib/ui';
import { useState } from 'react';

function range(min: number, max: number): number[] {
	const out: number[] = [];
	for (let n = min; n <= max; n++) out.push(n);
	return out;
}

const feelChip =
	'min-w-0 min-h-11 inline-flex items-center justify-center p-0 border border-line rounded-[10px] bg-inset text-muted font-inherit tabular-nums cursor-pointer transition-[border-color,color,background-color] duration-150 ease-out hover:border-accent active:border-accent aria-[pressed=true]:border-accent! aria-[pressed=true]:bg-accent! aria-[pressed=true]:text-accent-ink! aria-[pressed=true]:font-semibold';

/** Tappable 0–10 / 1–10 scores. */
export function FeelChips({
	name,
	label,
	min,
	max,
	low,
	high,
	value: valueProp,
	defaultValue,
	onChange
}: {
	name?: string;
	label: string;
	min: number;
	max: number;
	/** End-of-scale captions, e.g. easy → max. */
	low?: string;
	high?: string;
	value?: number | null;
	defaultValue?: number | null;
	onChange?: (value: number | null) => void;
}) {
	const isControlled = valueProp !== undefined;
	const [uncontrolled, setUncontrolled] = useState(
		defaultValue != null && Number.isFinite(defaultValue) ? String(defaultValue) : ''
	);
	const selected = isControlled
		? valueProp
		: uncontrolled === ''
			? null
			: Number(uncontrolled);

	function set(next: number | null) {
		if (!isControlled) setUncontrolled(next == null ? '' : String(next));
		onChange?.(next);
	}

	return (
		<div className={cn(ui.field, 'col-span-full')}>
			<span>{label}</span>
			{name != null ? <input type="hidden" name={name} value={selected ?? ''} /> : null}
			<div
				className="grid gap-[0.25rem]"
				style={{ gridTemplateColumns: `repeat(${max - min + 1}, minmax(0, 1fr))` }}
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
							onClick={() => set(active ? null : n)}
						>
							{n}
						</button>
					);
				})}
			</div>
			{low && high && (
				<div className="flex justify-between gap-2 text-[0.78rem] text-muted">
					<span>
						{min} {low}
					</span>
					<span>
						{max} {high}
					</span>
				</div>
			)}
		</div>
	);
}

/** Y / N / unset chips for wanted_faster. */
export function WantedFasterChips({
	name,
	value: valueProp,
	defaultValue = '',
	onChange
}: {
	name?: string;
	value?: string;
	defaultValue?: string;
	onChange?: (value: string) => void;
}) {
	const isControlled = valueProp !== undefined;
	const [uncontrolled, setUncontrolled] = useState(defaultValue);
	const value = isControlled ? valueProp : uncontrolled;
	const opts = [
		{ v: 'Y', label: 'Y' },
		{ v: 'N', label: 'N' },
		{ v: '', label: '—' }
	] as const;

	function set(next: string) {
		if (!isControlled) setUncontrolled(next);
		onChange?.(next);
	}

	return (
		<div className={cn(ui.field, 'col-span-full')}>
			<span>Wanted to go faster?</span>
			{name != null ? <input type="hidden" name={name} value={value} /> : null}
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
							onClick={() => set(opt.v)}
						>
							{opt.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
