import './route-pending.css';

/** Spinner for deferred page data — not a second copy of the title. */
export function RoutePending() {
	return (
		<div className="route-pending" role="status" aria-live="polite">
			<span className="route-pending-spinner" aria-hidden="true" />
			<p className="route-pending-label">Loading…</p>
		</div>
	);
}
