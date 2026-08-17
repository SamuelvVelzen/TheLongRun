import '../app.css';
import '../components.css';
import type { MouseEvent, ReactNode } from 'react';
import { Outlet, createRootRoute, HeadContent, Scripts, Link } from '@tanstack/react-router';
import { RoutePending } from '../components/RoutePending';

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
			{ title: 'The Long Run' },
			{ name: 'description', content: 'Personal run log' }
		]
	}),
	pendingComponent: RoutePending,
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
			<div className="shell">
				<header className="nav">
					<Link to="/" className="brand">
						The Long <span>Run</span>
					</Link>
					<nav className="nav-links" aria-label="Primary">
						{headerLinks.map((l) => (
							<Link
								key={l.href}
								to={l.href}
								className={l.href === '/coach' ? 'nav-coach' : undefined}
								activeProps={{ className: l.href === '/coach' ? 'nav-coach active' : 'active' }}
								activeOptions={{ exact: l.href === '/' }}
							>
								{l.label}
							</Link>
						))}
						<a
							href={PLAN_ROUTE_HREF}
							target="_blank"
							rel="noreferrer noopener"
							className="nav-external"
						>
							Plan route ↗
						</a>
					</nav>
				</header>
				<Outlet />
				<nav className="tab-bar" aria-label="Primary">
					{tabs.map((tab) => (
						<Link
							key={tab.href}
							to={tab.href}
							className={tab.primary ? 'tab-item tab-item-primary' : 'tab-item'}
							activeProps={{
								className: tab.primary ? 'tab-item tab-item-primary active' : 'tab-item active'
							}}
							activeOptions={{ exact: tab.href === '/' }}
						>
							<span className="tab-icon">
								<TabIcon name={tab.icon} />
							</span>
							<span className="tab-label">{tab.label}</span>
						</Link>
					))}
					<details className="tab-more">
						<summary className="tab-item">
							<span className="tab-icon">
								<TabIcon name="more" />
							</span>
							<span className="tab-label">More</span>
						</summary>
						<div className="tab-more-scrim" onClick={closeDetails} aria-hidden="true" />
						<div className="tab-more-menu">
							{moreLinks.map((l) => (
								<Link
									key={l.href}
									to={l.href}
									activeProps={{ className: 'active' }}
									onClick={closeDetails}
								>
									{l.label}
								</Link>
							))}
							<a
								href={PLAN_ROUTE_HREF}
								target="_blank"
								rel="noreferrer noopener"
								className="nav-external"
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
