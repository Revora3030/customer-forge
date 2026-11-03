/**
 * Time to the real page (not a loading message) in a throttled phone-sized
 * browser: when <main> first exists, when the hero heading is painted, and
 * when the hero picture has finished loading. Slow 4G (150 ms RTT,
 * 1.6 Mbps down) and 4x CPU slowdown via the DevTools protocol.
 * Usage: node measure-paint.mjs [runs]
 */
import { chromium } from "/workspace/tools/pr2/node_modules/playwright-core/index.mjs";
const RUNS = Number(process.argv[2] ?? 7);
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const variants = { before: "http://127.0.0.1:4528/", after: "http://127.0.0.1:4529/", "after-nopreload": "http://127.0.0.1:4529/?nopre=1" };
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const [name, url] of Object.entries(variants)) {
  const rows = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(() => {
      const marks = (window.__marks = {});
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.entryType === "paint" && e.name === "first-contentful-paint") marks.fcp = e.startTime;
          if (e.entryType === "largest-contentful-paint") marks.lcp = e.startTime;
        }
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => { for (const e of list.getEntries()) if (e.name === "first-contentful-paint") marks.fcp = e.startTime; }).observe({ type: "paint", buffered: true });
      const check = () => {
        if (!marks.main && document.querySelector("main h1")) marks.main = performance.now();
        const img = document.querySelector("main img");
        if (!marks.hero && img && img.complete && img.naturalWidth) marks.hero = performance.now();
        if (!marks.main || !marks.hero) requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
    await page.goto(url, { waitUntil: "load", timeout: 120000 });
    await page.waitForFunction(() => window.__marks.main && window.__marks.hero, null, { timeout: 120000 });
    await page.waitForTimeout(300);
    rows.push(await page.evaluate(() => window.__marks));
    await ctx.close();
  }
  const pick = (k) => Math.round(med(rows.map((r) => r[k] ?? NaN)));
  console.log(`${name.padEnd(16)} runs ${rows.length}  FCP ${pick("fcp")} ms  page drawn (main h1) ${pick("main")} ms  hero loaded ${pick("hero")} ms  LCP ${pick("lcp")} ms`);
}
await browser.close();
