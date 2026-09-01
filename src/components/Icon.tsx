import { activityLabel, normalizeActivityType, type ActivityType } from '$lib/activity';
import { cn, ui } from '$lib/ui';
import type { ReactNode } from 'react';

export type IconName =
	| 'home'
	| 'timeline'
	| 'coach'
	| 'routes'
	| 'more'
	| 'plus'
	| 'upload'
	| 'context'
	| 'map'
	| 'external'
	| 'filter'
	| 'sparkle'
	| 'calendar'
	| 'board'
	| 'flag'
	| 'copy'
	| 'check'
	| 'download'
	| 'close'
	| 'pencil'
	| 'grid'
	| 'run'
	| 'walk'
	| 'ride'
	| 'swim'
	| 'strength'
	| 'skip'
	| 'circle'
	| 'arrow'
	| 'sun'
	| 'unplanned'
	| 'trophy'
	| 'install'
	| 'signIn'
	| 'signOut';

function Paths({ name }: { name: IconName }) {
	switch (name) {
		case 'home':
			return (
				<>
					<path d="M4 11 12 4l8 7" />
					<path d="M6 10.5V20h4.5v-6h3V20H18v-9.5" />
				</>
			);
		case 'timeline':
			return (
				<>
					<path d="M8 6h12M8 12h12M8 18h12" />
					<circle cx="4.2" cy="6" r="1.1" fill="currentColor" stroke="none" />
					<circle cx="4.2" cy="12" r="1.1" fill="currentColor" stroke="none" />
					<circle cx="4.2" cy="18" r="1.1" fill="currentColor" stroke="none" />
				</>
			);
		case 'coach':
			return (
				<>
					<path d="M5 19V8.5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2V19" />
					<path d="M9 6.5V5a3 3 0 0 1 6 0v1.5" />
					<path d="M9 12h6M9 15.5h4" />
				</>
			);
		case 'routes':
			return (
				<>
					<circle cx="6.5" cy="6.5" r="2.2" />
					<circle cx="17.5" cy="17.5" r="2.2" />
					<path d="M8.4 8.2c2.4 0 2.6 3.6 5.2 3.6 1.6 0 2.6-.8 3.4-1.8" />
				</>
			);
		case 'more':
			return (
				<>
					<circle cx="6" cy="12" r="1.35" fill="currentColor" stroke="none" />
					<circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
					<circle cx="18" cy="12" r="1.35" fill="currentColor" stroke="none" />
				</>
			);
		case 'plus':
			return <path d="M12 5v14M5 12h14" />;
		case 'upload':
			return (
				<>
					<path d="M12 16V5" />
					<path d="m8 9 4-4 4 4" />
					<path d="M5 19h14" />
				</>
			);
		case 'context':
			return (
				<>
					<path d="M7 4h8l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
					<path d="M15 4v5h5M9 13h6M9 17h4" />
				</>
			);
		case 'map':
			return (
				<>
					<path d="M8.5 4.5 15 6.8 21 4.5v14.2l-6.5 2.3L8.5 18.8 3 21.2V7z" />
					<path d="M8.5 4.5v14.3M15 6.8v14.2" />
				</>
			);
		case 'external':
			return (
				<>
					<path d="M14 5h5v5" />
					<path d="M19 5l-9 9" />
					<path d="M19 13.5V18a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V6.5A1.5 1.5 0 0 1 6 5h4.5" />
				</>
			);
		case 'filter':
			return (
				<>
					<path d="M4 7h16M4 12h16M4 17h16" />
					<circle cx="8" cy="7" r="1.55" fill="currentColor" stroke="none" />
					<circle cx="15" cy="12" r="1.55" fill="currentColor" stroke="none" />
					<circle cx="10" cy="17" r="1.55" fill="currentColor" stroke="none" />
				</>
			);
		case 'sparkle':
			return (
				<>
					<path d="M12 3.2 13.5 9.2 19.8 10.5 13.5 11.8 12 17.8 10.5 11.8 4.2 10.5 10.5 9.2z" />
					<path d="M18.2 14.2 18.9 16.5 21.2 17.2 18.9 17.9 18.2 20.2 17.5 17.9 15.2 17.2 17.5 16.5z" />
				</>
			);
		case 'calendar':
			return (
				<>
					<rect x="4" y="6" width="16" height="14" rx="2" />
					<path d="M8 4v4M16 4v4M4 11h16" />
				</>
			);
		case 'board':
			return (
				<>
					<rect x="3.5" y="4.5" width="5" height="15" rx="1.2" />
					<rect x="9.5" y="4.5" width="5" height="10" rx="1.2" />
					<rect x="15.5" y="4.5" width="5" height="12.5" rx="1.2" />
				</>
			);
		case 'flag':
			return (
				<>
					<path d="M6 21V5" />
					<path d="M6 5h11l-2.3 3.6L17 12.2H6" />
				</>
			);
		case 'copy':
			return (
				<>
					<rect x="8.5" y="8.5" width="11" height="11" rx="2" />
					<path d="M15.5 8.5V6.5A2 2 0 0 0 13.5 4.5h-7A2 2 0 0 0 4.5 6.5v7A2 2 0 0 0 6.5 15.5h2" />
				</>
			);
		case 'check':
			return <path d="M5 12.5 9.5 17 19 7.5" />;
		case 'download':
			return (
				<>
					<path d="M12 4v11" />
					<path d="m8 11 4 4 4-4" />
					<path d="M5 19h14" />
				</>
			);
		case 'close':
			return <path d="M6 6l12 12M18 6 6 18" />;
		case 'pencil':
			return (
				<>
					<path d="M13.2 5.8 18.2 10.8" />
					<path d="M4 20l.9-4.6L15 5.3a1.7 1.7 0 0 1 2.4 0l1.3 1.3a1.7 1.7 0 0 1 0 2.4L8.6 19.1 4 20z" />
				</>
			);
		case 'grid':
			return (
				<>
					<rect x="4.5" y="4.5" width="6" height="6" rx="1.2" />
					<rect x="13.5" y="4.5" width="6" height="6" rx="1.2" />
					<rect x="4.5" y="13.5" width="6" height="6" rx="1.2" />
					<rect x="13.5" y="13.5" width="6" height="6" rx="1.2" />
				</>
			);
		case 'run':
			return (
				<>
					<circle cx="13.6" cy="4.6" r="1.7" fill="currentColor" stroke="none" />
					<path d="M8.2 21 11 13.4l2.3 2.2L15.8 21" />
					<path d="M6.8 12.6 11.2 11l2.4-3.9 3.9.9" />
					<path d="M12.4 12.6 9.2 16.2" />
				</>
			);
		case 'walk':
			return (
				<>
					<circle cx="12.6" cy="4.6" r="1.7" fill="currentColor" stroke="none" />
					<path d="M10 21l1.1-8.2 2.4 1.6L15.2 21" />
					<path d="M8 12.4 12.2 11l1.1-3.3 2.9.4" />
					<path d="M12.2 12.6 9.6 16.6" />
				</>
			);
		case 'ride':
			return (
				<>
					<circle cx="6.2" cy="16.4" r="3.1" />
					<circle cx="17.8" cy="16.4" r="3.1" />
					<path d="M6.2 16.4 10.6 8h4.1L18 16.4" />
					<path d="M10.6 8 8.8 12.3h6.1" />
					<circle cx="14.6" cy="7.2" r="1.35" fill="currentColor" stroke="none" />
				</>
			);
		case 'swim':
			return (
				<>
					<circle cx="16.8" cy="5.8" r="1.55" fill="currentColor" stroke="none" />
					<path d="M13.8 7.4 11.6 11" />
					<path d="M3.5 13.2c2.2-1.7 4.2-1.7 6.4 0s4.2 1.7 6.4 0 4.2-1.7 6.4 0" />
					<path d="M3.5 18.2c2.2-1.7 4.2-1.7 6.4 0s4.2 1.7 6.4 0 4.2-1.7 6.4 0" />
				</>
			);
		case 'strength':
			return (
				<>
					<path d="M7 8v8M17 8v8" />
					<path d="M5 10.2v3.6M19 10.2v3.6" />
					<path d="M7 12h10" />
					<path d="M3.6 10.6v2.8M20.4 10.6v2.8" />
				</>
			);
		case 'skip':
			return (
				<>
					<circle cx="12" cy="12" r="8" />
					<path d="M8.5 12h7" />
				</>
			);
		case 'circle':
			return <circle cx="12" cy="12" r="8" />;
		case 'arrow':
			return (
				<>
					<path d="M5 12h14" />
					<path d="m13 6 6 6-6 6" />
				</>
			);
		case 'sun':
			return (
				<>
					<circle cx="12" cy="12" r="3.4" />
					<path d="M12 4.2v2M12 17.8v2M4.2 12h2M17.8 12h2M6.5 6.5l1.4 1.4M16.1 16.1l1.4 1.4M6.5 17.5l1.4-1.4M16.1 7.9l1.4-1.4" />
				</>
			);
		case 'unplanned':
			return (
				<>
					<circle cx="12" cy="12" r="8" />
					<path d="M12 8.2v7.6M8.2 12h7.6" />
				</>
			);
		case 'trophy':
			return (
				<>
					<path d="M8 4.5h8v5a4 4 0 0 1-8 0v-5z" />
					<path d="M8 6.8H5.4a2.5 2.5 0 0 0 2.3 4" />
					<path d="M16 6.8h2.6a2.5 2.5 0 0 1-2.3 4" />
					<path d="M12 13.5V17" />
					<path d="M9.5 20h5" />
					<path d="M10.2 17h3.6" />
				</>
			);
		case 'install':
			return (
				<>
					<rect x="7" y="3.5" width="10" height="17" rx="2" />
					<path d="M10.5 5.2h3" />
					<circle cx="12" cy="17.4" r="0.9" fill="currentColor" stroke="none" />
				</>
			);
		case 'signIn':
			return (
				<>
					<path d="M10 17l5-5-5-5" />
					<path d="M15 12H3" />
					<path d="M15 19h4a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-4" />
				</>
			);
		case 'signOut':
			return (
				<>
					<path d="M14 7l5 5-5 5" />
					<path d="M19 12H7" />
					<path d="M9 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
				</>
			);
	}
}

export function Icon({
	name,
	size = 16,
	className
}: {
	name: IconName;
	size?: number;
	className?: string;
}) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={size <= 13 ? 2 : 1.8}
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={cn('shrink-0', className)}
		>
			<Paths name={name} />
		</svg>
	);
}

const ACTIVITY_ICON: Record<ActivityType | 'all', IconName> = {
	all: 'grid',
	run: 'run',
	walk: 'walk',
	ride: 'ride',
	swim: 'swim',
	strength: 'strength'
};

export function ActivityIcon({
	type,
	size = 14
}: {
	type: string;
	size?: number;
}) {
	const key = type === 'all' ? 'all' : normalizeActivityType(type);
	return <Icon name={ACTIVITY_ICON[key]} size={size} />;
}

export function ActivityTag({ type, className }: { type: string; className?: string }) {
	return (
		<span className={cn(ui.tag, ui.tagAccent, className)}>
			<ActivityIcon type={type} />
			{activityLabel(type)}
		</span>
	);
}

export function sportChipLabel(type: string, label: string): ReactNode {
	return (
		<>
			<ActivityIcon type={type} size={14} />
			{label}
		</>
	);
}
