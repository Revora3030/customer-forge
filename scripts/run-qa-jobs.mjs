// PAI-19 self-QA runner. Claims queued jobs from the app, opens each published
// page at phone and desktop size in Chromium, and posts the measurements and two
// screenshots back. Runs only on a trusted runner (Node 22+, Playwright).
//
// Public-repo rule: workflow logs are public. This script logs only job ids and
// counts, never page addresses, page text or secrets, and uploads no artifacts.
import { chromium } from "playwright";

const base = process.env.APP_URL;
const secret = process.env.LOVABLE_CRON_SECRET;
if (!base || !secret) throw new Error("REVORA_APP_URL and LOVABLE_CRON_SECRET must be configured.");
const origin = new URL(base);
if (origin.protocol !== "https:" || origin.username || origin.password)
  throw new Error("REVORA_APP_URL must be an HTTPS origin without credentials.");

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

async function api(action, body) {
  const url = new URL("/api/public/jobs/qa-jobs", origin.origin);
  url.searchParams.set("action", action);
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  return response;
}

async function checkPage(browser, url) {
  const metrics = {};
  const screenshots = [];
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, ignoreHTTPSErrors: false });
    try {
      const page = await context.newPage();
      let consoleErrors = 0;
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors += 1;
      });
      page.on("pageerror", () => {
        consoleErrors += 1;
      });
      const started = Date.now();
      const response = await page.goto(url, { waitUntil: "load", timeout: 45_000 });
      const loadMs = Date.now() - started;
      await page.waitForTimeout(800);
      const overflowX = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      const title = (await page.title()) || "";
      metrics[vp.name] = { httpStatus: response ? response.status() : null, overflowX, consoleErrors, loadMs, title };
      const jpeg = await page.screenshot({ type: "jpeg", quality: 70, fullPage: false });
      screenshots.push({ viewport: vp.name, mime: "image/jpeg", base64: jpeg.toString("base64") });
    } finally {
      await context.close();
    }
  }
  return { metrics, screenshots };
}

try {
  const claimResponse = await api("claim", {});
  if (!claimResponse.ok) throw new Error(`Claim returned HTTP ${claimResponse.status}.`);
  const { jobs } = await claimResponse.json();
  if (!Array.isArray(jobs) || jobs.length === 0) {
    console.log(JSON.stringify({ claimed: 0 }));
  } else {
    const browser = await chromium.launch();
    let done = 0;
    let failed = 0;
    try {
      for (const job of jobs) {
        let report;
        try {
          const { metrics, screenshots } = await checkPage(browser, job.url);
          const reachable = Object.values(metrics).every((m) => m.httpStatus !== null && m.httpStatus < 400);
          report = reachable
            ? { jobId: job.id, fence: job.fence, ok: true, metrics, screenshots }
            : { jobId: job.id, fence: job.fence, ok: false, metrics, screenshots: [], error: "The page answered with an error status." };
        } catch {
          // The raw error can contain the page address; keep a fixed reason.
          report = { jobId: job.id, fence: job.fence, ok: false, metrics: {}, screenshots: [], error: "The page did not load in time." };
        }
        const response = await api("report", report);
        if (response.ok && report.ok) done += 1;
        else failed += 1;
        console.log(JSON.stringify({ job: job.id, reported: response.status, ok: report.ok }));
      }
    } finally {
      await browser.close();
    }
    console.log(JSON.stringify({ claimed: jobs.length, done, failed }));
  }
} catch (error) {
  console.error(error instanceof Error && /^(Claim returned|REVORA_APP_URL)/.test(error.message) ? error.message : "QA runner could not complete. Inspect app logs and runner configuration.");
  process.exitCode = 1;
}
