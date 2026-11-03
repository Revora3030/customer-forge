/**
 * A11Y + CLS GATE
 * ===============
 * Cheap, deterministic accessibility and layout-stability gate for a handful
 * of key public routes, at phone width (390x800) in Chromium:
 *
 *   1. load the page, with third-party requests blocked and reduced motion on
 *   2. wait for hydration (<html data-hydrated>, set by the root component)
 *      and document.fonts.ready
 *   3. settle 3 s, then read CLS from buffered layout-shift entries
 *      (session-window definition; budget 0.1, the "good" threshold)
 *   4. run axe-core (WCAG 2.0/2.1/2.2 A + AA) on the hydrated page
 *
 * Fails on CLS over budget or any critical/serious axe violation that is not
 * accepted in scripts/a11y-cls-gate.allowlist.json ("<route>:<rule>"). Moderate
 * and minor violations are reported, not blocking. axe runs after the CLS read,
 * so injecting it can't shift the layout being measured.
 *
 * usage: node scripts/a11y-cls-gate.mjs [baseUrl] [--out=a11y-cls.json]
 * env:   A11Y_GATE_ROUTES="/,/pricing"   override the route list
 * Exit 0 pass, 1 fail, 2 NOT_VERIFIED (no Playwright / browser): never a silent pass.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { AXE_TAGS, CLS_BUDGET, clsFromShifts, judgeRoute, parseRoutes } from "./a11y-cls-gate.lib.mjs";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const out = (args.find((a) => a.startsWith("--out=")) ?? "--out=a11y-cls.json").split("=")[1];
const ROUTES = parseRoutes(process.env.A11Y_GATE_ROUTES, ["/", "/pricing", "/get-started", "/contact", "/auth"]);
const SETTLE_MS = 3000;
const HYDRATION_TIMEOUT_MS = 20_000;

const notVerified = (reason) => {
  console.log(JSON.stringify({ status: "NOT_VERIFIED", reason }));
  process.exit(2);
};

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    try {
      const { execFileSync } = await import("node:child_process");
      const root = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
      return createRequire(`${root}/`)("playwright");
    } catch {
      return null;
    }
  }
}

let axeSource;
try {
  axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
} catch {
  notVerified("axe-core is not installed");
}
const allowPath = "scripts/a11y-cls-gate.allowlist.json";
const allow = new Set(existsSync(allowPath) ? JSON.parse(readFileSync(allowPath, "utf8")).accepted?.map((e) => e.id) ?? [] : []);

const playwright = await loadPlaywright();
if (!playwright) notVerified("playwright is not installed locally or globally");
let browser;
try {
  browser = await playwright.chromium.launch();
} catch (error) {
  notVerified(`chromium could not start: ${String(error.message).slice(0, 160)}`);
}
const origin = new URL(base).origin;

const results = [];
for (const route of ROUTES) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 800 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  // Third-party scripts, fonts and pixels are the main source of run-to-run noise.
  await context.route("**/*", (r) => {
    const url = r.request().url();
    return url.startsWith(origin) || url.startsWith("data:") || url.startsWith("blob:") ? r.continue() : r.abort();
  });
  await context.addInitScript(() => {
    window.__clsShifts = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__clsShifts.push({ value: e.value, startTime: e.startTime, hadRecentInput: e.hadRecentInput });
      }).observe({ type: "layout-shift", buffered: true });
    } catch {
      /* layout-shift unsupported: reported below as an error */
    }
  });
  const page = await context.newPage();
  const measurement = { route, cls: null, violations: [], error: null, hydrated: false };
  try {
    const response = await page.goto(base + route, { waitUntil: "load", timeout: 60_000 });
    if ((response?.status() ?? 0) >= 400) throw new Error(`HTTP ${response.status()}`);
    measurement.hydrated = await page
      .waitForFunction(() => document.documentElement.dataset.hydrated === "true", null, { timeout: HYDRATION_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    if (!measurement.hydrated) throw new Error("page never hydrated (no <html data-hydrated>)");
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.waitForTimeout(SETTLE_MS);
    const shifts = await page.evaluate(() => window.__clsShifts ?? null);
    if (shifts === null) throw new Error("layout-shift entries unavailable");
    measurement.cls = clsFromShifts(shifts);
    await page.evaluate(axeSource);
    measurement.violations = await page.evaluate(async (tags) => {
      const r = await window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
      return r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
      }));
    }, AXE_TAGS);
  } catch (error) {
    measurement.error = String(error.message).split("\n")[0].slice(0, 200);
  }
  results.push({ ...judgeRoute(measurement, { budget: CLS_BUDGET, allow }), hydrated: measurement.hydrated });
  await context.close();
}
await browser.close();

const failed = results.filter((r) => !r.ok);
const report = { status: failed.length ? "FAILED" : "PASSED", base, budget: CLS_BUDGET, settleMs: SETTLE_MS, routes: results };
writeFileSync(out, JSON.stringify(report, null, 2));
for (const r of results) {
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.route}  CLS ${r.cls ?? "n/a"}${r.reported.length ? `  (${r.reported.length} non-blocking axe findings)` : ""}`);
  for (const reason of r.reasons) console.log(`       ${reason}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  const rows = results.map((r) => `| ${r.route} | ${r.cls ?? "n/a"} | ${r.ok ? "pass" : r.reasons.join("<br>")} |`).join("\n");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## A11y + CLS gate\n| Route | CLS | Result |\n|---|---|---|\n${rows}\n`);
}
process.exit(failed.length ? 1 : 0);
