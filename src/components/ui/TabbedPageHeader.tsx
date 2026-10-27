import { stickyChrome, stickySectionBar } from '$lib/shell-layout';
import { cn } from '$lib/ui';
import { getAppScrollElement, getAppScrollY } from '$lib/viewport';
import type { ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import { PageTabs } from './PageTabs';
import type { SegmentedOption } from './SegmentedToggle';
import { ui } from './tokens';

/** Scroll past this before hiding the title (tabs stay in the sticky band). */
const TITLE_HIDE_AFTER = 20;

function subscribeTitleCollapse(onStoreChange: () => void) {
	const el = getAppScrollElement() ?? window;
	el.addEventListener('scroll', onStoreChange, { passive: true });
	return () => el.removeEventListener('scroll', onStoreChange);
}

function getTitleCollapsedSnapshot() {
	return getAppScrollY() > TITLE_HIDE_AFTER;
}

function getTitleCollapsedServerSnapshot() {
	return false;
}

export type TabbedPageHeaderTabs<T extends string> = {
	'aria-label': string;
	value: T;
	onChange?: (value: T) => void;
	options: SegmentedOption<T>[];
	className?: string;
};

export function TabbedPageHeader<T extends string>({
	kicker,
	title,
	lead,
	tabs,
	className,
	actions
}: {
	kicker?: ReactNode;
	title: ReactNode;
	lead?: ReactNode;
	tabs?: TabbedPageHeaderTabs<T>;
	className?: string;
	actions?: ReactNode;
}) {
	const titleCollapsed = useSyncExternalStore(
		subscribeTitleCollapse,
		getTitleCollapsedSnapshot,
		getTitleCollapsedServerSnapshot
	);

	return (
		<header
			className={cn(
				stickyChrome,
				stickySectionBar,
				ui.tabbedPageHeader,
				titleCollapsed && ui.tabbedPageHeaderCompact,
				className
			)}
		>
			<div
				className={cn(
					ui.tabbedPageHeaderTitleShell,
					titleCollapsed
						? ui.tabbedPageHeaderTitleShellClosed
						: ui.tabbedPageHeaderTitleShellOpen
				)}
				aria-hidden={titleCollapsed}
			>
				<div className={cn(ui.tabbedPageHeaderCopy, 'min-h-0 overflow-hidden')}>
					{kicker != null ? (
						<p className={cn(ui.muted, ui.heroMobileHideCopy, ui.tabbedPageKicker)}>{kicker}</p>
					) : null}
					<div className="flex items-start justify-between gap-3">
						<h1 className={ui.tabbedPageTitle}>{title}</h1>
						{actions ? (
							<div className={cn(ui.actions, 'shrink-0 max-sm:hidden')}>{actions}</div>
						) : null}
					</div>
					{lead == null ? null : typeof lead === 'string' || typeof lead === 'number' ? (
						<p className={cn(ui.tabbedPageLead, ui.heroMobileHideCopy)}>{lead}</p>
					) : (
						<div className={cn(ui.tabbedPageLead, ui.heroMobileHideCopy)}>{lead}</div>
					)}
				</div>
			</div>
			{tabs ? (
				<PageTabs
					sticky={false}
					{...tabs}
					className={cn(tabs.className, titleCollapsed && '!mt-0')}
				/>
			) : null}
		</header>
	);
}
