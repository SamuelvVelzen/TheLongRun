import { cn } from '$lib/ui';
import type { HTMLAttributes } from 'react';
import { ui } from './tokens';

export function sectionTitleClass(...parts: Array<string | false | null | undefined>) {
	return cn(ui.sectionTitle, ...parts);
}

export function gridClass(...parts: Array<string | false | null | undefined>) {
	return cn(ui.grid, ...parts);
}

export function tabBarClass(...parts: Array<string | false | null | undefined>) {
	return cn(ui.coachTabs, ...parts);
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
export const stickyBarClass = ui.stickyBar;

export function SectionTitle({ className, ...props }: HTMLAttributes<HTMLElement>) {
	return <section className={sectionTitleClass(className)} {...props} />;
}

export function Grid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={gridClass(className)} {...props} />;
}

export function TabBar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={tabBarClass(className)} {...props} />;
}
