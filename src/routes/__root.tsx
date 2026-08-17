import '../app.css';
import '../components.css';
import type { ReactNode } from 'react';
import { Outlet, createRootRoute, HeadContent, Scripts, Link } from '@tanstack/react-router';

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

const links = [
	{ href: '/', label: 'Dashboard' },
	{ href: '/timeline', label: 'Timeline' },
	{ href: '/routes', label: 'Routes' },
	{ href: '/log', label: 'Log activity' },
	{ href: '/import', label: 'Import' },
	{ href: '/context', label: 'Context' },
	{ href: '/coach', label: 'Coach' }
] as const;

const tabs = [
	{ href: '/', label: 'Home', icon: 'home' },
	{ href: '/timeline', label: 'Timeline', icon: 'timeline' },
	{ href: '/log', label: 'Log', icon: 'log', primary: true },
	{ href: '/routes', label: 'Routes', icon: 'routes' }
] as const;

const moreLinks = [
	{ href: '/import', label: 'Import' },
	{ href: '/context', label: 'Context' },
	{ href: '/coach', label: 'Coach' }
] as const;

function RootComponent() {
	return (
		<RootDocument>
			<div className="shell">
				<header className="nav">
					<Link to="/" className="brand">
						The Long <span>Run</span>
					</Link>
					<nav className="nav-links" aria-label="Primary">
						{links.map((l) => (
							<Link
								key={l.href}
								to={l.href}
								activeProps={{ className: 'active' }}
								activeOptions={{ exact: l.href === '/' }}
							>
								{l.label}
							</Link>
						))}
						<a
							href="https://brouter.de/brouter-web/"
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
							className={tab.primary ? 'tab-item tab-item-log' : 'tab-item'}
							activeProps={{ className: tab.primary ? 'tab-item tab-item-log active' : 'tab-item active' }}
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
						<div className="tab-more-menu">
							{moreLinks.map((l) => (
								<Link
									key={l.href}
									to={l.href}
									activeProps={{ className: 'active' }}
								>
									{l.label}
								</Link>
							))}
							<a
								href="https://brouter.de/brouter-web/"
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

function TabIcon({ name }: { name: 'home' | 'timeline' | 'log' | 'routes' | 'more' }) {
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
		case 'log':
			return (
				<svg {...common}>
					<path d="M12 6v12M6 12h12" />
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
