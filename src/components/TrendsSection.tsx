import type { TrainingTrends, TrendSeries } from '$lib/trends';
import { cn, ui } from '$lib/ui';
import { useNavigate } from '@tanstack/react-router';
import { Sparkline } from './Sparkline';
import { TipBubble, TipCaption, TipValue, usePinnedTip } from './Tip';

type Props = {
	trends: TrainingTrends;
	heading?: string;
	caption?: string;
};

export function TrendsSection({
	trends,
	heading = 'Trends',
	caption = 'Progress over recent weeks'
}: Props) {
	const navigate = useNavigate();

	if (!trends.series.length) return null;

	return (
		<section className="mt-[1.4rem] mb-[1.75rem] p-0" aria-labelledby="trends-heading">
			<div className="mb-[1.1rem]">
				<h2 id="trends-heading" className="text-[1.5rem] font-extrabold tracking-[-0.02em]">
					{heading}
				</h2>
				<p className={cn(ui.muted, 'mt-[0.2rem] text-[0.9rem]')}>{caption}</p>
			</div>

			<div className="grid grid-cols-1 gap-x-6 gap-y-[1.15rem] min-[721px]:grid-cols-2 max-[720px]:gap-5">
				{trends.series.map((series) => (
					<article key={series.id} className={series.bars ? 'col-span-full' : undefined}>
						<header className="flex items-start justify-between gap-3 mb-[0.55rem]">
							<div>
								<span className="block font-semibold uppercase tracking-[0.06em] text-[0.78rem] text-muted">
									{series.title}
								</span>
								<span className={cn(ui.muted, 'block text-[0.78rem] mt-[0.15rem]')}>
									{series.subtitle}
								</span>
							</div>
							<div className="text-right shrink-0" aria-label={`${series.title} latest`}>
								{series.latest && (
									<strong className="block font-display text-[1.15rem] tracking-[-0.03em] leading-[1.1]">
										{series.latest}
										<span className="text-[0.75rem] font-medium text-muted ml-[0.15rem]">
											{series.unit}
										</span>
									</strong>
								)}
								{series.delta && (
									<span
										className={cn(
											'inline-block mt-[0.15rem] text-[0.78rem] text-muted',
											series.delta.startsWith('↓') && series.lowerIsBetter && 'text-ok',
											series.delta.startsWith('↑') && series.lowerIsBetter && 'text-warn',
											series.delta.startsWith('↑') && !series.lowerIsBetter && 'text-ok'
										)}
									>
										{series.delta}
									</span>
								)}
							</div>
						</header>

						{series.bars ? (
							<TrendBarChart series={series} />
						) : (
							<div className="min-w-0 overflow-visible pt-[1.85rem] -mt-[1.85rem]">
								<Sparkline
									values={series.points.map((p) => p.value)}
									tips={series.points.map((p) => ({ label: p.label, display: p.display }))}
									label={`${series.title}: ${series.points.map((p) => p.display).join(', ')}`}
									height={44}
									onPick={
										series.points.some((p) => p.slug)
											? (i) => {
													const slug = series.points[i]?.slug;
													if (slug) navigate({ to: '/runs/$slug', params: { slug } });
												}
											: undefined
									}
								/>
								<div className="flex justify-between text-[0.72rem] mt-[0.2rem] text-muted" aria-hidden="true">
									<span>{series.points[0]?.label}</span>
									<span>{series.points[series.points.length - 1]?.label}</span>
								</div>
							</div>
						)}
					</article>
				))}
			</div>
		</section>
	);
}

function TrendBarChart({ series }: { series: TrendSeries }) {
	const { active, rootRef, onEnter, onLeave, onToggle } = usePinnedTip<number>();
	const max = Math.max(...series.points.map((p) => p.value), 0.1);

	function barHeight(value: number): string {
		const pct = Math.max(4, Math.round((value / max) * 100));
		return `${pct}%`;
	}

	return (
		<div
			className="flex items-stretch gap-[0.28rem] h-[4.6rem] min-w-0 overflow-visible pt-[1.85rem] -mt-[1.85rem] max-[720px]:h-[4.2rem] max-[720px]:gap-[0.18rem]"
			ref={rootRef}
			role="group"
			aria-label={`${series.title}: ${series.points.map((p) => p.display).join(', ')}`}
		>
			{series.points.map((point, i) => (
				<button
					key={i}
					type="button"
					className="group/bar relative flex-1 min-w-0 flex flex-col items-center gap-[0.28rem] p-0 m-0 border-0 bg-transparent text-inherit font-inherit cursor-pointer touch-manipulation [-webkit-tap-highlight-color:transparent] max-[720px]:even:[&>span:first-of-type]:invisible"
					aria-label={`${point.label}: ${point.display}`}
					onPointerEnter={() => onEnter(i)}
					onPointerLeave={onLeave}
					onClick={(e) => {
						e.stopPropagation();
						onToggle(i);
					}}
				>
					<div className="flex-1 w-full flex items-end justify-center">
						<span
							className={cn(
								'block w-full max-w-[1.35rem] rounded-[3px_3px_1px_1px] bg-[linear-gradient(180deg,var(--accent)_0%,color-mix(in_srgb,var(--accent)_45%,transparent)_100%)] min-h-[3px] transition-[filter,opacity] duration-100 group-hover/bar:brightness-[1.08] group-active/bar:brightness-[1.08]',
								point.value <= 0
									? 'opacity-[0.22] bg-line min-h-[2px] !h-[4%] group-hover/bar:brightness-100 group-active/bar:brightness-100'
									: active === i
										? 'brightness-[1.08]'
										: ''
							)}
							style={{ height: barHeight(point.value) }}
						></span>
					</div>
					<span className="text-[0.62rem] leading-[1.1] text-center whitespace-nowrap overflow-hidden text-ellipsis max-w-full text-muted max-[720px]:text-[0.58rem]">
						{point.label}
					</span>
					{active === i && (
						<TipBubble className="bottom-[calc(100%-0.1rem)] left-1/2 -translate-x-1/2">
							<TipValue>{point.display}</TipValue>
							<TipCaption>{point.label}</TipCaption>
						</TipBubble>
					)}
				</button>
			))}
		</div>
	);
}
