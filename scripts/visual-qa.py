"""LAYER 2 MEASURING — loads real pages in a real browser and records what it sees.

Usage:  python3 scripts/visual-qa.py <url> [more urls]

For every width Revora judges, it runs the shared measurement snippet from
src/lib/builder/visual.ts and writes the raw numbers to /tmp/visual-qa.json.
Grading is NOT done here: `bun scripts/visual-grade.ts` scores the same numbers
with the exact code the app uses, so a claim about how a page looks always comes
from one grader.
"""

import asyncio
import json
import os
import re
import sys
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent.parent
SOURCE = (ROOT / "src/lib/builder/visual.ts").read_text()

WIDTHS = [int(n) for n in re.search(r"VIEWPORTS = \[([^\]]+)\]", SOURCE).group(1).split(",") if n.strip().isdigit()]
BENCHMARK_WIDTHS = [320, 390, 768, 1280, 1440]
BENCHMARK_CONTRACTS = {
    "high-ticket-mobile-service": [
        'input[type="range"][aria-label*="versus" i]',
        ".rv-cn-mobile-sticky-bar",
    ],
    "technical-contractor-b2b": ['[data-widget="quote_calculator"]'],
    "high-end-boutique-studio": ['[data-widget="booking_form"]', ".rv-cn-faq"],
}


def snippet(name):
    """Reads one exported browser snippet exactly as the app ships it.

    Each snippet ends at its OWN closing backtick, so the reader must stop at
    the first one. Reading to the last closing backtick silently glued several
    snippets together and every measurement failed in the browser.
    """
    head = f"export const {name} = `"
    if head not in SOURCE:
        raise SystemExit(f"{name} is missing from src/lib/builder/visual.ts")
    body = SOURCE.split(head, 1)[1].split("`;", 1)[0]
    return body


MEASURE = snippet("MEASURE_SCRIPT")
OBSERVE = snippet("OBSERVE_SCRIPT")
SCROLL = snippet("SCROLL_SCRIPT") if "export const SCROLL_SCRIPT = `" in SOURCE else None


async def main(urls, benchmark=False):
    out = []
    failures = []
    widths = BENCHMARK_WIDTHS if benchmark else WIDTHS
    contracts = {}
    if benchmark:
        routes = json.loads(os.environ.get("REVORA_VISUAL_BENCHMARK_ROUTES", "{}"))
        if set(routes) != set(BENCHMARK_CONTRACTS):
            print(json.dumps({
                "status": "NOT_VERIFIED",
                "reason": "REVORA_VISUAL_BENCHMARK_ROUTES must contain exactly the three benchmark archetype route keys.",
                "expected": list(BENCHMARK_CONTRACTS),
            }, indent=2))
            raise SystemExit(2)
        urls = [routes[key] for key in BENCHMARK_CONTRACTS]
        contracts = {routes[key]: key for key in BENCHMARK_CONTRACTS}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for url in urls:
            page_results = []
            for width in widths:
                context = await browser.new_context(viewport={"width": width, "height": 1800})
                page = await context.new_page()
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                    # Same order the app uses: watch layout shift, load lazy
                    # pictures, then measure.
                    try:
                        await page.evaluate(OBSERVE)
                        if SCROLL:
                            await page.evaluate(SCROLL)
                    except Exception as error:  # noqa: BLE001 - reported, never hidden
                        print(f"instrumentation skipped on {url}: {error}", file=sys.stderr)
                    # Lazy pictures are intentionally requested by the scroll pass.
                    # Wait for those real requests to settle before deciding that an
                    # image is broken; a fixed delay alone races signed storage URLs.
                    for _ in range(30):
                        if await page.evaluate("[...document.images].every((img) => img.complete)"):
                            break
                        await page.wait_for_timeout(500)
                    await page.evaluate("window.scrollTo(0, 0)")
                    await page.wait_for_timeout(600)
                    measured = await page.evaluate(MEASURE)
                    measured["width"] = width
                    if benchmark:
                        measured["benchmark"] = await page.evaluate(
                            """(selectors) => {
                              const visible = (el) => {
                                if (!el) return false;
                                const s = getComputedStyle(el);
                                const r = el.getBoundingClientRect();
                                return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
                              };
                              return {
                                requiredSelectors: selectors,
                                requiredPresent: selectors.map((selector) => Boolean(document.querySelector(selector))),
                                imageCount: [...document.images].filter(visible).length,
                                gridContainers: [...document.querySelectorAll("*")].filter((el) => visible(el) && getComputedStyle(el).display === "grid").length,
                              };
                            }""",
                            BENCHMARK_CONTRACTS[contracts[url]],
                        )
                    page_results.append(measured)

                    if benchmark:
                        archetype = contracts[url]
                        if measured["scrollWidth"] > width + 1 or measured.get("overflowing"):
                            failures.append(f"{archetype}@{width}: horizontal overflow")
                        if width <= 768 and measured.get("smallTargets"):
                            failures.append(f"{archetype}@{width}: touch target below 44px: {measured['smallTargets'][:5]}")
                        if measured.get("placeholderLeakage"):
                            failures.append(f"{archetype}@{width}: placeholder leakage: {measured['placeholderLeakage'][:5]}")
                        low_contrast = (measured.get("accessibility") or {}).get("lowContrast") or []
                        if low_contrast:
                            failures.append(f"{archetype}@{width}: contrast failures: {low_contrast[:5]}")
                        contract = measured.get("benchmark") or {}
                        if not all(contract.get("requiredPresent", [])):
                            failures.append(f"{archetype}@{width}: required benchmark primitive missing")
                        if archetype == "high-ticket-mobile-service" and contract.get("imageCount", 0) < 2:
                            failures.append(f"{archetype}@{width}: gallery/image campaign missing")
                        if archetype == "technical-contractor-b2b" and contract.get("gridContainers", 0) < 1:
                            failures.append(f"{archetype}@{width}: specification grid missing")
                except Exception as error:  # noqa: BLE001 - reported, never hidden
                    print(f"could not load {url} at {width}px: {error}", file=sys.stderr)
                finally:
                    await context.close()
            out.append({"url": url, "measurements": page_results})
        await browser.close()
    Path("/tmp/visual-qa.json").write_text(json.dumps(out))
    performed = sum(len(item["measurements"]) for item in out)
    if benchmark:
        expected = len(BENCHMARK_CONTRACTS) * len(BENCHMARK_WIDTHS)
        if performed != expected:
            failures.append(f"expected {expected} benchmark viewport measurements, got {performed}")
        status = "PASS" if not failures else "FAIL"
        print(json.dumps({
            "status": status,
            "archetypes": list(BENCHMARK_CONTRACTS),
            "viewports": BENCHMARK_WIDTHS,
            "performed": performed,
            "failures": failures,
            "report": "/tmp/visual-qa.json",
        }, indent=2))
        return 0 if not failures else 1
    print(f"measured {performed} viewport(s) -> /tmp/visual-qa.json")
    return 0


if __name__ == "__main__":
    benchmark = "--benchmark" in sys.argv
    urls = [arg for arg in sys.argv[1:] if arg != "--benchmark"]
    if benchmark and not urls:
        urls = []
    elif not urls:
        print("Give at least one URL to check.", file=sys.stderr)
        raise SystemExit(1)
    raise SystemExit(asyncio.run(main(urls, benchmark=benchmark)))
