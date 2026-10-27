/**
 * PAGE SWEEP
 * ==========
 * Crawls a running site from its home page and its public sitemap, then
 * measures every page at phone and desktop width: HTTP status, script errors,
 * sideways scrolling, title / description / single h1, unnamed buttons and
 * links, images without alt, small phone tap targets and broken internal
 * links. Nothing here is a visual opinion; every finding is a measurement.
 *
 * usage: node scripts/page-sweep.mjs [baseUrl] [--max=120] [--per-family=4] [--out=page-sweep.json]
 * Without Playwright the run is NOT_VERIFIED (exit 2), never a pass.
 */
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) ?? "http://127.0.0.1:5199").replace(/\/$/, "");
const max = Number((args.find((a) => a.startsWith("--max=")) ?? "--max=120").split("=")[1]);
const out = (args.find((a) => a.startsWith("--out=")) ?? "--out=page-sweep.json").split("=")[1];
const VIEWPORTS = [
  { name: "phone", width: 390, height: 800 },
  { name: "desktop", width: 1280, height: 800 },
];
// Paths that are not pages, or that need a signed-in user or a one-time token.
const SKIP = /^\/(api|_authenticated|app|admin|my|portal|invite|unsubscribe|p\/|s\/|mcp|lovable|\.well-known)|\.(xml|txt|webmanifest|png|jpg|svg|ico)$/;

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.log(JSON.stringify({ status: "NOT_VERIFIED", reason: "playwright is not installed" }));
  process.exit(2);
}

const browser = await playwright.chromium.launch();
const seen = new Map(); // path -> status
const queue = ["/"];
// Pages per URL family (/states/*, /local/*, ...), so generated families are sampled evenly.
const FAMILY_CAP = Number((args.find((a) => a.startsWith("--per-family=")) ?? "--per-family=4").split("=")[1]);
const familyCount = new Map();
const familyOf = (path) => path.split("/")[1] ?? "";
const findings = [];
const add = (page, viewport, severity, check, detail) => findings.push({ page, viewport, severity, check, detail });

try {
  const sitemap = await fetch(`${base}/sitemap.xml`).then((r) => (r.ok ? r.text() : "")).catch(() => "");
  for (const match of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    try {
      const url = new URL(match[1]);
      if (url.pathname !== "/" && !SKIP.test(url.pathname)) queue.push(url.pathname);
    } catch { /* ignore malformed entries */ }
  }
} catch { /* sitemap is optional */ }

const context = await browser.newContext({ viewport: VIEWPORTS[0] });
const probe = await context.newPage();
const pages = [];

while (queue.length && pages.length < max) {
  const path = queue.shift();
  if (seen.has(path)) continue;
  const family = familyOf(path);
  if ((familyCount.get(family) ?? 0) >= FAMILY_CAP) { seen.set(path, null); continue; }
  familyCount.set(family, (familyCount.get(family) ?? 0) + 1);
  seen.set(path, null);
  let links = [];
  for (const viewport of VIEWPORTS) {
    const page = await context.newPage();
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message.slice(0, 200)));
    let status = 0;
    try {
      const response = await page.goto(base + path, { waitUntil: "networkidle", timeout: 60_000 });
      status = response?.status() ?? 0;
      await page.waitForTimeout(400);
    } catch (error) {
      add(path, viewport.name, "P0", "load", String(error.message).slice(0, 160));
      await page.close();
      continue;
    }
    if (viewport.name === "phone") seen.set(path, status);
    if (status >= 400) add(path, viewport.name, "P0", "status", `HTTP ${status}`);
    for (const message of errors) add(path, viewport.name, "P0", "script-error", message);

    const m = await page.evaluate((isPhone) => {
      const root = document.documentElement;
      const name = (el) => (el.labels?.length ? [...el.labels].map((l) => l.textContent).join(" ") : "") || (el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.querySelector("img[alt]")?.getAttribute("alt") || "").trim();
      const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
      const interactive = [...document.querySelectorAll("a[href], button, [role=button]")].filter(visible);
      return {
        overflow: root.scrollWidth - root.clientWidth,
        title: document.title.trim(),
        description: document.querySelector('meta[name="description"]')?.getAttribute("content")?.trim() ?? "",
        h1: document.querySelectorAll("h1").length,
        unnamed: interactive.filter((el) => !name(el)).length,
        noAlt: [...document.querySelectorAll("img")].filter((img) => !img.hasAttribute("alt")).length,
        // WCAG 2.5.8 exempts links that sit inside a sentence.
        smallTargets: isPhone ? interactive.filter((el) => {
          const r = el.getBoundingClientRect();
          if (r.width >= 24 && r.height >= 24) return false;
          const block = el.tagName === "A" ? el.closest("p, li, dd, td") : null;
          const inline = block && (block.textContent ?? "").trim().length > (el.textContent ?? "").trim().length + 12;
          return !inline;
        }).length : 0,
        links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter(Boolean),
      };
    }, viewport.name === "phone");

    if (m.overflow > 1) add(path, viewport.name, "P0", "overflow", `${m.overflow}px sideways scroll`);
    if (viewport.name === "phone") {
      if (!m.title) add(path, "all", "P1", "title", "missing");
      if (!m.description) add(path, "all", "P1", "description", "missing");
      if (m.h1 !== 1) add(path, "all", "P1", "h1", `${m.h1} h1 elements`);
      links = m.links;
    }
    if (m.unnamed) add(path, viewport.name, "P1", "unnamed-control", `${m.unnamed} buttons or links have no accessible name`);
    if (m.noAlt) add(path, viewport.name, "P2", "image-alt", `${m.noAlt} images have no alt attribute`);
    if (m.smallTargets) add(path, viewport.name, "P2", "tap-target", `${m.smallTargets} controls smaller than 24px`);
    await page.close();
  }
  pages.push(path);
  for (const href of links) {
    try {
      const url = new URL(href, base + path);
      if (url.origin !== base || SKIP.test(url.pathname) || url.hash && url.pathname === path) continue;
      if (!seen.has(url.pathname)) queue.push(url.pathname);
    } catch { /* mailto, tel, malformed */ }
  }
}

// Every internal link target the crawl reached must have answered.
for (const [path, status] of seen) if (status !== null && status >= 400) add(path, "phone", "P0", "broken-link", `HTTP ${status}`);
await probe.close();
await browser.close();

const counts = { P0: 0, P1: 0, P2: 0 };
for (const f of findings) counts[f.severity] += 1;
const report = { status: counts.P0 ? "FAILED" : "PASSED", base, pagesChecked: pages.length, families: Object.fromEntries(familyCount), counts, findings };
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, pagesChecked: pages.length, families: report.families, counts }));
process.exit(counts.P0 ? 1 : 0);
