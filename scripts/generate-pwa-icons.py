"""Rasterize The Long Run PWA icons. Run: python scripts/generate-pwa-icons.py"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "icons"
PUBLIC = ROOT / "public"

CANVAS = (16, 20, 15, 255)
ACCENT = (200, 242, 90, 255)
INK = (20, 32, 10, 255)


def _scale(size: int, *xy: float, pad: float) -> tuple[int, ...]:
	inner = size * (1 - 2 * pad)
	origin = size * pad
	return tuple(round(origin + v * inner) for v in xy)


def _cubic(p0: tuple[float, float], p1: tuple[float, float], p2: tuple[float, float], p3: tuple[float, float], t: float):
	u = 1 - t
	return (
		u**3 * p0[0] + 3 * u**2 * t * p1[0] + 3 * u * t**2 * p2[0] + t**3 * p3[0],
		u**3 * p0[1] + 3 * u**2 * t * p1[1] + 3 * u * t**2 * p2[1] + t**3 * p3[1],
	)


def _stroke_curve(draw: ImageDraw.ImageDraw, pts: list[tuple[float, float]], width: float, color):
	r = width / 2
	for i in range(len(pts) - 1):
		draw.line([pts[i], pts[i + 1]], fill=color, width=max(1, round(width)))
	for x, y in pts:
		draw.ellipse((x - r, y - r, x + r, y + r), fill=color)


def _circle(draw: ImageDraw.ImageDraw, x: float, y: float, r: float, fill, outline=None, stroke=0):
	draw.ellipse((x - r, y - r, x + r, y + r), fill=fill, outline=outline, width=stroke)


def render_mark(size: int, pad: float) -> Image.Image:
	img = Image.new("RGBA", (size, size), CANVAS)
	draw = ImageDraw.Draw(img)
	s = lambda *xy: _scale(size, *xy, pad=pad)

	p0 = s(0.16, 0.78)
	p1 = s(0.18, 0.38)
	p2 = s(0.58, 0.62)
	p3 = s(0.84, 0.22)
	pts = [_cubic(p0, p1, p2, p3, t / 48) for t in range(49)]
	_stroke_curve(draw, pts, size * 0.09 * (0.72 / (1 - 2 * pad)), ACCENT)
	_circle(draw, *p0, size * 0.095 * (0.72 / (1 - 2 * pad)), ACCENT)
	_circle(draw, *p3, size * 0.095 * (0.72 / (1 - 2 * pad)), ACCENT)
	_circle(draw, *p0, size * 0.038 * (0.72 / (1 - 2 * pad)), INK)
	_circle(draw, *p3, size * 0.038 * (0.72 / (1 - 2 * pad)), INK)
	return img


def render_glyph(size: int, kind: str) -> Image.Image:
	img = Image.new("RGBA", (size, size), CANVAS)
	draw = ImageDraw.Draw(img)
	pad = 0.22
	s = lambda *xy: _scale(size, *xy, pad=pad)
	w = max(3, round(size * 0.07))
	cap = w / 2
	if kind == "add":
		draw.line([s(0.5, 0.1), s(0.5, 0.9)], fill=ACCENT, width=w)
		draw.line([s(0.1, 0.5), s(0.9, 0.5)], fill=ACCENT, width=w)
		for x, y in (s(0.5, 0.1), s(0.5, 0.9), s(0.1, 0.5), s(0.9, 0.5)):
			_circle(draw, x, y, cap, ACCENT)
	elif kind == "log":
		draw.rounded_rectangle([s(0.18, 0.1), s(0.82, 0.9)], radius=size * 0.07, outline=ACCENT, width=w)
		lw = max(2, round(size * 0.05))
		for y in (0.36, 0.52, 0.68):
			a, b = s(0.32, y), s(0.68, y)
			draw.line([a, b], fill=ACCENT, width=lw)
			_circle(draw, *a, lw / 2, ACCENT)
			_circle(draw, *b, lw / 2, ACCENT)
	elif kind == "coach":
		draw.rounded_rectangle([s(0.18, 0.3), s(0.82, 0.9)], radius=size * 0.07, outline=ACCENT, width=w)
		draw.arc([s(0.34, 0.08), s(0.66, 0.42)], start=200, end=-20, fill=ACCENT, width=w)
		lw = max(2, round(size * 0.05))
		for y, x1, x2 in ((0.52, 0.34, 0.66), (0.7, 0.34, 0.56)):
			a, b = s(x1, y), s(x2, y)
			draw.line([a, b], fill=ACCENT, width=lw)
			_circle(draw, *a, lw / 2, ACCENT)
			_circle(draw, *b, lw / 2, ACCENT)
	elif kind == "timeline":
		for y in (0.22, 0.5, 0.78):
			_circle(draw, *s(0.14, y), size * 0.07, ACCENT)
			a, b = s(0.32, y), s(0.9, y)
			draw.line([a, b], fill=ACCENT, width=w)
			_circle(draw, *a, cap, ACCENT)
			_circle(draw, *b, cap, ACCENT)
	return img


def downscale(img: Image.Image, size: int) -> Image.Image:
	return img.resize((size, size), Image.Resampling.LANCZOS).filter(ImageFilter.UnsharpMask(radius=0.6, percent=80, threshold=2))


def save(img: Image.Image, path: Path):
	path.parent.mkdir(parents=True, exist_ok=True)
	img.convert("RGB").save(path, "PNG", optimize=True)
	print(f"wrote {path.relative_to(ROOT)}")


def main():
	OUT.mkdir(parents=True, exist_ok=True)
	hi = render_mark(1024, pad=0.14)
	save(downscale(hi, 192), OUT / "icon-192.png")
	save(downscale(hi, 512), OUT / "icon-512.png")
	save(downscale(hi, 32), OUT / "favicon-32.png")
	mask = render_mark(1024, pad=0.22)
	save(downscale(mask, 192), OUT / "icon-192-maskable.png")
	save(downscale(mask, 512), OUT / "icon-512-maskable.png")
	save(downscale(hi, 180), PUBLIC / "apple-touch-icon.png")
	for kind in ("add", "log", "coach", "timeline"):
		save(downscale(render_glyph(768, kind), 192), OUT / f"shortcut-{kind}.png")


if __name__ == "__main__":
	main()
