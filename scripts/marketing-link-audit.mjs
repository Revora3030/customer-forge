#!/usr/bin/env node
/**
 * MARKETING LINK + BUTTON AUDIT
 * =============================
 *
 * Crawls Revora's own public marketing routes (not customer sites) in a real
 * Chromium at a 390px phone viewport and reports:
 *
 *   - broken links: same-origin hrefs that answer 404 (or any 4xx/5xx), and
 *     "#fragment" links whose target id does not exist on the destination page;
 *   - dead links: <a> with no href, href="#" or href="javascript:…" and no
 *     click handler (React handlers are read from the element's React props);
 *   - buttons and links with no accessible name;
 *   - tap targets under 44×44px (inline text links inside a sentence are
 *     reported separately, because WCAG 2.5.8 exempts them).
 *
 * It also samples one page of each dynamic route linked from the static ones
 * (/industries/:slug, /locations/:city, /compare/:slug, /guides/:slug, …).
 *
 * Usage:
 *   npx vite build && npx vite preview --port 4173 &
 *   node scripts/marketing-link-audit.mjs http://localhost:4173 [--json out.json] [--strict]
 *
 * Browser: uses Playwright's Chromium. CHROMIUM_PATH (or /opt/pw-browsers/chromium
 * when present) is passed as executablePath; otherwise PLAYWRIGHT_BROWSERS_PATH
 * decides. This script never installs browsers. It reads no secrets, sends no
 * forms and clicks nothing that submits, so it is safe against any build.
 * Exit code is 0 unless --strict is given and findings exist (or the run fails).
 */

import { execSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : undefined;
};
const base = (args.find((arg) => /^https?:\/\//.test(arg)) ?? "http://localhost:4173").replace(/\/+$/, "");
const jsonOut = option("--json");
const strict = flag("--strict");
const MIN_TAP = 44;
const VIEWPORT = { width: 390, height: 844 };

export const STATIC_ROUTES = [
  "/",
  "/pricing",
  "/get-started",
  "/demo",
  "/demo/dashboard",
  "/industries",
  "/locations",
  "/compare",
  "/guides",
  "/crm",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
];

/** One sample of each dynamic marketing route, taken from links on the static pages. */
export const DYNAMIC_PATTERNS = [
  ["/industries/:slug", /^\/industries\/[^/]+$/],
  ["/locations/:city", /^\/locations\/[^/]+$/],
  ["/compare/:slug", /^\/compare\/[^/]+$/],
  ["/guides/:slug", /^\/guides\/[^/]+$/],
  ["/crm/:trade", /^\/crm\/[^/]+$/],
  ["/states/:state", /^\/states\/[^/]+$/],
  ["/local/:industry", /^\/local\/[^/]+$/],
  ["/local/:industry/:state", /^\/local\/[^/]+\/[^/]+$/],
];

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    /* fall through to the global install */
  }
  const roots = [process.env["NODE_PATH"], "/opt/node22/lib/node_modules"];
  try {
    roots.push(execSync("npm root -g", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim());
  } catch {
    /* npm missing */
  }
  for (const root of roots.filter(Boolean)) {
    for (const dir of root.split(path.delimiter)) {
      try {
        return createRequire(path.join(dir, "noop.js"))("playwright");
      } catch {
        /* try next */
      }
    }
  }
  throw new Error("The playwright package is not installed (locally or globally). This script never installs it.");
}

function chromiumPath() {
  const explicit = process.env["CHROMIUM_PATH"];
  if (explicit && existsSync(explicit)) return explicit;
  if (existsSync("/opt/pw-browsers/chromium")) return "/opt/pw-browsers/chromium";
  return undefined; // Playwright resolves it from PLAYWRIGHT_BROWSERS_PATH.
}

/** Runs inside the page: describes every link and button. */
function inspectPage(minTap) {
  const visible = (el) => {
    const style = getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    if (el.closest("[inert],[aria-hidden='true']")) return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const reactProps = (el) => {
    const key = Object.keys(el).find((k) => k.startsWith("__reactProps$"));
    return key ? el[key] : null;
  };
  const hasHandler = (el) => {
    for (let node = el; node && node !== document.body; node = node.parentElement) {
      const props = reactProps(node);
      if (props && (props.onClick || props.onPointerDown || props.onMouseDown)) return true;
      if (node.onclick) return true;
      if (node !== el) break; // only the element and its direct wrapper count
    }
    return false;
  };
  const textOf = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();
  const accessibleName = (el) => {
    const labelled = el.getAttribute("aria-labelledby");
    if (labelled) {
      const text = labelled
        .split(/\s+/)
        .map((id) => textOf(document.getElementById(id)))
        .join(" ")
        .trim();
      if (text) return text;
    }
    const aria = el.getAttribute("aria-label")?.trim();
    if (aria) return aria;
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (textOf(label)) return textOf(label);
    }
    const clone = el.cloneNode(true);
    clone.querySelectorAll("[aria-hidden='true']").forEach((n) => n.remove());
    const text = (clone.innerText ?? clone.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) return text;
    const img = el.querySelector("img[alt]:not([alt=''])");
    if (img) return img.getAttribute("alt").trim();
    const svgTitle = el.querySelector("svg title");
    if (textOf(svgTitle)) return textOf(svgTitle);
    return el.getAttribute("title")?.trim() ?? "";
  };
  const isInline = (el) => {
    if (el.tagName !== "A") return false;
    const parent = el.parentElement;
    if (!parent || !/^(P|LI|SPAN|SMALL|DD|TD|LABEL)$/.test(parent.tagName)) return false;
    const own = textOf(el);
    const around = textOf(parent).replace(own, "").trim();
    return getComputedStyle(el).display === "inline" && around.length > 0;
  };
  const describe = (el) => {
    const cs = el.cloneNode(false).outerHTML.slice(0, 160);
    return cs.replace(/\s+/g, " ");
  };

  const ids = Array.from(document.querySelectorAll("[id]")).map((n) => n.id);
  const items = [];
  for (const el of document.querySelectorAll("a, button, [role='button']")) {
    const shown = visible(el);
    const rect = el.getBoundingClientRect();
    const href = el.tagName === "A" ? el.getAttribute("href") : null;
    items.push({
      tag: el.tagName.toLowerCase(),
      html: describe(el),
      name: accessibleName(el),
      href,
      resolved: el.tagName === "A" && href ? el.href : null,
      visible: shown,
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      inline: isInline(el),
      handler: hasHandler(el),
      // Buttons that act without their own onClick: form submits, and
      // disclosure/menu triggers wired by a component library.
      wired: Boolean(
        el.form ||
          el.closest("summary") ||
          el.getAttribute("aria-controls") ||
          el.getAttribute("aria-haspopup") ||
          el.getAttribute("aria-expanded") ||
          el.getAttribute("data-state"),
      ),
      disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
      tabbable: el.tabIndex >= 0,
    });
  }
  return { ids, items, minTap };
}

async function main() {
  const { chromium } = await loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: chromiumPath() });
  const context = await browser.newContext({ viewport: VIEWPORT, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  // Keep the audit hermetic: only the audited origin is reachable.
  const origin = new URL(base).origin;
  await context.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    return route.abort();
  });

  const findings = { broken: [], dead: [], unnamed: [], smallTargets: [], smallInline: [], missingAnchors: [], pageErrors: [] };
  const statusCache = new Map();
  const idsByPath = new Map();
  const queue = [...STATIC_ROUTES];
  const sampled = new Map();
  const visited = new Set();
  const anchorChecks = [];
  const inspected = {};

  async function statusOf(url) {
    if (statusCache.has(url)) return statusCache.get(url);
    let status;
    try {
      const response = await context.request.get(url, { maxRedirects: 5, timeout: 20000 });
      status = response.status();
    } catch (error) {
      status = `error: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`;
    }
    statusCache.set(url, status);
    return status;
  }

  while (queue.length) {
    const route = queue.shift();
    if (visited.has(route)) continue;
    visited.add(route);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message.split("\n")[0]));
    let response;
    try {
      response = await page.goto(base + route, { waitUntil: "load", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(400);
    } catch (error) {
      findings.broken.push({ page: route, href: route, status: `navigation failed: ${error.message.split("\n")[0]}` });
      await page.close();
      continue;
    }
    const status = response?.status() ?? 0;
    if (status >= 400) findings.broken.push({ page: route, href: route, status });
    const { ids, items } = await page.evaluate(inspectPage, MIN_TAP);
    inspected[route] = { status, finalPath: new URL(page.url()).pathname, controls: items.length };
    // Keyed by the requested path: a page that redirects must not overwrite
    // the ids recorded for its destination.
    idsByPath.set(route, new Set(ids));
    if (errors.length) findings.pageErrors.push({ page: route, errors: [...new Set(errors)].slice(0, 5) });

    const seen = new Set();
    for (const item of items) {
      const key = `${item.tag}|${item.href}|${item.name}|${item.width}x${item.height}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const where = { page: route, element: item.html, name: item.name || null };

      if (item.visible && !item.name) findings.unnamed.push(where);

      if (item.tag === "a") {
        const href = (item.href ?? "").trim();
        const nowhere = !href || href === "#" || /^javascript:/i.test(href);
        if (nowhere && !item.handler) findings.dead.push({ ...where, href: item.href });
        if (!nowhere && item.resolved) {
          const url = new URL(item.resolved);
          if (url.origin === origin && /^https?:$/.test(url.protocol)) {
            const pathOnly = url.pathname.replace(/\/+$/, "") || "/";
            const result = await statusOf(url.origin + url.pathname + url.search);
            if (typeof result !== "number" || result >= 400) findings.broken.push({ ...where, href, status: result });
            if (url.hash.length > 1) anchorChecks.push({ ...where, href, path: pathOnly, id: decodeURIComponent(url.hash.slice(1)) });
            for (const [label, pattern] of DYNAMIC_PATTERNS) {
              if (!sampled.has(label) && pattern.test(pathOnly)) {
                sampled.set(label, pathOnly);
                queue.push(pathOnly);
              }
            }
          }
        }
      } else if (item.visible && !item.disabled && !item.handler && !item.wired) {
        findings.dead.push({ ...where, href: null, note: "button with no click handler" });
      }

      if (item.visible && !item.disabled && (item.width < MIN_TAP || item.height < MIN_TAP)) {
        const entry = { ...where, href: item.href, size: `${item.width}x${item.height}` };
        (item.inline ? findings.smallInline : findings.smallTargets).push(entry);
      }
    }
    await page.close();
  }

  for (const check of anchorChecks) {
    let ids = idsByPath.get(check.path);
    if (!ids) {
      const page = await context.newPage();
      try {
        await page.goto(base + check.path, { waitUntil: "load", timeout: 30000 });
        await page.waitForTimeout(400);
        ids = new Set(await page.evaluate(() => Array.from(document.querySelectorAll("[id]")).map((n) => n.id)));
      } catch {
        ids = new Set();
      }
      idsByPath.set(check.path, ids);
      await page.close();
    }
    if (!ids.has(check.id)) findings.missingAnchors.push({ page: check.page, href: check.href, name: check.name, element: check.element });
  }

  await browser.close();

  const report = {
    base,
    viewport: VIEWPORT,
    minTapTarget: MIN_TAP,
    crawled: [...visited],
    pages: inspected,
    dynamicSamples: Object.fromEntries(sampled),
    dynamicNotFound: DYNAMIC_PATTERNS.map(([label]) => label).filter((label) => !sampled.has(label)),
    counts: Object.fromEntries(Object.entries(findings).map(([key, list]) => [key, list.length])),
    findings,
  };
  if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));

  console.log(`Marketing link audit — ${base} @ ${VIEWPORT.width}px`);
  console.log(`Crawled ${report.crawled.length} pages: ${report.crawled.join(", ")}`);
  const sections = [
    ["broken", "Links that 404 / fail"],
    ["missingAnchors", "#fragment links with no target id"],
    ["dead", "Links/buttons that go nowhere"],
    ["unnamed", "Buttons/links with no accessible name"],
    ["smallTargets", `Tap targets under ${MIN_TAP}px`],
    ["smallInline", `Inline text links under ${MIN_TAP}px (WCAG 2.5.8 inline exemption)`],
    ["pageErrors", "Uncaught page errors"],
  ];
  for (const [key, title] of sections) {
    const list = findings[key];
    console.log(`\n${title}: ${list.length}`);
    for (const entry of list.slice(0, 60)) console.log(`  - ${JSON.stringify(entry)}`);
    if (list.length > 60) console.log(`  … ${list.length - 60} more (use --json)`);
  }
  const blocking = findings.broken.length + findings.dead.length + findings.unnamed.length + findings.smallTargets.length + findings.missingAnchors.length;
  if (strict && blocking > 0) process.exit(1);
}

main().catch((error) => {
  console.error(`marketing-link-audit failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
});
