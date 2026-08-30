/** Shared Tailwind class strings for recurring UI primitives. */

export function cn(...parts: Array<string | false | null | undefined>): string {
	return parts.filter(Boolean).join(' ');
}

const btnBase =
	'inline-flex items-center justify-center gap-1.5 rounded-full min-h-11 px-[1.15rem] py-3 cursor-pointer transition-[transform,background-color,opacity] duration-150 ease-out enabled:active:-translate-y-px enabled:hover:-translate-y-px disabled:opacity-55 disabled:cursor-not-allowed disabled:translate-y-0 max-sm:py-[0.7rem] max-sm:px-[1.05rem]';

export const ui = {
	muted: 'text-muted',
	panel:
		'bg-panel border border-line rounded-box p-[1.1rem_1.2rem] backdrop-blur-[8px] max-sm:p-[0.9rem_1rem]',
	btn: btnBase,
	btnPrimary: `${btnBase} border-0 bg-accent text-accent-ink font-semibold`,
	btnGhost: `${btnBase} bg-transparent border border-solid border-line text-fg`,
	btnDanger:
		'text-warn border-[rgba(255,138,91,0.35)] hover:bg-warn/10 hover:border-warn active:bg-warn/10 active:border-warn',
	btnIcon:
		'size-11 min-h-11 min-w-11 p-0! px-0! py-0! rounded-full leading-none shrink-0 self-center box-border max-sm:!flex-none max-sm:!size-11 max-sm:!min-h-11 max-sm:!min-w-11 max-sm:!p-0',
	btnSm: 'min-h-11 px-[0.85rem] py-2 text-[0.82rem]',
	field: 'grid gap-[0.35rem] text-[0.9rem] text-muted',
	req: "after:content-['_*'] after:text-accent",
	fieldHint: 'block mt-[0.35rem] text-[0.78rem]',
	form: 'grid gap-4',
	formGrid: 'grid grid-cols-1 gap-[0.9rem] items-start min-[721px]:grid-cols-2',
	formSection: 'mt-[1.35rem] first-of-type:mt-0',
	formSectionTitle:
		'font-display text-[0.8rem] uppercase tracking-[0.08em] text-muted m-0 mb-[0.7rem] pb-1.5 border-b border-line',
	actions:
		'flex flex-wrap gap-3 max-sm:gap-[0.55rem] max-sm:w-full max-sm:[&>a]:flex-1 max-sm:[&>a]:min-w-[min(100%,9rem)] max-sm:[&>button]:flex-1 max-sm:[&>button]:min-w-[min(100%,9rem)]',
	hero: 'grid gap-5 mb-8 max-sm:gap-[0.95rem] max-sm:mb-[1.35rem] [&_h1]:text-[clamp(2.4rem,6vw,4.2rem)] [&_h1]:max-w-[12ch] max-sm:[&_h1]:text-[clamp(1.85rem,9.5vw,2.55rem)] max-sm:[&_h1]:max-w-none [&_p]:max-w-[68ch] [&_p]:text-muted [&_p]:text-[1.05rem] max-sm:[&_p]:text-[0.98rem] max-sm:[&_p]:max-w-none',
	heroHome: 'max-sm:hidden',
	heroRoute: '[&_h1]:max-w-none [&_a]:text-accent',
	snackHost:
		'fixed z-[60] inset-x-0 bottom-[calc(1.15rem+env(safe-area-inset-bottom,0px))] flex flex-col-reverse items-center gap-[0.45rem] px-4 pointer-events-none max-sm:bottom-[calc(5.1rem+env(safe-area-inset-bottom,0px))] max-sm:px-3',
	snack:
		'pointer-events-auto flex items-center gap-[0.45rem] w-[min(32rem,100%)] py-[0.7rem] pr-[0.55rem] pl-[0.95rem] rounded-[14px] border border-line bg-surface shadow-lift animate-rise max-sm:py-[0.65rem] max-sm:pr-[0.4rem] max-sm:pl-[0.85rem]',
	snackSuccess: 'border-[rgba(125,255,168,0.35)] bg-ok/10 text-[#d9ffe8]',
	snackError: 'border-[rgba(255,138,91,0.4)] bg-warn/10 text-[#ffd4c2]',
	snackAction:
		'shrink-0 appearance-none min-h-11 px-[0.7rem] py-[0.35rem] border-0 rounded-full bg-transparent text-accent font-semibold cursor-pointer whitespace-nowrap hover:text-fg active:text-fg',
	snackDismiss:
		'shrink-0 inline-flex items-center justify-center box-border size-11 min-h-11 min-w-11 p-0 border-0 bg-transparent text-muted text-[1.25rem] leading-none cursor-pointer hover:text-fg active:text-fg',
	tag: 'inline-flex px-[0.55rem] py-[0.2rem] rounded-full border border-line text-[0.78rem] text-muted',
	tagAccent: 'border-[rgba(200,242,90,0.4)] text-accent',
	grid: 'grid gap-4 max-sm:gap-3',
	sectionTitle:
		'flex items-end justify-between gap-4 mt-8 mb-[0.85rem] max-sm:flex-col max-sm:items-start max-sm:gap-[0.55rem] max-sm:mt-[1.45rem] max-sm:mb-[0.7rem] [&_h2]:text-[1.45rem] max-sm:[&_h2]:text-[1.28rem] [&_p]:text-muted',
	stickyActions:
		'sticky z-20 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] flex flex-wrap items-center gap-3 p-3 px-4 border border-line rounded-2xl bg-[rgba(16,20,15,0.92)] backdrop-blur-[10px] shadow-lift max-sm:bottom-[calc(5.1rem+env(safe-area-inset-bottom,0px))] max-sm:gap-[0.55rem] max-sm:[&>a]:w-auto max-sm:[&>button]:w-auto max-sm:[&>a]:flex-none max-sm:[&>button]:flex-none',
	stickyPrimary: 'max-sm:!flex-1 max-sm:!min-w-[min(100%,9rem)]',
	editor:
		'block w-full max-w-full font-mono text-[0.9rem] leading-[1.45] min-h-[22rem] max-sm:min-h-64 max-sm:text-[0.86rem]',
	runRow:
		'grid grid-cols-[1.2fr_0.8fr_0.7fr_0.7fr] gap-3 items-center p-4 px-[1.1rem] border border-line rounded-[14px] bg-white/[0.02] transition-[border-color,background-color,transform] duration-150 ease-out animate-rise hover:border-[rgba(200,242,90,0.35)] hover:bg-[rgba(200,242,90,0.04)] hover:-translate-y-px active:border-[rgba(200,242,90,0.35)] active:bg-[rgba(200,242,90,0.04)] active:-translate-y-px max-[760px]:grid-cols-2 max-sm:grid-cols-1 max-sm:gap-[0.3rem] max-sm:p-[0.85rem_0.95rem]',
	runRowCompact:
		'grid-cols-1 gap-[0.18rem] p-[0.75rem_0.95rem] max-[760px]:grid-cols-1 max-sm:gap-[0.1rem] max-sm:p-[0.62rem_0.8rem] max-sm:text-[0.92rem]',
	runTitle: 'flex items-center gap-1.5',
	mapBadge: 'inline-flex items-center justify-center text-accent opacity-90 shrink-0',
	feelBadge: 'inline-flex items-center justify-center text-muted opacity-85 shrink-0 ml-[0.1rem]',
	metric:
		'flex-[1_1_6.5rem] min-w-0 p-[0.65rem_0.8rem] rounded-xl bg-white/[0.03] border border-line max-sm:flex-[1_1_calc(50%-0.45rem)] max-sm:p-[0.55rem_0.7rem] [&_b]:block [&_b]:font-display [&_b]:text-[1.15rem] max-sm:[&_b]:text-[1.05rem] max-sm:[&_b]:[overflow-wrap:anywhere] [&_span]:text-muted [&_span]:text-[0.8rem]',
	metricEmph: 'border-[rgba(200,242,90,0.22)] bg-[rgba(200,242,90,0.05)] [&_b]:text-[1.35rem]',
	metrics: 'flex flex-wrap gap-2 max-sm:gap-[0.45rem]',
	dropzone:
		'flex flex-col items-center justify-center gap-[0.35rem] p-[2.25rem_1.2rem] border-2 border-dashed border-line rounded-box bg-black/18 text-muted cursor-pointer text-center transition-[border-color,background-color,color] duration-150 ease-out hover:border-accent hover:text-fg active:border-accent active:text-fg max-sm:p-[1.5rem_0.85rem] [&_strong]:font-display [&_strong]:text-[1.02rem] [&_strong]:text-fg',
	dropzoneOver: 'border-accent bg-[rgba(200,242,90,0.08)] text-fg',
	coachTabs: 'flex gap-[0.3rem] mb-4 border-b border-line max-sm:gap-0 max-sm:overflow-x-auto',
	// Selected styles use aria-* variants (not a second class): cn() does not merge
	// conflicting utilities, so text-muted/border-transparent would otherwise win.
	coachTab:
		'appearance-none bg-transparent border-0 border-b-2 border-transparent -mb-px min-h-11 px-[0.9rem] py-[0.55rem] font-semibold text-muted cursor-pointer hover:text-fg active:text-fg max-sm:flex-1 max-sm:min-w-0 max-sm:px-1 max-sm:py-2 max-sm:h-auto max-sm:text-[0.78rem] max-sm:text-center max-sm:leading-[1.25] max-sm:whitespace-normal aria-[selected=true]:text-fg! aria-[selected=true]:border-b-accent! data-[status=active]:text-fg! data-[status=active]:border-b-accent!',
	coachTabActive: 'text-fg border-b-accent',
	choiceChips: 'flex flex-wrap gap-[0.4rem]',
	choiceChip:
		'appearance-none inline-flex items-center justify-center min-h-11 px-[0.95rem] py-2 rounded-full border border-solid border-line bg-transparent text-muted font-semibold cursor-pointer transition-[color,background-color,border-color] duration-150 ease-out hover:text-fg hover:border-[rgba(200,242,90,0.35)] disabled:opacity-35 disabled:cursor-not-allowed aria-[pressed=true]:bg-accent! aria-[pressed=true]:text-accent-ink! aria-[pressed=true]:border-accent! aria-[pressed=true]:hover:text-accent-ink aria-[pressed=true]:hover:border-accent',
	dialogRoot: 'overlay-root fixed inset-0 z-[20000] flex items-end justify-center p-0 sm:items-center sm:p-4',
	dialogBackdrop: 'absolute inset-0 bg-black/55',
	dialogPanel:
		'relative z-[1] flex w-full max-h-[min(88dvh,100%)] flex-col gap-4 overflow-y-auto [overscroll-behavior:contain] border border-line border-b-0 rounded-t-box bg-surface p-[1.15rem_1.2rem_calc(1.15rem+env(safe-area-inset-bottom,0px))] shadow-lift sm:max-w-[26rem] sm:border-b sm:rounded-box sm:p-[1.25rem_1.35rem]',
	statusPill:
		'inline-flex items-center gap-1 shrink-0 px-[0.5rem] py-[0.12rem] rounded-full text-[0.68rem] tracking-[0.06em] uppercase font-bold',
	routeChip:
		'inline-flex items-center gap-[0.4rem] max-w-full mt-2 px-[0.7rem] py-[0.38rem] rounded-full border border-[color-mix(in_srgb,var(--color-accent)_55%,var(--color-line))] bg-[color-mix(in_srgb,var(--color-accent)_16%,transparent)] text-accent text-[0.88rem] font-bold overflow-hidden hover:bg-[color-mix(in_srgb,var(--color-accent)_24%,transparent)] shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-accent)_18%,transparent)]',
	segToggle:
		'inline-flex w-fit max-w-full overflow-x-auto overflow-y-hidden border border-line rounded-full bg-[rgba(16,20,15,0.85)] max-sm:w-full',
	segItem:
		'appearance-none inline-flex items-center justify-center relative w-auto min-h-11 px-[0.85rem] py-2 border-0 border-r border-line last:border-r-0 rounded-none bg-transparent text-muted font-inherit no-underline cursor-pointer shrink-0 max-sm:flex-1 transition-[color,background-color,border-color] duration-150 ease-out aria-[pressed=false]:hover:text-fg aria-[pressed=false]:hover:bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)] active:text-fg aria-[pressed=true]:text-accent-ink! aria-[pressed=true]:bg-accent! aria-[pressed=true]:font-semibold aria-[pressed=true]:active:text-accent-ink',
	segItemActive: 'text-accent-ink bg-accent font-semibold'
} as const;
