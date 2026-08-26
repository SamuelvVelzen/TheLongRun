import { useEffect, useMemo, useRef, useState } from 'react';

type Tip = { label: string; display: string };

type Props = {
	values: number[];
	tips?: Tip[];
	width?: number;
	height?: number;
	color?: string;
	label?: string;
	pad?: number;
	/** Called with the point index when a point is clicked/tapped (e.g. to open its activity). */
	onPick?: (index: number) => void;
};

export function Sparkline({
	values,
	tips,
	width = 160,
	height = 40,
	color = 'var(--accent)',
	label = 'Trend',
	pad = 0.08,
	onPick
}: Props) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [active, setActive] = useState<number | null>(null);
	const [pinned, setPinned] = useState(false);

	const geometry = useMemo(() => {
		if (values.length < 2) {
			return { path: '', area: '', coords: [] as { x: number; y: number }[] };
		}
		const min = Math.min(...values);
		const max = Math.max(...values);
		const span = max - min || 1;
		const yPad = span * pad;
		const lo = min - yPad;
		const hi = max + yPad;
		const range = hi - lo || 1;
		const step = width / (values.length - 1);
		const coords = values.map((v, i) => ({
			x: i * step,
			y: height - ((v - lo) / range) * height
		}));
		const path = coords
			.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`)
			.join(' ');
		const area = `${path} L${width} ${height} L0 ${height} Z`;
		return { path, area, coords };
	}, [values, width, height, pad]);

	const tipFor = (i: number): Tip | null => tips?.[i] ?? null;

	function nearestIndex(clientX: number, target: Element): number {
		const rect = target.getBoundingClientRect();
		const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * width;
		const step = width / Math.max(values.length - 1, 1);
		return Math.max(0, Math.min(values.length - 1, Math.round(x / step)));
	}

	function onPointerMove(e: React.PointerEvent) {
		if (pinned && e.pointerType === 'touch') return;
		if (values.length < 2) return;
		const i = nearestIndex(e.clientX, e.currentTarget);
		if (tipFor(i)) setActive(i);
	}

	function onPointerLeave() {
		if (!pinned) setActive(null);
	}

	function onPointerUp(e: React.PointerEvent) {
		if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
		if (values.length < 2) return;
		const i = nearestIndex(e.clientX, e.currentTarget);
		if (!tipFor(i)) return;
		if (pinned && active === i) {
			if (onPick) {
				onPick(i);
				return;
			}
			setPinned(false);
			setActive(null);
			return;
		}
		setPinned(true);
		setActive(i);
	}

	function onClick(e: React.MouseEvent) {
		if (!onPick || values.length < 2) return;
		const i = nearestIndex(e.clientX, e.currentTarget);
		if (tipFor(i)) onPick(i);
	}

	useEffect(() => {
		if (!pinned) return;
		function onDocPointerDown(e: PointerEvent) {
			if (!rootRef.current) return;
			if (e.target instanceof Node && rootRef.current.contains(e.target)) return;
			setPinned(false);
			setActive(null);
		}
		document.addEventListener('pointerdown', onDocPointerDown);
		return () => document.removeEventListener('pointerdown', onDocPointerDown);
	}, [pinned]);

	const activeTip = active !== null ? tipFor(active) : null;
	const activeCoord = active !== null ? geometry.coords[active] : null;

	return (
		<div className="relative block min-w-0 touch-manipulation" ref={rootRef}>
			<svg
				className="block overflow-visible cursor-crosshair touch-manipulation"
				viewBox={`0 0 ${width} ${height}`}
				width="100%"
				height={height}
				role="img"
				aria-label={label}
				preserveAspectRatio="none"
				style={onPick ? { cursor: 'pointer' } : undefined}
				onPointerMove={onPointerMove}
				onPointerLeave={onPointerLeave}
				onPointerUp={onPointerUp}
				onClick={onClick}
			>
				{geometry.area && <path className="opacity-[0.14] pointer-events-none" d={geometry.area} fill={color} />}
				{geometry.path && (
					<>
						<path
							className="spark-hit stroke-transparent [stroke-width:16] [stroke-linecap:round] [stroke-linejoin:round] pointer-events-[stroke]"
							d={geometry.path}
							fill="none"
						/>
						<path
							className="spark-line [stroke-width:1.75] [stroke-linecap:round] [stroke-linejoin:round] pointer-events-none"
							d={geometry.path}
							stroke={color}
							fill="none"
						/>
					</>
				)}
			</svg>

			{activeCoord && (
				<div
					className="absolute z-[1] size-[7px] mt-[-3.5px] ml-[-3.5px] rounded-full shadow-[0_0_0_2px_rgba(16,20,15,0.9),0_0_8px_rgba(200,242,90,0.45)] pointer-events-none"
					style={{
						left: `${(activeCoord.x / width) * 100}%`,
						top: `${(activeCoord.y / height) * 100}%`,
						background: color
					}}
					aria-hidden="true"
				/>
			)}

			{activeTip && activeCoord && (
				<div
					className="absolute z-[2] -translate-x-1/2 -translate-y-[calc(100%+10px)] flex flex-col items-center gap-[0.05rem] px-[0.45rem] py-[0.28rem] rounded-lg border border-line bg-[#1a2218] shadow-[0_8px_22px_rgba(0,0,0,0.4)] pointer-events-none whitespace-nowrap max-w-[min(11rem,70vw)] after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-[5px] after:border-transparent after:border-t-[#1a2218]"
					style={{
						left: `${(activeCoord.x / width) * 100}%`,
						top: `${(activeCoord.y / height) * 100}%`
					}}
					role="tooltip"
				>
					<span className="font-display font-bold text-[0.78rem] tracking-[-0.02em] text-accent leading-[1.15]">
						{activeTip.display}
					</span>
					<span className="text-[0.68rem] text-muted leading-[1.15] overflow-hidden text-ellipsis max-w-full">
						{activeTip.label}
					</span>
					{onPick && (
						<span className="text-[0.62rem] font-semibold tracking-[0.04em] text-accent leading-[1.3]">
							open →
						</span>
					)}
				</div>
			)}
		</div>
	);
}
