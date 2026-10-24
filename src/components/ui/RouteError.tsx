import { cn } from '$lib/ui';
import { Link, type ErrorComponentProps } from '@tanstack/react-router';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Icon } from '../Icon';
import { Button, buttonClass } from './Button';
import { EmptyState } from './EmptyState';
import { PageHero } from './PageHero';

function errorDetail(error: unknown): string {
	if (error instanceof Error) return error.message || error.name;
	if (typeof error === 'string') return error;
	try {
		return JSON.stringify(error);
	} catch {
		return 'Unknown error';
	}
}

export function RouteError({ error, reset }: ErrorComponentProps) {
	const detail = errorDetail(error);
	const showDetail = import.meta.env.DEV;

	return (
		<div className={cn('mx-auto w-full max-w-[42rem] px-4 py-6 sm:px-6')}>
			<PageHero
				variant="quiet"
				kicker="Something went wrong"
				title="This page hit a snag"
				lead="The rest of the app should still work. Try again or head home."
			/>
			<EmptyState
				className="mt-4"
				action={
					<div className="flex flex-wrap gap-2">
						<Button type="button" variant="primary" onClick={() => reset()}>
							Try again
						</Button>
						<Link
							to="/"
							className={buttonClass({ variant: 'ghost', className: 'inline-flex gap-1.5' })}
							onClick={() => reset()}
						>
							<Icon name="home" size={16} />
							Home
						</Link>
					</div>
				}
			>
				{showDetail ? (
					<p className="m-0 font-mono text-[0.82rem] text-fg wrap-break-word">{detail}</p>
				) : (
					<p className="m-0">If this keeps happening, try signing out and back in.</p>
				)}
			</EmptyState>
		</div>
	);
}

type AppErrorBoundaryProps = {
	children: ReactNode;
	onReset?: () => void;
};

/** Catches render errors outside TanStack Router match boundaries (e.g. shell chrome). */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, { error: Error | null }> {
	state = { error: null as Error | null };

	static getDerivedStateFromError(error: Error) {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo) {
		if (import.meta.env.DEV) {
			console.error('[AppErrorBoundary]', error, info.componentStack);
		}
	}

	private reset = () => {
		this.setState({ error: null });
		this.props.onReset?.();
	};

	render() {
		if (this.state.error) {
			return <RouteError error={this.state.error} reset={this.reset} />;
		}
		return this.props.children;
	}
}
