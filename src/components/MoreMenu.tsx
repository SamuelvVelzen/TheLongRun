import { cn } from '$lib/ui';
import type { MouseEvent, ReactNode } from 'react';
import { Icon } from './Icon';
import { compactIconButtonClass } from './ui/IconButtons';
import { buttonClass } from './ui/Button';

export type MoreMenuItem = {
	label: string;
	icon: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	danger?: boolean;
};

function closeMenu(e: MouseEvent<HTMLElement>) {
	const details = e.currentTarget.closest('details');
	if (!details) return;
	requestAnimationFrame(() => {
		details.open = false;
	});
}

const itemClass =
	'flex w-full items-center gap-[0.65rem] min-h-11 px-[0.9rem] py-[0.55rem] rounded-xl border-0 bg-transparent text-muted text-left font-inherit cursor-pointer transition-colors duration-150 hover:text-fg hover:bg-panel disabled:opacity-45 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:bg-transparent';

const dangerItemClass =
	'text-warn! hover:text-warn hover:bg-warn/10 [&_svg]:text-warn';

export function MoreMenu({
	items,
	label = 'More actions',
	compact = false,
	trigger = 'more'
}: {
	items: MoreMenuItem[];
	label?: string;
	compact?: boolean;
	/** `edit` uses a pencil icon (gear rows, etc.); default is the ⋮ menu. */
	trigger?: 'more' | 'edit';
}) {
	if (!items.length) return null;
	return (
		<details className="relative z-30 shrink-0 open:z-50 max-sm:flex-none">
			<summary
				className={cn(
					buttonClass({ variant: 'ghost', size: compact ? 'default' : 'icon' }),
					compact && compactIconButtonClass,
					'list-none [&::-webkit-details-marker]:hidden'
				)}
				aria-label={label}
				title={label}
			>
				<Icon name={trigger === 'edit' ? 'pencil' : 'more'} size={compact ? 14 : 16} />
			</summary>
			<div className="fixed inset-0 z-40 cursor-pointer" onClick={closeMenu} aria-hidden="true" />
			<div className="absolute right-0 top-[calc(100%+0.35rem)] z-[41] grid min-w-[12.5rem] gap-[0.2rem] p-[0.45rem] border border-line rounded-box bg-surface shadow-lift">
				{items.map((item) => (
					<button
						key={item.label}
						type="button"
						className={cn(itemClass, item.danger && dangerItemClass)}
						disabled={item.disabled}
						onClick={(e) => {
							closeMenu(e);
							item.onClick();
						}}
					>
						{item.icon}
						{item.label}
					</button>
				))}
			</div>
		</details>
	);
}
