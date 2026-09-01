import { cn, ui } from '$lib/ui';
import type { ReactNode } from 'react';

export function PageHero({
	kicker,
	title,
	lead,
	children,
	actions,
	variant = 'default',
	className,
	copyClassName,
	kickerClassName,
	titleClassName,
	actionsClassName,
	hideActionsOnMobile
}: {
	kicker?: ReactNode;
	title: ReactNode;
	lead?: ReactNode;
	children?: ReactNode;
	actions?: ReactNode;
	variant?: 'default' | 'home' | 'quiet' | 'route';
	className?: string;
	copyClassName?: string;
	kickerClassName?: string;
	titleClassName?: string;
	actionsClassName?: string;
	hideActionsOnMobile?: boolean;
}) {
	return (
		<section
			className={cn(
				ui.hero,
				variant === 'home' && ui.heroHome,
				variant === 'quiet' && ui.heroQuiet,
				variant === 'route' && ui.heroRoute,
				className
			)}
		>
			<div className={copyClassName}>
				{kicker != null ? <p className={cn(ui.muted, kickerClassName)}>{kicker}</p> : null}
				<h1 className={titleClassName}>{title}</h1>
				{lead == null ? null : typeof lead === 'string' || typeof lead === 'number' ? (
					<p>{lead}</p>
				) : (
					lead
				)}
				{children}
			</div>
			{actions ? (
				<div className={cn(ui.actions, hideActionsOnMobile && 'max-sm:hidden', actionsClassName)}>
					{actions}
				</div>
			) : null}
		</section>
	);
}
