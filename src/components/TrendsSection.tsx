import { useEffect, useRef, useState } from 'react';
import { Sparkline } from './Sparkline';
import type { TrainingTrends, TrendSeries } from '$lib/trends';

type Props = {
	trends: TrainingTrends;
	heading?: string;
	caption?: string;
};

export function TrendsSection({
	trends,
	heading = 'Trends',
	caption = 'Progress over recent weeks and runs'
}: Props) {
	const [activeBar, setActiveBar] = useState<number | null>(null);
	const [barPinned, setBarPinned] = useState(false);
	const barChartRef = useRef<HTMLDivElement>(null);

	function maxBar(series: TrendSeries): number {
		return Math.max(...series.points.map((p) => p.value), 0.1);
	}

	function barHeight(value: number, max: number): string {
		const pct = Math.max(4, Math.round((value / max) * 100));
		return `${pct}%`;
	}

	function onBarEnter(i: number) {
		if (!barPinned) setActiveBar(i);
	}

	function onBarLeave() {
		if (!barPinned) setActiveBar(null);
	}

	function onBarClick(i: number, e: React.MouseEvent) {
		e.stopPropagation();
		if (
			typeof window !== 'undefined' &&
			window.matchMedia('(hover: hover) and (pointer: fine)').matches
		) {
			setActiveBar(i);
			return;
		}
		if (barPinned && activeBar === i) {
			setBarPinned(false);
			setActiveBar(null);
			return;
		}
		setBarPinned(true);
		setActiveBar(i);
	}

	useEffect(() => {
		if (!barPinned) return;
		function onDocPointerDown(e: PointerEvent) {
			if (!barChartRef.current) return;
			if (e.target instanceof Node && barChartRef.current.contains(e.target)) return;
			setBarPinned(false);
			setActiveBar(null);
		}
		document.addEventListener('pointerdown', onDocPointerDown);
		return () => document.removeEventListener('pointerdown', onDocPointerDown);
	}, [barPinned]);

	if (!trends.series.length) return null;

	return (
		<section className="trends" aria-labelledby="trends-heading">
			<div className="trends-head">
				<h2 id="trends-heading">{heading}</h2>
				<p className="muted">{caption}</p>
			</div>

			<div className="trends-grid">
				{trends.series.map((series) => {
					const max = maxBar(series);
					return (
						<article key={series.id} className={`trend-item${series.bars ? ' trend-bars' : ''}`}>
							<header className="trend-meta">
								<div>
									<span className="trend-title">{series.title}</span>
									<span className="trend-sub muted">{series.subtitle}</span>
								</div>
								<div className="trend-readout" aria-label={`${series.title} latest`}>
									{series.latest && (
										<strong>
											{series.latest}
											<span className="trend-unit">{series.unit}</span>
										</strong>
									)}
									{series.delta && (
										<span
											className={
												'trend-delta' +
												(series.delta.startsWith('↓') && series.lowerIsBetter ? ' better' : '') +
												(series.delta.startsWith('↑') && series.lowerIsBetter ? ' worse' : '') +
												(series.delta.startsWith('↑') && !series.lowerIsBetter ? ' up' : '')
											}
										>
											{series.delta}
										</span>
									)}
								</div>
							</header>

							{series.bars ? (
								<div
									className="bar-chart"
									ref={barChartRef}
									role="group"
									aria-label={`${series.title}: ${series.points.map((p) => p.display).join(', ')}`}
								>
									{series.points.map((point, i) => (
										<button
											key={i}
											type="button"
											className={`bar-col${activeBar === i ? ' active' : ''}`}
											aria-label={`${point.label}: ${point.display}`}
											onPointerEnter={() => onBarEnter(i)}
											onPointerLeave={onBarLeave}
											onClick={(e) => onBarClick(i, e)}
										>
											<div className="bar-track">
												<span
													className={`bar${point.value <= 0 ? ' empty' : ''}`}
													style={{ height: barHeight(point.value, max) }}
												></span>
											</div>
											<span className="bar-label muted">{point.label}</span>
											{activeBar === i && (
												<span className="bar-tip" role="tooltip">
													<span className="bar-tip-value">{point.display}</span>
													<span className="bar-tip-label">{point.label}</span>
												</span>
											)}
										</button>
									))}
								</div>
							) : (
								<div className="spark-wrap">
									<Sparkline
										values={series.points.map((p) => p.value)}
										tips={series.points.map((p) => ({ label: p.label, display: p.display }))}
										label={`${series.title}: ${series.points.map((p) => p.display).join(', ')}`}
										height={44}
									/>
									<div className="spark-ends muted" aria-hidden="true">
										<span>{series.points[0]?.label}</span>
										<span>{series.points[series.points.length - 1]?.label}</span>
									</div>
								</div>
							)}
						</article>
					);
				})}
			</div>
		</section>
	);
}
