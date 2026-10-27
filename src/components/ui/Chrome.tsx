import { stickySectionBar } from '$lib/shell-layout';
import { cn } from '$lib/ui';
import type { HTMLAttributes } from 'react';
import { ui } from './tokens';

export function sectionTitleClass(...parts: Array<string | false | null | undefined>) {
	return cn(ui.sectionTitle, ...parts);
}

export function gridClass(...parts: Array<string | false | null | undefined>) {
	return cn(ui.grid, ...parts);
}

export function tabBarClass(
	sticky: boolean | undefined,
	...parts: Array<string | false | null | undefined>
) {
	return cn(sticky !== false ? ui.coachTabs : ui.coachTabsInline, ...parts);
}

export function runRowClass(...parts: Array<string | boolean | false | null | undefined>) {
	return cn(
		ui.runRow,
		parts.some((p) => p === true) && ui.runRowCompact,
		...parts.filter((p): p is string => typeof p === 'string')
	);
}

export function dropzoneClass(...parts: Array<string | boolean | false | null | undefined>) {
	return cn(
		ui.dropzone,
		parts.some((p) => p === true) && ui.dropzoneOver,
		...parts.filter((p): p is string => typeof p === 'string')
	);
}

export function mapBadgeClass(...parts: Array<string | false | null | undefined>) {
	return cn(ui.mapBadge, ...parts);
}

export const runTitleClass = ui.runTitle;
export const feelBadgeClass = ui.feelBadge;
export const routeChipClass = ui.routeChip;
export const stickyBarClass = stickySectionBar;

export function SectionTitle({ className, ...props }: HTMLAttributes<HTMLElement>) {
	return <section className={sectionTitleClass(className)} {...props} />;
}

export function Grid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={gridClass(className)} {...props} />;
}

export function TabBar({
	sticky = true,
	className,
	...props
}: { sticky?: boolean } & HTMLAttributes<HTMLDivElement>) {
	return <div className={tabBarClass(sticky, className)} {...props} />;
}

export function RunRow({
	compact,
	className,
	...props
}: { compact?: boolean } & HTMLAttributes<HTMLDivElement>) {
	return <div className={runRowClass(compact, className)} {...props} />;
}

export function RunTitle({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={cn(ui.runTitle, className)} {...props} />;
}

export function MapBadge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
	return <span className={mapBadgeClass(className)} {...props} />;
}

export function FeelBadgeWrap({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
	return <span className={cn(ui.feelBadge, className)} {...props} />;
}

export function Dropzone({
	over,
	className,
	...props
}: { over?: boolean } & HTMLAttributes<HTMLDivElement>) {
	return <div className={dropzoneClass(over, className)} {...props} />;
}
