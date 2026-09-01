import { ui } from '$lib/ui';
import type { ReactNode } from 'react';

export type ChoiceOption<T extends string> = {
	value: T;
	label: ReactNode;
};

export function ChoiceChips<T extends string>({
	value,
	options,
	onChange,
	disabled,
	'aria-label': ariaLabel
}: {
	value: T;
	options: ChoiceOption<T>[];
	onChange: (value: T) => void;
	disabled?: boolean;
	'aria-label'?: string;
}) {
	return (
		<div className={ui.choiceChips} role="group" aria-label={ariaLabel}>
			{options.map((opt) => {
				const selected = opt.value === value;
				return (
					<button
						key={opt.value}
						type="button"
						className={ui.choiceChip}
						aria-pressed={selected}
						disabled={disabled}
						onClick={() => {
							if (!selected) onChange(opt.value);
						}}
					>
						{opt.label}
					</button>
				);
			})}
		</div>
	);
}
