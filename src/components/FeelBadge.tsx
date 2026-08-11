/** Small badge marking an activity that carries subjective "how it felt" context. */
export function FeelBadge() {
	return (
		<span className="feel-badge" title="Has how-it-felt notes" aria-label="Has feel notes">
			<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
				<path
					fill="currentColor"
					d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1zm3 5h10V7.5H7V9zm0 3.5h7V11H7v1.5z"
				/>
			</svg>
		</span>
	);
}
