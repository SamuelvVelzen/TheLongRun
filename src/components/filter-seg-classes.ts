import { cn } from '$lib/ui';
import { ui } from './ui/tokens';

/** Desktop filter strip — one height for segments and selects. */
export const filterBarDesktopButtonClass =
	'sm:min-h-8 sm:px-2 sm:py-1.5 sm:text-[0.78rem] sm:leading-tight sm:gap-1';

/** Apply to a segmented group wrapper (`[&_button]`). */
export const filterBarDesktopGroupClass = cn(
	'sm:[&_button]:min-h-8 sm:[&_button]:px-2 sm:[&_button]:py-1.5 sm:[&_button]:text-[0.78rem] sm:[&_button]:leading-tight sm:[&_button]:gap-1'
);

/** Full-width equal segments on mobile; compact scroll row on desktop. */
export const filterSegToggleClass = cn(
	ui.segToggleFill,
	'max-sm:flex max-sm:w-full',
	'sm:inline-flex sm:w-fit sm:max-w-full sm:overflow-x-auto sm:overflow-y-hidden sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden',
	'border border-line rounded-full bg-canvas/85',
	filterBarDesktopGroupClass
);

export const filterSegButtonClass = cn(
	ui.segItemFill,
	'sm:flex-none sm:w-auto sm:shrink-0 sm:overflow-visible',
	filterBarDesktopButtonClass
);

export const filterSegWrapClass =
	'inline-flex items-center shrink-0 max-w-full max-sm:w-full max-sm:overflow-x-auto max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden';
