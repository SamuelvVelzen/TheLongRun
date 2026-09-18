import { Suspense, use, useRef, type ReactNode } from 'react';
import { RoutePending } from './RoutePending';

/** Resolve deferred loader data without remounting the page chrome. */
export function DeferredData<T>({
	promise,
	children
}: {
	promise: Promise<T>;
	children: (data: T) => ReactNode;
}) {
	const prev = useRef<T | null>(null);
	return (
		<Suspense fallback={prev.current != null ? children(prev.current) : <RoutePending />}>
			<Resolved promise={promise} prev={prev}>
				{children}
			</Resolved>
		</Suspense>
	);
}

function Resolved<T>({
	promise,
	prev,
	children
}: {
	promise: Promise<T>;
	prev: { current: T | null };
	children: (data: T) => ReactNode;
}) {
	const data = use(promise);
	prev.current = data;
	return children(data);
}
