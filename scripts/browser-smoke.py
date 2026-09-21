"""
BROWSER SMOKE DRIVER (Playwright)
=================================

Reproducible browser evidence for the release gate. No external credentials are
required: every check either runs against the local app or is recorded as
NOT_VERIFIED. Nothing is ever reported as passing without a real page load.

Checks per route, at desktop (1280x900) and mobile (390x844):
  - HTTP status of the document
  - page title / first heading present
  - console errors
  - failed network requests
  - horizontal overflow
  - direct-route refresh (second navigation straight to the URL)

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
ROUTES = [r.strip() for r in os.environ.get("BROWSER_QA_ROUTES", "/,/auth,/pricing").split(",") if r.strip()][:12]
PUBLISHED_PATH = os.environ.get("REVORA_SMOKE_PUBLISHED_PATH", "").strip()
ARTIFACTS = pathlib.Path("browser-qa-artifacts")
VIEWPORTS = [("desktop", 1280, 900), ("mobile", 390, 844)]
# Noise that is not an application fault.
IGNORED_CONSOLE = ("favicon", "sourcemap", "Download the React DevTools")


async def check_route(browser, route: str, label: str, width: int, height: int) -> dict:
    url = BASE_URL + route if route.startswith("/") else route
    context = await browser.new_context(viewport={"width": width, "height": height})
    page = await context.new_page()
    console_errors: list[str] = []
    failed_requests: list[str] = []

    page.on(
        "console",
        lambda msg: console_errors.append(msg.text[:300])
        if msg.type == "error" and not any(x in msg.text for x in IGNORED_CONSOLE)
        else None,
    )
    page.on("pageerror", lambda err: console_errors.append(str(err)[:300]))
    def on_request_failed(req) -> None:
        # A navigation cancels in-flight requests; an aborted request is not an
        # application fault, so only real transport/server failures are recorded.
        reason = (req.failure or "") if hasattr(req, "failure") else ""
        if "ERR_ABORTED" in str(reason):
            return
        failed_requests.append(f"{req.method} {req.url[:200]} ({reason})")

    page.on("requestfailed", on_request_failed)


    result: dict = {"route": route, "url": url, "viewport": label}
    try:
        response = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        result["status"] = response.status if response else None
        await page.wait_for_timeout(600)
        result["title"] = (await page.title())[:160]
        headings = await page.locator("h1").all_inner_texts()
        result["heading"] = (headings[0][:160] if headings else "")
        overflow = await page.evaluate(
            "() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth)"
        )
        result["horizontalOverflowPx"] = overflow

        # Direct-route refresh: a fresh navigation to the same URL must also work.
        refreshed = await page.goto(url, wait_until="domcontentloaded", timeout=45000)
        result["refreshStatus"] = refreshed.status if refreshed else None

        slug = (route.strip("/").replace("/", "-") or "home")
        shot = ARTIFACTS / f"{slug}-{label}.png"
        await page.screenshot(path=str(shot))
        result["screenshot"] = str(shot)

        result["consoleErrors"] = console_errors
        result["failedRequests"] = failed_requests
        result["passed"] = bool(
            result["status"]
            and result["status"] < 400
            and result["refreshStatus"]
            and result["refreshStatus"] < 400
            and overflow <= 1
            and not console_errors
            and not failed_requests
        )
    except Exception as error:  # noqa: BLE001 - recorded, never hidden
        result["passed"] = False
        result["error"] = str(error)[:400]
        result["consoleErrors"] = console_errors
        result["failedRequests"] = failed_requests
    finally:
        await context.close()
    return result


async def main() -> int:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    checks: list[dict] = []
    not_verified: list[dict] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
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
    report = {
        "status": "FAILED" if failed else ("PASSED" if checks else "NOT_VERIFIED"),
        "baseUrl": BASE_URL,
        "routes": ROUTES,
        "performed": len(checks),
        "failed": len(failed),
        "notVerified": not_verified,
        "checks": checks,
    }
    (ARTIFACTS / "report.json").write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ("status", "performed", "failed", "notVerified")}, indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
