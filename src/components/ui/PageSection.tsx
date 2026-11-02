import { cn } from '$lib/ui';
import type { ReactNode } from 'react';
import { Panel } from './Panel';
import { PanelTitle } from './PanelTitle';

export function PageSection({
	title,
	form,
	className,
	children
}: {
	title?: ReactNode;
	form?: boolean;
	className?: string;
	children: ReactNode;
}) {
	return (
		<Panel form={form} className={cn('mb-4', className)}>
			{title != null ? <PanelTitle className="m-0 mb-3 border-b-0! pb-0!">{title}</PanelTitle> : null}
			{children}
		</Panel>
	);
}
