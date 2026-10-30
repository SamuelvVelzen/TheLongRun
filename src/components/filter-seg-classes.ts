import { cn } from '$lib/ui';
import { ui } from './ui/tokens';

/** Full-width equal segments on mobile; compact scroll row on desktop. */
export const filterSegToggleClass = cn(
	ui.segToggleFill,
	'max-sm:flex max-sm:w-full',
	'sm:inline-flex sm:w-fit sm:max-w-full sm:overflow-x-auto sm:overflow-y-hidden sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden',
	'border border-line rounded-full bg-canvas/85'
);

export const filterSegButtonClass = cn(
	ui.segItemFill,
	'sm:flex-none sm:w-auto sm:shrink-0 sm:overflow-visible sm:px-2.5 sm:py-2 sm:text-[0.82rem] sm:leading-normal sm:gap-1.5'
);

export const filterSegWrapClass =
	'inline-flex items-center shrink-0 max-w-full max-sm:w-full max-sm:overflow-x-auto max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden';
