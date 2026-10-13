import { Actions, Button, Panel } from '../components/ui';
import { createContext, useContext, type MouseEventHandler, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import type { BodyArea } from './body-scores';
import { cn } from './ui';

const AuthContext = createContext(false);
const BodyAreasContext = createContext<BodyArea[]>([]);

export function AuthProvider({
	authed,
	bodyAreas,
	children
}: {
	authed: boolean;
	bodyAreas: BodyArea[];
	children: ReactNode;
}) {
	return (
		<AuthContext.Provider value={authed}>
			<BodyAreasContext.Provider value={bodyAreas}>{children}</BodyAreasContext.Provider>
		</AuthContext.Provider>
	);
}

export function useAuthed(): boolean {
	return useContext(AuthContext);
}

/** Open body notes from Profile — each gets a 0–10 score per activity. */
export function useBodyAreas(): BodyArea[] {
	return useContext(BodyAreasContext);
}

export function loginHref(next?: string): string {
	if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/login')) {
		return '/login';
	}
	return `/login?next=${encodeURIComponent(next)}`;
}

export function SignInLink({
	className,
	children,
	next,
	onClick,
	'aria-label': ariaLabel,
	title
}: {
	className?: string;
	children?: ReactNode;
	next?: string;
	onClick?: MouseEventHandler<HTMLAnchorElement>;
	'aria-label'?: string;
	title?: string;
}) {
	const here = useRouterState({
		select: (s) => `${s.location.pathname}${s.location.searchStr}`
	});
	const href = loginHref(next ?? here);
	return (
		<a
			href={href}
			className={className}
			aria-label={ariaLabel}
			title={title ?? ariaLabel}
			onClick={(e) => {
				onClick?.(e);
				if (
					e.defaultPrevented ||
					e.button !== 0 ||
					e.metaKey ||
					e.ctrlKey ||
					e.shiftKey ||
					e.altKey
				) {
					return;
				}
				e.preventDefault();
				window.location.assign(href);
			}}
		>
			{children ?? 'Sign in'}
		</a>
	);
}

export function AuthGate({
	children,
	fallback = null
}: {
	children: ReactNode;
	fallback?: ReactNode;
}) {
	return useAuthed() ? children : fallback;
}

export function SignInPanel({ title, body }: { title: string; body?: string }) {
	const here = useRouterState({
		select: (s) => `${s.location.pathname}${s.location.searchStr}`
	});
	const href = loginHref(here);

	return (
		<Panel form>
			<h2 className="m-0">{title}</h2>
			<p className={cn('text-muted', 'mt-[0.35rem] mb-0')}>
				{body ?? 'Sign in to add, edit, or delete.'}
			</p>
			<Actions>
				<Button type="button" onClick={() => window.location.assign(href)}>
					Sign in
				</Button>
			</Actions>
		</Panel>
	);
}
