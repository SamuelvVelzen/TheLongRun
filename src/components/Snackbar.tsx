import { cn, ui } from '$lib/ui';
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode
} from 'react';

export type SnackbarVariant = 'success' | 'error' | 'info';

export type SnackbarAction = {
	label: string;
	onClick: () => void;
};

export type ShowSnackbarOptions = {
	variant?: SnackbarVariant;
	/** Auto-dismiss in ms. `0` stays until dismissed. */
	duration?: number;
	action?: SnackbarAction;
};

type SnackbarItem = {
	id: string;
	message: string;
	variant: SnackbarVariant;
	duration: number;
	action?: SnackbarAction;
};

type SnackbarApi = {
	show: (message: string, options?: ShowSnackbarOptions) => string;
	success: (message: string, options?: Omit<ShowSnackbarOptions, 'variant'>) => string;
	error: (message: string, options?: Omit<ShowSnackbarOptions, 'variant'>) => string;
	info: (message: string, options?: Omit<ShowSnackbarOptions, 'variant'>) => string;
	dismiss: (id?: string) => void;
};

const SnackbarContext = createContext<SnackbarApi | null>(null);

const MAX_SNACKBARS = 3;
const DEFAULT_DURATION: Record<SnackbarVariant, number> = {
	success: 4500,
	info: 4500,
	error: 6500
};

export function errorMessage(err: unknown, fallback: string) {
	return err instanceof Error ? err.message : fallback;
}

export function useSnackbar() {
	const api = useContext(SnackbarContext);
	if (!api) throw new Error('useSnackbar must be used within SnackbarProvider');
	return api;
}

export function SnackbarProvider({ children }: { children: ReactNode }) {
	const [items, setItems] = useState<SnackbarItem[]>([]);
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

	const clearTimer = useCallback((id: string) => {
		const timer = timers.current.get(id);
		if (timer) clearTimeout(timer);
		timers.current.delete(id);
	}, []);

	const dismiss = useCallback(
		(id?: string) => {
			if (!id) {
				for (const timer of timers.current.values()) clearTimeout(timer);
				timers.current.clear();
				setItems([]);
				return;
			}
			clearTimer(id);
			setItems((prev) => prev.filter((item) => item.id !== id));
		},
		[clearTimer]
	);

	const armTimer = useCallback(
		(item: SnackbarItem) => {
			clearTimer(item.id);
			if (item.duration <= 0) return;
			timers.current.set(
				item.id,
				setTimeout(() => dismiss(item.id), item.duration)
			);
		},
		[clearTimer, dismiss]
	);

	const show = useCallback(
		(message: string, options?: ShowSnackbarOptions) => {
			const variant = options?.variant ?? 'info';
			const item: SnackbarItem = {
				id: crypto.randomUUID(),
				message,
				variant,
				duration: options?.duration ?? DEFAULT_DURATION[variant],
				action: options?.action
			};
			setItems((prev) => {
				const next = [...prev, item];
				for (const dropped of next.slice(0, -MAX_SNACKBARS)) clearTimer(dropped.id);
				return next.slice(-MAX_SNACKBARS);
			});
			armTimer(item);
			return item.id;
		},
		[armTimer, clearTimer]
	);

	const api = useMemo<SnackbarApi>(
		() => ({
			show,
			success: (message, options) => show(message, { ...options, variant: 'success' }),
			error: (message, options) => show(message, { ...options, variant: 'error' }),
			info: (message, options) => show(message, { ...options, variant: 'info' }),
			dismiss
		}),
		[dismiss, show]
	);

	useEffect(
		() => () => {
			for (const timer of timers.current.values()) clearTimeout(timer);
			timers.current.clear();
		},
		[]
	);

	useEffect(() => {
		if (!items.length) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === 'Escape') dismiss(items[items.length - 1]?.id);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [dismiss, items]);

	return (
		<SnackbarContext.Provider value={api}>
			{children}
			<div className={ui.snackHost} aria-live="polite" aria-relevant="additions">
				{items.map((item) => (
					<div
						key={item.id}
						className={cn(
							ui.snack,
							item.variant === 'success' && ui.snackSuccess,
							item.variant === 'error' && ui.snackError
						)}
						role={item.variant === 'error' ? 'alert' : 'status'}
						onMouseEnter={() => clearTimer(item.id)}
						onMouseLeave={() => armTimer(item)}
						onFocus={() => clearTimer(item.id)}
						onBlur={() => armTimer(item)}
					>
						<p className="flex-1 min-w-0 m-0 text-[0.92rem] leading-[1.35] [overflow-wrap:anywhere]">
							{item.message}
						</p>
						{item.action && (
							<button
								type="button"
								className={ui.snackAction}
								onClick={() => {
									item.action?.onClick();
									dismiss(item.id);
								}}
							>
								{item.action.label}
							</button>
						)}
						<button
							type="button"
							className={ui.snackDismiss}
							aria-label="Dismiss"
							onClick={() => dismiss(item.id)}
						>
							×
						</button>
					</div>
				))}
			</div>
		</SnackbarContext.Provider>
	);
}
