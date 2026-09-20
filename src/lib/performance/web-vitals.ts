/**
 * Real speed measurement for published customer websites.
 *
 * Until now performance was only inferred from page structure. This module
 * measures what visitors actually experience — largest paint, layout movement,
 * interaction delay, first paint and server response — in the visitor's own
 * browser, using the standard browser performance APIs. No third-party script,
 * no cost, nothing personal: only a metric name, a number and an opaque
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

/** Opaque per-visit token; never identifies a person or persists past the tab. */
export function visitToken(): string {
  const KEY = "revora.vitals.visit";
  try {
    const existing = window.sessionStorage.getItem(KEY);
    if (existing && /^[A-Za-z0-9_-]{6,60}$/.test(existing)) return existing;
    const token = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-6);
    window.sessionStorage.setItem(KEY, token);
    return token;
  } catch {
    return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-6);
  }
}

type PerfEntry = PerformanceEntry & {
  value?: number;
  hadRecentInput?: boolean;
  startTime: number;
  duration: number;
  responseStart?: number;
  requestStart?: number;
};

function observe(type: string, buffered: boolean, cb: (entries: PerfEntry[]) => void) {
  try {
    const observer = new PerformanceObserver((list) => cb(list.getEntries() as PerfEntry[]));
    observer.observe({ type, buffered } as PerformanceObserverInit);
    return observer;
  } catch {
    return null;
  }
}

/**
 * Collects the metrics for this page view and reports them exactly once, when
 * the visitor leaves or hides the page (the point the standard says the values
 * are final). Returns a cleanup function.
 */
export function observeWebVitals(report: (samples: VitalSample[]) => void): () => void {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") {
    return () => undefined;
  }

  let lcp: number | null = null;
  let cls = 0;
  let inp = 0;
  let fcp: number | null = null;
  let ttfb: number | null = null;
  let sent = false;
  const observers: Array<PerformanceObserver | null> = [];

  observers.push(
    observe("largest-contentful-paint", true, (entries) => {
      const last = entries[entries.length - 1];
      if (last) lcp = last.startTime;
    }),
  );
  observers.push(
    observe("layout-shift", true, (entries) => {
      for (const entry of entries) {
        if (!entry.hadRecentInput && typeof entry.value === "number") cls += entry.value;
      }
    }),
  );
  observers.push(
    observe("event", false, (entries) => {
      for (const entry of entries) {
        if (entry.duration > inp) inp = entry.duration;
      }
    }),
  );
  observers.push(
    observe("paint", true, (entries) => {
      for (const entry of entries) {
        if (entry.name === "first-contentful-paint" && fcp === null) fcp = entry.startTime;
      }
    }),
  );

  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerfEntry | undefined;
    if (nav && typeof nav.responseStart === "number" && nav.responseStart > 0) {
      ttfb = nav.responseStart;
    }
  } catch {
    /* measurement is best-effort and must never break the page */
  }

  const finish = () => {
    if (sent) return;
    sent = true;
    const samples: VitalSample[] = [];
    const push = (metric: VitalMetric, value: number | null) => {
      if (value === null || !Number.isFinite(value) || value < 0) return;
      samples.push({ metric, value, rating: rateVital(metric, value) });
    };
    push("lcp", lcp);
    push("cls", cls);
    if (inp > 0) push("inp", inp);
    push("fcp", fcp);
    push("ttfb", ttfb);
    for (const observer of observers) {
      try {
        observer?.disconnect();
      } catch {
        /* ignore */
      }
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
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", finish);
    window.clearTimeout(timer);
    finish();
  };
}
