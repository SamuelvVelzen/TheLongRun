import { Await } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { RoutePending } from './RoutePending';

/** Resolve deferred loader data without remounting the page chrome. */
export function DeferredData<T>({
	promise,
	children
}: {
	promise: Promise<T>;
	children: (data: T) => ReactNode;
}) {
	return (
		<Await promise={promise} fallback={<RoutePending />}>
			{children}
		</Await>
	);
}
