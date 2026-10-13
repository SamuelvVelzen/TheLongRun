/** App chrome — Tailwind only; `data-*` hooks for global CSS (fullscreen, :has). */

export const stickyChrome =
	'relative isolate max-sm:bg-[var(--sticky-chrome-bg-mobile)] sm:bg-[var(--sticky-chrome-bg)] sm:backdrop-blur-md sm:before:pointer-events-none sm:before:absolute sm:before:inset-0 sm:before:left-1/2 sm:before:-z-10 sm:before:w-screen sm:before:-ml-[50vw] sm:before:bg-[var(--sticky-chrome-bg)] sm:before:backdrop-blur-md sm:before:content-[""]';

export const appShell =
	'relative z-1 flex flex-1 flex-col w-[min(1120px,calc(100%-2rem))] min-h-dvh mx-auto pt-5 pr-[env(safe-area-inset-right,0px)] pb-[calc(4rem+env(safe-area-inset-bottom,0px))] pl-[env(safe-area-inset-left,0px)] max-sm:w-full max-sm:h-dvh max-sm:min-h-0 max-sm:flex-1 max-sm:overflow-hidden max-sm:pt-0 max-sm:pb-0 max-sm:pl-0 max-sm:pr-0 sm:pt-2';

export const appHeader =
	'flex flex-none flex-wrap items-center justify-between gap-x-4 gap-y-2 max-sm:box-border max-sm:w-full max-sm:min-h-[var(--app-header-height)] max-sm:pt-[calc(env(safe-area-inset-top,0px)+0.45rem)] max-sm:pr-[max(0.625rem,env(safe-area-inset-right,0px))] max-sm:pb-[0.45rem] max-sm:pl-[max(0.625rem,env(safe-area-inset-left,0px))] sm:sticky sm:top-0 sm:z-40 sm:pt-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:pb-3';

export const appScroll =
	'min-w-0 flex-1 max-sm:min-h-0 max-sm:overflow-x-clip max-sm:overflow-y-auto max-sm:overscroll-contain max-sm:pl-[max(0.625rem,env(safe-area-inset-left,0px))] max-sm:pr-[max(0.625rem,env(safe-area-inset-right,0px))] max-sm:pb-3 max-sm:[--page-pad-left:max(0.625rem,env(safe-area-inset-left,0px))] max-sm:[--page-pad-right:max(0.625rem,env(safe-area-inset-right,0px))]';

export const tabBar =
	'hidden max-sm:flex flex-none items-stretch justify-around z-40 gap-[0.15rem] border-t border-line select-none bg-canvas shadow-[var(--shadow-tab)] pt-[0.3rem] pr-[max(0.35rem,var(--safe-right))] pb-[max(0.3rem,var(--safe-bottom-chrome))] pl-[max(0.35rem,var(--safe-left))] [-webkit-touch-callout:none]';

export const stickySectionBar =
	'sticky z-30 top-0 mb-4 py-2 max-sm:pt-0 max-sm:pb-2 max-sm:mb-3 max-sm:-ml-[var(--page-pad-left)] max-sm:-mr-[var(--page-pad-right)] max-sm:pl-[var(--page-pad-left)] max-sm:pr-[var(--page-pad-right)] sm:-mx-2 sm:px-2 sm:top-[calc(0.75rem+var(--app-header-desktop)+0.75rem+env(safe-area-inset-top,0px))]';

export const scrollToTopBtn =
	'fixed z-30 inline-flex items-center justify-center p-0 rounded-full border border-line bg-surface/92 text-fg shadow-lift backdrop-blur-[10px] cursor-pointer max-sm:bottom-[calc(var(--tab-bar-offset)+0.65rem)]';
