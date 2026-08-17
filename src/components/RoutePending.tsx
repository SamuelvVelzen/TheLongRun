import './route-pending.css';

/** Content-area pending UI while a route loader runs. Renders inside the shell Outlet. */
export function RoutePending() {
	return (
		<div className="route-pending" role="status" aria-live="polite">
			<span className="route-pending-spinner" aria-hidden="true" />
			<p className="route-pending-label">Loading…</p>
		</div>
	);
}
