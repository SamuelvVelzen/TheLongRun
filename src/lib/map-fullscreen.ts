import { useEffect, useState, type RefObject } from 'react';

export function isMapWrapFullscreen(wrap: HTMLElement | null | undefined): boolean {
	if (!wrap) return false;
	const doc = document as Document & { webkitFullscreenElement?: Element | null };
	return (
		wrap.dataset.mapFullscreen === 'true' ||
		document.fullscreenElement === wrap ||
		doc.webkitFullscreenElement === wrap
	);
}

/** True while this map’s `[data-map-wrap]` is in native or CSS fullscreen. */
export function useMapWrapFullscreen(hostRef: RefObject<HTMLElement | null>): boolean {
	const [fullscreen, setFullscreen] = useState(false);

	useEffect(() => {
		const wrap = hostRef.current?.closest('[data-map-wrap]') as HTMLElement | null;
		if (!wrap) return;

		const sync = () => setFullscreen(isMapWrapFullscreen(wrap));
		const obs = new MutationObserver(sync);
		obs.observe(wrap, { attributes: true, attributeFilter: ['data-map-fullscreen'] });
		document.addEventListener('fullscreenchange', sync);
		document.addEventListener('webkitfullscreenchange', sync);
		sync();

		return () => {
			obs.disconnect();
			document.removeEventListener('fullscreenchange', sync);
			document.removeEventListener('webkitfullscreenchange', sync);
		};
	}, [hostRef]);

	return fullscreen;
}
