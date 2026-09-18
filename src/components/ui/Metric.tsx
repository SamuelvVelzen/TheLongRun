import { cn } from '$lib/ui';
import type { HTMLAttributes, ReactNode } from 'react';
import { ui } from './tokens';

export function metricsClass(...parts: Array<string | false | null | undefined>) {
	return cn(ui.metrics, ...parts);
}

export function metricClass(...parts: Array<string | boolean | false | null | undefined>) {
	return cn(
		ui.metric,
		parts.some((p) => p === true) && ui.metricEmph,
		...parts.filter((p): p is string => typeof p === 'string')
	);
}

export function Metrics({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={metricsClass(className)} {...props} />;
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
		<div className={metricClass(emph && ui.metricEmph, className)} {...props}>
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
