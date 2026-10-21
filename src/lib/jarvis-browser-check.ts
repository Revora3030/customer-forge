/**
 * Live page check through Browserless (free plan, BROWSERLESS_API_KEY).
 * Loads one allow-listed page at phone and desktop sizes and reports script
 * errors, failed requests, broken same-page links and horizontal overflow.
 * Read-only: it never clicks, submits or changes anything.
 */
export const BROWSERLESS_ENDPOINT = "https://production-sfo.browserless.io/function";

export type ViewportReport = {
  viewport: "phone" | "desktop";
  httpStatus: number | null;
  title: string | null;
  scriptErrors: string[];
  failedRequests: string[];
  horizontalOverflowPx: number;
  brokenLinks: string[];
};

export type BrowserCheckSummary = { url: string; viewports: ViewportReport[] };

/** Puppeteer code executed inside Browserless. Receives { url } as context. */
export const BROWSER_CHECK_CODE = `
export default async function ({ page, context }) {
  const sizes = [["phone", 390, 844], ["desktop", 1280, 900]];
  const out = [];
  for (const [name, w, h] of sizes) {
    const errors = []; const failed = [];
    page.removeAllListeners("pageerror"); page.removeAllListeners("requestfailed"); page.removeAllListeners("response");
    page.on("pageerror", (e) => errors.push(String(e && e.message || e).slice(0, 200)));
    page.on("requestfailed", (r) => failed.push((r.url() + " " + (r.failure()?.errorText || "")).slice(0, 200)));
    page.on("response", (r) => { if (r.status() >= 400) failed.push((r.status() + " " + r.url()).slice(0, 200)); });
    await page.setViewport({ width: w, height: h });
    let status = null;
    try { const res = await page.goto(context.url, { waitUntil: "networkidle2", timeout: 20000 }); status = res ? res.status() : null; } catch (e) { errors.push("navigation: " + String(e.message || e).slice(0, 160)); }
    const info = await page.evaluate(async () => {
      const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      const links = Array.from(new Set(Array.from(document.querySelectorAll("a[href]")).map((a) => a.href).filter((h) => h.startsWith(location.origin)))).slice(0, 25);
      const broken = [];
      for (const href of links) { try { const r = await fetch(href, { method: "HEAD" }); if (r.status >= 400) broken.push(r.status + " " + href); } catch { broken.push("unreachable " + href); } }
      return { overflow, broken, title: document.title || null };
    }).catch(() => ({ overflow: 0, broken: [], title: null }));
    out.push({ viewport: name, httpStatus: status, title: info.title, scriptErrors: errors.slice(0, 10), failedRequests: failed.slice(0, 10), horizontalOverflowPx: info.overflow, brokenLinks: info.broken.slice(0, 10) });
  }
  return { data: { viewports: out }, type: "application/json" };
}`;

const strList = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 10).map((s) => s.slice(0, 200)) : []);

export function summarizeBrowserCheck(raw: unknown, url: string): BrowserCheckSummary | null {
  const vps = (raw as { viewports?: unknown })?.viewports;
  if (!Array.isArray(vps) || vps.length === 0) return null;
  const viewports = vps.slice(0, 2).map((v): ViewportReport => {
    const r = (v ?? {}) as Record<string, unknown>;
    return {
      viewport: r["viewport"] === "desktop" ? "desktop" : "phone",
      httpStatus: typeof r["httpStatus"] === "number" ? r["httpStatus"] : null,
      title: typeof r["title"] === "string" ? r["title"].slice(0, 160) : null,
      scriptErrors: strList(r["scriptErrors"]),
      failedRequests: strList(r["failedRequests"]),
      horizontalOverflowPx: typeof r["horizontalOverflowPx"] === "number" ? r["horizontalOverflowPx"] : 0,
      brokenLinks: strList(r["brokenLinks"]),
    };
  });
  return { url, viewports };
}

export function browserCheckHasProblems(s: BrowserCheckSummary): boolean {
  return s.viewports.some((v) => v.scriptErrors.length > 0 || v.failedRequests.length > 0 || v.brokenLinks.length > 0 || v.horizontalOverflowPx > 1 || (v.httpStatus ?? 0) >= 400 || v.httpStatus === null);
}
