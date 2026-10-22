import { cn } from '$lib/ui';
import { useState } from 'react';
import { buttonClass } from '../ui/Button';

export const fieldLabel = cn('text-muted', 'text-[0.72rem] uppercase tracking-[0.05em]');
export const fieldBox =
	'w-full min-h-11 min-w-0 text-left bg-white/[0.03] border border-line rounded-lg p-[0.65rem_0.75rem] [overflow-wrap:anywhere]';

/** A single value you can tap to edit in place, saved on its own (no full form). */
export function InlineText({
	label,
	value,
	placeholder,
	multiline = false,
	numeric = false,
	datalistId,
	options,
	editable = true,
	onSave
}: {
	label: string;
	value: string;
	placeholder?: string;
	multiline?: boolean;
	numeric?: boolean;
	datalistId?: string;
	options?: string[];
	editable?: boolean;
	onSave: (v: string) => Promise<void>;
}) {
	const [editing, setEditing] = useState(false);
	const [val, setVal] = useState(value);
	const [busy, setBusy] = useState(false);

	async function save() {
		setBusy(true);
		try {
			await onSave(val.trim());
			setEditing(false);
		} finally {
			setBusy(false);
		}
	}

	const wrap = cn('flex flex-col gap-[0.28rem] min-w-0', (multiline || editing) && 'col-span-full');

	if (!editing) {
		return (
			<div className={wrap}>
				<span className={fieldLabel}>{label}</span>
				{editable ? (
					<button
						type="button"
						className={cn(
							fieldBox,
							'flex items-start justify-between gap-3 text-inherit font-inherit cursor-pointer hover:border-accent hover:bg-accent/6 active:border-accent group/qv'
						)}
						onClick={() => {
							setVal(value);
							setEditing(true);
						}}
						title="Tap to edit"
					>
						{value ? (
							<span className="whitespace-pre-wrap break-words min-w-0 flex-1">{value}</span>
						) : (
							<span className={'text-muted'}>— add</span>
						)}
						<span
							className="shrink-0 mt-[0.15rem] text-accent-fg text-[0.85rem] sm:opacity-0 group-hover/qv:opacity-100"
							aria-hidden="true"
						>
							✎
						</span>
					</button>
				) : (
					<div className={fieldBox}>
						{value ? (
							<span className="whitespace-pre-wrap break-words">{value}</span>
						) : (
							<span className={'text-muted'}>—</span>
						)}
					</div>
				)}
			</div>
		);
	}

	return (
		<div className={wrap}>
			<span className={fieldLabel}>{label}</span>
			<div className="flex flex-col gap-[0.45rem] sm:flex-row sm:items-start">
				{multiline ? (
					<textarea
						className="flex-1 min-w-0 text-base"
						value={val}
						placeholder={placeholder}
						rows={5}
						autoFocus
						onChange={(e) => setVal(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Escape') setEditing(false);
						}}
					/>
				) : (
					<input
						className="flex-1 min-w-0 text-base"
						value={val}
						type={numeric ? 'number' : 'text'}
						inputMode={numeric ? 'decimal' : 'text'}
						placeholder={placeholder}
						list={datalistId}
						enterKeyHint="done"
						autoComplete="off"
						autoCorrect="off"
						autoFocus
						onChange={(e) => setVal(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === 'Enter') void save();
							if (e.key === 'Escape') setEditing(false);
						}}
					/>
				)}
				{datalistId && options && (
					<datalist id={datalistId}>
						{[...new Set(options.map((o) => o.trim()).filter(Boolean))].map((o) => (
							<option key={o} value={o} />
						))}
					</datalist>
				)}
				<div className="flex gap-[0.35rem] shrink-0 max-sm:w-full sm:justify-end">
					<button
						type="button"
						className={buttonClass({ size: 'sm', className: 'max-sm:flex-1' })}
						onClick={() => void save()}
						disabled={busy}
					>
						{busy ? '…' : 'Save'}
					</button>
					<button
						type="button"
						className={buttonClass({ variant: 'ghost', size: 'sm', className: 'max-sm:flex-1' })}
						onClick={() => setEditing(false)}
						disabled={busy}
					>
						Cancel
					</button>
				</div>
			</div>
		</div>
	);
}
