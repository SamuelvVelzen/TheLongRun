/** Spinner for deferred page data — not a second copy of the title. */
export function RoutePending() {
	return (
		<div
			className="flex-1 flex flex-col items-center justify-center gap-[0.85rem] min-h-[min(14rem,40dvh)] p-[1.5rem_1rem_2.5rem] text-center"
			role="status"
			aria-live="polite"
		>
			<span
				className="size-[1.85rem] border-2 border-line border-t-accent rounded-full animate-[route-pending-spin_0.7s_linear_infinite]"
				aria-hidden="true"
			/>
			<p className="font-display font-bold tracking-[-0.02em] text-muted">Loading…</p>
		</div>
	);
}
