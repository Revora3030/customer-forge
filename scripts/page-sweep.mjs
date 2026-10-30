/**
 * PAGE SWEEP
 * ==========
 * Crawls a running site from its home page and its public sitemap, then
 * measures every page at phone and desktop width: HTTP status, script errors,
 * sideways scrolling, title / description / single h1, unnamed buttons and
 * links, images without alt, small phone tap targets and broken internal
 * links. Nothing here is a visual opinion; every finding is a measurement.
 *
 * usage: node scripts/page-sweep.mjs [baseUrl] [--max=120] [--per-family=4] [--out=page-sweep.json] [--target=24]
 * --top=N sets how many offenders are listed (default 40).
 * --a11y runs axe-core (WCAG 2.0/2.1/2.2 A and AA rules) on every page at phone width and lists the rules
 * that fail, most widespread first. Automated rules cannot prove a page is accessible; they only find what they can.
 * --all-viewports also measures 320px (small phone) and 768px (tablet) for sideways scrolling and layout.
 * --target=44 holds phone tap targets to the 44px comfort size instead of the 24px WCAG 2.5.8
 * minimum, and lists the controls that miss it, most widespread first, so shared chrome shows up.
 * Without Playwright the run is NOT_VERIFIED (exit 2), never a pass.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) ?? "http://127.0.0.1:5199").replace(/\/$/, "");
const max = Number((args.find((a) => a.startsWith("--max=")) ?? "--max=120").split("=")[1]);
const out = (args.find((a) => a.startsWith("--out=")) ?? "--out=page-sweep.json").split("=")[1];
const RUN_A11Y = args.includes("--a11y");
const MIN_TARGET = Number((args.find((a) => a.startsWith("--target=")) ?? "--target=24").split("=")[1]);
// --all-viewports adds the QA bot's small-phone (320px) and tablet (768px) widths.
const VIEWPORTS = [
  { name: "phone", width: 390, height: 800 },
  ...(args.includes("--all-viewports")
    ? [
        { name: "small-phone", width: 320, height: 640 },
        { name: "tablet", width: 768, height: 1024 },
      ]
    : []),
  { name: "desktop", width: 1280, height: 800 },
];
// Paths that are not pages, or that need a signed-in user or a one-time token.
const SKIP = /^\/(api|_authenticated|app|admin|my|portal|invite|unsubscribe|p\/|s\/|mcp|lovable|\.well-known)|\.(xml|txt|webmanifest|png|jpg|svg|ico)$/;

// Playwright may be installed locally or only globally (cloud images pre-install it that way).
async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch { /* try the global install next */ }
  try {
    const root = execFileSync("npm", ["root", "-g"], { encoding: "utf8", timeout: 15_000 }).trim();
    const require = createRequire(`${root}/`);
    return require("playwright");
  } catch {
    return null;
  }
}
const playwright = await loadPlaywright();
if (!playwright) {
  console.log(JSON.stringify({ status: "NOT_VERIFIED", reason: "playwright is not installed locally or globally" }));
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
// Small phone targets by control, across every page: signature -> { region, size, pages }.
const targetOffenders = new Map();
// axe rule id -> { impact, help, pages, nodes }
const a11yRules = new Map();
let axeSource = null;
if (RUN_A11Y) {
  try {
    const { readFileSync } = await import("node:fs");
    axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
  } catch {
    console.log(JSON.stringify({ status: "NOT_VERIFIED", reason: "axe-core is not installed (run bun install)" }));
    process.exit(2);
  }
}
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

    const m = await page.evaluate(({ isPhone, minTarget }) => {
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
        // WCAG 2.5.8 exempts links that sit inside a sentence. A text control only has to be tall enough;
        // an icon-only control has to be big in both directions.
        smallTargets: isPhone ? interactive.filter((el) => {
          // A checkbox or switch inside a <label> is tapped through the label, so the label is the target.
          const labelled = el.tagName !== "A" ? el.closest("label") : null;
          const r = (labelled ?? el).getBoundingClientRect();
          if (r.width <= 1 || r.height <= 1) return false; // visually hidden skip links
          const iconOnly = !labelled && (el.textContent ?? "").trim().length === 0;
          if (r.height >= minTarget && (!iconOnly || r.width >= minTarget)) return false;
          if (minTarget <= 24 && r.width >= 24 && r.height >= 24) return false;
          const block = el.tagName === "A" ? el.closest("p, li, dd, td") : null;
          const inline = block && (block.textContent ?? "").trim().length > (el.textContent ?? "").trim().length + 12;
          return !inline;
        }).map((el) => {
          const r = el.getBoundingClientRect();
          const label = name(el).replace(/\s+/g, " ").slice(0, 30);
          return {
            signature: `${el.tagName.toLowerCase()} "${label}"`,
            region: el.closest("header, footer, nav, aside, [role=dialog], main")?.tagName.toLowerCase() ?? "page",
            size: `${Math.round(r.width)}x${Math.round(r.height)}`,
          };
        }) : [],
        links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter(Boolean),
      };
    }, { isPhone: viewport.name === "phone", minTarget: MIN_TARGET });

    if (m.overflow > 1) add(path, viewport.name, "P0", "overflow", `${m.overflow}px sideways scroll`);
    if (viewport.name === "phone") {
      if (!m.title) add(path, "all", "P1", "title", "missing");
      if (!m.description) add(path, "all", "P1", "description", "missing");
      if (m.h1 !== 1) add(path, "all", "P1", "h1", `${m.h1} h1 elements`);
      links = m.links;
    }
    if (m.unnamed) add(path, viewport.name, "P1", "unnamed-control", `${m.unnamed} buttons or links have no accessible name`);
    if (m.noAlt) add(path, viewport.name, "P2", "image-alt", `${m.noAlt} images have no alt attribute`);
    if (m.smallTargets.length) add(path, viewport.name, "P2", "tap-target", `${m.smallTargets.length} controls smaller than ${MIN_TARGET}px`);
    for (const target of m.smallTargets) {
      const key = `${target.region}|${target.signature}`;
      const entry = targetOffenders.get(key) ?? { region: target.region, control: target.signature, size: target.size, pages: new Set() };
      entry.pages.add(path);
      targetOffenders.set(key, entry);
    }
    if (RUN_A11Y && viewport.name === "phone" && status < 400) {
      try {
        await page.evaluate(axeSource);
        const result = await page.evaluate(async () => {
          const r = await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
          return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length }));
        });
        for (const v of result) {
          const entry = a11yRules.get(v.id) ?? { impact: v.impact, help: v.help, pages: new Set(), nodes: 0 };
          entry.pages.add(path);
          entry.nodes += v.nodes;
          a11yRules.set(v.id, entry);
          add(path, "phone", v.impact === "critical" || v.impact === "serious" ? "P1" : "P2", "a11y", `${v.id}: ${v.help} (${v.nodes} elements)`);
        }
      } catch (error) {
        add(path, "phone", "P2", "a11y-error", String(error.message).slice(0, 120));
      }
    }
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
const offenders = [...targetOffenders.values()]
  .map((o) => ({ region: o.region, control: o.control, size: o.size, pages: o.pages.size }))
  .sort((a, b) => b.pages - a.pages)
  .slice(0, Number((args.find((a) => a.startsWith("--top=")) ?? "--top=40").split("=")[1]));
const a11y = [...a11yRules.entries()].map(([id, r]) => ({ id, impact: r.impact, help: r.help, pages: r.pages.size, elements: r.nodes })).sort((a, b) => b.pages - a.pages);
const report = { status: counts.P0 ? "FAILED" : "PASSED", base, minTarget: MIN_TARGET, pagesChecked: pages.length, families: Object.fromEntries(familyCount), counts, targetOffenders: offenders, ...(RUN_A11Y ? { a11y } : {}), findings };
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, pagesChecked: pages.length, families: report.families, counts }));
process.exit(counts.P0 ? 1 : 0);
