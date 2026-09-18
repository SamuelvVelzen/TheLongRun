import { formatGearKm, gearKey, type GearChipOption, type GearWear } from '$lib/gear';
import { useEffect, useId, useMemo, useState } from 'react';
import { Button } from './ui/Button';
import { Field } from './ui/Field';
import { Input } from './ui/Input';
import { Select } from './ui/Select';

const OTHER = '__other__';

function wearHint(name: string, wear?: Record<string, GearWear>): string {
	const w = wear?.[gearKey(name)];
	if (!w || w.km <= 0) return '';
	return formatGearKm(w.km);
}

function optionLabel(
	opt: GearChipOption,
	wear?: Record<string, GearWear>,
	activeHint = 'daily'
): string {
	const bits: string[] = [];
	if (opt.role === 'active') bits.push(activeHint);
	const hint = wearHint(opt.name, wear);
	if (hint) bits.push(hint);
	return bits.length ? `${opt.name} (${bits.join(' · ')})` : opt.name;
}

/** Native select of inventory items, with Other… for a new name. */
export function GearField({
	options,
	wear,
	value: valueProp,
	defaultValue,
	name = 'gear',
	label = 'Gear',
	placeholder = 'Name',
	activeHint = 'daily',
	onChange,
	immediate = false
}: {
	options: GearChipOption[] | string[];
	wear?: Record<string, GearWear>;
	value?: string;
	defaultValue?: string;
	name?: string;
	label?: string;
	placeholder?: string;
	activeHint?: string;
	onChange?: (value: string) => void;
	immediate?: boolean;
}) {
	const catalog = useMemo<GearChipOption[]>(
		() =>
			options.map((o) => (typeof o === 'string' ? { name: o, role: 'rotation' as const } : o)),
		[options]
	);
	const isControlled = valueProp !== undefined;
	const [uncontrolled, setUncontrolled] = useState(defaultValue ?? '');
	const value = isControlled ? valueProp : uncontrolled;
	const [customOpen, setCustomOpen] = useState(false);
	const [custom, setCustom] = useState('');
	const [added, setAdded] = useState<string[]>([]);
	const customId = useId();

	useEffect(() => {
		if (!isControlled) setUncontrolled(defaultValue ?? '');
		setCustomOpen(false);
	}, [defaultValue, isControlled]);

	const list = useMemo(() => {
		const seen = new Set<string>();
		const out: GearChipOption[] = [];
		const push = (name: string, role: GearChipOption['role']) => {
			const n = name.trim().replace(/\s+/g, ' ');
			const k = gearKey(n);
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
		if (!isControlled) setUncontrolled(n);
		setCustomOpen(false);
		onChange?.(n);
	}

	function commitCustom() {
		const n = custom.trim().replace(/\s+/g, ' ');
		if (!n) {
			setCustomOpen(false);
			return;
		}
		const match = list.find((c) => gearKey(c.name) === gearKey(n));
		if (match) {
			setCustom('');
			select(match.name);
			return;
		}
		setAdded((prev) => [...prev, n]);
		setCustom('');
		select(n);
	}

	const selectedKey = gearKey(value);
	const matched = list.find((c) => gearKey(c.name) === selectedKey);
	const selectValue = customOpen ? OTHER : (matched?.name ?? '');

	return (
		<Field label={label}>
			<Select
				value={selectValue}
				aria-label={label || 'Gear'}
				onChange={(next) => {
					if (next === OTHER) {
						setCustomOpen(true);
						setCustom('');
						return;
					}
					select(next);
				}}
				options={[
					{ value: '', label: '—' },
					...list.map((opt) => ({
						value: opt.name,
						label: optionLabel(opt, wear, activeHint)
					})),
					{ value: OTHER, label: 'Other…' }
				]}
			/>
			{!immediate && !isControlled && name != null && (
				<input
					type="hidden"
					name={name}
					value={customOpen ? custom.trim().replace(/\s+/g, ' ') || value : value}
				/>
			)}
			{customOpen && (
				<div id={customId} className="flex gap-[0.4rem] items-center mt-[0.15rem]">
					<Input
						className="flex-1 min-w-0"
						value={custom}
						placeholder={placeholder}
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
					<Button type="button" size="sm" onClick={commitCustom}>
						Use
					</Button>
				</div>
			)}
		</Field>
	);
}
