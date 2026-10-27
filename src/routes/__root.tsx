import { AuthProvider, SignInLink, useAuthed } from '$lib/auth';
import { registerPwa } from '$lib/pwa';
import { getAuthState } from '$lib/server/functions';
import { applyTheme, getTheme, themeInitScript } from '$lib/theme';
import { appTitle } from '$lib/title';
import { appHeader, appScroll, appShell, stickyChrome, tabBar } from '$lib/shell-layout';
import { cn } from '$lib/ui';
import { appCanScrollTo, getAppScrollElement, scrollAppTo } from '$lib/viewport';
import {
	createRootRoute,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useElementScrollRestoration,
	useRouterState
} from '@tanstack/react-router';
import {
	useEffect,
	useLayoutEffect,
	type MouseEvent,
	type MouseEventHandler,
	type ReactNode
} from 'react';
import '../app.css';
import { Icon } from '../components/Icon';
import {
	LiveLocationMenuItem,
	LiveLocationShare,
	LiveShareBanner
} from '../components/LiveLocationShare';
import { NetworkStatus } from '../components/NetworkStatus';
import { PwaInstall } from '../components/PwaInstall';
import { ScrollToTop } from '../components/ScrollToTop';
import { destructiveNavLinkClass, SnackbarProvider } from '../components/ui';
import { ThemeToggle } from '../components/ThemeToggle';

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1, viewport-fit=cover'
			},
			{ title: appTitle() },
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

const menuLinks = [
	{ href: '/gear', label: 'Gear', icon: 'shoe' },
	{ href: '/fuel', label: 'Fuel', icon: 'fuel' },
	{ href: '/profile', label: 'Settings', icon: 'gear' }
] as const;

const tabs = [
	{ href: '/', label: 'Home', icon: 'home', primary: false },
	{ href: '/timeline', label: 'Timeline', icon: 'timeline', primary: false },
	{ href: '/coach', label: 'Coach', icon: 'coach', primary: true },
	{ href: '/routes', label: 'Routes', icon: 'routes', primary: false },
	{ href: '/goals', label: 'Goals', icon: 'trophy', primary: false }
] as const;

const navLink =
	'inline-flex items-center gap-1.5 min-h-11 px-3 py-[0.45rem] rounded-full text-muted whitespace-nowrap transition-colors duration-150 hover:text-fg hover:bg-panel data-[status=active]:text-fg! data-[status=active]:bg-panel!';
const navCoach =
	'inline-flex items-center gap-1.5 min-h-11 px-3 py-[0.45rem] rounded-full text-muted whitespace-nowrap transition-colors duration-150 hover:text-fg hover:bg-panel data-[status=active]:text-accent-ink! data-[status=active]:bg-accent!';
const tabItem =
	'group flex-1 flex flex-col items-center justify-center gap-[0.12rem] min-w-0 min-h-11 p-[0.2rem_0.15rem] rounded-xl text-muted bg-transparent cursor-pointer transition-colors duration-150 hover:text-fg active:text-fg data-[status=active]:text-accent-fg! data-[status=active]:hover:text-accent-fg';
const tabItemPrimary = cn(tabItem, 'text-accent-fg');
const tabMoreLink =
	'flex items-center gap-[0.65rem] min-h-11 px-[0.9rem] py-[0.55rem] rounded-xl text-muted transition-colors duration-150 hover:text-fg hover:bg-panel data-[status=active]:text-fg! data-[status=active]:bg-panel! active:text-fg active:bg-panel';
const tabMoreButton = cn(
	tabMoreLink,
	'flex w-full border-0 bg-transparent text-left cursor-pointer'
);

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
		<AuthProvider authed={auth.authed} bodyAreas={auth.bodyAreas}>
			<RootShell />
		</AuthProvider>
	);
}

function RootShell() {
	const authed = useAuthed();
	useEffect(() => {
		applyTheme(getTheme());
		registerPwa();
	}, []);
	return (
		<RootDocument>
			<SnackbarProvider>
				<LiveLocationShare />
				<ScrollRestore />
				<ScrollToTop />
				<div data-app-shell className={appShell}>
					<header
						data-app-header
						className={cn(stickyChrome, appHeader, 'has-[details[open]]:z-50')}
					>
						<Link
							to="/"
							className="shrink-0 font-display font-extrabold text-[1.35rem] tracking-[-0.04em] max-sm:text-[1.15rem] max-sm:py-[0.15rem] [&_span]:text-accent-fg"
						>
							The Long <span>Run</span>
						</Link>
						<nav
							className="flex flex-1 flex-wrap items-center justify-end gap-[0.35rem] max-sm:hidden"
							aria-label="Primary"
						>
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
							<DesktopProfile />
						</nav>
						<details className="relative group sm:hidden">
							<summary
								className="relative z-[42] inline-flex items-center justify-center size-11 shrink-0 rounded-full text-muted cursor-pointer list-none [&::-webkit-details-marker]:hidden transition-colors duration-150 hover:text-fg hover:bg-panel group-open:text-fg group-open:bg-panel"
								aria-label="Profile"
								title="Profile"
							>
								<Icon name="profile" size={22} />
							</summary>
							<div
								className="fixed inset-0 z-40 cursor-pointer touch-none"
								onClick={closeDetails}
								aria-hidden="true"
							/>
							<div className="absolute right-0 top-[calc(100%+0.35rem)] z-[41] grid min-w-[13rem] gap-[0.2rem] p-[0.45rem] border border-line rounded-box bg-surface shadow-lift max-h-[calc(100dvh-var(--app-header-height)-1.25rem)] overflow-y-auto overscroll-contain">
								<ProfileMenuItems authed={authed} mobile />
							</div>
						</details>
					</header>
					<NetworkStatus />
					<LiveShareBanner />
					<main data-app-scroll className={appScroll}>
						<Outlet />
					</main>
					<nav data-tab-bar className={tabBar} aria-label="Primary">
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
					</nav>
				</div>
			</SnackbarProvider>
		</RootDocument>
	);
}

function ProfileMenuItems({ authed, mobile = false }: { authed: boolean; mobile?: boolean }) {
	return (
		<>
			{authed ? (
				<Link
					to="/import"
					search={{ mode: 'manual' }}
					className={tabMoreLink}
					onClick={closeDetails}
				>
					<Icon name="plus" size={18} />
					Add activity
				</Link>
			) : null}
			{menuLinks.map((l) => (
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
			{authed ? (
				<Link to="/routes/draw" className={tabMoreLink} onClick={closeDetails}>
					<Icon name="map" size={18} />
					Plan route
				</Link>
			) : null}
			{mobile ? <PwaInstall className={tabMoreLink} /> : null}
			<LiveLocationMenuItem className={tabMoreButton} onClick={closeDetails} />
			<div className="my-[0.15rem] border-t border-line" />
			<ThemeToggle className={tabMoreButton} showLabel onClick={closeDetails} />
			{authed ? (
				<SignOutLink className={destructiveNavLinkClass()} onClick={closeDetails} />
			) : (
				<SignInLink className={tabMoreLink} onClick={closeDetails}>
					<Icon name="signIn" size={18} />
					Sign in
				</SignInLink>
			)}
		</>
	);
}

function DesktopProfile() {
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
				<Icon name="profile" size={15} />
				Profile
			</summary>
			<div
				className="fixed inset-0 z-40 cursor-pointer"
				onClick={closeDetails}
				aria-hidden="true"
			/>
			<div className="absolute right-0 top-[calc(100%+0.35rem)] z-[41] grid min-w-[13rem] gap-[0.2rem] p-[0.45rem] border border-line rounded-box bg-surface shadow-lift max-h-[calc(100dvh-var(--app-header-height)-1.25rem)] overflow-y-auto overscroll-contain">
				<ProfileMenuItems authed={authed} />
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

/** Re-apply saved window scroll after deferred content makes the page tall enough. */
function ScrollRestore() {
	const locationKey = useRouterState({
		select: (s) => s.location.state.__TSR_key ?? s.location.href
	});
	const entry = useElementScrollRestoration({
		getElement: () => getAppScrollElement()
	});
	const x = entry?.scrollX ?? 0;
	const y = entry?.scrollY ?? 0;

	useLayoutEffect(() => {
		if ((!x && !y) || typeof window === 'undefined' || window.location.hash) return;

		const found = getAppScrollElement();
		if (!found) return;
		const scrollTarget = found;

		let applying = false;
		let userMoved = false;
		let stopped = false;
		let raf = 0;
		let frames = 0;
		let timeout = 0;
		const apply = () => {
			if (stopped || userMoved) return true;
			applying = true;
			scrollAppTo({ top: y, left: x, behavior: 'instant' }, scrollTarget);
			applying = false;
			return appCanScrollTo(y, scrollTarget);
		};

		if (apply()) return;

		const onScroll = () => {
			if (!applying) userMoved = true;
		};
		scrollTarget.addEventListener('scroll', onScroll, { passive: true });

		const ro = new ResizeObserver(() => {
			if (apply()) cleanup();
		});
		if (scrollTarget === window) {
			ro.observe(document.documentElement);
			if (document.body) ro.observe(document.body);
		} else {
			ro.observe(scrollTarget as HTMLElement);
		}
		if (stopped) return cleanup;

		const tick = () => {
			if (apply() || ++frames > 120) {
				cleanup();
				return;
			}
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		timeout = window.setTimeout(() => {
			apply();
			cleanup();
		}, 4000);

		function cleanup() {
			if (stopped) return;
			stopped = true;
			ro.disconnect();
			scrollTarget.removeEventListener('scroll', onScroll);
			cancelAnimationFrame(raf);
			window.clearTimeout(timeout);
		}

		return cleanup;
	}, [locationKey, x, y]);

	return null;
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
