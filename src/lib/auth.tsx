import { createContext, useContext, type MouseEventHandler, type ReactNode } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { cn, ui } from './ui';

const AuthContext = createContext(false);

export function AuthProvider({ authed, children }: { authed: boolean; children: ReactNode }) {
	return <AuthContext.Provider value={authed}>{children}</AuthContext.Provider>;
}

export function useAuthed(): boolean {
	return useContext(AuthContext);
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

export function SignInPanel({
	title,
	body
}: {
	title: string;
	body?: string;
}) {
	return (
		<div className={cn(ui.panel, ui.form)}>
			<h2 className="m-0">{title}</h2>
			<p className={cn(ui.muted, 'mt-[0.35rem] mb-0')}>
				{body ?? 'Sign in to add, edit, or delete.'}
			</p>
			<div className={ui.actions}>
				<SignInLink className={ui.btnPrimary}>Sign in</SignInLink>
			</div>
		</div>
	);
}
