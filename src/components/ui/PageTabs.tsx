import { TabBar } from './Chrome';
import { SegmentedToggle, type SegmentedOption } from './SegmentedToggle';

export function PageTabs<T extends string>({
	'aria-label': ariaLabel,
	value,
	onChange,
	options,
	className,
	sticky = true
}: {
	'aria-label': string;
	value: T;
	onChange?: (value: T) => void;
	options: SegmentedOption<T>[];
	className?: string;
	/** False when tabs sit inside `TabbedPageHeader` (parent handles sticky chrome). */
	sticky?: boolean;
}) {
	return (
		<TabBar sticky={sticky} className={className}>
			<SegmentedToggle
				fill
				aria-label={ariaLabel}
				value={value}
				onChange={onChange}
				options={options}
			/>
		</TabBar>
	);
}
