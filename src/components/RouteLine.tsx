import { useMemo } from 'react';

type Props = {
	coords: [number, number][];
	width?: number;
	height?: number;
	className?: string;
	/** Draw start/end markers on the route. */
	markers?: boolean;
	strokeWidth?: number;
};

export function RouteLine({
	coords,
	width = 90,
	height = 72,
	className,
	markers = false,
	strokeWidth = 1.75
}: Props) {
	const path = useMemo(() => {
		if (coords.length < 2) return '';
		const lats = coords.map(([lat]) => lat);
		const lngs = coords.map(([, lng]) => lng);
		let minLat = Math.min(...lats);
		let maxLat = Math.max(...lats);
		let minLng = Math.min(...lngs);
		let maxLng = Math.max(...lngs);
		const pad = 0.1;
		const latSpan = maxLat - minLat || 0.001;
		const lngSpan = maxLng - minLng || 0.001;
		minLat -= latSpan * pad;
		maxLat += latSpan * pad;
		minLng -= lngSpan * pad;
		maxLng += lngSpan * pad;
		const rangeLat = maxLat - minLat;
		const rangeLng = maxLng - minLng;
		return coords
			.map(([lat, lng], i) => {
				const x = ((lng - minLng) / rangeLng) * width;
				const y = height - ((lat - minLat) / rangeLat) * height;
				return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
			})
			.join(' ');
	}, [coords, width, height]);

	if (!path) return null;

	const start = coords[0];
	const end = coords[coords.length - 1];
	const lats = coords.map(([lat]) => lat);
	const lngs = coords.map(([, lng]) => lng);
	let minLat = Math.min(...lats);
	let maxLat = Math.max(...lats);
	let minLng = Math.min(...lngs);
	let maxLng = Math.max(...lngs);
	const pad = 0.1;
	const latSpan = maxLat - minLat || 0.001;
	const lngSpan = maxLng - minLng || 0.001;
	minLat -= latSpan * pad;
	maxLat += latSpan * pad;
	minLng -= lngSpan * pad;
	maxLng += lngSpan * pad;
	const rangeLat = maxLat - minLat;
	const rangeLng = maxLng - minLng;
	const toPoint = ([lat, lng]: [number, number]) => ({
		x: ((lng - minLng) / rangeLng) * width,
		y: height - ((lat - minLat) / rangeLat) * height
	});
	const startPt = start ? toPoint(start) : null;
	const endPt = end ? toPoint(end) : null;

	return (
		<svg
			className={className}
			viewBox={`0 0 ${width} ${height}`}
			width={width}
			height={height}
			aria-hidden="true"
		>
			<path
				d={path}
				fill="none"
				stroke="currentColor"
				strokeWidth={strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			{markers && startPt && (
				<circle cx={startPt.x} cy={startPt.y} r={strokeWidth * 1.4} fill="currentColor" opacity={0.9} />
			)}
			{markers && endPt && (
				<circle
					cx={endPt.x}
					cy={endPt.y}
					r={strokeWidth * 1.1}
					fill="none"
					stroke="currentColor"
					strokeWidth={strokeWidth * 0.85}
					opacity={0.85}
				/>
			)}
		</svg>
	);
}
