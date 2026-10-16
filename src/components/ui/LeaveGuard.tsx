import { useCallback, useRef, useState } from 'react';
import { useBlocker } from '@tanstack/react-router';
import { ConfirmDialog } from './Dialog';

/**
 * Route-level leave guard. Blocks in-app navigation — and browser unload — while the user
 * has unsaved changes, and asks for confirmation first. Render `{guard}` in the page and
 * call `allowNextLeave()` right before a purposeful navigation (e.g. after a save).
 */
export function useLeaveGuard({
	dirty,
	challengeSameRoute,
	title = 'Are you sure?',
	description = "You'll lose any unsaved changes."
}: {
	/** When false the blocker is fully disabled — no dialog, no beforeunload prompt. */
	dirty: boolean;
	/**
	 * Same-route navigations (search-param changes) only get challenged when this returns true,
	 * e.g. switching tabs on a page whose edits survive the switch but deserve a reminder.
	 */
	challengeSameRoute?: (currentSearch: unknown, nextSearch: unknown) => boolean;
	title?: string;
	description?: string;
}) {
	const skipRef = useRef(false);
	const shouldBlock = useCallback(
		(args: {
			current: { pathname: string; search: unknown };
			next: { pathname: string; search: unknown };
		}) => {
			if (skipRef.current) {
				skipRef.current = false;
				return false;
			}
			if (args.next.pathname !== args.current.pathname) return true;
			return challengeSameRoute?.(args.current.search, args.next.search) ?? false;
		},
		[challengeSameRoute]
	);
	const blocker = useBlocker({
		shouldBlockFn: shouldBlock,
		withResolver: true,
		enableBeforeUnload: true,
		disabled: !dirty
	});
	const allowNextLeave = useCallback(() => {
		skipRef.current = true;
	}, []);
	const guard = (
		<ConfirmDialog
			open={blocker.status === 'blocked'}
			title={title}
			description={description}
			confirmLabel="Leave"
			cancelLabel="Keep editing"
			onClose={() => blocker.reset?.()}
			onConfirm={() => blocker.proceed?.()}
		/>
	);
	return { guard, allowNextLeave };
}

/**
 * Dialog close guard. Confirms before discarding in-progress edits: use `requestClose` on
 * every close path (Esc / backdrop / close button / cancel) and render `{guard}` nearby.
 */
export function useDiscardGuard({
	dirty,
	onDiscard,
	busy = false,
	title = 'Discard these changes?',
	description = "You'll lose what you've entered here."
}: {
	/** Whether the dialog holds unsaved or in-progress content. */
	dirty: boolean;
	/** Called on confirmed discard, or immediately when not dirty. */
	onDiscard: () => void;
	/** While busy, all close requests are ignored. */
	busy?: boolean;
	title?: string;
	description?: string;
}) {
	const [pending, setPending] = useState(false);
	const requestClose = useCallback(() => {
		if (busy) return;
		if (dirty) setPending(true);
		else onDiscard();
	}, [busy, dirty, onDiscard]);
	const guard = (
		<ConfirmDialog
			open={pending}
			title={title}
			description={description}
			confirmLabel="Discard"
			cancelLabel="Keep editing"
			onClose={() => setPending(false)}
			onConfirm={onDiscard}
		/>
	);
	return [requestClose, guard] as const;
}
