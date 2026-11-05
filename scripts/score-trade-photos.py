#!/usr/bin/env python3
"""Offline photo scorer for the curated per-trade picks (src/lib/builder/trade-photo-picks.ts).

Usage: python3 scripts/score-trade-photos.py PEXELS_ID [PEXELS_ID ...]

For each Pexels photo id it downloads a 1200px copy from the Pexels CDN, checks
the CDN answers HTTP 200, and prints the numbers the picks file stores:
aspect ratio, mean brightness, contrast (standard deviation) and the share of
near-black pixels (all on a 0..1 scale). Add a pick only when the numbers pass
`gradePhotoStats` in src/lib/builder/image-framing.ts, and record the
photographer from the photo's own Pexels page.
"""
import io
import sys
import urllib.request

from PIL import Image


def cdn(photo_id: str, width: int = 1200) -> str:
    return f"https://images.pexels.com/photos/{photo_id}/pexels-photo-{photo_id}.jpeg?auto=compress&cs=tinysrgb&w={width}"


def score(photo_id: str) -> dict:
    req = urllib.request.Request(cdn(photo_id), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as res:
        status = res.status
        data = res.read()
    img = Image.open(io.BytesIO(data)).convert("L")
    w, h = img.size
    small = img.resize((64, max(1, round(64 * h / w))))
    px = [p / 255 for p in small.get_flattened_data()] if hasattr(small, "get_flattened_data") else [p / 255 for p in small.getdata()]
    n = len(px)
    mean = sum(px) / n
    sd = (sum((p - mean) ** 2 for p in px) / n) ** 0.5
    dark = sum(1 for p in px if p < 40 / 255) / n
    return {"id": photo_id, "status": status, "aspect": round(w / h, 3), "mean": round(mean, 2), "contrast": round(sd, 2), "darkShare": round(dark, 2)}


if __name__ == "__main__":
    for pid in sys.argv[1:]:
        print(score(pid))
