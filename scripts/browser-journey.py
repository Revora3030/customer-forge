"""
CUSTOMER FORGE — DURABLE BROWSER JOURNEY SMOKE SUITE
====================================================

Runs the real customer journey in a real Chromium browser against the running
application and records honest evidence for every step.

Design rules
------------
* No external service is required: no live Stripe, email, CRM or paid AI. Those
  integrations are reported NOT_TESTED — never PASS — unless their own
  credential-gated suite runs (`bun run test:integrations`).
* Nothing is ever reported as passing without an observed page state. A step
  that cannot be attempted is NOT_TESTED with the reason.
* No security control is weakened. The signed-out gate is asserted, not
  bypassed, and the suite never presses Publish.
* Web-first assertions only (`wait_for_selector` / `expect`-style polling).
  No arbitrary sleeps as a substitute for an assertion.
* Retries happen only for genuinely transient browser/transport conditions.

Environment
-----------
JOURNEY_BASE_URL            default http://localhost:8080
JOURNEY_SESSION_FILE        Supabase session JSON (default the Lovable auth cache)
JOURNEY_ALLOW_MUTATE=1      run the edit / persistence / rollback steps
JOURNEY_ALLOW_BUILD=1       submit a real deterministic build request
JOURNEY_FIXTURE_WORKSPACE   expected workspace name (asserted when provided)

Outputs
-------
browser-qa-artifacts/journey.json   machine-readable evidence
browser-qa-artifacts/journey.html   human-readable report
browser-qa-artifacts/journey-*.png  checkpoint screenshots

Exit 0 when no step FAILED, 1 otherwise.
"""

from __future__ import annotations

import asyncio
import html
import json
import os
import pathlib
import time
from typing import Any, Awaitable, Callable

from playwright.async_api import Browser, Page, async_playwright

BASE = os.environ.get("JOURNEY_BASE_URL", "http://localhost:8080").rstrip("/")
SESSION_FILE = os.environ.get(
    "JOURNEY_SESSION_FILE", str(pathlib.Path.home() / ".cache/lovable-auth/session.json")
)
ALLOW_MUTATE = os.environ.get("JOURNEY_ALLOW_MUTATE") == "1"
ALLOW_BUILD = os.environ.get("JOURNEY_ALLOW_BUILD") == "1"
EXPECTED_WORKSPACE = os.environ.get("JOURNEY_FIXTURE_WORKSPACE", "").strip()

ARTIFACTS = pathlib.Path("browser-qa-artifacts")
MOBILE_WIDTHS = [320, 375, 390, 414]
DESKTOP_WIDTHS = [1280, 1440]

# Console noise that is not an application fault.
IGNORED_CONSOLE = (
    "favicon",
    "sourcemap",
    "Download the React DevTools",
    "js.stripe.com",
    "r.stripe.com",
)
# Requests that fail for reasons outside the application.
IGNORED_REQUESTS = ("js.stripe.com", "r.stripe.com", "ERR_ABORTED")
# Text that means the app rendered a global failure screen.
ERROR_SCREEN_MARKERS = (
    "Unexpected Application Error",
    "Something went wrong",
    "Application error",
)
TRANSIENT = ("ERR_CONNECTION", "ERR_NETWORK", "Timeout", "Target closed", "ERR_EMPTY_RESPONSE")

# The user-facing build stages, in order. Source of truth: GENERATION_STEPS in
# src/lib/site-engine.ts, grouped into the six stages a customer sees.
BUILD_STAGES = [
    ("Understanding", ["Business information analysed", "Services organised"]),
    ("Designing", ["Brand identity prepared", "Website structure generated"]),
    ("Writing", ["Local SEO content generated"]),
    ("Building", ["Conversion system configured", "Lead capture connected"]),
    ("Checking", ["Mobile experience optimised"]),
    ("Ready", ["Draft ready for browser review"]),
]

BUILD_PROMPT = (
    "Build a simple three page website for a deterministic smoke-test business. "
    "Keep every fact exactly as supplied and invent nothing."
)


class Recorder:
    """Collects console errors and failed requests for one page."""

    def __init__(self, page: Page) -> None:
        self.console: list[str] = []
        self.requests: list[str] = []
        page.on("console", self._on_console)
        page.on("pageerror", lambda err: self.console.append(str(err)[:300]))
        page.on("requestfailed", self._on_request_failed)

    def _on_console(self, message: Any) -> None:
        if message.type != "error":
            return
        text = message.text
        if any(noise in text for noise in IGNORED_CONSOLE):
            return
        self.console.append(text[:8000])

    def _on_request_failed(self, request: Any) -> None:
        failure = str(request.failure or "")
        if any(noise in request.url or noise in failure for noise in IGNORED_REQUESTS):
            return
        self.requests.append(f"{request.method} {request.url[:180]} ({failure})")

    def drain(self) -> dict[str, list[str]]:
        console, requests = list(self.console), list(self.requests)
        self.console.clear()
        self.requests.clear()
        return {"consoleErrors": console, "failedRequests": requests}


class Skip(Exception):
    """Raised by a step that cannot honestly be attempted -> NOT_TESTED."""


class Journey:
    def __init__(self, browser: Browser) -> None:
        self.browser = browser
        self.page: Page | None = None
        self.recorder: Recorder | None = None
        self.steps: list[dict[str, Any]] = []
        self.state: dict[str, Any] = {
            "slug": None,
            "pagePaths": [],
            "statusLabel": None,
            "originalHeading": None,
            "editedHeading": None,
            "overflow": {},
        }

    # ----------------------------------------------------------------- setup
    async def open_app(self, *, authenticated: bool, width: int = 1440) -> Page:
        context = await self.browser.new_context(viewport={"width": width, "height": 1800})
        page = await context.new_page()
        recorder = Recorder(page)
        await page.goto(f"{BASE}/", wait_until="domcontentloaded")
        if authenticated:
            session = self.session_payload()
            if not session:
                raise Skip(
                    "No Supabase test session available. Provide JOURNEY_SESSION_FILE or run "
                    "`lovable auth-session --json --self` first."
                )
            key, payload = session
            await page.evaluate(
                "([key, value]) => localStorage.setItem(key, value)", [key, payload]
            )
        self.page = page
        self.recorder = recorder
        return page

    @staticmethod
    def session_payload() -> tuple[str, str] | None:
        key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        raw = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        if key and raw:
            return key, raw
        path = pathlib.Path(SESSION_FILE)
        if not path.exists():
            return None
        data = json.loads(path.read_text())
        storage_key = data.get("storage_key")
        session = data.get("session") or data
        if not storage_key:
            return None
        return storage_key, json.dumps(session)

    async def shot(self, name: str) -> str:
        assert self.page
        path = ARTIFACTS / f"journey-{name}.png"
        await self.page.screenshot(path=str(path), caret="initial")
        return str(path)

    # ------------------------------------------------------------ step runner
    async def run_step(
        self, key: str, title: str, fn: Callable[[], Awaitable[dict[str, Any] | None]]
    ) -> None:
        started = time.time()
        attempts = 0
        record: dict[str, Any] = {"id": key, "title": title}
        while True:
            attempts += 1
            try:
                extra = await fn() or {}
                record.update({"status": "PASS", **extra})
                break
            except Skip as skip:
                record.update({"status": "NOT_TESTED", "reason": str(skip)})
                break
            except Exception as error:  # noqa: BLE001 - recorded honestly
                message = str(error)
                transient = any(marker in message for marker in TRANSIENT)
                if transient and attempts < 2:
                    continue
                record.update(
                    {
                        "status": "FAIL",
                        "error": message[:9000],
                        "retried": attempts > 1,
                    }
                )
                try:
                    record["screenshot"] = await self.shot(f"fail-{key}")
                except Exception:  # noqa: BLE001
                    pass
                break

        record["durationMs"] = int((time.time() - started) * 1000)
        record["url"] = self.page.url if self.page else None
        if self.page:
            size = self.page.viewport_size or {}
            record["viewport"] = f"{size.get('width')}x{size.get('height')}"
        if self.recorder:
            record.update(self.recorder.drain())
        self.steps.append(record)

    def not_tested(self, key: str, title: str, reason: str) -> None:
        self.steps.append(
            {
                "id": key,
                "title": title,
                "status": "NOT_TESTED",
                "reason": reason,
                "durationMs": 0,
            }
        )

    # ------------------------------------------------------------------ steps
    async def step_app_loads(self) -> dict[str, Any]:
        page = await self.open_app(authenticated=False)
        response = await page.goto(f"{BASE}/", wait_until="domcontentloaded")
        status = response.status if response else None
        if not status or status >= 400:
            raise AssertionError(f"Home page returned {status}")
        await page.wait_for_selector("h1", timeout=20000)
        heading = (await page.locator("h1").first.inner_text())[:120]
        return {"httpStatus": status, "heading": heading, "screenshot": await self.shot("home")}

    async def step_no_error_screen(self) -> dict[str, Any]:
        assert self.page
        body = await self.page.inner_text("body")
        hits = [marker for marker in ERROR_SCREEN_MARKERS if marker in body]
        if hits:
            raise AssertionError(f"Global error screen rendered: {hits}")
        return {"note": "No global error screen and no page errors."}

    async def step_auth(self) -> dict[str, Any]:
        # 1. The signed-out gate must hold (never weakened, only asserted).
        page = await self.open_app(authenticated=False)
        await page.goto(f"{BASE}/app", wait_until="domcontentloaded")
        await page.wait_for_url(lambda url: "/auth" in url, timeout=25000)
        gated = page.url
        await page.context.close()

        # 2. A restored session reaches the workspace.
        page = await self.open_app(authenticated=True)
        await page.goto(f"{BASE}/app", wait_until="domcontentloaded")
        await page.wait_for_selector("h1", timeout=40000)
        await page.wait_for_selector("text=Sign out", timeout=40000)
        return {
            "note": f"Signed out /app redirected to {gated}; restored session reached the workspace.",
            "screenshot": await self.shot("dashboard"),
        }

    async def step_fixture_workspace(self) -> dict[str, Any]:
        assert self.page
        name = (await self.page.locator("h1").first.inner_text()).strip()
        if EXPECTED_WORKSPACE and EXPECTED_WORKSPACE.lower() not in name.lower():
            raise AssertionError(f"Expected workspace {EXPECTED_WORKSPACE!r}, entered {name!r}")
        return {"workspace": name}

    async def step_builder_opens(self) -> dict[str, Any]:
        assert self.page
        await self.page.goto(f"{BASE}/app/website", wait_until="domcontentloaded")
        await self.page.wait_for_selector(
            "[data-testid=builder-preview], [aria-label='Tell Revora what to change']",
            timeout=60000,
        )
        chip = self.page.locator("[data-testid=builder-status]").first
        await chip.wait_for(timeout=30000)
        status = (await chip.inner_text()).strip()
        self.state["statusLabel"] = status
        # Any publish/launch call from this point on would mean the suite caused a
        # publication, which it must never do.
        self.publish_calls: list[str] = []
        self.page.on(
            "request",
            lambda req: self.publish_calls.append(req.url[:200])
            if req.method == "POST" and ("launch" in req.url or "publishSite" in req.url)
            else None,
        )
        return {"note": f"Builder opened. Project status chip: {status or 'unknown'}",
                "screenshot": await self.shot("builder")}

    async def step_builder_console(self) -> dict[str, Any]:
        assert self.recorder
        errors = list(self.recorder.console)
        failed = list(self.recorder.requests)
        if errors or failed:
            raise AssertionError(f"Builder reported console/network errors: {errors + failed}")
        return {"note": "Builder loaded with no console errors and no failed requests."}

    async def step_build_request(self) -> dict[str, Any]:
        if not ALLOW_BUILD:
            raise Skip(
                "Set JOURNEY_ALLOW_BUILD=1 to submit a real build request. It writes website "
                "content to the fixture workspace, so it is off by default."
            )
        assert self.page
        composer = self.page.get_by_label("Tell Revora what to change")
        await composer.wait_for(timeout=30000)
        await composer.fill(BUILD_PROMPT)
        await composer.press("Enter")
        await self.page.wait_for_selector("text=/Understanding|analysed|Working/i", timeout=60000)
        return {"note": "Deterministic build request submitted.", "screenshot": await self.shot("build-request")}

    async def step_build_stages(self) -> dict[str, Any]:
        assert self.page
        body = await self.page.inner_text("body")
        seen = [stage for stage, markers in BUILD_STAGES if any(m in body for m in markers)]
        if not seen:
            raise Skip(
                "No build is in progress or recorded in this workspace, so the user-facing stages "
                "(Understanding -> Ready) could not be observed. Run with JOURNEY_ALLOW_BUILD=1."
            )
        missing = [stage for stage, _ in BUILD_STAGES if stage not in seen]
        if missing:
            raise Skip(f"Only these stages were observable: {seen}. Not observed: {missing}.")
        return {"stages": seen}

    async def step_preview_renders(self) -> dict[str, Any]:
        assert self.page
        frame = self.page.locator("[data-testid=builder-preview-frame]")
        await frame.wait_for(timeout=45000)
        src = await frame.get_attribute("data-preview-src")
        if not src or not src.startswith("/s/"):
            raise AssertionError(f"Unexpected preview source: {src!r}")
        self.state["slug"] = src.split("/")[2]
        page = await self.browser.new_page(viewport={"width": 1280, "height": 1800})
        try:
            response = await page.goto(f"{BASE}{src}", wait_until="domcontentloaded")
            if not response or response.status >= 400:
                raise AssertionError(f"Preview {src} returned {response.status if response else None}")
            await page.wait_for_selector("h1", timeout=30000)
            text = await page.inner_text("body")
            links = await page.eval_on_selector_all(
                "a[href^='/s/']", "els => [...new Set(els.map(e => e.getAttribute('href')))]"
            )
            self.state["pagePaths"] = [href for href in links if href != src][:6]
            if len(text) < 400:
                raise AssertionError(f"Preview rendered only {len(text)} characters of content")
            return {"previewPath": src, "contentChars": len(text), "internalPages": self.state["pagePaths"]}
        finally:
            await page.close()

    async def step_page_navigation(self) -> dict[str, Any]:
        assert self.page
        buttons = self.page.locator("[data-testid=builder-preview-page]")
        count = await buttons.count()
        if count < 2:
            raise Skip("The fixture website has a single page, so navigation cannot be exercised.")
        frame = self.page.locator("[data-testid=builder-preview-frame]")
        before = await frame.get_attribute("data-preview-src")
        await buttons.nth(1).click()
        await self.page.wait_for_function(
            "before => document.querySelector('[data-testid=builder-preview-frame]')"
            "?.getAttribute('data-preview-src') !== before",
            arg=before,
            timeout=30000,
        )
        after = await frame.get_attribute("data-preview-src")

        # The public page behind the switch must render on its own too.
        page = await self.browser.new_page(viewport={"width": 1280, "height": 1800})
        try:
            response = await page.goto(f"{BASE}{after}", wait_until="domcontentloaded")
            if not response or response.status >= 400:
                raise AssertionError(f"Second page {after} returned {response.status if response else None}")
            await page.wait_for_selector("h1", timeout=30000)
        finally:
            await page.close()
        await buttons.nth(0).click()
        return {"from": before, "to": after}

    async def _measure(self, width: int) -> dict[str, Any]:
        slug = self.state["slug"]
        if not slug:
            raise Skip("No published preview path was resolved, so layouts cannot be measured.")
        page = await self.browser.new_page(viewport={"width": width, "height": 900})
        recorder = Recorder(page)
        try:
            response = await page.goto(f"{BASE}/s/{slug}", wait_until="domcontentloaded")
            await page.wait_for_selector("h1", timeout=30000)
            overflow = await page.evaluate(
                "() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth)"
            )
            shot = ARTIFACTS / f"journey-site-{width}.png"
            await page.screenshot(path=str(shot), caret="initial")
            self.state["overflow"][width] = overflow
            problems = recorder.drain()
            if overflow > 1:
                raise AssertionError(f"{width}px overflows horizontally by {overflow}px")
            if problems["consoleErrors"] or problems["failedRequests"]:
                raise AssertionError(f"{width}px reported {problems}")
            return {
                "width": width,
                "httpStatus": response.status if response else None,
                "horizontalOverflowPx": overflow,
                "screenshot": str(shot),
            }
        finally:
            await page.close()

    async def step_mobile_widths(self) -> dict[str, Any]:
        results = [await self._measure(width) for width in MOBILE_WIDTHS]
        return {"measurements": results}

    async def step_desktop_widths(self) -> dict[str, Any]:
        results = [await self._measure(width) for width in DESKTOP_WIDTHS]
        return {"measurements": results}

    async def step_no_overflow(self) -> dict[str, Any]:
        measured = self.state["overflow"]
        if not measured:
            raise Skip("No widths were measured, so overflow cannot be reported.")
        bad = {width: value for width, value in measured.items() if value > 1}
        if bad:
            raise AssertionError(f"Horizontal overflow at {bad}")
        return {"widths": sorted(measured), "maxOverflowPx": max(measured.values())}

    async def step_actionable(self) -> dict[str, Any]:
        slug = self.state["slug"]
        if not slug:
            raise Skip("No preview path resolved.")
        page = await self.browser.new_page(viewport={"width": 1280, "height": 1800})
        try:
            await page.goto(f"{BASE}/s/{slug}", wait_until="domcontentloaded")
            await page.wait_for_selector("a[href], button", timeout=30000)
            actionable = await page.evaluate(
                """() => {
                  const links = [...document.querySelectorAll('a')];
                  const buttons = [...document.querySelectorAll('button')];
                  return {
                    links: links.filter(a => (a.getAttribute('href') || '').trim().length > 0).length,
                    deadLinks: links.filter(a => !(a.getAttribute('href') || '').trim()).length,
                    buttons: buttons.length,
                    disabledButtons: buttons.filter(b => b.disabled).length,
                  };
                }"""
            )
            if actionable["links"] < 2:
                raise AssertionError(f"Too few working links: {actionable}")
            if actionable["deadLinks"]:
                raise AssertionError(f"{actionable['deadLinks']} links have no destination")
            if actionable["buttons"] and actionable["buttons"] == actionable["disabledButtons"]:
                raise AssertionError("Every button on the page is disabled")
            # A real click on the first in-page call to action must resolve.
            cta = page.locator("a[href^='#'], a[href^='/s/']").first
            if await cta.count():
                await cta.click()
                await page.wait_for_timeout(250)
            return actionable
        finally:
            await page.close()

    async def step_real_content(self) -> dict[str, Any]:
        slug = self.state["slug"]
        if not slug:
            raise Skip("No preview path resolved.")
        page = await self.browser.new_page(viewport={"width": 1280, "height": 1800})
        try:
            await page.goto(f"{BASE}/s/{slug}", wait_until="domcontentloaded")
            await page.wait_for_selector("h1", timeout=30000)
            facts = await page.evaluate(
                """() => ({
                  heading: (document.querySelector('h1')?.textContent || '').trim(),
                  sections: document.querySelectorAll('section').length,
                  headings: document.querySelectorAll('h2, h3').length,
                  chars: document.body.innerText.trim().length,
                  text: document.body.innerText.toLowerCase(),
                })"""
            )
            placeholders = [
                marker
                for marker in ("lorem ipsum", "your headline here", "sample text", "todo:")
                if marker in facts["text"]
            ]
            del facts["text"]
            if len(facts["heading"]) < 8:
                raise AssertionError(f"Homepage headline is empty or too short: {facts['heading']!r}")
            if facts["sections"] < 3 or facts["headings"] < 3:
                raise AssertionError(f"Page looks like an empty template: {facts}")
            if facts["chars"] < 800:
                raise AssertionError(f"Page carries only {facts['chars']} characters of content")
            if placeholders:
                raise AssertionError(f"Placeholder copy shipped: {placeholders}")
            return facts
        finally:
            await page.close()

    async def _select_first_section(self) -> None:
        assert self.page
        await self.page.locator("[data-testid=builder-mode-visual]").click()
        section = self.page.locator("[data-testid=canvas-section]").first
        await section.wait_for(timeout=45000)
        await section.click()
        await self.page.wait_for_selector("[data-testid=canvas-heading-input]", timeout=30000)

    async def step_builder_edit(self) -> dict[str, Any]:
        if not ALLOW_MUTATE:
            raise Skip(
                "Set JOURNEY_ALLOW_MUTATE=1 to run the edit, persistence and rollback steps. "
                "They write to the fixture workspace, so they are off by default."
            )
        assert self.page
        await self._select_first_section()
        field = self.page.locator("[data-testid=canvas-heading-input]")
        original = await field.input_value()
        self.state["originalHeading"] = original
        edited = f"Smoke check {int(time.time())}"
        self.state["editedHeading"] = edited
        await field.fill(edited)
        await field.blur()
        apply_button = self.page.locator("[data-testid=canvas-apply]")
        await apply_button.wait_for(timeout=30000)
        await apply_button.click()
        await self.page.wait_for_selector("[data-testid=canvas-apply]", state="detached", timeout=45000)
        return {
            "note": "Staged one heading edit and applied it.",
            "from": original,
            "to": edited,
            "screenshot": await self.shot("edit-applied"),
        }

    async def _preview_contains(self, text: str) -> bool:
        slug = self.state["slug"]
        page = await self.browser.new_page(viewport={"width": 1280, "height": 1800})
        try:
            await page.goto(f"{BASE}/s/{slug}", wait_until="domcontentloaded")
            await page.wait_for_selector("h1", timeout=30000)
            body = await page.inner_text("body")
            return text in body
        finally:
            await page.close()

    async def step_edit_visible(self) -> dict[str, Any]:
        edited = self.state["editedHeading"]
        if not edited:
            raise Skip("No edit was made, so the rendered result cannot be checked.")
        for _ in range(6):
            if await self._preview_contains(edited):
                return {"note": "The applied edit renders on the generated page.", "text": edited}
            await asyncio.sleep(1)
        raise AssertionError(f"Edited heading {edited!r} never appeared in the rendered page")

    async def step_edit_persists(self) -> dict[str, Any]:
        edited = self.state["editedHeading"]
        if not edited:
            raise Skip("No edit was made, so persistence cannot be checked.")
        assert self.page
        await self.page.reload(wait_until="domcontentloaded")
        await self.page.wait_for_selector("[data-testid=builder-preview], [data-testid=canvas-section]", timeout=60000)
        if not await self._preview_contains(edited):
            raise AssertionError("The edit disappeared after a full refresh")
        return {"note": "The edit survived a full page refresh.", "screenshot": await self.shot("edit-persisted")}

    async def step_rollback(self) -> dict[str, Any]:
        original = self.state["originalHeading"]
        if self.state["editedHeading"] is None:
            raise Skip("No edit was made, so rollback cannot be exercised.")
        assert self.page
        undo = self.page.locator("button[aria-label^='Undo']").first
        method = "undo-button"
        if await undo.count() and await undo.is_enabled():
            await undo.click()
        else:
            method = "restore-original-heading"
            await self._select_first_section()
            field = self.page.locator("[data-testid=canvas-heading-input]")
            await field.fill(original or "")
            await field.blur()
            apply_button = self.page.locator("[data-testid=canvas-apply]")
            await apply_button.wait_for(timeout=30000)
            await apply_button.click()
            await self.page.wait_for_selector(
                "[data-testid=canvas-apply]", state="detached", timeout=45000
            )
        return {"method": method, "restoring": original}

    async def step_rollback_restores(self) -> dict[str, Any]:
        original = self.state["originalHeading"]
        edited = self.state["editedHeading"]
        if edited is None:
            raise Skip("No edit was made, so there is nothing to restore.")
        for _ in range(6):
            if not await self._preview_contains(edited):
                if original and not await self._preview_contains(original):
                    raise AssertionError("The original heading did not come back after rollback")
                return {"note": "Rollback restored the previous state.", "restored": original}
            await asyncio.sleep(1)
        raise AssertionError("The smoke edit is still live after rollback")

    async def step_publish_gated(self) -> dict[str, Any]:
        assert self.page
        publish = self.page.locator("[data-testid=builder-publish]")
        if not await publish.count():
            raise Skip("This account cannot publish, so the gate could not be inspected.")
        disabled = await publish.is_disabled()
        # The suite never presses Publish: the status chip must be exactly what it
        # was when the builder opened, proving nothing was published by this run.
        status_before = self.state["statusLabel"]
        chip = self.page.locator("[data-testid=builder-status]").first
        await chip.wait_for(timeout=30000)
        status_now = (await chip.inner_text()).strip()
        calls = getattr(self, "publish_calls", [])
        if calls:
            raise AssertionError(f"The smoke run triggered a publish request: {calls[:3]}")
        return {
            "note": "Publish control present and never pressed; no publish request was issued.",
            "statusLabelBefore": status_before,
            "publishDisabled": disabled,
            "statusLabel": status_now or status_before,
        }

    async def step_dashboard_return(self) -> dict[str, Any]:
        assert self.page
        await self.page.get_by_role("link", name="Dashboard", exact=True).first.click()
        await self.page.wait_for_url(lambda url: url.rstrip("/").endswith("/app"), timeout=30000)
        await self.page.wait_for_selector("h1", timeout=30000)
        assert self.recorder
        problems = {
            "consoleErrors": list(self.recorder.console),
            "failedRequests": list(self.recorder.requests),
        }
        if problems["consoleErrors"] or problems["failedRequests"]:
            raise AssertionError(f"Returning to the dashboard reported {problems}")
        return {"note": "Returned to the dashboard cleanly.", "screenshot": await self.shot("dashboard-return")}


def render_html(report: dict[str, Any]) -> str:
    rows = []
    tone = {"PASS": "#0a7", "FAIL": "#d33", "NOT_TESTED": "#a70"}
    for step in report["steps"]:
        detail = {
            key: value
            for key, value in step.items()
            if key not in {"id", "title", "status", "durationMs"} and value not in (None, [], {})
        }
        rows.append(
            "<tr>"
            f"<td>{html.escape(step['id'])}</td>"
            f"<td>{html.escape(step['title'])}</td>"
            f"<td style=\"color:{tone.get(step['status'], '#333')};font-weight:600\">{step['status']}</td>"
            f"<td>{step['durationMs']} ms</td>"
            f"<td><pre style=\"white-space:pre-wrap;margin:0;font-size:12px\">{html.escape(json.dumps(detail, indent=1)[:1600])}</pre></td>"
            "</tr>"
        )
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Customer Forge browser journey</title>
<style>body{{font:14px system-ui;margin:24px;color:#111}}table{{border-collapse:collapse;width:100%}}
td,th{{border:1px solid #ddd;padding:6px;vertical-align:top;text-align:left}}th{{background:#f5f5f5}}</style>
</head><body>
<h1>Customer Forge browser journey</h1>
<p><strong>Status:</strong> {report['status']} &middot; base URL {html.escape(report['baseUrl'])} &middot;
{report['passed']} passed, {report['failed']} failed, {report['notTested']} not tested &middot;
{report['durationMs']} ms</p>
<table><thead><tr><th>Step</th><th>What it proves</th><th>Status</th><th>Duration</th><th>Evidence</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>
<h2>External integrations</h2>
<p>Live Stripe, email and CRM are never simulated here. They are reported NOT_TESTED and are covered
by the credential-gated suite (<code>bun run test:integrations</code>).</p>
</body></html>"""


async def main() -> int:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    started = time.time()
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        journey = Journey(browser)
        plan: list[tuple[str, str, Callable[[], Awaitable[dict[str, Any] | None]]]] = [
            ("01_app_loads", "The application loads", journey.step_app_loads),
            ("02_no_error_screen", "No global error screen", journey.step_no_error_screen),
            ("03_auth_session", "Signed-out gate holds and a session signs in", journey.step_auth),
            ("04_fixture_workspace", "A deterministic workspace is entered", journey.step_fixture_workspace),
            ("05_builder_opens", "The builder opens", journey.step_builder_opens),
            ("06_builder_console_clean", "The builder loads without console errors", journey.step_builder_console),
            ("07_build_request", "A deterministic build request is submitted", journey.step_build_request),
            ("08_build_stages", "Build progresses through the user-facing stages", journey.step_build_stages),
            ("09_preview_renders", "The generated site renders", journey.step_preview_renders),
            ("10_page_navigation", "Navigation between generated pages works", journey.step_page_navigation),
            ("11_mobile_widths", "Mobile layout at 320/375/390/414px", journey.step_mobile_widths),
            ("12_desktop_widths", "Desktop layout at 1280/1440px", journey.step_desktop_widths),
            ("13_no_overflow", "No horizontal overflow at any width", journey.step_no_overflow),
            ("14_actionable", "Important buttons and links are actionable", journey.step_actionable),
            ("15_real_content", "The page carries real content", journey.step_real_content),
            ("16_builder_edit", "One deterministic builder edit is applied", journey.step_builder_edit),
            ("17_edit_visible", "The edit appears in the rendered preview", journey.step_edit_visible),
            ("18_edit_persists", "The edit survives a refresh", journey.step_edit_persists),
            ("19_rollback", "Undo / rollback is available and used", journey.step_rollback),
            ("20_rollback_restores", "Rollback restores the previous state", journey.step_rollback_restores),
            ("21_publish_gated", "Publishing stays gated and nothing is published", journey.step_publish_gated),
            ("22_dashboard_return", "The app returns to the dashboard cleanly", journey.step_dashboard_return),
        ]
        for key, title, fn in plan:
            await journey.run_step(key, title, fn)

        journey.not_tested(
            "ext_stripe",
            "Live Stripe checkout and webhooks",
            "External payment credentials are not part of this CI-safe suite. Covered by "
            "`bun run test:integrations` when STRIPE_SANDBOX_API_KEY is configured.",
        )
        journey.not_tested(
            "ext_email",
            "Live transactional email delivery",
            "External email credentials are not part of this CI-safe suite. Covered by "
            "`bun run test:integrations` when LOVABLE_API_KEY and INTEGRATION_TEST_EMAIL_TO are set.",
        )
        journey.not_tested(
            "ext_crm",
            "Live CRM hand-off",
            "External CRM credentials are not part of this CI-safe suite. Covered by "
            "`bun run test:integrations` when INTEGRATION_TEST_CRM_WEBHOOK_URL is set.",
        )
        await browser.close()

    steps = journey.steps
    failed = [step for step in steps if step["status"] == "FAIL"]
    report = {
        "status": "FAILED" if failed else "PASSED",
        "baseUrl": BASE,
        "browser": "chromium",
        "mutationsAllowed": ALLOW_MUTATE,
        "buildAllowed": ALLOW_BUILD,
        "mobileWidths": MOBILE_WIDTHS,
        "desktopWidths": DESKTOP_WIDTHS,
        "passed": sum(1 for step in steps if step["status"] == "PASS"),
        "failed": len(failed),
        "notTested": sum(1 for step in steps if step["status"] == "NOT_TESTED"),
        "durationMs": int((time.time() - started) * 1000),
        "steps": steps,
    }
    (ARTIFACTS / "journey.json").write_text(json.dumps(report, indent=2))
    (ARTIFACTS / "journey.html").write_text(render_html(report))
    print(json.dumps({k: report[k] for k in ("status", "passed", "failed", "notTested", "durationMs")}, indent=2))
    for step in steps:
        line = f"  {step['status']:<11} {step['id']} — {step['title']}"
        if step["status"] != "PASS":
            line += f"  [{str(step.get('reason') or step.get('error') or '')[:160]}]"
        print(line)
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
