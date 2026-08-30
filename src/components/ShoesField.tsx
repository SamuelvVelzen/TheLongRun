import { formatShoeKm, shoeKey, type ShoeChipOption, type ShoeWear } from '$lib/shoes';
import { cn, ui } from '$lib/ui';
import { useEffect, useId, useMemo, useState } from 'react';

const OTHER = '__other__';

function wearHint(name: string, wear?: Record<string, ShoeWear>): string {
	const w = wear?.[shoeKey(name)];
	if (!w || w.km <= 0) return '';
	return formatShoeKm(w.km);
}

function optionLabel(opt: ShoeChipOption, wear?: Record<string, ShoeWear>): string {
	const bits: string[] = [];
	if (opt.role === 'active') bits.push('daily');
	const hint = wearHint(opt.name, wear);
	if (hint) bits.push(hint);
	return bits.length ? `${opt.name} (${bits.join(' · ')})` : opt.name;
}

/** Native select of inventory pairs, with Other… for a new name. */
export function ShoesField({
	options,
	wear,
	defaultValue,
	name = 'shoes',
	label = 'Shoes',
	onChange,
	immediate = false
}: {
	options: ShoeChipOption[] | string[];
	wear?: Record<string, ShoeWear>;
	defaultValue?: string;
	name?: string;
	label?: string;
	onChange?: (value: string) => void;
	immediate?: boolean;
}) {
	const catalog = useMemo<ShoeChipOption[]>(
		() =>
			options.map((o) => (typeof o === 'string' ? { name: o, role: 'rotation' as const } : o)),
		[options]
	);
	const [value, setValue] = useState(defaultValue ?? '');
	const [customOpen, setCustomOpen] = useState(false);
	const [custom, setCustom] = useState('');
	const [added, setAdded] = useState<string[]>([]);
	const customId = useId();

	useEffect(() => {
		setValue(defaultValue ?? '');
		setCustomOpen(false);
	}, [defaultValue]);

	const list = useMemo(() => {
		const seen = new Set<string>();
		const out: ShoeChipOption[] = [];
		const push = (name: string, role: ShoeChipOption['role']) => {
			const n = name.trim().replace(/\s+/g, ' ');
			const k = shoeKey(n);
			if (!n || !k || seen.has(k)) return;
			seen.add(k);
			out.push({ name: n, role });
		};
		for (const c of catalog) push(c.name, c.role);
		for (const n of added) push(n, 'logged');
		push(value, 'logged');
		return out;
	}, [catalog, added, value]);

	function select(next: string) {
		const n = next.trim().replace(/\s+/g, ' ');
		setValue(n);
		setCustomOpen(false);
		onChange?.(n);
	}

	function commitCustom() {
		const n = custom.trim().replace(/\s+/g, ' ');
		if (!n) {
			setCustomOpen(false);
			return;
		}
		const match = list.find((c) => shoeKey(c.name) === shoeKey(n));
		if (match) {
			setCustom('');
			select(match.name);
			return;
		}
		setAdded((prev) => [...prev, n]);
		setCustom('');
		select(n);
	}

	const selectedKey = shoeKey(value);
	const matched = list.find((c) => shoeKey(c.name) === selectedKey);
	const selectValue = customOpen ? OTHER : (matched?.name ?? '');

	return (
		<label className={ui.field}>
			{label ? <span>{label}</span> : null}
			<select
				name={undefined}
				value={selectValue}
				aria-label={label || 'Shoes'}
				aria-expanded={customOpen}
				aria-controls={customOpen ? customId : undefined}
				onChange={(e) => {
					const next = e.target.value;
					if (next === OTHER) {
						setCustomOpen(true);
						setCustom('');
						return;
					}
					select(next);
				}}
			>
				<option value="">—</option>
				{list.map((opt) => (
					<option key={shoeKey(opt.name)} value={opt.name}>
						{optionLabel(opt, wear)}
					</option>
				))}
				<option value={OTHER}>Other…</option>
			</select>
			{!immediate && (
				<input
					type="hidden"
					name={name}
					value={customOpen ? custom.trim().replace(/\s+/g, ' ') || value : value}
				/>
			)}
			{customOpen && (
				<div id={customId} className="flex gap-[0.4rem] items-center mt-[0.15rem]">
					<input
						className="flex-1 min-w-0"
						value={custom}
						placeholder="Pair name"
						autoFocus
						onChange={(e) => setCustom(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') {
								e.preventDefault();
								commitCustom();
							}
							if (e.key === 'Escape') setCustomOpen(false);
						}}
					/>
					<button type="button" className={cn(ui.btnPrimary, ui.btnSm)} onClick={commitCustom}>
						Use
					</button>
				</div>
			)}
		</label>
	);
}
