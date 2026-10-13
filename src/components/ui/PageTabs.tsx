import type { ReactNode } from 'react';
import { TabBar } from './Chrome';
import { SegmentedToggle, type SegmentedOption } from './SegmentedToggle';

export function PageTabs<T extends string>({
	'aria-label': ariaLabel,
	value,
	onChange,
	options,
	className
}: {
	'aria-label': string;
	value: T;
	onChange?: (value: T) => void;
	options: SegmentedOption<T>[];
	className?: string;
}) {
	return (
		<TabBar className={className}>
			<SegmentedToggle fill aria-label={ariaLabel} value={value} onChange={onChange} options={options} />
		</TabBar>
	);
}
