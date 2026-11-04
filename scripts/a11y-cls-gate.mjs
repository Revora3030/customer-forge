/**
 * A11Y + CLS GATE
 * ===============
 * Cheap, deterministic accessibility and layout-stability gate for a handful
 * of key public routes in Chromium, at each width in A11Y_GATE_WIDTHS
 * (default 320 and 1440 px; height 800):
 *
 *   1. load the page, with third-party requests blocked and reduced motion on
 *   2. wait for hydration (<html data-hydrated>, set by the root component)
 *      and document.fonts.ready
 *   3. settle 3 s, then read CLS from buffered layout-shift entries
 *      (session-window definition; budget 0.1, the "good" threshold)
 *   4. run IBM Equal Access (accessibility-checker-engine, Apache-2.0) with the
 *      WCAG_2_2 policy on the hydrated page
 *
 * Fails on CLS over budget or any definite violation (["VIOLATION", "FAIL"]) not
 * accepted in scripts/a11y-cls-gate.allowlist.json ("<route>:<rule>",
 * "<route>@<width>:<rule>" or "*:<rule>"). Potential / manual-review results and
 * recommendations are reported, not blocking. The engine runs after the CLS read,
 * so injecting it can't shift the layout being measured.
 *
 * usage: node scripts/a11y-cls-gate.mjs [baseUrl] [--out=a11y-cls.json]
 * env:   A11Y_GATE_ROUTES="/,/pricing"   override the route list
 *        A11Y_GATE_WIDTHS="320,1440"    override the viewport widths
 * Exit 0 pass, 1 fail, 2 NOT_VERIFIED (no Playwright / browser): never a silent pass.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { ACE_POLICIES, CLS_BUDGET, clsFromShifts, judgeRoute, parseRoutes, parseWidths, summarizeAceResults } from "./a11y-cls-gate.lib.mjs";

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) ?? "http://127.0.0.1:8080").replace(/\/$/, "");
const out = (args.find((a) => a.startsWith("--out=")) ?? "--out=a11y-cls.json").split("=")[1];
const ROUTES = parseRoutes(process.env.A11Y_GATE_ROUTES, ["/", "/pricing", "/get-started", "/contact", "/auth"]);
const WIDTHS = parseWidths(process.env.A11Y_GATE_WIDTHS);
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

let aceSource;
try {
  aceSource = readFileSync(createRequire(import.meta.url).resolve("accessibility-checker-engine/ace.js"), "utf8");
} catch {
  notVerified("accessibility-checker-engine is not installed (npm install --no-save accessibility-checker-engine@4.0.34)");
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
for (const [width, route] of WIDTHS.flatMap((w) => ROUTES.map((r) => [w, r]))) {
  const context = await browser.newContext({
    viewport: { width, height: 800 },
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
  const measurement = { route, width, cls: null, violations: [], error: null, hydrated: false };
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
    await page.evaluate(aceSource);
    const raw = await page.evaluate(async (policies) => {
      const report = await new window.ace.Checker().check(document, policies);
      return report.results.map((r) => ({ ruleId: r.ruleId, value: r.value, message: r.message, path: { dom: r.path?.dom } }));
    }, ACE_POLICIES);
    measurement.violations = summarizeAceResults(raw);
  } catch (error) {
    measurement.error = String(error.message).split("\n")[0].slice(0, 200);
  }
  results.push({ ...judgeRoute(measurement, { budget: CLS_BUDGET, allow }), hydrated: measurement.hydrated });
  await context.close();
}
await browser.close();

const failed = results.filter((r) => !r.ok);
const report = { status: failed.length ? "FAILED" : "PASSED", base, engine: "accessibility-checker-engine", policies: ACE_POLICIES, widths: WIDTHS, budget: CLS_BUDGET, settleMs: SETTLE_MS, routes: results };
writeFileSync(out, JSON.stringify(report, null, 2));
for (const r of results) {
  const accepted = r.reported.filter((v) => v.accepted && v.kind === "violation").map((v) => v.id);
  console.log(`${r.ok ? "ok  " : "FAIL"} ${r.width}px ${r.route}  CLS ${r.cls ?? "n/a"}${accepted.length ? `  (accepted: ${accepted.join(", ")})` : ""}${r.reported.length ? `  (${r.reported.length} non-blocking findings)` : ""}`);
  for (const reason of r.reasons) console.log(`       ${reason}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  const rows = results.map((r) => `| ${r.width}px | ${r.route} | ${r.cls ?? "n/a"} | ${r.ok ? "pass" : r.reasons.join("<br>")} |`).join("\n");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## A11y + CLS gate\n| Width | Route | CLS | Result |\n|---|---|---|---|\n${rows}\n`);
}
process.exit(failed.length ? 1 : 0);
