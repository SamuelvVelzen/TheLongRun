import '../app.css';
import type { MouseEvent, ReactNode } from 'react';
import { Outlet, createRootRoute, HeadContent, Scripts, Link } from '@tanstack/react-router';
import { cn } from '$lib/ui';

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
			{ title: 'The Long Run' },
			{ name: 'description', content: 'Personal run log' }
		]
	}),
	component: RootComponent
});

const headerLinks = [
	{ href: '/', label: 'Dashboard' },
	{ href: '/timeline', label: 'Timeline' },
	{ href: '/routes', label: 'Routes' },
	{ href: '/coach', label: 'Coach' },
	{ href: '/import', label: 'Add activity' },
	{ href: '/context', label: 'Context' }
] as const;

const moreLinks = [
	{ href: '/import', label: 'Add activity' },
	{ href: '/context', label: 'Context' }
] as const;

const PLAN_ROUTE_HREF = 'https://brouter.de/brouter-web/';

const tabs = [
	{ href: '/', label: 'Home', icon: 'home', primary: false },
	{ href: '/timeline', label: 'Timeline', icon: 'timeline', primary: false },
	{ href: '/coach', label: 'Coach', icon: 'coach', primary: true },
	{ href: '/routes', label: 'Routes', icon: 'routes', primary: false }
] as const;

const navLink =
	'inline-flex items-center min-h-11 px-3 py-[0.45rem] rounded-full text-muted whitespace-nowrap transition-colors duration-150 hover:text-fg hover:bg-panel data-[status=active]:text-fg data-[status=active]:bg-panel';
const navCoach =
	'inline-flex items-center min-h-11 px-3 py-[0.45rem] rounded-full text-accent whitespace-nowrap transition-colors duration-150 hover:text-accent-ink hover:bg-accent data-[status=active]:text-accent-ink data-[status=active]:bg-accent';
const tabItem =
	'group flex-1 flex flex-col items-center justify-center gap-[0.12rem] min-w-0 min-h-11 p-[0.2rem_0.15rem] rounded-xl text-muted bg-transparent cursor-pointer transition-colors duration-150 hover:text-fg active:text-fg data-[status=active]:text-accent data-[status=active]:hover:text-accent';
const tabItemPrimary = cn(tabItem, 'text-accent');
const tabMoreLink =
	'flex items-center min-h-11 px-[0.9rem] py-[0.55rem] rounded-xl text-muted transition-colors duration-150 hover:text-fg hover:bg-panel data-[status=active]:text-fg data-[status=active]:bg-panel active:text-fg active:bg-panel';

function closeDetails(e: MouseEvent<HTMLElement>) {
	const details = e.currentTarget.closest('details');
	if (!details) return;
	// Close after the click so TanStack Link can navigate first.
	requestAnimationFrame(() => {
		details.open = false;
	});
}

function RootComponent() {
	return (
		<RootDocument>
			<div className="relative z-1 flex flex-1 flex-col w-[min(1120px,calc(100%-2rem))] min-h-dvh mx-auto pt-5 pr-[env(safe-area-inset-right,0px)] pb-[calc(4rem+env(safe-area-inset-bottom,0px))] pl-[env(safe-area-inset-left,0px)] max-sm:w-[min(1120px,calc(100%-1.25rem))] max-sm:pt-[0.85rem] max-sm:pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))]">
				<header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-8 pt-[calc(0.85rem+env(safe-area-inset-top,0px))] pb-[0.85rem] border-b border-line max-sm:justify-start max-sm:gap-0 max-sm:mb-4 max-sm:pt-[max(0.45rem,env(safe-area-inset-top,0px))] max-sm:pb-[0.45rem]">
					<Link
						to="/"
						className="shrink-0 font-display font-extrabold text-[1.35rem] tracking-[-0.04em] max-sm:text-[1.15rem] max-sm:py-[0.15rem] [&_span]:text-accent"
					>
						The Long <span>Run</span>
					</Link>
					<nav className="flex flex-1 flex-wrap items-center justify-end gap-[0.35rem] max-sm:hidden" aria-label="Primary">
						{headerLinks.map((l) => (
							<Link
								key={l.href}
								to={l.href}
								className={l.href === '/coach' ? navCoach : navLink}
								activeOptions={{ exact: l.href === '/' }}
							>
								{l.label}
							</Link>
						))}
						<a href={PLAN_ROUTE_HREF} target="_blank" rel="noreferrer noopener" className={navLink}>
							Plan route ↗
						</a>
					</nav>
				</header>
				<Outlet />
				<nav
					className="hidden max-sm:flex items-stretch justify-around fixed inset-x-0 bottom-0 z-40 gap-[0.15rem] min-h-[calc(3.5rem+env(safe-area-inset-bottom,0px))] pt-[0.3rem] pl-[max(0.35rem,env(safe-area-inset-left,0px))] pr-[max(0.35rem,env(safe-area-inset-right,0px))] pb-[calc(0.3rem+env(safe-area-inset-bottom,0px))] border-t border-line bg-[rgba(16,20,15,0.96)] shadow-[0_-12px_32px_rgba(0,0,0,0.28)]"
					aria-label="Primary"
				>
					{tabs.map((tab) => (
						<Link
							key={tab.href}
							to={tab.href}
							className={tab.primary ? tabItemPrimary : tabItem}
							activeOptions={{ exact: tab.href === '/' }}
						>
							<span
								className={cn(
									'flex items-center justify-center size-6 leading-[0]',
									tab.primary &&
										'size-11 -mt-[1.15rem] rounded-full bg-accent text-accent-ink shadow-[0_8px_18px_rgba(0,0,0,0.35)] group-data-[status=active]:shadow-[0_0_0_3px_rgba(200,242,90,0.22),0_8px_18px_rgba(0,0,0,0.35)]'
								)}
							>
								<TabIcon name={tab.icon} />
							</span>
							<span className="text-[0.68rem] font-semibold tracking-[0.01em] leading-none whitespace-nowrap">
								{tab.label}
							</span>
						</Link>
					))}
					<details className="relative flex-1 min-w-0 group">
						<summary className={cn(tabItem, 'list-none w-full [&::-webkit-details-marker]:hidden group-has-[a[data-status=active]]:text-accent')}>
							<span className="flex items-center justify-center size-6 leading-[0]">
								<TabIcon name="more" />
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
							{moreLinks.map((l) => (
								<Link key={l.href} to={l.href} className={tabMoreLink} onClick={closeDetails}>
									{l.label}
								</Link>
							))}
							<a
								href={PLAN_ROUTE_HREF}
								target="_blank"
								rel="noreferrer noopener"
								className={tabMoreLink}
							>
								Plan route ↗
							</a>
						</div>
					</details>
				</nav>
			</div>
		</RootDocument>
	);
}

function TabIcon({ name }: { name: 'home' | 'timeline' | 'import' | 'routes' | 'more' | 'coach' }) {
	const common = {
		width: 22,
		height: 22,
		viewBox: '0 0 24 24',
		fill: 'none',
		stroke: 'currentColor',
		strokeWidth: 1.8,
		strokeLinecap: 'round' as const,
		strokeLinejoin: 'round' as const,
		'aria-hidden': true
	};

	switch (name) {
		case 'home':
			return (
				<svg {...common}>
					<path d="M4 11 12 4l8 7" />
					<path d="M6 10.5V20h4.5v-6h3V20H18v-9.5" />
				</svg>
			);
		case 'timeline':
			return (
				<svg {...common}>
					<path d="M8 6h12M8 12h12M8 18h12" />
					<circle cx="4.2" cy="6" r="1.1" fill="currentColor" stroke="none" />
					<circle cx="4.2" cy="12" r="1.1" fill="currentColor" stroke="none" />
					<circle cx="4.2" cy="18" r="1.1" fill="currentColor" stroke="none" />
				</svg>
			);
		case 'coach':
			return (
				<svg {...common}>
					<path d="M5 19V8.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2V19" />
					<path d="M9 6.5V5a3 3 0 0 1 6 0v1.5" />
					<path d="M9 12h6M9 15.5h4" />
				</svg>
			);
		case 'import':
			return (
				<svg {...common}>
					<path d="M12 3v10" />
					<path d="m8 9 4 4 4-4" />
					<path d="M5 18h14" />
					<path d="M5 21h14" />
				</svg>
			);
		case 'routes':
			return (
				<svg {...common}>
					<circle cx="6.5" cy="6.5" r="2.2" />
					<circle cx="17.5" cy="17.5" r="2.2" />
					<path d="M8.4 8.2c2.4 0 2.6 3.6 5.2 3.6 1.6 0 2.6-.8 3.4-1.8" />
				</svg>
			);
		case 'more':
			return (
				<svg {...common}>
					<circle cx="6" cy="12" r="1.35" fill="currentColor" stroke="none" />
					<circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
					<circle cx="18" cy="12" r="1.35" fill="currentColor" stroke="none" />
				</svg>
			);
	}
}

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
