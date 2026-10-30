/**
 * Real speed measurement for published customer websites.
 *
 * Until now performance was only inferred from page structure. This module
 * measures what visitors actually experience — largest paint, layout movement,
 * interaction delay, first paint and server response — in the visitor's own
 * browser, using Google's open-source `web-vitals` library (bundled, not a
 * third-party script). No cost, nothing personal: only a metric name, a number and an opaque
 * per-visit token used to stop the same visit being counted twice.
 */

export type VitalMetric = "lcp" | "cls" | "inp" | "ttfb" | "fcp";
export type VitalRating = "good" | "needs-improvement" | "poor";

export type VitalSample = {
  metric: VitalMetric;
  /** Milliseconds for every metric except CLS, which is a unitless score. */
  value: number;
  rating: VitalRating;
};

/**
 * Google's published Core Web Vitals thresholds. Kept explicit so the numbers
 * shown to a business owner can be traced to a real standard.
 */
export const VITAL_THRESHOLDS: Record<VitalMetric, { good: number; poor: number }> = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  inp: { good: 200, poor: 500 },
  ttfb: { good: 800, poor: 1800 },
  fcp: { good: 1800, poor: 3000 },
};

export const VITAL_LABEL: Record<VitalMetric, string> = {
  lcp: "Main content appears",
  cls: "Page steadiness",
  inp: "Response to taps",
  ttfb: "Server response",
  fcp: "First paint",
};

export function rateVital(metric: VitalMetric, value: number): VitalRating {
  const limits = VITAL_THRESHOLDS[metric];
  if (!Number.isFinite(value) || value < 0) return "poor";
  if (value <= limits.good) return "good";
  if (value <= limits.poor) return "needs-improvement";
  return "poor";
}

/** Formats a stored value the way a non-technical owner reads it. */
export function formatVital(metric: VitalMetric, value: number): string {
  if (metric === "cls") return value.toFixed(3);
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
}

/**
 * 75th percentile — the figure Core Web Vitals is judged on, so a handful of
 * fast visits cannot hide a slow experience for most visitors.
 */
export function percentile75(values: number[]): number | null {
  const clean = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const index = Math.min(clean.length - 1, Math.ceil(clean.length * 0.75) - 1);
  return clean[Math.max(0, index)] ?? null;
}

export type VitalSummary = {
  metric: VitalMetric;
  label: string;
  samples: number;
  p75: number | null;
  rating: VitalRating | "not-measured";
};

/**
 * Turns raw recorded rows into one honest line per metric. A metric with no
 * recorded visits is reported as not measured rather than guessed or scored.
 */
export function summariseVitals(
  rows: Array<{ metric: string; value: number | string | null }>,
): VitalSummary[] {
  const metrics: VitalMetric[] = ["lcp", "inp", "cls", "fcp", "ttfb"];
  return metrics.map((metric) => {
    const values = rows
      .filter((row) => row.metric === metric)
      .map((row) => Number(row.value))
      .filter((value) => Number.isFinite(value));
    const p75 = percentile75(values);
    return {
      metric,
      label: VITAL_LABEL[metric],
      samples: values.length,
      p75,
      rating: p75 === null ? "not-measured" : rateVital(metric, p75),
    };
  });
}

/**
 * Random base-36 fragment for the visit token. Uses the Web Crypto API so the
 * token is unguessable (it doubles as the de-duplication key for server-side
 * conversion analytics); Math.random() would be predictable and is flagged by
 * code scanning. Falls back to a timestamp fragment only when no crypto API
 * exists (legacy webviews), never to Math.random().
 */
function randomFragment(length: number): string {
  try {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    let out = "";
    for (const byte of bytes) out += (byte % 36).toString(36);
    return out;
  } catch {
    return Date.now().toString(36).slice(-length).padStart(length, "0");
  }
}

/** Opaque per-visit token; never identifies a person or persists past the tab. */
export function visitToken(): string {
  const KEY = "revora.vitals.visit";
  try {
    const existing = window.sessionStorage.getItem(KEY);
    if (existing && /^[A-Za-z0-9_-]{6,60}$/.test(existing)) return existing;
    const token = randomFragment(10) + Date.now().toString(36).slice(-6);
    window.sessionStorage.setItem(KEY, token);
    return token;
  } catch {
    return randomFragment(10) + Date.now().toString(36).slice(-6);
  }
}

type MetricLike = { value: number };
type OnMetric = (cb: (metric: MetricLike) => void, opts?: { reportAllChanges?: boolean }) => void;

/** The subset of Google's `web-vitals` library this module uses. */
export type WebVitalsLib = {
  onLCP: OnMetric;
  onCLS: OnMetric;
  onINP: OnMetric;
  onFCP: OnMetric;
  onTTFB: OnMetric;
};

/**
 * Collects the metrics for this page view with Google's `web-vitals` library
 * (spec-correct INP and session-windowed CLS, Apache-2.0, ~2 KB) and reports
 * them exactly once, when the visitor leaves or hides the page (the point the
 * standard says the values are final). Returns a cleanup function.
 *
 * `lib` is injectable for tests; by default the library is loaded lazily so it
 * never lands in the server bundle or blocks first paint.
 */
export function observeWebVitals(
  report: (samples: VitalSample[]) => void,
  lib?: WebVitalsLib,
): () => void {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return () => undefined;
  }

  const latest: Partial<Record<VitalMetric, number>> = {};
  let sent = false;
  let stopped = false;

  const subscribe = (vitals: WebVitalsLib) => {
    if (stopped) return;
    const opts = { reportAllChanges: true };
    const keep = (metric: VitalMetric) => (m: MetricLike) => {
      if (!sent && typeof m?.value === "number") latest[metric] = m.value;
    };
    try {
      vitals.onLCP(keep("lcp"), opts);
      vitals.onCLS(keep("cls"), opts);
      vitals.onINP(keep("inp"), opts);
      vitals.onFCP(keep("fcp"), opts);
      vitals.onTTFB(keep("ttfb"), opts);
    } catch {
      /* measurement is best-effort and must never break the page */
    }
  };

  if (lib) subscribe(lib);
  else
    void import("web-vitals")
      .then((vitals) => subscribe(vitals as unknown as WebVitalsLib))
      .catch(() => undefined);

  const finish = () => {
    if (sent) return;
    sent = true;
    const samples: VitalSample[] = [];
    for (const metric of ["lcp", "cls", "inp", "fcp", "ttfb"] as const) {
      const value = latest[metric];
      if (value === undefined || !Number.isFinite(value) || value < 0) continue;
      if (metric === "inp" && value <= 0) continue;
      samples.push({ metric, value, rating: rateVital(metric, value) });
    }
    if (samples.length > 0) report(samples);
  };

  const onHide = () => {
    if (document.visibilityState === "hidden") finish();
  };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", finish);
  // Long-lived tabs would otherwise never report; 20s is well past load.
  const timer = window.setTimeout(finish, 20_000);

  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", finish);
    window.clearTimeout(timer);
    finish();
  };
}
