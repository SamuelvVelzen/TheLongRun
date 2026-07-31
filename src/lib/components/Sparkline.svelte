<script lang="ts">
	type Tip = {
		label: string;
		display: string;
	};

	type Props = {
		values: number[];
		/** Parallel tip text for each value (label + formatted value). */
		tips?: Tip[];
		width?: number;
		height?: number;
		/** Stroke color; defaults to accent lime. */
		color?: string;
		/** Accessible label for the chart. */
		label?: string;
		/** Pad y-range so flat series still show a line. */
		pad?: number;
	};

	let {
		values,
		tips,
		width = 160,
		height = 40,
		color = 'var(--accent)',
		label = 'Trend',
		pad = 0.08
	}: Props = $props();

	let root: HTMLDivElement | undefined = $state();
	let active = $state<number | null>(null);
	let pinned = $state(false);

	const geometry = $derived.by(() => {
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
	});

	function tipFor(i: number): Tip | null {
		if (!tips?.[i]) return null;
		return tips[i];
	}

	function nearestIndex(clientX: number, target: Element): number {
		const rect = target.getBoundingClientRect();
		const x = ((clientX - rect.left) / Math.max(rect.width, 1)) * width;
		const step = width / Math.max(values.length - 1, 1);
		return Math.max(0, Math.min(values.length - 1, Math.round(x / step)));
	}

	function show(i: number) {
		if (!tipFor(i)) return;
		active = i;
	}

	function clearIfUnpinned() {
		if (!pinned) active = null;
	}

	function onPointerMove(e: PointerEvent) {
		if (pinned && e.pointerType === 'touch') return;
		if (values.length < 2) return;
		show(nearestIndex(e.clientX, e.currentTarget as Element));
	}

	function onPointerLeave() {
		clearIfUnpinned();
	}

	function onPointerUp(e: PointerEvent) {
		if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
		if (values.length < 2) return;
		const i = nearestIndex(e.clientX, e.currentTarget as Element);
		if (!tipFor(i)) return;
		if (pinned && active === i) {
			pinned = false;
			active = null;
			return;
		}
		pinned = true;
		active = i;
	}

	function onDocPointerDown(e: PointerEvent) {
		if (!pinned || !root) return;
		if (e.target instanceof Node && root.contains(e.target)) return;
		pinned = false;
		active = null;
	}

	$effect(() => {
		if (!pinned) return;
		document.addEventListener('pointerdown', onDocPointerDown);
		return () => document.removeEventListener('pointerdown', onDocPointerDown);
	});

	const activeTip = $derived(active !== null ? tipFor(active) : null);
	const activeCoord = $derived(
		active !== null ? geometry.coords[active] : null
	);
</script>

<div class="spark-root" bind:this={root}>
	<svg
		class="sparkline"
		viewBox={`0 0 ${width} ${height}`}
		width="100%"
		height={height}
		role="img"
		aria-label={label}
		preserveAspectRatio="none"
		onpointermove={onPointerMove}
		onpointerleave={onPointerLeave}
		onpointerup={onPointerUp}
	>
		{#if geometry.area}
			<path class="spark-area" d={geometry.area} fill={color} />
		{/if}
		{#if geometry.path}
			<!-- Wide invisible stroke for easier hit-testing along the line -->
			<path class="spark-hit" d={geometry.path} fill="none" />
			<path class="spark-line" d={geometry.path} stroke={color} fill="none" />
		{/if}
	</svg>

	{#if activeCoord}
		<div
			class="spark-marker"
			style={`left:${(activeCoord.x / width) * 100}%; top:${(activeCoord.y / height) * 100}%; background:${color}`}
			aria-hidden="true"
		></div>
	{/if}

	{#if activeTip && activeCoord}
		<div
			class="spark-tip"
			style={`left:${(activeCoord.x / width) * 100}%; top:${(activeCoord.y / height) * 100}%`}
			role="tooltip"
		>
			<span class="spark-tip-value">{activeTip.display}</span>
			<span class="spark-tip-label">{activeTip.label}</span>
		</div>
	{/if}
</div>

<style>
	.spark-root {
		position: relative;
		display: block;
		min-width: 0;
		touch-action: manipulation;
	}

	.sparkline {
		display: block;
		overflow: visible;
		cursor: crosshair;
		touch-action: manipulation;
	}

	.spark-area {
		opacity: 0.14;
		pointer-events: none;
	}

	.spark-hit {
		stroke: transparent;
		stroke-width: 16;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
		pointer-events: stroke;
	}

	.spark-line {
		stroke-width: 1.75;
		stroke-linecap: round;
		stroke-linejoin: round;
		vector-effect: non-scaling-stroke;
		pointer-events: none;
	}

	.spark-marker {
		position: absolute;
		z-index: 1;
		width: 7px;
		height: 7px;
		margin: -3.5px 0 0 -3.5px;
		border-radius: 50%;
		box-shadow:
			0 0 0 2px rgba(16, 20, 15, 0.9),
			0 0 8px rgba(200, 242, 90, 0.45);
		pointer-events: none;
	}

	.spark-tip {
		position: absolute;
		z-index: 2;
		transform: translate(-50%, calc(-100% - 10px));
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.05rem;
		padding: 0.28rem 0.45rem;
		border-radius: 8px;
		border: 1px solid var(--line);
		background: #1a2218;
		box-shadow: 0 8px 22px rgba(0, 0, 0, 0.4);
		pointer-events: none;
		white-space: nowrap;
		max-width: min(11rem, 70vw);
	}

	.spark-tip::after {
		content: '';
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		border: 5px solid transparent;
		border-top-color: #1a2218;
	}

	.spark-tip-value {
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 0.78rem;
		letter-spacing: -0.02em;
		color: var(--accent);
		line-height: 1.15;
	}

	.spark-tip-label {
		font-size: 0.68rem;
		color: var(--muted);
		line-height: 1.15;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 100%;
	}
</style>
