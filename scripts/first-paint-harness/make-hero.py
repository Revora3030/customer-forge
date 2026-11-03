"""Writes a FICTIONAL abstract hero picture (no real photo) for the harness."""
import os
from PIL import Image, ImageDraw, ImageFilter
import random

random.seed(7)
out = os.path.join(os.path.dirname(__file__), "public", "fixture")
os.makedirs(out, exist_ok=True)
w, h = 2400, 1600
img = Image.new("RGB", (w, h))
d = ImageDraw.Draw(img)
for y in range(h):
    t = y / h
    d.line([(0, y), (w, y)], fill=(int(20 + 40 * t), int(60 + 80 * (1 - t)), int(120 + 90 * t)))
for _ in range(220):
    x, y, r = random.randrange(w), random.randrange(h), random.randrange(20, 220)
    d.ellipse([x - r, y - r, x + r, y + r], fill=(random.randrange(255), random.randrange(255), random.randrange(255)))
img = img.filter(ImageFilter.GaussianBlur(6))
noise = Image.effect_noise((w, h), 40).convert("RGB")
img = Image.blend(img, noise, 0.03)
img.save(os.path.join(out, "hero.jpg"), quality=78)
print(os.path.getsize(os.path.join(out, "hero.jpg")), "bytes")
