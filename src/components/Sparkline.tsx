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
			// Second tap on the same point opens it (if pickable), else dismiss.
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
		<div className="spark-root" ref={rootRef}>
			<svg
				className="sparkline"
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
				{geometry.area && <path className="spark-area" d={geometry.area} fill={color} />}
				{geometry.path && (
					<>
						<path className="spark-hit" d={geometry.path} fill="none" />
						<path className="spark-line" d={geometry.path} stroke={color} fill="none" />
					</>
				)}
			</svg>

			{activeCoord && (
				<div
					className="spark-marker"
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
					className="spark-tip"
					style={{
						left: `${(activeCoord.x / width) * 100}%`,
						top: `${(activeCoord.y / height) * 100}%`
					}}
					role="tooltip"
				>
					<span className="spark-tip-value">{activeTip.display}</span>
					<span className="spark-tip-label">{activeTip.label}</span>
					{onPick && <span className="spark-tip-open">open →</span>}
				</div>
			)}
		</div>
	);
}
