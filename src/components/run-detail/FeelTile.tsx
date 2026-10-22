import { useState } from 'react';
import { Metric } from '../ui';
import { metricClass } from '../ui/Metric';

/** A metric tile (like the pace/HR tiles) that you click to edit the score in place. */
export function FeelTile({
	label,
	value,
	min,
	max,
	editable = true,
	onSave
}: {
	label: string;
	value: number | null;
	min: number;
	max: number;
	editable?: boolean;
	onSave: (v: number | null) => void;
}) {
	const [editing, setEditing] = useState(false);
	const [val, setVal] = useState(value != null ? String(value) : '');

	function commit() {
		setEditing(false);
		const t = val.trim();
		if (t === '') {
			onSave(null);
			return;
		}
		const n = Math.max(min, Math.min(max, Math.round(Number(t))));
		onSave(Number.isFinite(n) ? n : null);
	}

	if (editing) {
		return (
			<Metric emph className="pt-2 max-sm:flex-[1_1_100%]">
				<input
					className="font-display text-[1.35rem] min-h-11 px-2 py-[0.35rem] rounded-lg w-full"
					type="number"
					inputMode="numeric"
					min={min}
					max={max}
					value={val}
					autoFocus
					onChange={(e) => setVal(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === 'Enter') commit();
						if (e.key === 'Escape') setEditing(false);
					}}
				/>
				<span>{label}</span>
			</Metric>
		);
	}
	return (
		<button
			type="button"
			className={metricClass(
				true,
				'block w-full text-left font-inherit text-inherit',
				editable &&
					'cursor-pointer hover:border-accent hover:bg-accent/10 active:border-accent active:bg-accent/10'
			)}
			title={editable ? 'Click to edit' : undefined}
			disabled={!editable}
			onClick={() => {
				if (!editable) return;
				setVal(value != null ? String(value) : '');
				setEditing(true);
			}}
		>
			<b>{value ?? '—'}</b>
			<span>{label}</span>
		</button>
	);
}
