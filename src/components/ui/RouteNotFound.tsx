import { entityFromNotFound, NOT_FOUND_COPY } from '$lib/not-found';
import { cn } from '$lib/ui';
import { Link, type NotFoundRouteProps } from '@tanstack/react-router';
import { Icon } from '../Icon';
import { buttonClass } from './Button';
import { EmptyState } from './EmptyState';
import { PageHero } from './PageHero';

export function RouteNotFound({ data, routeId }: NotFoundRouteProps) {
	const entity = entityFromNotFound(routeId, data);
	const copy = NOT_FOUND_COPY[entity];

	return (
		<div className={cn('mx-auto w-full max-w-[42rem] px-4 py-6 sm:px-6')}>
			<PageHero variant="quiet" kicker={copy.kicker} title={copy.title} lead={copy.lead} />
			<EmptyState
				className="mt-4"
				action={
					<div className="flex flex-wrap gap-2">
						<Link
							to={entity === 'route' ? '/routes' : '/timeline'}
							className={buttonClass({ variant: 'primary', className: 'inline-flex gap-1.5' })}
						>
							<Icon name={entity === 'route' ? 'routes' : 'timeline'} size={16} />
							{entity === 'route' ? 'All routes' : 'Timeline'}
						</Link>
						<Link
							to="/"
							className={buttonClass({ variant: 'ghost', className: 'inline-flex gap-1.5' })}
						>
							<Icon name="home" size={16} />
							Home
						</Link>
					</div>
				}
			>
				<p className="m-0 text-[0.9rem]">Check the link or pick a destination above.</p>
			</EmptyState>
		</div>
	);
}
