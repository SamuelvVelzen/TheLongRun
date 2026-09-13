import { useMemo } from 'react';

type Props = {
	coords: [number, number][];
	width?: number;
	height?: number;
	className?: string;
};

export function RouteLine({ coords, width = 90, height = 72, className }: Props) {
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
				strokeWidth="1.75"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
