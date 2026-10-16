import { cn } from '$lib/ui';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Icon } from './Icon';
import { useSnackbar } from './ui';

function subscribeOnline(onStoreChange: () => void) {
	window.addEventListener('online', onStoreChange);
	window.addEventListener('offline', onStoreChange);
	return () => {
		window.removeEventListener('online', onStoreChange);
		window.removeEventListener('offline', onStoreChange);
	};
}

function getOnlineSnapshot() {
	return navigator.onLine;
}

function getOnlineServerSnapshot() {
	return true;
}

/** Offline banner + toasts when connectivity changes. */
export function NetworkStatus() {
	const online = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getOnlineServerSnapshot);
	const snack = useSnackbar();
	const prevOnline = useRef<boolean | null>(null);

	useEffect(() => {
		const prev = prevOnline.current;
		prevOnline.current = online;
		if (prev === null) return;
		if (prev && !online) {
			snack.error("You're offline. This page may still work, but saving needs a connection.", {
				duration: 6500
			});
		}
		if (!prev && online) {
			snack.success('Back online');
		}
	}, [online, snack]);

	if (online) return null;

	return (
		<div
			role="status"
			className={cn(
				'flex flex-none items-center gap-2 px-3 py-2 text-[0.82rem] font-medium leading-snug',
				'border-b border-warn/35 bg-warn/10 text-warn',
				'max-sm:px-[max(0.625rem,env(safe-area-inset-left,0px))] max-sm:pr-[max(0.625rem,env(safe-area-inset-right,0px))]'
			)}
		>
			<Icon name="warning" size={16} className="shrink-0 opacity-90" aria-hidden />
			<span>Offline — saves and new pages need a connection.</span>
		</div>
	);
}
