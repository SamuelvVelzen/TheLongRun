import { useEffect, useMemo, useState } from 'react';

const COLORS = ['#c8f060', '#8fd4ff', '#ff8a5b', '#e8f0e2', '#ffd166', '#7ee8c7'];

type Piece = {
	left: number;
	delay: number;
	duration: number;
	color: string;
	rotate: number;
	size: number;
};

function randomPiece(i: number): Piece {
	return {
		left: (i * 17 + 13) % 100,
		delay: (i % 12) * 0.08,
		duration: 3.8 + (i % 5) * 0.45,
		color: COLORS[i % COLORS.length]!,
		rotate: (i * 37) % 360,
		size: 5 + (i % 4)
	};
}

export function Confetti({ active }: { active: boolean }) {
	const pieces = useMemo(() => Array.from({ length: 48 }, (_, i) => randomPiece(i)), []);
	const [show, setShow] = useState(false);

	useEffect(() => {
		if (!active) {
			setShow(false);
			return;
		}
		setShow(true);
		const t = window.setTimeout(() => setShow(false), 6200);
		return () => window.clearTimeout(t);
	}, [active]);

	if (!show) return null;

	return (
		<div className="confetti-burst pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
			{pieces.map((p, i) => (
				<span
					key={i}
					className="confetti-piece"
					style={{
						left: `${p.left}%`,
						animationDelay: `${p.delay}s`,
						animationDuration: `${p.duration}s`,
						backgroundColor: p.color,
						width: `${p.size}px`,
						height: `${p.size * 1.4}px`,
						transform: `rotate(${p.rotate}deg)`
					}}
				/>
			))}
		</div>
	);
}
