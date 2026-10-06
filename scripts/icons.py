"""Draw the extension icon (two fanned cards with a star) at Chrome's icon sizes.

Run: python scripts/icons.py   (needs Pillow)
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / 'extension' / 'icons'
SS = 8  # supersampling factor


def card(size, box, angle, fill, outline, star=None, shine=True):
    """Return a layer with one rounded card rotated around its center."""
    layer = Image.new('RGBA', (size, size))
    draw = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = box
    radius = (x1 - x0) * 0.17
    draw.rounded_rectangle(box, radius, fill=fill, outline=outline, width=max(1, round(size * 0.035)))
    if shine:
        # Soft highlight across the top-left corner, clipped to the card.
        w = x1 - x0
        gloss = Image.new('L', (size, size))
        ImageDraw.Draw(gloss).polygon([(x0, y0), (x0 + w * 0.62, y0), (x0, y0 + w * 0.62)], fill=70)
        mask = Image.new('L', (size, size))
        ImageDraw.Draw(mask).rounded_rectangle(box, radius, fill=255)
        layer.alpha_composite(Image.merge('RGBA', (*[Image.new('L', (size, size), 255)] * 3,
                                                   Image.composite(gloss, Image.new('L', (size, size)), mask))))
    if star:
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        outer, inner = (x1 - x0) * 0.3, (x1 - x0) * 0.13
        points = []
        for k in range(10):
            a = math.radians(-90 + k * 36)
            r = outer if k % 2 == 0 else inner
            points.append((cx + r * math.cos(a), cy + r * math.sin(a)))
        draw.polygon(points, fill=star)
    return layer.rotate(-angle, center=((x0 + x1) / 2, (y0 + y1) / 2), resample=Image.BICUBIC)


def icon(px):
    size = px * SS
    # Chrome Web Store: 128px icons keep the artwork inside the central 96px.
    pad = 0.125 if px >= 48 else 0.02
    unit = size * (1 - 2 * pad) / 18
    o = size * pad
    scale = lambda x0, y0, x1, y1: (o + x0 * unit, o + y0 * unit, o + x1 * unit, o + y1 * unit)
    image = Image.new('RGBA', (size, size))
    back = card(size, scale(1.2, 2.6, 10.6, 15.6), -14, (124, 58, 237, 255), (25, 10, 50, 220), shine=False)
    front = card(size, scale(6.2, 1.6, 15.8, 15.2), 8, (255, 64, 129, 255), (60, 8, 30, 230), star=(255, 255, 255, 255))
    if px >= 48:
        shadow = front.split()[3].filter(ImageFilter.GaussianBlur(size * 0.02))
        image.paste((0, 0, 0, 110), (round(size * 0.01), round(size * 0.02)), shadow)
    image.alpha_composite(back)
    image.alpha_composite(front)
    return image.resize((px, px), Image.LANCZOS)


if __name__ == '__main__':
    OUT.mkdir(exist_ok=True)
    for px in (16, 32, 48, 128):
        icon(px).save(OUT / f'icon-{px}.png', optimize=True)
    print('wrote', ', '.join(f'icon-{px}.png' for px in (16, 32, 48, 128)), 'to', OUT)
