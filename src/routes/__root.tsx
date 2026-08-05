import '../app.css';
import '../components.css';
import type { ReactNode } from 'react';
import { Outlet, createRootRoute, HeadContent, Scripts, Link } from '@tanstack/react-router';

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: 'utf-8' },
			{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
			{ title: 'The Long Run' },
			{ name: 'description', content: 'Personal run log' }
		]
	}),
	component: RootComponent
});

const links = [
	{ href: '/', label: 'Dashboard' },
	{ href: '/timeline', label: 'Timeline' },
	{ href: '/log', label: 'Log run' },
	{ href: '/import', label: 'Import' },
	{ href: '/context', label: 'Context' }
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
					</nav>
				</header>
				<Outlet />
			</div>
		</RootDocument>
	);
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
