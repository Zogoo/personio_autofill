#!/usr/bin/env python3
"""Compose popup screenshots onto Chrome Web Store canvas sizes."""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = Path(__file__).resolve().parent / 'assets'
SRC_DIR = Path(__file__).resolve().parent / 'source'

# Match extension popup background
BG = (245, 240, 252)

SOURCES = [
    ('screenshot-01-settings', 'settings.png'),
    ('screenshot-02-actions', 'actions.png'),
]


def fit_on_canvas(
    src: Image.Image,
    canvas_w: int,
    canvas_h: int,
    padding: int = 48,
    max_scale: float = 1.0,
) -> Image.Image:
    max_w = canvas_w - padding * 2
    max_h = canvas_h - padding * 2
    scale = min(max_w / src.width, max_h / src.height, max_scale)
    w = max(1, int(src.width * scale))
    h = max(1, int(src.height * scale))
    if abs(scale - 1.0) > 1e-6:
        src = src.resize((w, h), Image.Resampling.LANCZOS)
    canvas = Image.new('RGB', (canvas_w, canvas_h), BG)
    x = (canvas_w - src.width) // 2
    y = (canvas_h - src.height) // 2
    canvas.paste(src, (x, y))
    return canvas


def save_variants(img: Image.Image, stem: str) -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    sizes = [
        (1280, 800, f'{stem}-1280x800'),
        (640, 400, f'{stem}-640x400'),
    ]
    for w, h, name in sizes:
        out = fit_on_canvas(img, w, h, padding=max(24, int(min(w, h) * 0.06)))
        jpg = ASSETS / f'{name}.jpg'
        png = ASSETS / f'{name}.png'
        out.save(jpg, 'JPEG', quality=90, optimize=True)
        out.save(png, 'PNG', optimize=True)
        print(f'wrote {jpg} ({jpg.stat().st_size // 1024} KB)')


def promo_tile(
    src: Image.Image,
    out_name: str,
    size: tuple[int, int],
    max_scale: float = 2.5,
) -> None:
    w, h = size
    padding = 16
    tile = fit_on_canvas(src, w, h, padding=padding, max_scale=max_scale)
    path = ASSETS / out_name
    tile.save(path, 'JPEG', quality=90, optimize=True)
    print(f'wrote {path} ({path.stat().st_size // 1024} KB)')


def main() -> None:
    for stem, filename in SOURCES:
        path = SRC_DIR / filename
        if not path.exists():
            raise SystemExit(f'missing source: {path}')
        img = Image.open(path).convert('RGB')
        save_variants(img, stem)

    settings = Image.open(SRC_DIR / SOURCES[0][1]).convert('RGB')
    promo_tile(settings, 'promo-small-440x280.jpg', (440, 280))
    promo_tile(settings, 'promo-marquee-1400x560.jpg', (1400, 560))


if __name__ == '__main__':
    main()
