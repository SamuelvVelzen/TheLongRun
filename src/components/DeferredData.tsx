import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { RoutePending } from './RoutePending';

/** Resolve deferred loader data without remounting the page chrome. */
export function DeferredData<T>({
	promise,
	children
}: {
	promise: Promise<T>;
	children: (data: T) => ReactNode;
}) {
	const [data, setData] = useState<T | null>(null);

	useEffect(() => {
		let cancelled = false;
		void promise.then(
			(next) => {
				if (!cancelled) setData(next);
			},
			() => {
				// Keep showing the last good payload if a background refresh fails.
			}
		);
		return () => {
			cancelled = true;
		};
	}, [promise]);

	if (data === null) return <RoutePending />;
	return children(data);
}
