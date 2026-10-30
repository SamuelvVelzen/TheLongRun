import { createContext, use, useCallback, useEffect, useRef, type ReactNode } from 'react';

type CommitFn = () => void;

type FilterSheetCommitContextValue = {
	register: (fn: CommitFn) => () => void;
	runCommits: () => void;
	sheetOpen: boolean;
};

const FilterSheetCommitContext = createContext<FilterSheetCommitContextValue | null>(null);

export function FilterSheetCommitProvider({
	sheetOpen,
	children
}: {
	sheetOpen: boolean;
	children: ReactNode;
}) {
	const commits = useRef(new Set<CommitFn>());

	const register = useCallback((fn: CommitFn) => {
		commits.current.add(fn);
		return () => {
			commits.current.delete(fn);
		};
	}, []);

	const runCommits = useCallback(() => {
		for (const fn of commits.current) fn();
	}, []);

	return (
		<FilterSheetCommitContext
			value={{ register, runCommits, sheetOpen }}
		>
			{children}
		</FilterSheetCommitContext>
	);
}

export function useFilterSheetCommit(onCommit: () => void, enabled: boolean) {
	const ctx = use(FilterSheetCommitContext);
	useEffect(() => {
		if (!enabled || !ctx) return;
		return ctx.register(onCommit);
	}, [ctx, onCommit, enabled]);
}

export function useFilterSheetCommitActions() {
	return use(FilterSheetCommitContext);
}

/** True while the mobile filter bottom sheet is open — defer URL updates until Done. */
export function useDeferFilterUntilDone() {
	const ctx = use(FilterSheetCommitContext);
	return ctx?.sheetOpen ?? false;
}
