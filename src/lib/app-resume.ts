/** Run when the user returns to this tab or standalone PWA (incl. iOS home-screen resume). */
export function subscribeAppResume(onResume: () => void): () => void {
	if (typeof window === 'undefined') return () => {};

	const onVisibility = () => {
		if (document.visibilityState === 'visible') onResume();
	};

	window.addEventListener('pageshow', onResume);
	window.addEventListener('focus', onResume);
	document.addEventListener('visibilitychange', onVisibility);

	return () => {
		window.removeEventListener('pageshow', onResume);
		window.removeEventListener('focus', onResume);
		document.removeEventListener('visibilitychange', onVisibility);
	};
}
