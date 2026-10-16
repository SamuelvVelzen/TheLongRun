import { useEffect } from 'react';

/**
 * Reports a value upward from inside a render-prop (TanStack Form's `Subscribe` children)
 * without side effects during render. Render it inside the selector's child function.
 */
export function ChangeReporter<T>({ value, onChange }: { value: T; onChange: (value: T) => void }) {
	useEffect(() => {
		onChange(value);
	}, [value, onChange]);
	return null;
}
