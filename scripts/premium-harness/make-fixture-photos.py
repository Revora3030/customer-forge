"""Procedural PLACEHOLDER photos for the premium template harness.

No stock, no downloads: every pixel is generated here so the fixture render
has owner-photo-shaped images without any licence question. Output goes to
./public/fixture/ (gitignored). Run: python3 make-fixture-photos.py
"""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.join(os.path.dirname(__file__), "public", "fixture")
os.makedirs(OUT, exist_ok=True)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

def scene(w, h, seed, top, bottom, glow, car=True):
    rnd = random.Random(seed)  # DevSkim: ignore DS148264 -- seeded RNG for reproducible placeholder pixels, not security
    img = Image.new("RGB", (w, h))
    px = img.load()
    for y in range(h):
        c = lerp(top, bottom, y / h)
        for x in range(w):
            px[x, y] = c
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # bokeh lights
    for _ in range(46):
        r = rnd.randint(int(w * .01), int(w * .045))
        x, y = rnd.randint(0, w), rnd.randint(0, int(h * .55))
        a = rnd.randint(40, 120)
        d.ellipse((x - r, y - r, x + r, y + r), fill=glow + (a,))
    layer = layer.filter(ImageFilter.GaussianBlur(w * .006))
    img.paste(layer, (0, 0), layer)
    if car:
        body = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        b = ImageDraw.Draw(body)
        cx, base = w * rnd.uniform(.55, .62), h * .82
        L = w * .62
        # floor reflection
        b.ellipse((cx - L * .62, base - h * .05, cx + L * .62, base + h * .07), fill=(0, 0, 0, 150))
        # lower body
        b.rounded_rectangle((cx - L / 2, base - h * .2, cx + L / 2, base - h * .02), radius=int(h * .06), fill=(18, 22, 30, 255))
        # cabin
        b.polygon([(cx - L * .28, base - h * .2), (cx - L * .12, base - h * .34), (cx + L * .16, base - h * .34), (cx + L * .32, base - h * .2)], fill=(14, 17, 24, 255))
        # windows
        b.polygon([(cx - L * .22, base - h * .21), (cx - L * .1, base - h * .315), (cx + L * .14, base - h * .315), (cx + L * .26, base - h * .21)], fill=(40, 60, 90, 255))
        # wheels
        for wx in (cx - L * .3, cx + L * .3):
            r = h * .075
            b.ellipse((wx - r, base - r * 1.15, wx + r, base + r * .85), fill=(6, 7, 9, 255))
            b.ellipse((wx - r * .55, base - r * .7, wx + r * .55, base + r * .4), fill=(70, 78, 92, 255))
        body = body.filter(ImageFilter.GaussianBlur(1.2))
        img.paste(body, (0, 0), body)
        # specular highlight sweep
        hl = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        hd = ImageDraw.Draw(hl)
        hd.line([(cx - L * .45, base - h * .15), (cx + L * .45, base - h * .175)], fill=glow + (200,), width=max(2, int(h * .008)))
        hd.line([(cx - L * .1, base - h * .325), (cx + L * .12, base - h * .33)], fill=(255, 255, 255, 120), width=max(2, int(h * .004)))
        hl = hl.filter(ImageFilter.GaussianBlur(h * .004))
        img.paste(hl, (0, 0), hl)
    # vignette
    v = Image.new("L", (w, h), 0)
    vd = ImageDraw.Draw(v)
    vd.ellipse((-w * .2, -h * .3, w * 1.2, h * 1.3), fill=255)
    v = v.filter(ImageFilter.GaussianBlur(w * .08))
    dark = Image.new("RGB", (w, h), (2, 3, 6))
    img = Image.composite(img, dark, v)
    # grain
    noise = Image.effect_noise((w, h), 18).convert("RGB")
    img = Image.blend(img, noise, .035)
    return img

def save(img, name):
    img.save(os.path.join(OUT, name + ".jpg"), quality=72, optimize=True, progressive=True)
    img.save(os.path.join(OUT, name + ".webp"), quality=70, method=6)

save(scene(1920, 1200, 1, (10, 14, 24), (4, 6, 10), (70, 140, 255)), "hero")
save(scene(800, 500, 2, (12, 18, 30), (5, 7, 11), (90, 170, 255)), "ceramic")
save(scene(800, 500, 3, (24, 16, 10), (6, 5, 4), (255, 170, 80)), "correction")
save(scene(800, 500, 4, (8, 20, 22), (3, 7, 8), (80, 220, 210)), "interior")
save(scene(800, 500, 5, (18, 12, 26), (6, 4, 9), (190, 120, 255), car=True), "ppf")
logo = Image.new("RGB", (160, 160), (59, 130, 246))
ImageDraw.Draw(logo).text((52, 40), "N", fill=(7, 9, 13), font_size=80)
logo.save(os.path.join(OUT, "logo.png"))
print("wrote", sorted(os.listdir(OUT)))
