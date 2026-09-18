import { cn, ui } from '$lib/ui';
import type { HTMLAttributes, ReactNode } from 'react';

export function Metrics({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={cn(ui.metrics, className)} {...props} />;
}

export function Metric({
	emph,
	value,
	label,
	className,
	children,
	...props
}: {
	emph?: boolean;
	value?: ReactNode;
	label?: ReactNode;
} & HTMLAttributes<HTMLDivElement>) {
	return (
		<div className={cn(ui.metric, emph && ui.metricEmph, className)} {...props}>
			{value != null || label != null ? (
				<>
					{value != null ? <b>{value}</b> : null}
					{label != null ? <span>{label}</span> : null}
				</>
			) : (
				children
			)}
		</div>
	);
}
