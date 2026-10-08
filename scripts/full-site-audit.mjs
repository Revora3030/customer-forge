#!/usr/bin/env node
/**
 * FULL SITE AUDIT — click-every-button browser test (free: Playwright + Chromium)
 * =============================================================================
 *
 * Signs in, opens the builder, finds the workspace's site, then visits every
 * page of the rendered customer site at desktop and phone widths. On each page
 * it clicks every menu link, call-to-action, button, accordion and slider, and
 * records console errors, page crashes, 4xx/5xx responses, dead clicks,
 * zero-size or unreadable elements and horizontal overflow.
 *
 * Runs anywhere Node 18+ and Playwright are installed (a self-hosted n8n
 * Execute Command node, GitHub Actions, a laptop). Prints ONE JSON report to
 * stdout and writes screenshots + report.json to ARTIFACTS_DIR.
 *
 * Environment
 *   BASE_URL          default https://revoragrowthsystems.com
 *   TEST_EMAIL        test account email      (optional: without it only public pages are audited)
 *   TEST_PASSWORD     test account password
 *   SITE_PATH         optional site path to audit, e.g. /s/elite-pressure-washing
 *                     (otherwise read from the builder preview after sign-in)
 *   ALLOW_BUILD=1     if the workspace has no site yet, start a build and wait for it
 *   BUILD_WAIT_SECONDS  default 180
 *   ALLOW_SUBMIT=1    allow real form submissions (default off: forms are only checked for validation)
 *   ARTIFACTS_DIR     default /tmp/qa-run
 *   MAX_PAGES         default 15
 *
 * Safety: never presses Publish, never deletes, never submits forms unless
 * ALLOW_SUBMIT=1, and never follows links off the site under test (tel:,
 * mailto: and external links are format-checked, not opened).
 *
 * Exit code: 0 PASS/WARNING, 1 FAIL, 2 the audit itself could not run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.log(JSON.stringify({ status: "NOT_RUN", reason: "Playwright is not installed. Run: npm i playwright && npx playwright install chromium" }));
  process.exit(2);
}

const BASE_URL = (process.env.BASE_URL || "https://revoragrowthsystems.com").replace(/\/$/, "");
const TEST_EMAIL = process.env.TEST_EMAIL || "";
const TEST_PASSWORD = process.env.TEST_PASSWORD || "";
const ARTIFACTS = process.env.ARTIFACTS_DIR || "/tmp/qa-run";
const ALLOW_BUILD = process.env.ALLOW_BUILD === "1";
const ALLOW_SUBMIT = process.env.ALLOW_SUBMIT === "1";
const BUILD_WAIT = Number(process.env.BUILD_WAIT_SECONDS || 180) * 1000;
const MAX_PAGES = Number(process.env.MAX_PAGES || 15);
const CLICK_TIMEOUT = 3000;
const PAGE_BUDGET_MS = Number(process.env.PAGE_BUDGET_SECONDS || 120) * 1000;
const MAX_TARGETS = Number(process.env.MAX_TARGETS_PER_PAGE || 60);
const log = (msg) => process.stderr.write(`[audit] ${msg}\n`);
mkdirSync(ARTIFACTS, { recursive: true });

const NOISE = [/favicon/i, /sourcemap/i, /React DevTools/i, /stripe\.com/i, /googletagmanager|google-analytics|doubleclick/i, /ERR_ABORTED/];
const noisy = (text) => NOISE.some((re) => re.test(text));

const report = {
  test_run_timestamp: new Date().toISOString(),
  base_url: BASE_URL,
  status: "PASS",
  summary: {
    pages_audited: 0,
    total_buttons_tested: 0,
    failed_buttons_count: 0,
    console_errors_count: 0,
    network_errors_count: 0,
    page_crashes_count: 0,
    visual_defects_count: 0,
    build_status: "NOT_CHECKED",
    signed_in: false,
    site_path: null,
  },
  failures: { dead_clicks: [], console_errors: [], page_crashes: [], network_failures: [], visual_defects: [], layout: [] },
  notes: [],
  screenshots: [],
  actionable_fixes: [],
};

let shotN = 0;
async function shot(page, label) {
  const file = join(ARTIFACTS, `${String(++shotN).padStart(2, "0")}-${label.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.png`);
  try {
    await page.screenshot({ path: file, fullPage: false });
    report.screenshots.push(file);
  } catch {
    /* page already closed */
  }
  return file;
}

function listen(page, where) {
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (noisy(text)) return;
    const loc = msg.location();
    report.failures.console_errors.push({ page: where(), message: text.slice(0, 500), location: loc?.url ? `${loc.url}:${loc.lineNumber}` : null });
  });
  page.on("pageerror", (err) => report.failures.page_crashes.push({ page: where(), message: String(err?.message || err).slice(0, 500) }));
  page.on("response", (res) => {
    const status = res.status();
    if (status < 400) return;
    const url = res.url();
    if (noisy(url)) return;
    report.failures.network_failures.push({ page: where(), url: url.slice(0, 300), status, statusText: res.statusText() });
  });
}

/* ------------------------------------------------------------ sign in */
async function signIn(page) {
  await page.goto(`${BASE_URL}/auth`, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.locator('input[type="email"]').first().fill(TEST_EMAIL);
  const pwd = page.locator('input[type="password"]').first();
  if (!(await pwd.count())) throw new Error("No password field on /auth (magic-link mode?)");
  await pwd.fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').first().click();
  try {
    await page.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 30000 });
  } catch {
    const alert = await page.locator('[role="alert"], .text-destructive').first().innerText().catch(() => "");
    await shot(page, "login-failed");
    throw new Error(`Login did not leave /auth${alert ? `: ${alert.slice(0, 200)}` : ""}`);
  }
  report.summary.signed_in = true;
}

/* ---------------------------------------------- builder + site discovery */
async function findSite(page) {
  await page.goto(`${BASE_URL}/app/website`, { waitUntil: "domcontentloaded", timeout: 45000 });
  const frameSel = "[data-testid=builder-preview-frame]";
  const deadline = Date.now() + (ALLOW_BUILD ? BUILD_WAIT : 45000);
  let startedBuild = false;
  while (Date.now() < deadline) {
    const src = await page.locator(frameSel).first().getAttribute("data-preview-src").catch(() => null);
    if (src) {
      report.summary.build_status = "COMPLETED";
      return new URL(src, BASE_URL).pathname.replace(/\/$/, "");
    }
    const body = await page.locator("body").innerText().catch(() => "");
    if (/build was interrupted|could not finish/i.test(body)) {
      report.summary.build_status = "STALLED";
      report.notes.push("Builder shows 'The build was interrupted'.");
      await shot(page, "build-stalled");
      return null;
    }
    if (ALLOW_BUILD && !startedBuild) {
      const build = page.getByRole("button", { name: /build (my )?(site|website)|^build$/i }).first();
      if (await build.count()) {
        await build.click().catch(() => undefined);
        startedBuild = true;
        report.notes.push("Started a site build (ALLOW_BUILD=1).");
      }
    }
    await page.waitForTimeout(3000);
  }
  report.summary.build_status = startedBuild ? "STALLED" : "NO_SITE";
  await shot(page, "no-preview");
  return null;
}

/* ------------------------------------------------------------ page audit */
const sameSite = (href, sitePath) => {
  try {
    const url = new URL(href, BASE_URL);
    return url.origin === new URL(BASE_URL).origin && url.pathname.startsWith(sitePath);
  } catch {
    return false;
  }
};

async function pageState(page) {
  return page.evaluate(() => ({
    url: location.href,
    scrollY: Math.round(scrollY),
    html: document.body.innerHTML.length,
    dialogs: document.querySelectorAll('[role="dialog"]:not([hidden]), dialog[open], [role="listbox"], [role="menu"], [data-radix-popper-content-wrapper]').length,
    selected: [...document.querySelectorAll('[aria-selected="true"], [aria-pressed="true"], [data-state="active"]')].length + ":" + [...document.querySelectorAll('[aria-selected="true"]')].map((e) => (e.textContent || "").slice(0, 20)).join("|"),
    expanded: [...document.querySelectorAll("[aria-expanded]")].map((el) => el.getAttribute("aria-expanded")).join(""),
    detailsOpen: document.querySelectorAll("details[open]").length,
    focus: document.activeElement ? document.activeElement.outerHTML.slice(0, 80) : "",
    sliders: [...document.querySelectorAll('[role="slider"]')].map((el) => el.getAttribute("aria-valuenow")).join(","),
  }));
}

async function auditPage(context, url, sitePath, width, label) {
  const page = await context.newPage();
  let where = `${label} ${url}`;
  listen(page, () => where);
  const result = { links: new Set() };
  try {
    log(`${label} ${url}`);
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
    await page.waitForLoadState("load", { timeout: 15000 }).catch(() => undefined);
    if (!res || res.status() >= 400) {
      report.failures.network_failures.push({ page: where, url, status: res?.status() ?? 0, statusText: "page did not load" });
      return result;
    }
    report.summary.pages_audited += 1;
    await page.waitForTimeout(800);
    await shot(page, `${label}-${new URL(url).pathname}`);

    // Header / menu presence.
    const hasHeader = await page.locator("header, [data-composition] nav, nav").count();
    if (!hasHeader) report.failures.layout.push({ page: where, problem: "no menu bar / navigation found" });

    // Layout: overflow, zero-size actions, unreadable text.
    const layout = await page.evaluate(() => {
      const out = { overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth), zero: [], contrast: [], noHref: [] };
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const toRgb = (c) => {
        if (!ctx) return null;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = "#000";
        ctx.fillStyle = c;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return `rgb(${d[0]},${d[1]},${d[2]})`;
      };
      const lum = (raw) => {
        const c = toRgb(raw);
        if (!c) return null;
        const m = c.match(/\d+(\.\d+)?/g);
        if (!m) return null;
        const [r, g, b] = m.slice(0, 3).map((v) => {
          const s = Number(v) / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const bgOf = (el) => {
        for (let n = el; n; n = n.parentElement) {
          const bg = getComputedStyle(n).backgroundColor;
          const a = bg.match(/(?:,|\/)\s*([\d.]+%?)\s*\)$/);
          const alpha = a ? (a[1].endsWith("%") ? Number(a[1].slice(0, -1)) / 100 : Number(a[1])) : 1;
          if (bg && bg !== "transparent" && alpha > 0.5) return bg;
          const img = getComputedStyle(n).backgroundImage;
          if (img && img !== "none") return null; // text over a picture/gradient: not measurable

        }
        return getComputedStyle(document.body).backgroundColor || "rgb(255,255,255)";
      };
      for (const el of document.querySelectorAll("a, button, [role=button]")) {
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        if (st.display === "none" || st.visibility === "hidden") continue;
        if (el.closest("[hidden],[aria-hidden=true],dialog:not([open])")) continue;
        // A link hidden at this width by a parent (desktop/phone duplicates) has no box: that's not a defect.
        const hiddenByParent = !el.checkVisibility?.({ checkVisibilityCSS: true, checkOpacity: false });
        if ((r.width === 0 || r.height === 0) && !hiddenByParent && (el.textContent || "").trim()) out.zero.push((el.textContent || "").trim().slice(0, 40));
        if (el.tagName === "A" && !(el.getAttribute("href") || "").trim()) out.noHref.push((el.textContent || "").trim().slice(0, 40));
      }
      for (const el of document.querySelectorAll("h1,h2,h3,p,a,button,li")) {
        const text = (el.textContent || "").trim();
        if (!text || el.children.length > 3) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const fg = lum(getComputedStyle(el).color);
        const bgRaw = bgOf(el);
        if (!bgRaw) continue;
        const bg = lum(bgRaw);
        if (fg == null || bg == null) continue;
        const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        if (ratio < 3) out.contrast.push({ text: text.slice(0, 50), ratio: Math.round(ratio * 100) / 100 });
        if (out.contrast.length >= 10) break;
      }
      return out;
    });
    if (layout.overflow > 1) report.failures.layout.push({ page: where, problem: `horizontal overflow ${layout.overflow}px (scrollWidth > clientWidth)` });
    for (const text of layout.zero) report.failures.visual_defects.push({ page: where, element: text, problem: "zero-size clickable element" });
    for (const text of layout.noHref) report.failures.visual_defects.push({ page: where, element: text, problem: "link with no destination" });
    for (const c of layout.contrast) report.failures.visual_defects.push({ page: where, element: c.text, problem: `low text contrast ${c.ratio}:1` });

    // Mobile sticky action bar.
    if (width < 768) {
      const sticky = page.locator('[data-testid="site-sticky-actions"], nav[aria-label="Quick actions"]');
      if (!(await sticky.count())) report.notes.push(`${where}: no phone quick-action bar (only shown when a real phone/contact page exists)`);
    }

    // Collect every clickable target.
    const targets = await page.evaluate(() => {
      const sel = "header a, nav a, footer a, a, button, [role=button], [role=tab], summary, [role=slider]";
      const seen = new Set();
      const list = [];
      const section = (el) => {
        const s = el.closest("header,footer,section,[data-section-kind],main");
        if (!s) return "page";
        return s.tagName === "HEADER" ? "Header" : s.tagName === "FOOTER" ? "Footer" : s.getAttribute("data-section-kind") || s.id || s.tagName.toLowerCase();
      };
      const counts = new Map();
      document.querySelectorAll(sel).forEach((el, i) => {
        if (seen.has(el)) return;
        seen.add(el);
        const base = `${el.tagName}|${el.getAttribute("href") || ""}|${(el.textContent || "").trim().slice(0, 40)}`;
        const n = counts.get(base) || 0;
        counts.set(base, n + 1);
        el.setAttribute("data-qa-key", `${base}#${n}`);
        const st = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        if (st.display === "none" || st.visibility === "hidden" || r.width === 0 || r.height === 0) return;
        if (el.closest("[data-preview-bridge],[data-builder-only]")) return;
        void i;
        list.push({
          id: el.getAttribute("data-qa-key"),
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute("role") || "",
          type: el.getAttribute("type") || "",
          text: ((el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ")).slice(0, 60),
          href: el.getAttribute("href") || "",
          target: el.getAttribute("target") || "",
          inForm: Boolean(el.closest("form")),
          section: section(el),
        });
      });
      return list;
    });

    const pageStarted = Date.now();
    const seenKeys = new Set();
    let tested = 0;
    for (const t of targets) {
      if (/publish|delete|remove|sign out|log out/i.test(t.text)) continue;
      // The same link repeated in header, body and footer is clicked once per page.
      const key = `${t.tag}|${t.href}|${t.text}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      if (++tested > MAX_TARGETS || Date.now() - pageStarted > PAGE_BUDGET_MS) {
        report.notes.push(`${where}: stopped after ${tested - 1} controls (page time/limit budget); the rest were not clicked.`);
        break;
      }
      const el = page.locator(`[data-qa-key="${t.id.replace(/["\\]/g, "\\$&")}"]`);
      const name = `${t.tag}${t.role ? `[role=${t.role}]` : ""} "${t.text}"`;
      // tel:/mailto: and external links: check the format, don't open them.
      if (t.href) {
        if (/^tel:/i.test(t.href)) {
          report.summary.total_buttons_tested += 1;
          if (t.href.replace(/\D/g, "").length < 7) dead(where, name, t, `invalid phone link ${t.href}`);
          continue;
        }
        if (/^mailto:/i.test(t.href)) {
          report.summary.total_buttons_tested += 1;
          if (!/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+/i.test(t.href)) dead(where, name, t, `invalid email link ${t.href}`);
          continue;
        }
        if (/^javascript:/i.test(t.href)) { report.summary.total_buttons_tested += 1; dead(where, name, t, "javascript: link"); continue; }
        if (/^https?:/i.test(t.href) && !sameSite(t.href, sitePath)) continue; // off-site
        if (sameSite(t.href, sitePath) || t.href.startsWith("/")) result.links.add(new URL(t.href, BASE_URL).href.split("#")[0]);
        // Links to another page: check the destination answers (no 404/5xx)
        // instead of clicking away and reloading for every link.
        const abs = new URL(t.href, BASE_URL);
        if (!t.href.startsWith("#") && abs.origin === new URL(BASE_URL).origin && abs.pathname !== new URL(url).pathname) {
          report.summary.total_buttons_tested += 1;
          const status = await linkStatus(context, abs.href.split("#")[0]);
          if (status === 0 || status >= 400) dead(where, name, t, `link goes to ${abs.pathname} which returned ${status || "no response"}`);
          continue;
        }
      }
      if (t.type === "submit" && t.inForm && !ALLOW_SUBMIT) {
        // Check validation without sending anything.
        report.summary.total_buttons_tested += 1;
        const valid = await el.evaluate((b) => b.form?.checkValidity?.() ?? true).catch(() => true);
        report.notes.push(`${where}: form "${t.text}" not submitted (ALLOW_SUBMIT off); empty form ${valid ? "has no browser-level required fields (it may still validate in code — not checked without submitting)" : "is blocked by required-field validation as expected"}`);
        continue;
      }
      report.summary.total_buttons_tested += 1;
      const before = await pageState(page).catch(() => null);
      const errorsBefore = report.failures.page_crashes.length;
      try {
        await el.scrollIntoViewIfNeeded({ timeout: CLICK_TIMEOUT });
        const popup = context.waitForEvent("page", { timeout: CLICK_TIMEOUT }).catch(() => null);
        await el.click({ timeout: CLICK_TIMEOUT });
        await page.waitForTimeout(t.role === "slider" ? 100 : 600);
        if (t.role === "slider") {
          await el.focus();
          await page.keyboard.press("ArrowRight");
          await page.waitForTimeout(150);
        }
        const opened = await Promise.race([popup, new Promise((r) => setTimeout(() => r(null), 50))]);
        if (opened) { await opened.close().catch(() => undefined); }
        const after = await pageState(page).catch(() => null);
        if (report.failures.page_crashes.length > errorsBefore) {
          dead(where, name, t, `click threw: ${report.failures.page_crashes.at(-1).message}`);
        } else if (
          before && after && !opened &&
          JSON.stringify({ ...before, focus: "" }) === JSON.stringify({ ...after, focus: "" }) &&
          !t.href.startsWith("#") &&
          // A link to the page you're already on (the logo on the home page) is fine.
          !(t.href && new URL(t.href, url).pathname === new URL(url).pathname)
        ) {
          dead(where, name, t, `click did nothing after ${CLICK_TIMEOUT}ms (no navigation, scroll, dialog, expand or slider change)`);
        }
        // Opened a dialog: check typing + close.
        if (after && before && after.dialogs > before.dialogs) {
          const dialog = page.locator('[role="dialog"], dialog[open]').last();
          const input = dialog.locator("input:not([type=hidden]), textarea").first();
          if (await input.count()) await input.fill("QA").catch(() => dead(where, name, t, "dialog input does not accept typing"));
          await page.keyboard.press("Escape");
          await page.waitForTimeout(300);
          if ((await pageState(page)).dialogs > before.dialogs) {
            const close = dialog.getByRole("button", { name: /close|cancel|×/i }).first();
            if (await close.count()) await close.click().catch(() => undefined);
          }
        }
      } catch (error) {
        dead(where, name, t, `not clickable within ${CLICK_TIMEOUT}ms: ${String(error.message || error).split("\n")[0].slice(0, 160)}`);
      }
      // A toggle the click opened (phone menu, accordion, disclosure) is
      // closed again with the same control — that also proves it toggles back.
      const expanded = await el.getAttribute("aria-expanded").catch(() => null);
      if (expanded === "true" && t.tag !== "summary") {
        await el.click({ timeout: CLICK_TIMEOUT }).catch(() => undefined);
        await page.waitForTimeout(300);
        if ((await el.getAttribute("aria-expanded").catch(() => null)) === "true") {
          const closer = page.getByRole("button", { name: /close( menu)?/i }).first();
          if (await closer.count()) await closer.click({ timeout: CLICK_TIMEOUT }).catch(() => dead(where, name, t, "opened but could not be closed again"));
        }
      }
      // Close anything else the click left open (dropdowns, popovers,
      // dialogs) the way a visitor would: Escape, then a tap on empty space.
      await closeOverlays(page);
      // Return to the page under audit after a navigation.
      if (page.url().split("#")[0] !== url.split("#")[0]) {
        where = `${label} ${url}`;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 }).catch(() => undefined);
        await page.waitForTimeout(400);
        await page.evaluate(() => {
          const sel = "header a, nav a, footer a, a, button, [role=button], [role=tab], summary, [role=slider]";
          const counts = new Map();
          const seen = new Set();
          document.querySelectorAll(sel).forEach((el) => {
            if (seen.has(el)) return;
            seen.add(el);
            const base = `${el.tagName}|${el.getAttribute("href") || ""}|${(el.textContent || "").trim().slice(0, 40)}`;
            const n = counts.get(base) || 0;
            counts.set(base, n + 1);
            el.setAttribute("data-qa-key", `${base}#${n}`);
          });
        }).catch(() => undefined);
      }
    }
  } finally {
    await page.close();
  }
  return result;
}

async function closeOverlays(page) {
  await page.waitForTimeout(250);
  for (let i = 0; i < 4; i += 1) {
    const open = await page
      .evaluate(
        () =>
          document.querySelectorAll('[role="listbox"], [role="menu"], [data-radix-popper-content-wrapper], dialog[open]').length +
          (getComputedStyle(document.body).pointerEvents === "none" ? 1 : 0),
      )
      .catch(() => 0);
    if (!open) return;
    await page.keyboard.press("Escape").catch(() => undefined);
    await page.waitForTimeout(200);
    if (i >= 1) await page.mouse.click(2, Math.round((page.viewportSize()?.height ?? 800) / 2)).catch(() => undefined);
  }
}

const statusCache = new Map();
async function linkStatus(context, href) {
  if (statusCache.has(href)) return statusCache.get(href);
  let status = 0;
  try {
    const res = await context.request.get(href, { timeout: 20000, maxRedirects: 5 });
    status = res.status();
  } catch {
    status = 0;
  }
  statusCache.set(href, status);
  return status;
}

function dead(where, name, t, error) {
  report.failures.dead_clicks.push({ page: where, element: name, text: t.text, href: t.href || null, section: t.section, error });
}

/* ------------------------------------------------------------ main */
const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await desktop.newPage();
  listen(page, () => `app ${page.url()}`);

  let sitePath = process.env.SITE_PATH ? process.env.SITE_PATH.replace(/\/$/, "") : null;
  if (TEST_EMAIL && TEST_PASSWORD) {
    try {
      await signIn(page);
      await shot(page, "signed-in");
      if (!sitePath) sitePath = await findSite(page);
      await shot(page, "builder");
    } catch (error) {
      report.status = "FAIL";
      report.notes.push(`Sign-in/builder step failed: ${error.message}`);
    }
  } else {
    report.notes.push("TEST_EMAIL/TEST_PASSWORD not set: sign-in and builder were not tested.");
  }

  // Public marketing pages are always audited.
  const roots = [`${BASE_URL}/`];
  if (sitePath) roots.push(`${BASE_URL}${sitePath}`);
  report.summary.site_path = sitePath;

  for (const [ctxWidth, label] of [[1280, "desktop"], [390, "mobile"]]) {
    const context = ctxWidth === 1280 ? desktop : await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    for (const root of roots) {
      const prefix = new URL(root).pathname === "/" ? "/" : new URL(root).pathname;
      const queue = [root];
      const done = new Set();
      while (queue.length && done.size < (prefix === "/" ? 1 : MAX_PAGES)) {
        const url = queue.shift();
        if (done.has(url)) continue;
        done.add(url);
        const { links } = await auditPage(context, url, prefix === "/" ? "/__none__" : prefix, ctxWidth, label);
        for (const link of links) if (!done.has(link) && new URL(link).pathname.startsWith(prefix) && prefix !== "/") queue.push(link);
      }
    }
    if (context !== desktop) await context.close();
  }
} catch (error) {
  report.status = "FAIL";
  report.notes.push(`Audit stopped: ${error.message}`);
} finally {
  await browser.close();
}

/* ------------------------------------------------------------ verdict */
const f = report.failures;
Object.assign(report.summary, {
  failed_buttons_count: f.dead_clicks.length,
  console_errors_count: f.console_errors.length,
  network_errors_count: f.network_failures.length,
  page_crashes_count: f.page_crashes.length,
  visual_defects_count: f.visual_defects.length + f.layout.length,
});
const hard = f.dead_clicks.length + f.console_errors.length + f.page_crashes.length + f.network_failures.filter((n) => n.status >= 500 || n.status === 404).length + f.layout.length;
if (report.status !== "FAIL") report.status = hard ? "FAIL" : f.visual_defects.length || f.network_failures.length ? "WARNING" : "PASS";
if (["STALLED", "NO_SITE"].includes(report.summary.build_status)) report.status = "FAIL";

const fixes = new Set();
for (const d of f.dead_clicks) fixes.add(`Dead ${d.section} control "${d.text}" on ${d.page}: ${d.error}. Check the AI composition for that section (src/components/site/CompositionRenderer.tsx renders it; links are repaired by src/lib/builder/link-integrity.server.ts).`);
for (const c of f.page_crashes) fixes.add(`Page crash on ${c.page}: ${c.message}`);
for (const n of f.network_failures) fixes.add(`HTTP ${n.status} ${n.url} (seen on ${n.page})`);
for (const l of f.layout) fixes.add(`${l.problem} on ${l.page}${/menu/.test(l.problem) ? " — use 'Design my menu & footer' in the builder (src/lib/site-upgrade.functions.ts designSiteChrome)" : ""}`);
if (report.summary.build_status === "STALLED") fixes.add("Build stalled — check generation_jobs.error_message and src/lib/site-engine.worker.server.ts stage timings.");
report.actionable_fixes = [...fixes].slice(0, 40);

writeFileSync(join(ARTIFACTS, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
process.exit(report.status === "FAIL" ? 1 : 0);
