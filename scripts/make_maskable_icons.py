#!/usr/bin/env python3
"""Make the maskable PWA icons from the garage logo.
   python3 scripts/make_maskable_icons.py frontend/public/madeg-logo.png frontend/public/icons
Writes icon-maskable-192.png and icon-maskable-512.png. The logo is scaled to fit inside the central 66% (the maskable "safe zone",
a circle of 40% of the icon's width), on a solid background that fills the whole square, so no phone's mask cuts the logo."""
import sys
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
BG = (7, 11, 20, 255)   # the app background colour (#070b14), the same as background_color in manifest.webmanifest
logo = Image.open(src).convert('RGBA')
for size in (192, 512):
    canvas = Image.new('RGBA', (size, size), BG)
    box = int(size * 0.66)
    l = logo.copy(); l.thumbnail((box, box), Image.LANCZOS)
    canvas.alpha_composite(l, ((size - l.width) // 2, (size - l.height) // 2))
    canvas.convert('RGB').save(f'{out}/icon-maskable-{size}.png', optimize=True)
    print('wrote', f'{out}/icon-maskable-{size}.png')
