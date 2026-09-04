import { AuthProvider, SignInLink, useAuthed } from '$lib/auth';
import { getAuthState } from '$lib/server/functions';
import { applyTheme, getTheme, themeInitScript } from '$lib/theme';
import { cn } from '$lib/ui';
import { createRootRoute, HeadContent, Link, Outlet, Scripts } from '@tanstack/react-router';
import { useEffect, type MouseEvent, type MouseEventHandler, type ReactNode } from 'react';
import '../app.css';
import { Icon } from '../components/Icon';
import { PwaInstall } from '../components/PwaInstall';
import { SnackbarProvider } from '../components/Snackbar';
import { ThemeToggle } from '../components/ThemeToggle';

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{
				name: 'viewport',
				content:
					'width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content'
			},
			{ title: 'The Long Run' },
			{ name: 'description', content: 'Personal run log' },
			{ name: 'theme-color', content: '#10140f' },
			{ name: 'color-scheme', content: 'dark' },
			{ name: 'mobile-web-app-capable', content: 'yes' },
			{ name: 'apple-mobile-web-app-capable', content: 'yes' },
			{ name: 'apple-mobile-web-app-title', content: 'Long Run' },
			{ name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' }
		],
		links: [
			{ rel: 'manifest', href: '/manifest.webmanifest' },
			{ rel: 'icon', href: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
			{ rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' },
			{ rel: 'apple-touch-icon', href: '/apple-touch-icon.png' }
		]
	}),
	loader: () => getAuthState(),
	component: RootComponent
});

const headerLinks = [
	{ href: '/', label: 'Dashboard', icon: 'home' },
	{ href: '/timeline', label: 'Timeline', icon: 'timeline' },
	{ href: '/coach', label: 'Coach', icon: 'coach' },
	{ href: '/routes', label: 'Routes', icon: 'routes' },
	{ href: '/goals', label: 'Goals', icon: 'trophy' }
] as const;

const moreLinks = [
	{ href: '/goals', label: 'Goals', icon: 'trophy' },
	{ href: '/import', label: 'Add activity', icon: 'plus' },
	{ href: '/context', label: 'Context', icon: 'context' }
] as const;

const desktopMoreLinks = [{ href: '/context', label: 'Context', icon: 'context' }] as const;

const PLAN_ROUTE_HREF = 'https://brouter.de/brouter-web/';

const tabs = [
	{ href: '/', label: 'Home', icon: 'home', primary: false },
	{ href: '/timeline', label: 'Timeline', icon: 'timeline', primary: false },
	{ href: '/coach', label: 'Coach', icon: 'coach', primary: true },
	{ href: '/routes', label: 'Routes', icon: 'routes', primary: false }
] as const;

const navLink =
	'inline-flex items-center gap-1.5 min-h-11 px-3 py-[0.45rem] rounded-full text-muted whitespace-nowrap transition-colors duration-150 hover:text-fg hover:bg-panel data-[status=active]:text-fg! data-[status=active]:bg-panel!';
const navCoach =
	'inline-flex items-center gap-1.5 min-h-11 px-3 py-[0.45rem] rounded-full text-muted whitespace-nowrap transition-colors duration-150 hover:text-fg hover:bg-panel data-[status=active]:text-accent-ink! data-[status=active]:bg-accent!';
const navAuth =
	'inline-flex items-center justify-center size-11 shrink-0 rounded-full text-muted transition-colors duration-150 hover:text-fg hover:bg-panel';
const navAdd =
	'inline-flex items-center justify-center size-11 shrink-0 rounded-full bg-accent text-accent-ink transition-[opacity,box-shadow] duration-150 hover:opacity-90 data-[status=active]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_28%,transparent)]';
const tabItem =
	'group flex-1 flex flex-col items-center justify-center gap-[0.12rem] min-w-0 min-h-11 p-[0.2rem_0.15rem] rounded-xl text-muted bg-transparent cursor-pointer transition-colors duration-150 hover:text-fg active:text-fg data-[status=active]:text-accent-fg! data-[status=active]:hover:text-accent-fg';
const tabItemPrimary = cn(tabItem, 'text-accent-fg');
const tabMoreLink =
	'flex items-center gap-[0.65rem] min-h-11 px-[0.9rem] py-[0.55rem] rounded-xl text-muted transition-colors duration-150 hover:text-fg hover:bg-panel data-[status=active]:text-fg! data-[status=active]:bg-panel! active:text-fg active:bg-panel';

function closeDetails(e: MouseEvent<HTMLElement>) {
	const details = e.currentTarget.closest('details');
	if (!details) return;
	// Close after the click so TanStack Link can navigate first.
	requestAnimationFrame(() => {
		details.open = false;
	});
}

function RootComponent() {
	const auth = Route.useLoaderData();
	return (
		<AuthProvider authed={auth.authed}>
			<RootShell />
		</AuthProvider>
	);
}

function RootShell() {
	const authed = useAuthed();
	const extra = moreLinks.filter((l) => authed || l.href !== '/import');
	useEffect(() => {
		applyTheme(getTheme());
		if ('serviceWorker' in navigator) {
			void navigator.serviceWorker.register('/sw.js');
		}
	}, []);
	return (
		<RootDocument>
			<SnackbarProvider>
			<div className="app-shell relative z-1 flex flex-1 flex-col w-[min(1120px,calc(100%-2rem))] min-h-dvh mx-auto pt-5 pr-[env(safe-area-inset-right,0px)] pb-[calc(4rem+env(safe-area-inset-bottom,0px))] pl-[env(safe-area-inset-left,0px)] max-sm:w-[min(1120px,calc(100%-1.25rem))] max-sm:pt-[var(--app-shell-pad-top)] max-sm:pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]">
				<header className="app-header flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-8 pt-[calc(0.85rem+env(safe-area-inset-top,0px))] pb-[0.85rem] border-b border-line max-sm:mb-0">
					<Link
						to="/"
						className="shrink-0 font-display font-extrabold text-[1.35rem] tracking-[-0.04em] max-sm:text-[1.15rem] max-sm:py-[0.15rem] [&_span]:text-accent-fg"
					>
						The Long <span>Run</span>
					</Link>
					<nav className="flex flex-1 flex-wrap items-center justify-end gap-[0.35rem] max-sm:hidden" aria-label="Primary">
						{headerLinks.map((l) => (
							<Link
								key={l.href}
								to={l.href}
								className={l.href === '/coach' ? navCoach : navLink}
								activeOptions={{ exact: l.href === '/', includeSearch: false }}
							>
								<Icon name={l.icon} size={15} />
								{l.label}
							</Link>
						))}
						<DesktopMore />
					</nav>
					<div className="flex items-center gap-[0.35rem] shrink-0">
						<ThemeToggle className={navAuth} />
						{authed ? (
							<Link
								to="/import"
								className={navAdd}
								aria-label="Add activity"
								title="Add activity"
								activeOptions={{ includeSearch: false }}
							>
								<Icon name="plus" size={20} />
							</Link>
						) : (
							<AuthNavIcon />
						)}
					</div>
				</header>
				<Outlet />
				<nav
					className="tab-bar hidden max-sm:flex items-stretch justify-around fixed inset-x-0 bottom-0 z-40 gap-[0.15rem] min-h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] pt-[0.3rem] pl-[max(0.35rem,env(safe-area-inset-left,0px))] pr-[max(0.35rem,env(safe-area-inset-right,0px))] pb-[calc(0.3rem+env(safe-area-inset-bottom,0px))] border-t border-line"
					aria-label="Primary"
				>
					{tabs.map((tab) => (
						<Link
							key={tab.href}
							to={tab.href}
							className={tab.primary ? tabItemPrimary : tabItem}
							activeOptions={{ exact: tab.href === '/', includeSearch: false }}
						>
							<span
								className={cn(
									'flex items-center justify-center size-6 leading-[0]',
									tab.primary &&
									'size-11 -mt-[1.15rem] rounded-full bg-accent text-accent-ink shadow-[0_8px_18px_rgba(0,0,0,0.35)] group-data-[status=active]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_22%,transparent),0_8px_18px_rgba(0,0,0,0.35)]'
								)}
							>
								<Icon name={tab.icon} size={22} />
							</span>
							<span className="text-[0.68rem] font-semibold tracking-[0.01em] leading-none whitespace-nowrap">
								{tab.label}
							</span>
						</Link>
					))}
					<details className="relative flex-1 min-w-0 group">
						<summary className={cn(tabItem, 'list-none w-full [&::-webkit-details-marker]:hidden group-has-[a[data-status=active]]:text-accent-fg')}>
							<span className="flex items-center justify-center size-6 leading-[0]">
								<Icon name="more" size={22} />
							</span>
							<span className="text-[0.68rem] font-semibold tracking-[0.01em] leading-none whitespace-nowrap">
								More
							</span>
						</summary>
						<div
							className="fixed inset-0 z-40 bg-black/45 cursor-pointer"
							onClick={closeDetails}
							aria-hidden="true"
						/>
						<div className="fixed left-3 right-3 bottom-[calc(5.1rem+env(safe-area-inset-bottom,0px))] z-[41] grid gap-[0.2rem] p-[0.45rem] border border-line rounded-box bg-surface shadow-lift">
							{extra.map((l) => (
								<Link
									key={l.href}
									to={l.href}
									className={tabMoreLink}
									activeOptions={{ includeSearch: false }}
									onClick={closeDetails}
								>
									<Icon name={l.icon} size={18} />
									{l.label}
								</Link>
							))}
							<a
								href={PLAN_ROUTE_HREF}
								target="_blank"
								rel="noreferrer noopener"
								className={tabMoreLink}
							>
								<Icon name="map" size={18} />
								Plan route
								<Icon name="external" size={13} className="ml-auto opacity-70" />
							</a>
							<PwaInstall className={tabMoreLink} />
							{authed ? (
								<>
									<div className="my-[0.15rem] border-t border-line" />
									<SignOutLink className={tabMoreLink} onClick={closeDetails} />
								</>
							) : null}
						</div>
					</details>
				</nav>
			</div>
			</SnackbarProvider>
		</RootDocument>
	);
}

function DesktopMore() {
	const authed = useAuthed();
	return (
		<details className="relative z-50 group">
			<summary
				className={cn(
					navLink,
					'relative z-[42] list-none cursor-pointer [&::-webkit-details-marker]:hidden',
					'group-open:text-fg group-open:bg-panel',
					'group-has-[a[data-status=active]]:text-fg group-has-[a[data-status=active]]:bg-panel'
				)}
			>
				<Icon name="more" size={15} />
				More
			</summary>
			<div className="fixed inset-0 z-40 cursor-pointer" onClick={closeDetails} aria-hidden="true" />
			<div className="absolute right-0 top-[calc(100%+0.35rem)] z-[41] grid min-w-[13rem] gap-[0.2rem] p-[0.45rem] border border-line rounded-box bg-surface shadow-lift">
				{desktopMoreLinks.map((l) => (
					<Link
						key={l.href}
						to={l.href}
						className={tabMoreLink}
						activeOptions={{ includeSearch: false }}
						onClick={closeDetails}
					>
						<Icon name={l.icon} size={18} />
						{l.label}
					</Link>
				))}
				<a
					href={PLAN_ROUTE_HREF}
					target="_blank"
					rel="noreferrer noopener"
					className={tabMoreLink}
					onClick={closeDetails}
				>
					<Icon name="map" size={18} />
					Plan route
					<Icon name="external" size={13} className="ml-auto opacity-70" />
				</a>
				{authed ? (
					<>
						<div className="my-[0.15rem] border-t border-line" />
						<SignOutLink className={tabMoreLink} onClick={closeDetails} />
					</>
				) : null}
			</div>
		</details>
	);
}

function SignOutLink({
	className,
	onClick
}: {
	className: string;
	onClick?: MouseEventHandler<HTMLAnchorElement>;
}) {
	return (
		<a
			href="/logout"
			className={className}
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
				window.location.assign('/logout');
			}}
		>
			<Icon name="signOut" size={18} />
			Sign out
		</a>
	);
}

function AuthNavIcon() {
	return (
		<SignInLink className={navAuth} aria-label="Sign in">
			<Icon name="signIn" size={22} />
		</SignInLink>
	);
}

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
				<script dangerouslySetInnerHTML={{ __html: themeInitScript() }} />
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
