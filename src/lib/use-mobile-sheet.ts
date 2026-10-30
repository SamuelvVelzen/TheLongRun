import { useEffect, useState } from 'react';

/** Matches filter sheet / compact UI breakpoint (640px). */
export function useMobileSheet() {
	const [mobile, setMobile] = useState(() =>
		typeof window !== 'undefined' ? window.matchMedia('(max-width: 640px)').matches : false
	);
	useEffect(() => {
		const mq = window.matchMedia('(max-width: 640px)');
		const sync = () => setMobile(mq.matches);
		sync();
		mq.addEventListener('change', sync);
		return () => mq.removeEventListener('change', sync);
	}, []);
	return mobile;
}
