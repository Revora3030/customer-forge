/**
 * Runs LAYER 2 — the rendered visual check — from inside the builder.
 *
 * The worker that serves the app cannot open a browser, but the person
 * building the website already has one. This module loads the workspace's own
 * pages in a hidden same-origin iframe, scrolls each one so lazy pictures
 * actually load, resizes it through every required width, and collects the
 * exact `ViewportMeasurement`s the shared grader judges. The raw numbers go to
 * the server, which re-grades them itself — the browser never gets to decide
 * its own score.
 */
import { MEASURE_SCRIPT, OBSERVE_SCRIPT, VIEWPORTS, type ViewportMeasurement } from "./visual";

const IFRAME_HEIGHT = 900;
/** Let styles, fonts and images settle after each resize before measuring. */
const SETTLE_MS = 400;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForLoad(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The preview page took too long to load.")),
      30000,
    );
    iframe.addEventListener(
      "load",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

type FrameWindow = Window & { __revoraEval?: unknown };

/**
 * Runs a snippet inside the measured page's own window.
 *
 * The site's security policy forbids `eval`, so the snippet runs as an inline
 * script element in the same-origin frame (inline scripts are already allowed
 * for server-rendered HTML) and hands its value back through a one-shot slot.
 */
function evaluate(win: Window, code: string): unknown {
  const frame = win as FrameWindow;
  const doc = frame.document;
  const script = doc.createElement("script");
  script.textContent = `window.__revoraEval = ${code};`;
  frame.__revoraEval = undefined;
  (doc.head ?? doc.documentElement).appendChild(script);
  script.remove();
  const value = frame.__revoraEval;
  delete frame.__revoraEval;
  if (value === undefined) throw new Error("The page refused the measurement snippet.");
  return value;
}

/**
 * Scrolls the whole page so lazily-loaded pictures start downloading, then
 * waits for them. Without this, every below-the-fold image looks "broken".
 */
const SCROLL_SCRIPT = `(async () => {
  const step = Math.max(200, window.innerHeight * 0.8);
  const end = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  for (let y = 0; y <= end; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 60));
  }
  window.scrollTo(0, 0);
  const images = [...document.images];
  await Promise.all(
    images.map((img) => {
      if (img.complete) return null;
      return new Promise((resolve) => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
        setTimeout(resolve, 4000);
      });
    }),
  );
  if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch (e) {} }
  return true;
})()`;

/**
 * Measures one same-origin page at every required width. Throws a plain-language
 * error when the page cannot be reached or read.
 */
export async function measureWebsiteAtAllWidths(
  previewPath: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ViewportMeasurement[]> {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.left = "-10000px";
  iframe.style.top = "0";
  iframe.style.height = `${IFRAME_HEIGHT}px`;
  iframe.style.border = "0";
  iframe.src = previewPath;
  document.body.appendChild(iframe);

  try {
    await waitForLoad(iframe);
    const win = iframe.contentWindow;
    if (!win) throw new Error("The preview page could not be opened for checking.");

    // Watch layout shift from the first frame, and load everything lazy before
    // judging a single picture.
    try {
      evaluate(win, `(${OBSERVE_SCRIPT})`);
      await (evaluate(win, `(${SCROLL_SCRIPT})`) as Promise<unknown>);
    } catch {
      // A page that refuses instrumentation is still measured for geometry.
    }

    const measurements: ViewportMeasurement[] = [];
    for (const [index, width] of VIEWPORTS.entries()) {
      iframe.style.width = `${width}px`;
      await wait(SETTLE_MS);
      // Same-origin, so the preview's own window runs the shared measurement
      // snippet against its own document — the real rendered numbers, not an
      // approximation taken from outside the frame.
      const measured = evaluate(win, `(${MEASURE_SCRIPT})`) as ViewportMeasurement;
      measurements.push({ ...measured, width });
      onProgress?.(index + 1, VIEWPORTS.length);
    }
    return measurements;
  } finally {
    iframe.remove();
  }
}

export type PageMeasurement = {
  /** The page path that was measured, e.g. `/s/acme/services`. */
  page: string;
  measurements: ViewportMeasurement[];
};

/**
 * Measures EVERY visible page. A clean home page has never proved that Services
 * or Contact render correctly, so the gate needs one report per page.
 */
export async function measureSitePages(
  pages: { page: string; url: string }[],
  onProgress?: (label: string, done: number, total: number) => void,
): Promise<PageMeasurement[]> {
  const results: PageMeasurement[] = [];
  const totalSteps = pages.length * VIEWPORTS.length;
  let completed = 0;
  for (const target of pages) {
    const measurements = await measureWebsiteAtAllWidths(target.url, () => {
      completed += 1;
      onProgress?.(target.page, completed, totalSteps);
    });
    results.push({ page: target.page, measurements });
  }
  return results;
}
