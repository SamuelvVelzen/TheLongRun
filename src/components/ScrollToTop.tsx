import { cn } from '$lib/ui';
import { getAppScrollElement, getAppScrollY, scrollAppTo } from '$lib/viewport';
import { useCallback, useSyncExternalStore } from 'react';
import { Icon } from './Icon';

const SHOW_AFTER = 400;

function subscribe(onStoreChange: () => void) {
	const el = getAppScrollElement() ?? window;
	el.addEventListener('scroll', onStoreChange, { passive: true });
	return () => el.removeEventListener('scroll', onStoreChange);
}

function getSnapshot() {
	return getAppScrollY() > SHOW_AFTER;
}

function getServerSnapshot() {
	return false;
}

export function ScrollToTop() {
	const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

	const scrollTop = useCallback(() => {
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		scrollAppTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
	}, []);

	return (
		<button
			type="button"
			aria-label="Scroll to top"
			title="Scroll to top"
			tabIndex={visible ? 0 : -1}
			aria-hidden={!visible}
			onClick={scrollTop}
			className={cn(
				'scroll-to-top fixed z-30 inline-flex items-center justify-center p-0 rounded-full border border-line bg-surface/92 text-fg shadow-lift backdrop-blur-[10px] cursor-pointer',
				'size-11 min-h-11 min-w-11',
				'right-[max(0.85rem,var(--safe-right))] bottom-[calc(1.15rem+var(--safe-bottom))]',
				'max-sm:size-9 max-sm:min-h-9 max-sm:min-w-9',
				'max-sm:left-[max(0.85rem,var(--safe-left))] max-sm:right-auto',
				'max-sm:bottom-[calc(var(--tab-bar-offset)+0.65rem)]',
				'transition-[opacity,transform,border-color,color,visibility] duration-200',
				'hover:border-accent/45 hover:text-accent-fg active:border-accent/45 active:text-accent-fg',
				visible
					? 'opacity-100 translate-y-0 pointer-events-auto'
					: 'opacity-0 translate-y-2 pointer-events-none'
			)}
		>
			<Icon name="arrowUp" size={20} className="max-sm:hidden" />
			<Icon name="arrowUp" size={16} className="hidden max-sm:block" />
		</button>
	);
}
