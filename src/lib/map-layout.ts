/** Leaflet map shells — Tailwind on nodes; `data-map-*` for fullscreen / attribution CSS. */

export const mapWrap = 'relative rounded-box overflow-hidden border border-line bg-inset isolate';

export const mapRoutePane = 'h-[min(440px,48vh)] w-full z-0 max-sm:h-[50vh] max-sm:min-h-[280px]';

export const mapRoutePaneTall =
	'h-[min(520px,62vh)] w-full z-0 max-sm:h-[58vh] max-sm:min-h-[320px]';

export const mapHeatmapPane = 'h-[min(360px,42vh)] w-full z-0 max-sm:h-[50vh] max-sm:min-h-[280px]';

export const mapPillTop =
	'absolute z-[2] left-[0.85rem] top-[0.85rem] m-0 px-[0.65rem] py-[0.35rem] rounded-full bg-[rgba(16,20,15,0.85)] border border-line text-[0.85rem]';

export const mapPillLegend =
	'absolute z-[2] right-[0.85rem] bottom-[0.85rem] flex items-center gap-1.5 px-[0.55rem] py-[0.3rem] rounded-full bg-[rgba(16,20,15,0.85)] border border-line text-muted text-[0.72rem]';

export const mapHeatmapLegend =
	'absolute z-[2] right-[0.85rem] bottom-[0.85rem] flex flex-wrap items-center gap-x-2.5 gap-y-1 px-[0.55rem] py-[0.3rem] rounded-full bg-[rgba(16,20,15,0.85)] border border-line text-muted text-[0.72rem]';

export const liveShareHost =
	'fixed z-[55] inset-x-0 top-[calc(var(--app-header-height)+0.65rem)] flex justify-center px-4 pointer-events-none max-sm:px-3';

export const liveWatchMapShell = 'fixed inset-0 z-[20000] m-0 border-0 rounded-none bg-inset';

export const liveWatchCanvas = 'size-full min-h-full';
