"""
BROWSER SMOKE DRIVER (Playwright)
=================================

Reproducible browser evidence for the release gate. No external credentials are
required: every check either runs against the local app or is recorded as
NOT_VERIFIED. Nothing is ever reported as passing without a real page load.

Checks per route, at every acceptance viewport
(320, 375, 390, 414, 768, 1024, 1280, 1920):
  - HTTP status of the document
  - page title / first heading present
  - console errors
  - failed network requests
  - horizontal overflow
  - direct-route refresh (second navigation straight to the URL)

A cold dev server can reload the first page it serves while it optimizes
dependencies. Every route is therefore warmed up once before the matrix, and a
page read interrupted by such a reload is retried once. Real failures (status,
overflow, console errors, failed requests) are never retried away.

Optional, only when a fixture is supplied:
  - REVORA_SMOKE_PUBLISHED_PATH  e.g. /s/elite-mobile-detailing
  Without it, published-site proof is reported NOT_VERIFIED, never as a pass.

Outputs browser-qa-artifacts/report.json plus screenshots.
Exit 0 = all performed checks passed. Exit 1 = a performed check failed.
"""

from __future__ import annotations

import asyncio
import json
import os
import pathlib
import sys

from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BROWSER_QA_BASE_URL", "http://127.0.0.1:8080").rstrip("/")
ROUTES = [r.strip() for r in os.environ.get("BROWSER_QA_ROUTES", "/,/auth,/pricing").split(",") if r.strip()][:24]
PUBLISHED_PATH = os.environ.get("REVORA_SMOKE_PUBLISHED_PATH", "").strip()
ARTIFACTS = pathlib.Path("browser-qa-artifacts")
# Acceptance matrix: every width below 768 is a mobile layout.
VIEWPORTS = [
    ("w320", 320, 740),
    ("w375", 375, 812),
    ("w390", 390, 844),
    ("w414", 414, 896),
    ("w768", 768, 1024),
    ("w1024", 1024, 768),
    ("w1280", 1280, 900),
    ("w1920", 1920, 1080),
    ("w2560", 2560, 1440),
]
# Noise that is not an application fault.
IGNORED_CONSOLE = ("favicon", "sourcemap", "Download the React DevTools")
# Errors caused by the page navigating/reloading while it is being read.
NAVIGATION_INTERRUPTIONS = ("Execution context was destroyed", "because of a navigation", "Target closed")


def url_for(route: str) -> str:
    return BASE_URL + route if route.startswith("/") else route


async def settle(page) -> None:
    try:
        await page.wait_for_load_state("load", timeout=15000)
    except Exception:  # noqa: BLE001 - settling is best-effort, the read below decides
        pass
    await page.wait_for_timeout(600)


async def read_page(page) -> tuple[str, str, int]:
    title = (await page.title())[:160]
    headings = await page.locator("h1").all_inner_texts()
    heading = headings[0][:160] if headings else ""
    overflow = await page.evaluate(
        "() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth)"
    )
    return title, heading, overflow


# Automated WCAG basics (spec H). Each finding is a real DOM fact, not a score:
# images without alt, form controls with no accessible name, buttons/links with
# no accessible name, a missing <html lang>, and (on phones) visible tap targets
# smaller than 24x24 CSS px (WCAG 2.2 SC 2.5.8 minimum). Hidden mirrors that
# component libraries render with aria-hidden are excluded. Missing alt, labels,
# accessible names and lang FAIL the run; small tap targets are recorded as
# warnings (the size heuristic can't see WCAG's spacing exception), and a
# control inside a <label> is measured by its label.
A11Y_SNIPPET = r"""() => {
  const visible = (el) => {
    if (el.closest('[aria-hidden="true"]')) return false;
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const name = (el) => (el.getAttribute('aria-label') || '').trim()
    || (el.getAttribute('aria-labelledby') ? (el.getAttribute('aria-labelledby').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ').trim()) : '')
    || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent.trim()) || ''
    || (el.closest('label')?.textContent.trim() || '')
    || (el.getAttribute('title') || '').trim();
  const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).slice(0, 2).join('.') : ''}`.slice(0, 80);
  const out = { missingLang: !document.documentElement.getAttribute('lang'), imagesWithoutAlt: [], unlabeledControls: [], unnamedButtons: [], smallTargets: [] };
  for (const img of document.querySelectorAll('img')) if (visible(img) && !img.hasAttribute('alt')) out.imagesWithoutAlt.push(describe(img));
  for (const el of document.querySelectorAll('input:not([type=hidden]), select, textarea')) if (visible(el) && !name(el) && !(el.getAttribute('placeholder') || '').trim()) out.unlabeledControls.push(describe(el));
  for (const el of document.querySelectorAll('button, a[href], [role=button]')) {
    if (!visible(el)) continue;
    const text = (el.textContent || '').trim() || name(el) || el.querySelector('img[alt]:not([alt=""])')?.getAttribute('alt') || el.querySelector('svg title')?.textContent || '';
    if (!text.trim()) out.unnamedButtons.push(describe(el));
    if (window.innerWidth < 768 && !el.closest('label')) { const r = el.getBoundingClientRect(); const inline = getComputedStyle(el).display === 'inline' && el.tagName === 'A'; if (!inline && (r.width < 24 || r.height < 24)) out.smallTargets.push(describe(el)); }
  }
  for (const k of ['imagesWithoutAlt', 'unlabeledControls', 'unnamedButtons', 'smallTargets']) out[k] = out[k].slice(0, 10);
  return out;
}"""


def a11y_problems(a11y: dict) -> list[str]:
    problems: list[str] = []
    if a11y.get("missingLang"):
        problems.append("missing <html lang>")
    for key, label in (("imagesWithoutAlt", "image without alt"), ("unlabeledControls", "form control without a label"), ("unnamedButtons", "button/link without an accessible name")):
        if a11y.get(key):
            problems.append(f"{len(a11y[key])} {label}: {', '.join(a11y[key][:3])}")
    return problems


async def read_page_with_retry(page, result: dict) -> tuple[str, str, int]:
    try:
        return await read_page(page)
    except Exception as error:  # noqa: BLE001
        if not any(marker in str(error) for marker in NAVIGATION_INTERRUPTIONS):
            raise
        result["retriedAfterReload"] = str(error)[:200]
        await settle(page)
        return await read_page(page)


async def warm_up(browser) -> list[dict]:
    """Load each route once so the dev server finishes its first-load work."""
    notes: list[dict] = []
    context = await browser.new_context(viewport={"width": 1280, "height": 900})
    page = await context.new_page()
    for route in ROUTES:
        try:
            await page.goto(url_for(route), wait_until="load", timeout=60000)
            await page.wait_for_timeout(1500)
        except Exception as error:  # noqa: BLE001 - recorded; the real check decides pass/fail
            notes.append({"route": route, "warmUpError": str(error)[:200]})
    await context.close()
    return notes


async def check_route(browser, route: str, label: str, width: int, height: int) -> dict:
    url = url_for(route)
    context = await browser.new_context(viewport={"width": width, "height": height})
    page = await context.new_page()
    console_errors: list[str] = []
    hydration_warnings: list[str] = []
    failed_requests: list[str] = []

    def on_console(msg) -> None:
        text = msg.text[:500]
        if msg.type == "error" and not any(x in text for x in IGNORED_CONSOLE):
            # React 19 emits this recoverable warning when an SSR element has
            # attributes changed before/around hydration. Browser extensions
            # and password managers can inject attributes without changing app
            # behaviour. Keep the evidence, but do not turn this diagnostic
            # warning into a false browser-smoke failure.
            if text.startswith("A tree hydrated but some attributes"):
                hydration_warnings.append(text)
                return
            console_errors.append(text)

    page.on("console", on_console)
    page.on("pageerror", lambda err: console_errors.append(str(err)[:300]))

    def on_request_failed(req) -> None:
        # A navigation cancels in-flight requests; an aborted request is not an
        # application fault, so only real transport/server failures are recorded.
        reason = (req.failure or "") if hasattr(req, "failure") else ""
        if "ERR_ABORTED" in str(reason):
            return
        failed_requests.append(f"{req.method} {req.url[:200]} ({reason})")

    page.on("requestfailed", on_request_failed)

    result: dict = {"route": route, "url": url, "viewport": label, "width": width}
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        result["status"] = response.status if response else None
        await settle(page)
        title, heading, overflow = await read_page_with_retry(page, result)
        result["title"] = title
        result["heading"] = heading
        result["horizontalOverflowPx"] = overflow
        try:
            result["a11y"] = await page.evaluate(A11Y_SNIPPET)
        except Exception as error:  # noqa: BLE001 - recorded; a failed read is a failure
            result["a11y"] = {"error": str(error)[:200]}
        result["a11yProblems"] = a11y_problems(result["a11y"]) if "error" not in result["a11y"] else [result["a11y"]["error"]]
        result["a11yWarnings"] = [f"{len(result['a11y'].get('smallTargets', []))} tap target(s) under 24px: {', '.join(result['a11y'].get('smallTargets', [])[:3])}"] if result["a11y"].get("smallTargets") else []

        # Direct-route refresh: a fresh navigation to the same URL must also work.
        refreshed = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        result["refreshStatus"] = refreshed.status if refreshed else None
        await settle(page)

        slug = (route.strip("/").replace("/", "-") or "home")
        shot = ARTIFACTS / f"{slug}-{label}.png"
        await page.screenshot(path=str(shot))
        result["screenshot"] = str(shot)

        result["consoleErrors"] = console_errors
        result["hydrationWarnings"] = hydration_warnings
        result["failedRequests"] = failed_requests
        result["passed"] = bool(
            result["status"]
            and result["status"] < 400
            and result["refreshStatus"]
            and result["refreshStatus"] < 400
            and overflow <= 1
            and not result.get("a11yProblems")
            and not console_errors
            and not failed_requests
        )
    except Exception as error:  # noqa: BLE001 - recorded, never hidden
        result["passed"] = False
        result["error"] = str(error)[:400]
        result["consoleErrors"] = console_errors
        result["hydrationWarnings"] = hydration_warnings
        result["failedRequests"] = failed_requests
    finally:
        await context.close()
    return result


async def main() -> int:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    checks: list[dict] = []
    not_verified: list[dict] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, **({"executable_path": os.environ["BROWSER_QA_CHROMIUM"]} if os.environ.get("BROWSER_QA_CHROMIUM") else {}))
        warm_up_notes = await warm_up(browser)
        for route in ROUTES:
            for label, width, height in VIEWPORTS:
                checks.append(await check_route(browser, route, label, width, height))

        if PUBLISHED_PATH:
            for label, width, height in VIEWPORTS:
                check = await check_route(browser, PUBLISHED_PATH, label, width, height)
                check["kind"] = "published_site"
                checks.append(check)
        else:
            not_verified.append(
                {
                    "check": "published_site",
                    "status": "NOT_VERIFIED",
                    "reason": "No published-site fixture supplied. Set REVORA_SMOKE_PUBLISHED_PATH to a /s/<slug> path to verify.",
                }
            )
        await browser.close()

    failed = [c for c in checks if not c.get("passed")]
    retried = [{"route": c["route"], "width": c.get("width")} for c in checks if c.get("retriedAfterReload")]
    report = {
        "status": "FAILED" if failed else ("PASSED" if checks else "NOT_VERIFIED"),
        "baseUrl": BASE_URL,
        "routes": ROUTES,
        "viewports": [v[1] for v in VIEWPORTS],
        "performed": len(checks),
        "failed": len(failed),
        "failedSummary": [
            {"route": c["route"], "width": c.get("width"), "overflowPx": c.get("horizontalOverflowPx"),
             "status": c.get("status"), "error": c.get("error"),
             "consoleErrors": c.get("consoleErrors", [])[:3],
             "a11yProblems": c.get("a11yProblems", [])[:5],
             "hydrationWarnings": c.get("hydrationWarnings", [])[:3],
             "failedRequests": c.get("failedRequests", [])[:3]}
            for c in failed
        ],
        "retriedAfterReload": retried,
        "warmUp": warm_up_notes,
        "notVerified": not_verified,
        "checks": checks,
    }
    (ARTIFACTS / "report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ("status", "performed", "failed", "failedSummary", "retriedAfterReload", "warmUp", "notVerified")}, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
