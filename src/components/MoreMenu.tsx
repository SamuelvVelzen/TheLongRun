import { cn, ui } from '$lib/ui';
import type { MouseEvent, ReactNode } from 'react';
import { Icon } from './Icon';

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

export function MoreMenu({
	items,
	label = 'More actions'
}: {
	items: MoreMenuItem[];
	label?: string;
}) {
	if (!items.length) return null;
	return (
		<details className="relative z-30 shrink-0 max-sm:flex-none">
			<summary
				className={cn(
					ui.btnGhost,
					ui.btnIcon,
					'list-none cursor-pointer [&::-webkit-details-marker]:hidden'
				)}
				aria-label={label}
				title={label}
			>
				<Icon name="more" size={16} />
			</summary>
			<div className="fixed inset-0 z-40 cursor-pointer" onClick={closeMenu} aria-hidden="true" />
			<div className="absolute right-0 top-[calc(100%+0.35rem)] z-[41] grid min-w-[12.5rem] gap-[0.2rem] p-[0.45rem] border border-line rounded-box bg-surface shadow-lift">
				{items.map((item) => (
					<button
						key={item.label}
						type="button"
						className={cn(itemClass, item.danger && 'hover:text-warn hover:bg-warn/10')}
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
